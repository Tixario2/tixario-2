// pages/admin/new-event.tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Auth guard ──────────────────────────────────────────────────────────────

interface Props {
  userName: string | null
  ownerId: string
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      ownerId: user.id,
    },
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string
  categorie: string
  prix: number | null
  quantite: number | null
  zone_id: string
  ticket_type: 'SEATED' | 'GA'
  enforce_no_solo: boolean
  cout_unitaire: number | null
  is_mixed: boolean
  quantite_adult: number | null
  quantite_child: number | null
  prix_adult: number | null
  prix_child: number | null
  extra_info: string
  highlight?: Partial<Record<string, boolean>>
}

interface SubEvent {
  id: string
  session: string
  date: string
  lieu: string
  ville: string
  pays: string
  categories: CategoryRow[]
}

interface EventMatch {
  slug: string
  evenement: string
  ville: string
  dates: string[]
  image: string | null
  type: string | null
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyCategory(): CategoryRow {
  return {
    id: uid(),
    categorie: '',
    prix: null,
    quantite: null,
    zone_id: '',
    ticket_type: 'SEATED',
    enforce_no_solo: true,
    cout_unitaire: null,
    is_mixed: false,
    quantite_adult: null,
    quantite_child: null,
    prix_adult: null,
    prix_child: null,
    extra_info: '',
  }
}

function emptySubEvent(): SubEvent {
  return {
    id: uid(),
    session: '',
    date: '',
    lieu: '',
    ville: '',
    pays: '',
    categories: [emptyCategory()],
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NewEventPage({ userName, ownerId }: Props) {
  const [tab, setTab] = useState<'manual' | 'paste'>('manual')

  // Parent-level form state
  const [evenement, setEvenement] = useState('')
  const [type, setType] = useState<'concert' | 'sport'>('concert')
  const [image, setImage] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)

  // Sub-events
  const [subEvents, setSubEvents] = useState<SubEvent[]>([emptySubEvent()])

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // SEO fields (manual)
  const [seoTitleEn, setSeoTitleEn] = useState('')
  const [seoTitleFr, setSeoTitleFr] = useState('')
  const [seoDescEn, setSeoDescEn] = useState('')
  const [seoDescFr, setSeoDescFr] = useState('')
  const [seoTextEn, setSeoTextEn] = useState('')
  const [seoTextFr, setSeoTextFr] = useState('')
  const [sessionsFr, setSessionsFr] = useState<Record<string, string>>({})

  // Paste mode state
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  // Event name search dropdown
  const [nameResults, setNameResults] = useState<EventMatch[]>([])
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameWrapRef = useRef<HTMLDivElement>(null)

  // Sub-event field suggestions (loaded when existing event selected)
  const [suggestions, setSuggestions] = useState<{
    sessions: string[]; lieux: string[]; villes: string[]; pays: string[]
  }>({ sessions: [], lieux: [], villes: [], pays: [] })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // SEO Prompt Generator state
  const [seoPromptQuery, setSeoPromptQuery] = useState('')
  const [seoPromptResults, setSeoPromptResults] = useState<Array<{ slug: string; evenement: string }>>([])
  const [seoPromptDropdownOpen, setSeoPromptDropdownOpen] = useState(false)
  const seoPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seoPromptWrapRef = useRef<HTMLDivElement>(null)
  const [seoPromptData, setSeoPromptData] = useState<{
    evenement: string
    type: string
    sessions: Array<{ date: string; session: string; lieu: string; ville: string; pays: string }>
    categories: string[]
    minPrix: number | null
    maxPrix: number | null
    minSession: string
    maxSession: string
  } | null>(null)
  const [seoPromptCopied, setSeoPromptCopied] = useState(false)

  // ── Event name search (replaces duplicate detection) ──────────────

  const searchEventName = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setNameResults([])
      setNameDropdownOpen(false)
      return
    }
    try {
      const resp = await fetch('/api/admin/check-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: query.trim() }),
      })
      const data = await resp.json()
      if (data.exists && data.matches.length > 0) {
        setNameResults(data.matches)
        setNameDropdownOpen(true)
      } else {
        setNameResults([])
        setNameDropdownOpen(false)
      }
    } catch {
      // Silently fail
    }
  }, [])

  // Debounced search on event name change
  useEffect(() => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    if (!evenement.trim() || evenement.trim().length < 2) {
      setNameResults([])
      setNameDropdownOpen(false)
      return
    }
    nameTimerRef.current = setTimeout(() => {
      searchEventName(evenement)
    }, 400)
    return () => { if (nameTimerRef.current) clearTimeout(nameTimerRef.current) }
  }, [evenement, searchEventName])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nameWrapRef.current && !nameWrapRef.current.contains(e.target as Node)) {
        setNameDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadSuggestions = useCallback(async (slug: string) => {
    try {
      const { data } = await supabase
        .from('billets')
        .select('session, lieu, ville, pays')
        .eq('slug', slug)
      if (!data) return
      const sessions = [...new Set(data.map(r => r.session).filter(Boolean))] as string[]
      const lieux = [...new Set(data.map(r => r.lieu).filter(Boolean))] as string[]
      const villes = [...new Set(data.map(r => r.ville).filter(Boolean))] as string[]
      const paysList = [...new Set(data.map(r => r.pays).filter(Boolean))] as string[]
      setSuggestions({ sessions, lieux, villes, pays: paysList })
    } catch {
      // Silently fail
    }
  }, [])

  const selectExistingEvent = (match: EventMatch) => {
    setEvenement(match.evenement)
    if (match.type === 'concert' || match.type === 'sport') setType(match.type)
    if (match.image) {
      setImage(match.image)
      setImagePreview(match.image)
    }
    setNameDropdownOpen(false)
    setNameResults([])
    loadSuggestions(match.slug)
  }

  // ── Image upload to Supabase Storage ──────────────────────────────────

  const uploadToStorage = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const slug = slugify(evenement || 'event')
      const filename = `${slug}-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('event-images')
        .upload(filename, file, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage
        .from('event-images')
        .getPublicUrl(filename)
      setImage(urlData.publicUrl)
      setImagePreview(urlData.publicUrl)
    } catch (err: unknown) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }, [evenement])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) uploadToStorage(file)
  }, [uploadToStorage])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadToStorage(file)
  }, [uploadToStorage])

  const handleUrlPaste = useCallback((url: string) => {
    setImage(url)
    setImagePreview(url)
  }, [])

  const saveUrlToSupabase = useCallback(async () => {
    if (!image) return
    setUploading(true)
    try {
      const resp = await fetch(image)
      const blob = await resp.blob()
      const ext = image.split('.').pop()?.split('?')[0] || 'jpg'
      const slug = slugify(evenement || 'event')
      const filename = `${slug}-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('event-images')
        .upload(filename, blob, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage
        .from('event-images')
        .getPublicUrl(filename)
      setImage(urlData.publicUrl)
      setImagePreview(urlData.publicUrl)
    } catch (err: unknown) {
      alert('Save failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }, [image, evenement])

  // ── Sub-event management ────────────────────────────────────────────

  const updateSubEvent = (seId: string, field: string, value: string) => {
    setSubEvents(prev => prev.map(se =>
      se.id === seId ? { ...se, [field]: value } : se
    ))
  }

  const removeSubEvent = (seId: string) => {
    setSubEvents(prev => prev.length > 1 ? prev.filter(se => se.id !== seId) : prev)
  }

  const updateCategory = (seId: string, catId: string, field: string, value: unknown) => {
    setSubEvents(prev => prev.map(se =>
      se.id === seId
        ? { ...se, categories: se.categories.map(c => c.id === catId ? { ...c, [field]: value } : c) }
        : se
    ))
  }

  const removeCategory = (seId: string, catId: string) => {
    setSubEvents(prev => prev.map(se =>
      se.id === seId
        ? { ...se, categories: se.categories.length > 1 ? se.categories.filter(c => c.id !== catId) : se.categories }
        : se
    ))
  }

  const addCategory = (seId: string) => {
    setSubEvents(prev => prev.map(se =>
      se.id === seId
        ? { ...se, categories: [...se.categories, emptyCategory()] }
        : se
    ))
  }

  // ── Submit ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!evenement) {
      setSubmitResult({ ok: false, msg: 'Event name is required.' })
      return
    }
    const validSubs = subEvents.filter(se => se.date && se.ville)
    if (validSubs.length === 0) {
      setSubmitResult({ ok: false, msg: 'At least one sub-event with date and city is required.' })
      return
    }
    const hasCats = validSubs.some(se => se.categories.some(c => c.categorie))
    if (!hasCats) {
      setSubmitResult({ ok: false, msg: 'At least one ticket category is required.' })
      return
    }
    setSubmitting(true)
    setSubmitResult(null)

    const slug = slugify(evenement)

    const rows: Record<string, unknown>[] = []
    for (const se of validSubs) {
      for (const c of se.categories) {
        if (!c.categorie) continue
        const sessionName = se.session || null
        rows.push({
          id_billet: uid() + '-' + uid(),
          evenement,
          slug,
          session: sessionName,
          session_fr: sessionName && sessionsFr[sessionName] ? sessionsFr[sessionName] : null,
          date: se.date,
          lieu: se.lieu || null,
          ville: se.ville,
          pays: se.pays || null,
          type,
          image: null,
          categorie: c.categorie,
          prix: c.is_mixed ? null : (c.prix ?? 0),
          quantite: c.is_mixed ? null : (c.quantite ?? 0),
          zone_id: c.zone_id || null,
          ticket_type: c.ticket_type,
          enforce_no_solo: c.enforce_no_solo,
          cout_unitaire: c.cout_unitaire ?? 0,
          disponible: true,
          owner_id: ownerId,
          quantite_adult: c.is_mixed ? (c.quantite_adult ?? 0) : null,
          quantite_child: c.is_mixed ? (c.quantite_child ?? 0) : null,
          prix_adult: c.is_mixed ? (c.prix_adult ?? 0) : null,
          prix_child: c.is_mixed ? (c.prix_child ?? 0) : null,
          extra_info: c.extra_info || null,
        })
      }
    }

    if (rows.length === 0) {
      setSubmitResult({ ok: false, msg: 'No valid ticket rows to insert.' })
      setSubmitting(false)
      return
    }

    try {
      // Insert event_meta row
      const metaResp = await fetch('/api/admin/upsert-event-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          evenement,
          type,
          image: image || null,
          seo_title_en: seoTitleEn,
          seo_title_fr: seoTitleFr,
          seo_description_en: seoDescEn,
          seo_description_fr: seoDescFr,
          seo_text_en: seoTextEn,
          seo_text_fr: seoTextFr,
        }),
      })
      const metaResult = await metaResp.json()
      if (!metaResp.ok) throw new Error(metaResult.error || 'event_meta insert failed')

      // Insert billets rows
      const resp = await fetch('/api/admin/insert-billets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Insert failed')
      setSubmitResult({ ok: true, msg: `${rows.length} ticket row(s) created successfully.` })
      // Reset form
      setEvenement('')
      setType('concert')
      setImage('')
      setImagePreview('')
      setSubEvents([emptySubEvent()])
      setSeoTitleEn('')
      setSeoTitleFr('')
      setSeoDescEn('')
      setSeoDescFr('')
      setSeoTextEn('')
      setSeoTextFr('')
      setSessionsFr({})
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: string }).message)
        : err && typeof err === 'object' && 'details' in err
        ? String((err as { details: string }).details)
        : JSON.stringify(err)
      setSubmitResult({ ok: false, msg })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Parse paste ───────────────────────────────────────────────────────

  const handleParse = async () => {
    if (!rawText.trim()) return
    setParsing(true)
    setParseError('')

    try {
      const resp = await fetch('/api/admin/parse-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Parse failed')

      const rows = data.rows as Array<Record<string, unknown>>
      if (!rows || rows.length === 0) {
        setParseError('No rows could be parsed from the text.')
        return
      }

      // Fill parent-level fields from first row
      const first = rows[0]
      if (first.evenement) setEvenement(first.evenement as string)
      if (first.type === 'concert' || first.type === 'sport') setType(first.type)

      // Group rows by session + date to build sub-events
      const seMap = new Map<string, SubEvent>()
      for (const r of rows) {
        const session = (r.session as string) || ''
        const date = (r.date as string) || ''
        const key = `${session}|||${date}`

        if (!seMap.has(key)) {
          seMap.set(key, {
            id: uid(),
            session,
            date,
            lieu: (r.lieu as string) || '',
            ville: (r.ville as string) || '',
            pays: (r.pays as string) || '',
            categories: [],
          })
        }

        const catHighlight: Partial<Record<string, boolean>> = {}
        if (r.prix == null) catHighlight.prix = true
        if (r.quantite == null) catHighlight.quantite = true
        if (!r.categorie) catHighlight.categorie = true

        const hasMixed = r.prix_adult != null || r.prix_child != null || r.quantite_adult != null || r.quantite_child != null

        seMap.get(key)!.categories.push({
          id: uid(),
          categorie: (r.categorie as string) || '',
          prix: r.prix != null ? Number(r.prix) : null,
          quantite: r.quantite != null ? Number(r.quantite) : null,
          zone_id: (r.zone_id as string) || '',
          ticket_type: 'SEATED',
          enforce_no_solo: true,
          cout_unitaire: r.cout_unitaire != null && r.quantite != null && Number(r.quantite) > 0
            ? Number(r.cout_unitaire) / Number(r.quantite)
            : r.cout_unitaire != null ? Number(r.cout_unitaire) : null,
          is_mixed: hasMixed,
          quantite_adult: r.quantite_adult != null ? Number(r.quantite_adult) : null,
          quantite_child: r.quantite_child != null ? Number(r.quantite_child) : null,
          prix_adult: r.prix_adult != null ? Number(r.prix_adult) : null,
          prix_child: r.prix_child != null ? Number(r.prix_child) : null,
          extra_info: (r.extra_info as string) || '',
          highlight: Object.keys(catHighlight).length > 0 ? catHighlight : undefined,
        })
      }

      setSubEvents(Array.from(seMap.values()))
      setTab('manual')
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setParsing(false)
    }
  }

  // ── SEO Prompt Generator search ──────────────────────────────────────

  const searchSeoPromptEvent = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSeoPromptResults([])
      setSeoPromptDropdownOpen(false)
      return
    }
    const { data } = await supabase
      .from('billets')
      .select('slug, evenement')
      .ilike('evenement', `%${query.trim()}%`)
      .order('evenement')
      .limit(50)
    if (!data || data.length === 0) {
      setSeoPromptResults([])
      setSeoPromptDropdownOpen(false)
      return
    }
    const seen = new Map<string, string>()
    for (const r of data) {
      if (r.slug && r.evenement && !seen.has(r.slug)) seen.set(r.slug, r.evenement)
    }
    setSeoPromptResults(Array.from(seen, ([slug, evenement]) => ({ slug, evenement })))
    setSeoPromptDropdownOpen(true)
  }, [])

  const handleSeoPromptInputChange = (val: string) => {
    setSeoPromptQuery(val)
    if (seoPromptTimerRef.current) clearTimeout(seoPromptTimerRef.current)
    seoPromptTimerRef.current = setTimeout(() => searchSeoPromptEvent(val), 300)
  }

  const selectSeoPromptEvent = async (slug: string, evenement: string) => {
    setSeoPromptQuery(evenement)
    setSeoPromptDropdownOpen(false)
    setSeoPromptResults([])

    // Fetch billets for this slug
    const { data: rows } = await supabase
      .from('billets')
      .select('session, date, lieu, ville, pays, prix, categorie, type')
      .eq('slug', slug)
      .order('date', { ascending: true })

    if (!rows || rows.length === 0) {
      setSeoPromptData(null)
      return
    }

    const eventType = rows[0].type || 'concert'

    // Distinct sessions
    const sessionMap = new Map<string, { date: string; session: string; lieu: string; ville: string; pays: string }>()
    for (const r of rows) {
      const key = `${r.session || ''}__${r.date}`
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          date: r.date!,
          session: r.session || '',
          lieu: r.lieu || '',
          ville: r.ville || '',
          pays: r.pays || '',
        })
      }
    }
    const sessions = Array.from(sessionMap.values())

    // Distinct categories
    const categories = [...new Set(rows.map(r => r.categorie).filter(Boolean))] as string[]

    // Price range with session tracking
    let minPrix: number | null = null
    let maxPrix: number | null = null
    let minSession = ''
    let maxSession = ''
    for (const r of rows) {
      const p = r.prix != null ? Number(r.prix) : null
      if (p != null && p > 0) {
        if (minPrix === null || p < minPrix) {
          minPrix = p
          minSession = r.session || '(main event)'
        }
        if (maxPrix === null || p > maxPrix) {
          maxPrix = p
          maxSession = r.session || '(main event)'
        }
      }
    }

    setSeoPromptData({ evenement, type: eventType, sessions, categories, minPrix, maxPrix, minSession, maxSession })
  }

  // Close SEO prompt dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (seoPromptWrapRef.current && !seoPromptWrapRef.current.contains(e.target as Node)) {
        setSeoPromptDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const buildSeoPromptText = () => {
    if (!seoPromptData) return ''
    const lines = [
      `Event name: ${seoPromptData.evenement}`,
      `Type: ${seoPromptData.type}`,
      `Sessions:`,
      ...seoPromptData.sessions.map(s =>
        `- ${s.date} | ${s.session || '(main event)'} | ${s.lieu || 'TBD'} | ${s.ville} | ${s.pays}`
      ),
      `Categories: ${seoPromptData.categories.join(', ') || '(none)'}`,
    ]
    if (seoPromptData.minPrix != null && seoPromptData.maxPrix != null) {
      lines.push(`Price range: €${seoPromptData.minPrix} (${seoPromptData.minSession}) to €${seoPromptData.maxPrix} (${seoPromptData.maxSession})`)
    }
    return lines.join('\n')
  }

  const handleCopyPrompt = async () => {
    const text = buildSeoPromptText()
    if (!text) return
    await navigator.clipboard.writeText(text)
    setSeoPromptCopied(true)
    setTimeout(() => setSeoPromptCopied(false), 2000)
  }

  // ── Suggest input helper ──────────────────────────────────────────────

  function SuggestInput({ value, onChange, options, placeholder, className }: {
    value: string
    onChange: (v: string) => void
    options: string[]
    placeholder?: string
    className?: string
  }) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [])

    const filtered = options.filter(o =>
      o.toLowerCase().includes(value.toLowerCase()) && o !== value
    )

    return (
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <input
          className={className || 'ne-input'}
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (filtered.length > 0 || (options.length > 0 && !value)) setOpen(true) }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {open && (value ? filtered : options).length > 0 && (
          <div className="ne-name-dd">
            {(value ? filtered : options).map(opt => (
              <button
                key={opt}
                type="button"
                className="ne-name-dd__row"
                onClick={() => { onChange(opt); setOpen(false) }}
              >
                <span className="ne-name-dd__name">{opt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <DashboardLayout userName={userName}>
      <Head>
        <title>New Event - Zenntry</title>
      </Head>

      <div className="ne-page">
        <h1 className="ne-heading">New Event Listing</h1>

        {/* Tabs */}
        <div className="ne-tabs">
          <button
            className={`ne-tab ${tab === 'manual' ? 'ne-tab--active' : ''}`}
            onClick={() => setTab('manual')}
          >
            Manual Form
          </button>
          <button
            className={`ne-tab ${tab === 'paste' ? 'ne-tab--active' : ''}`}
            onClick={() => setTab('paste')}
          >
            Paste Inventory
          </button>
        </div>

        {/* ── Paste mode ─────────────────────────────────────────── */}
        {tab === 'paste' && (
          <>
            <div className="ne-card">
              <p className="ne-card__desc">
                Paste raw text from Google Sheets or notes. Our AI will extract event details and ticket categories.
              </p>
              <textarea
                className="ne-textarea"
                rows={12}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="Paste tab-separated data or free-form event text here..."
              />
              <div className="ne-row" style={{ marginTop: '1rem' }}>
                <button
                  className="ne-btn ne-btn--primary"
                  onClick={handleParse}
                  disabled={parsing || !rawText.trim()}
                >
                  {parsing ? 'Parsing…' : 'Parse with AI'}
                </button>
              </div>
              {parseError && <p className="ne-error">{parseError}</p>}
            </div>

            {/* Image */}
            <div className="ne-card">
              <h2 className="ne-card__title">Event Image</h2>
              <div className="ne-grid-2">
                <div className="ne-field">
                  <label className="ne-label">Upload File</label>
                  <div
                    className="ne-dropzone"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <span className="ne-dropzone__spinner">Uploading…</span>
                    ) : (
                      <span className="ne-dropzone__text">
                        Drag &amp; drop or click to choose file
                      </span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
                <div className="ne-field">
                  <label className="ne-label">Or Paste URL</label>
                  <input
                    className="ne-input"
                    value={image}
                    onChange={e => handleUrlPaste(e.target.value)}
                    placeholder="https://..."
                  />
                  {image && !image.includes('supabase') && (
                    <button
                      className="ne-btn ne-btn--small"
                      onClick={saveUrlToSupabase}
                      disabled={uploading}
                      style={{ marginTop: '0.5rem' }}
                    >
                      {uploading ? 'Saving…' : 'Save to Supabase'}
                    </button>
                  )}
                </div>
              </div>
              {imagePreview && (
                <div className="ne-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" className="ne-preview__img" />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Manual form ────────────────────────────────────────── */}
        {tab === 'manual' && (
          <>
            {/* Parent event details */}
            <div className="ne-card">
              <h2 className="ne-card__title">Event Details</h2>
              <div className="ne-grid-2">
                <div className="ne-field" ref={nameWrapRef} style={{ position: 'relative' }}>
                  <label className="ne-label">Event Name *</label>
                  <input
                    className="ne-input"
                    value={evenement}
                    onChange={e => setEvenement(e.target.value)}
                    onFocus={() => { if (nameResults.length > 0) setNameDropdownOpen(true) }}
                    placeholder="e.g. AC/DC"
                    autoComplete="off"
                  />
                  {/* Search dropdown */}
                  {nameDropdownOpen && nameResults.length > 0 && (
                    <div className="ne-name-dd">
                      {nameResults.map(m => (
                        <button
                          key={m.slug}
                          type="button"
                          className="ne-name-dd__row"
                          onClick={() => selectExistingEvent(m)}
                        >
                          <span className="ne-name-dd__name">{m.evenement}</span>
                          <span className="ne-name-dd__meta">
                            {m.ville}{m.dates.length > 0 ? ` · ${m.dates.length} date${m.dates.length > 1 ? 's' : ''}` : ''}
                            {m.type ? ` · ${m.type}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ne-field">
                  <label className="ne-label">Type</label>
                  <div className="ne-toggle-group">
                    <button
                      className={`ne-toggle ${type === 'concert' ? 'ne-toggle--on' : ''}`}
                      onClick={() => setType('concert')}
                      type="button"
                    >
                      Concert
                    </button>
                    <button
                      className={`ne-toggle ${type === 'sport' ? 'ne-toggle--on' : ''}`}
                      onClick={() => setType('sport')}
                      type="button"
                    >
                      Sport
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Image */}
            <div className="ne-card">
              <h2 className="ne-card__title">Event Image</h2>
              <div className="ne-grid-2">
                <div className="ne-field">
                  <label className="ne-label">Upload File</label>
                  <div
                    className="ne-dropzone"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <span className="ne-dropzone__spinner">Uploading…</span>
                    ) : (
                      <span className="ne-dropzone__text">
                        Drag &amp; drop or click to choose file
                      </span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
                <div className="ne-field">
                  <label className="ne-label">Or Paste URL</label>
                  <input
                    className="ne-input"
                    value={image}
                    onChange={e => handleUrlPaste(e.target.value)}
                    placeholder="https://..."
                  />
                  {image && !image.includes('supabase') && (
                    <button
                      className="ne-btn ne-btn--small"
                      onClick={saveUrlToSupabase}
                      disabled={uploading}
                      style={{ marginTop: '0.5rem' }}
                    >
                      {uploading ? 'Saving…' : 'Save to Supabase'}
                    </button>
                  )}
                </div>
              </div>
              {imagePreview && (
                <div className="ne-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" className="ne-preview__img" />
                </div>
              )}
            </div>

            {/* Sub-events */}
            <div className="ne-card">
              <h2 className="ne-card__title">Sub-events</h2>

              {subEvents.map((se, seIdx) => (
                <div key={se.id} className="ne-subevent">
                  <div className="ne-subevent__head">
                    <span className="ne-subevent__num">Sub-event {seIdx + 1}</span>
                    {subEvents.length > 1 && (
                      <button
                        className="ne-cat-row__remove"
                        onClick={() => removeSubEvent(se.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Sub-event fields */}
                  <div className="ne-grid-3" style={{ marginBottom: '1rem' }}>
                    <div className="ne-field">
                      <label className="ne-label">Session Name</label>
                      <SuggestInput
                        value={se.session}
                        onChange={v => updateSubEvent(se.id, 'session', v)}
                        options={suggestions.sessions}
                        placeholder="e.g. Bronze Final"
                      />
                    </div>
                    <div className="ne-field">
                      <label className="ne-label">Date *</label>
                      <input
                        className="ne-input"
                        type="date"
                        value={se.date}
                        onChange={e => updateSubEvent(se.id, 'date', e.target.value)}
                      />
                    </div>
                    <div className="ne-field">
                      <label className="ne-label">Venue</label>
                      <SuggestInput
                        value={se.lieu}
                        onChange={v => updateSubEvent(se.id, 'lieu', v)}
                        options={suggestions.lieux}
                        placeholder="e.g. Stade de France"
                      />
                    </div>
                    <div className="ne-field">
                      <label className="ne-label">City *</label>
                      <SuggestInput
                        value={se.ville}
                        onChange={v => updateSubEvent(se.id, 'ville', v)}
                        options={suggestions.villes}
                        placeholder="e.g. Paris"
                      />
                    </div>
                    <div className="ne-field">
                      <label className="ne-label">Country</label>
                      <SuggestInput
                        value={se.pays}
                        onChange={v => updateSubEvent(se.id, 'pays', v)}
                        options={suggestions.pays}
                        placeholder="e.g. France"
                      />
                    </div>
                  </div>

                  {/* Categories inside this sub-event */}
                  {se.categories.map((cat, catIdx) => (
                    <div key={cat.id} className="ne-cat-row">
                      <div className="ne-cat-row__head">
                        <span className="ne-cat-row__num">Listing {catIdx + 1}</span>
                        {se.categories.length > 1 && (
                          <button
                            className="ne-cat-row__remove"
                            onClick={() => removeCategory(se.id, cat.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="ne-grid-3">
                        <div className="ne-field">
                          <label className="ne-label">Label *</label>
                          <input
                            className={cat.highlight?.categorie ? 'ne-input ne-input--hl' : 'ne-input'}
                            value={cat.categorie}
                            onChange={e => updateCategory(se.id, cat.id, 'categorie', e.target.value)}
                            placeholder="e.g. Catégorie 2 – B3"
                          />
                        </div>
                        <div className="ne-field">
                          <label className="ne-label">Price (€)</label>
                          <input
                            className={cat.highlight?.prix ? 'ne-input ne-input--hl' : 'ne-input'}
                            type="number"
                            min="0"
                            step="0.01"
                            value={cat.prix ?? ''}
                            onChange={e => updateCategory(se.id, cat.id, 'prix', e.target.value ? Number(e.target.value) : null)}
                            placeholder={cat.highlight?.prix ? 'Set your price' : '0.00'}
                          />
                        </div>
                        <div className="ne-field">
                          <label className="ne-label">Quantity</label>
                          <input
                            className={cat.highlight?.quantite ? 'ne-input ne-input--hl' : 'ne-input'}
                            type="number"
                            min="0"
                            value={cat.quantite ?? ''}
                            onChange={e => updateCategory(se.id, cat.id, 'quantite', e.target.value ? Number(e.target.value) : null)}
                            placeholder="0"
                          />
                        </div>
                        <div className="ne-field">
                          <label className="ne-label">Zone ID</label>
                          <input
                            className="ne-input"
                            value={cat.zone_id}
                            onChange={e => updateCategory(se.id, cat.id, 'zone_id', e.target.value)}
                            placeholder="e.g. B3"
                          />
                        </div>
                        <div className="ne-field">
                          <label className="ne-label">Ticket Type</label>
                          <div className="ne-toggle-group">
                            <button
                              className={`ne-toggle ${cat.ticket_type === 'SEATED' ? 'ne-toggle--on' : ''}`}
                              onClick={() => updateCategory(se.id, cat.id, 'ticket_type', 'SEATED')}
                              type="button"
                            >
                              Seated
                            </button>
                            <button
                              className={`ne-toggle ${cat.ticket_type === 'GA' ? 'ne-toggle--on' : ''}`}
                              onClick={() => updateCategory(se.id, cat.id, 'ticket_type', 'GA')}
                              type="button"
                            >
                              GA
                            </button>
                          </div>
                        </div>
                        <div className="ne-field">
                          <label className="ne-label">Cost Price (€)</label>
                          <input
                            className="ne-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={cat.cout_unitaire ?? ''}
                            onChange={e => updateCategory(se.id, cat.id, 'cout_unitaire', e.target.value ? Number(e.target.value) : null)}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <label className="ne-checkbox-label">
                        <input
                          type="checkbox"
                          checked={cat.enforce_no_solo}
                          onChange={e => updateCategory(se.id, cat.id, 'enforce_no_solo', e.target.checked)}
                        />
                        <span>Enforce no solo (never leave 1 unsold seat)</span>
                      </label>
                      <label className="ne-checkbox-label">
                        <input
                          type="checkbox"
                          checked={cat.is_mixed}
                          onChange={e => updateCategory(se.id, cat.id, 'is_mixed', e.target.checked)}
                        />
                        <span>Mixed adult/child listing</span>
                      </label>
                      {cat.is_mixed && (
                        <div className="ne-grid-2" style={{ marginTop: '0.75rem' }}>
                          <div className="ne-field">
                            <label className="ne-label">Adult Qty</label>
                            <input
                              className="ne-input"
                              type="number"
                              min="0"
                              value={cat.quantite_adult ?? ''}
                              onChange={e => updateCategory(se.id, cat.id, 'quantite_adult', e.target.value ? Number(e.target.value) : null)}
                              placeholder="0"
                            />
                          </div>
                          <div className="ne-field">
                            <label className="ne-label">Child Qty</label>
                            <input
                              className="ne-input"
                              type="number"
                              min="0"
                              value={cat.quantite_child ?? ''}
                              onChange={e => updateCategory(se.id, cat.id, 'quantite_child', e.target.value ? Number(e.target.value) : null)}
                              placeholder="0"
                            />
                          </div>
                          <div className="ne-field">
                            <label className="ne-label">Adult Price (€)</label>
                            <input
                              className="ne-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={cat.prix_adult ?? ''}
                              onChange={e => updateCategory(se.id, cat.id, 'prix_adult', e.target.value ? Number(e.target.value) : null)}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="ne-field">
                            <label className="ne-label">Child Price (€)</label>
                            <input
                              className="ne-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={cat.prix_child ?? ''}
                              onChange={e => updateCategory(se.id, cat.id, 'prix_child', e.target.value ? Number(e.target.value) : null)}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      )}
                      <div className="ne-field" style={{ marginTop: '0.75rem' }}>
                        <label className="ne-label">Extra Info</label>
                        <input
                          className="ne-input"
                          value={cat.extra_info}
                          onChange={e => updateCategory(se.id, cat.id, 'extra_info', e.target.value)}
                          placeholder="e.g. Under 12 only, Includes meal…"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    className="ne-btn ne-btn--secondary"
                    onClick={() => addCategory(se.id)}
                    type="button"
                    style={{ marginBottom: '0.5rem' }}
                  >
                    + Add Listing
                  </button>
                </div>
              ))}

              <button
                className="ne-btn ne-btn--secondary"
                onClick={() => setSubEvents(prev => [...prev, emptySubEvent()])}
                type="button"
              >
                + Add Sub-event
              </button>
            </div>

            {/* SEO Content (manual) */}
            <div className="ne-card">
              <h2 className="ne-card__title">SEO Content (optional)</h2>
              <div className="ne-grid-2">
                <div className="ne-field">
                  <label className="ne-label">SEO Title (EN)</label>
                  <input className="ne-input" placeholder="e.g. Rugby World Cup 2027 Tickets | Zenntry" value={seoTitleEn} onChange={e => setSeoTitleEn(e.target.value)} />
                </div>
                <div className="ne-field">
                  <label className="ne-label">SEO Title (FR)</label>
                  <input className="ne-input" placeholder="e.g. Billets Coupe du Monde de Rugby 2027 | Zenntry" value={seoTitleFr} onChange={e => setSeoTitleFr(e.target.value)} />
                </div>
                <div className="ne-field">
                  <label className="ne-label">SEO Description (EN) <span className="ne-char-count">{seoDescEn.length}/155</span></label>
                  <input className="ne-input" maxLength={155} value={seoDescEn} onChange={e => setSeoDescEn(e.target.value)} />
                </div>
                <div className="ne-field">
                  <label className="ne-label">SEO Description (FR) <span className="ne-char-count">{seoDescFr.length}/155</span></label>
                  <input className="ne-input" maxLength={155} value={seoDescFr} onChange={e => setSeoDescFr(e.target.value)} />
                </div>
              </div>
              <div className="ne-field" style={{ marginTop: '1rem' }}>
                <label className="ne-label">SEO Text (EN) — accepts HTML</label>
                <textarea className="ne-textarea" rows={12} placeholder="<h3>When is the event?</h3><p>...</p>" value={seoTextEn} onChange={e => setSeoTextEn(e.target.value)} />
              </div>
              <div className="ne-field" style={{ marginTop: '1rem' }}>
                <label className="ne-label">SEO Text (FR) — accepts HTML</label>
                <textarea className="ne-textarea" rows={12} placeholder="<h3>Quand a lieu l'événement ?</h3><p>...</p>" value={seoTextFr} onChange={e => setSeoTextFr(e.target.value)} />
              </div>
              {Object.keys(sessionsFr).length > 0 && (
                <div className="ne-field" style={{ marginTop: '1rem' }}>
                  <label className="ne-label">Session Translations (FR)</label>
                  <div className="ne-sessions-fr">
                    {Object.entries(sessionsFr).map(([en, fr]) => (
                      <div key={en} className="ne-sessions-fr__row">
                        <span className="ne-sessions-fr__en">{en}</span>
                        <span className="ne-sessions-fr__arrow">&rarr;</span>
                        <input
                          className="ne-input"
                          value={fr}
                          onChange={e => setSessionsFr(prev => ({ ...prev, [en]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SEO Prompt Generator */}
            <div className="ne-card ne-card--prompt">
              <h2 className="ne-card__title">Generate SEO Prompt</h2>
              <p className="ne-card__desc">
                Search for an existing event to auto-populate its data, then copy the prompt for Claude.
              </p>

              {/* Event search */}
              <div className="ne-field" style={{ marginBottom: '1.5rem', position: 'relative' }} ref={seoPromptWrapRef}>
                <label className="ne-label">Search Event</label>
                <input
                  className="ne-input"
                  placeholder="Type an event name…"
                  value={seoPromptQuery}
                  onChange={e => handleSeoPromptInputChange(e.target.value)}
                  onFocus={() => { if (seoPromptResults.length > 0) setSeoPromptDropdownOpen(true) }}
                />
                {seoPromptDropdownOpen && seoPromptResults.length > 0 && (
                  <div className="ne-seo-dropdown">
                    {seoPromptResults.map(r => (
                      <button
                        key={r.slug}
                        type="button"
                        className="ne-seo-dropdown__item"
                        onClick={() => selectSeoPromptEvent(r.slug, r.evenement)}
                      >
                        {r.evenement}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Auto-populated data */}
              {seoPromptData && (
                <>
                  <div className="ne-seo-data">
                    <div className="ne-seo-data__row">
                      <span className="ne-seo-data__label">Event name</span>
                      <span className="ne-seo-data__value">{seoPromptData.evenement}</span>
                    </div>
                    <div className="ne-seo-data__row">
                      <span className="ne-seo-data__label">Type</span>
                      <span className="ne-seo-data__value">{seoPromptData.type}</span>
                    </div>
                    <div className="ne-seo-data__row ne-seo-data__row--full">
                      <span className="ne-seo-data__label">Sessions ({seoPromptData.sessions.length})</span>
                      <div className="ne-seo-data__sessions">
                        {seoPromptData.sessions.map((s, i) => (
                          <div key={i} className="ne-seo-data__session">
                            {s.date} | {s.session || '(main event)'} | {s.lieu || 'TBD'} | {s.ville} | {s.pays}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ne-seo-data__row">
                      <span className="ne-seo-data__label">Categories</span>
                      <span className="ne-seo-data__value">{seoPromptData.categories.join(', ') || '(none)'}</span>
                    </div>
                    {seoPromptData.minPrix != null && seoPromptData.maxPrix != null && (
                      <div className="ne-seo-data__row">
                        <span className="ne-seo-data__label">Price range</span>
                        <span className="ne-seo-data__value">
                          &euro;{seoPromptData.minPrix} ({seoPromptData.minSession}) &mdash; &euro;{seoPromptData.maxPrix} ({seoPromptData.maxSession})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Prompt preview */}
                  <div className="ne-field" style={{ marginTop: '1.25rem' }}>
                    <label className="ne-label">Prompt Preview</label>
                    <pre className="ne-seo-preview">{buildSeoPromptText()}</pre>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="ne-btn ne-btn--primary"
                      onClick={handleCopyPrompt}
                    >
                      {seoPromptCopied ? 'Copied!' : 'Copy Claude Prompt'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Submit */}
            <div className="ne-actions">
              {submitResult && (
                <p className={submitResult.ok ? 'ne-success' : 'ne-error'}>
                  {submitResult.msg}
                </p>
              )}
              <button
                className="ne-btn ne-btn--primary ne-btn--large"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Creating…' : 'Create Event Listing'}
              </button>
            </div>
          </>
        )}

      </div>

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx>{`
        .ne-page {
          padding: 2rem 2.5rem 4rem;
          max-width: 960px;
        }
        .ne-heading {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 1.5rem;
        }

        /* Tabs */
        .ne-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #E5E5E0;
          margin-bottom: 1.5rem;
        }
        .ne-tab {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          color: #9ca3af;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 0.75rem 1.25rem;
          cursor: pointer;
          transition: color 0.15s;
        }
        .ne-tab--active {
          color: #111111;
          border-bottom-color: #1a3a2a;
        }

        /* Cards */
        .ne-card {
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.25rem;
        }
        .ne-card__title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 20px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 1.25rem;
        }
        .ne-card__desc {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        /* Grid layouts */
        .ne-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .ne-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1rem;
        }

        /* Fields */
        .ne-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .ne-label {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ne-input {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #111111;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          padding: 0.625rem 0.75rem;
          background: white;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ne-input:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }
        .ne-input--hl {
          background: #fefce8;
          border-color: #facc15;
        }
        .ne-input--hl:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
          background: white;
        }

        /* Event name search dropdown */
        .ne-name-dd {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 50;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          margin-top: 4px;
          overflow: hidden;
          max-height: 240px;
          overflow-y: auto;
        }
        .ne-name-dd__row {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: none;
          background: white;
          cursor: pointer;
          text-align: left;
          transition: background 0.1s;
        }
        .ne-name-dd__row:hover {
          background: #FAFAF8;
        }
        .ne-name-dd__row + .ne-name-dd__row {
          border-top: 1px solid #f0f0ee;
        }
        .ne-name-dd__name {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #111111;
        }
        .ne-name-dd__meta {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.6875rem;
          color: #9ca3af;
        }

        /* Toggle group */
        .ne-toggle-group {
          display: flex;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          overflow: hidden;
        }
        .ne-toggle {
          flex: 1;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          font-weight: 500;
          padding: 0.625rem 0;
          border: none;
          background: white;
          color: #6b7280;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .ne-toggle + .ne-toggle {
          border-left: 1px solid #E5E5E0;
        }
        .ne-toggle--on {
          background: #1a3a2a;
          color: white;
        }

        /* Textarea */
        .ne-textarea {
          width: 100%;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #111111;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          padding: 0.75rem;
          resize: vertical;
          outline: none;
          line-height: 1.6;
        }
        .ne-textarea:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }

        /* Dropzone */
        .ne-dropzone {
          border: 2px dashed #E5E5E0;
          border-radius: 10px;
          padding: 2rem 1rem;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .ne-dropzone:hover { border-color: #1a3a2a; }
        .ne-dropzone__text {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #9ca3af;
        }
        .ne-dropzone__spinner {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #1a3a2a;
          font-weight: 500;
        }

        /* Image preview */
        .ne-preview {
          margin-top: 1rem;
          border-radius: 8px;
          overflow: hidden;
          max-width: 320px;
          border: 1px solid #E5E5E0;
        }
        .ne-preview__img {
          width: 100%;
          height: auto;
          display: block;
        }

        /* Sub-event block */
        .ne-subevent {
          border: 1px solid #E5E5E0;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
          background: white;
        }
        .ne-subevent__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .ne-subevent__num {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          font-weight: 700;
          color: #1a3a2a;
        }

        /* Category row */
        .ne-cat-row {
          border: 1px solid #f0f0ee;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
          background: #FAFAF8;
        }
        .ne-cat-row__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .ne-cat-row__num {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #111111;
        }
        .ne-cat-row__remove {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.75rem;
          color: #ef4444;
          background: none;
          border: none;
          cursor: pointer;
        }
        .ne-cat-row__remove:hover { text-decoration: underline; }

        /* Checkbox */
        .ne-checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.75rem;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #6b7280;
          cursor: pointer;
        }

        /* Buttons */
        .ne-btn {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .ne-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ne-btn--primary {
          background: #1a3a2a;
          color: white;
        }
        .ne-btn--primary:hover:not(:disabled) { opacity: 0.9; }
        .ne-btn--secondary {
          background: white;
          color: #1a3a2a;
          border: 1px solid #E5E5E0;
        }
        .ne-btn--secondary:hover:not(:disabled) { background: #FAFAF8; }
        .ne-btn--small {
          font-size: 0.75rem;
          padding: 0.5rem 1rem;
          background: white;
          color: #1a3a2a;
          border: 1px solid #E5E5E0;
        }
        .ne-btn--large {
          padding: 0.875rem 2.5rem;
          font-size: 0.9375rem;
        }

        /* Actions */
        .ne-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        .ne-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        /* Messages */
        .ne-error {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #ef4444;
          margin: 0.75rem 0 0;
        }
        .ne-success {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #16a34a;
          margin: 0;
        }

        /* SEO fields */
        .ne-char-count {
          font-weight: 400;
          color: #9ca3af;
          font-size: 0.75rem;
          margin-left: 0.375rem;
        }
        .ne-sessions-fr {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .ne-sessions-fr__row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .ne-sessions-fr__en {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #6b7280;
          min-width: 180px;
          flex-shrink: 0;
        }
        .ne-sessions-fr__arrow {
          color: #9ca3af;
          font-size: 0.875rem;
        }

        /* SEO Prompt Generator */
        .ne-card--prompt {
          background: #f9fafb;
          border: 1px dashed #d1d5db;
        }
        .ne-seo-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          max-height: 240px;
          overflow-y: auto;
          z-index: 20;
          margin-top: 4px;
        }
        .ne-seo-dropdown__item {
          display: block;
          width: 100%;
          text-align: left;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #111111;
          padding: 0.625rem 0.75rem;
          border: none;
          background: none;
          cursor: pointer;
          transition: background 0.1s;
        }
        .ne-seo-dropdown__item:hover {
          background: #f3f4f6;
        }
        .ne-seo-data {
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          overflow: hidden;
        }
        .ne-seo-data__row {
          display: flex;
          gap: 1rem;
          padding: 0.625rem 0.75rem;
          border-bottom: 1px solid #E5E5E0;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
        }
        .ne-seo-data__row:last-child {
          border-bottom: none;
        }
        .ne-seo-data__row--full {
          flex-direction: column;
          gap: 0.375rem;
        }
        .ne-seo-data__label {
          font-weight: 600;
          color: #6b7280;
          min-width: 100px;
          flex-shrink: 0;
        }
        .ne-seo-data__value {
          color: #111111;
        }
        .ne-seo-data__sessions {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ne-seo-data__session {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #111111;
          padding: 0.25rem 0;
        }
        .ne-seo-preview {
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
          font-size: 0.75rem;
          line-height: 1.6;
          color: #111111;
          background: #f9fafb;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          padding: 1rem;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          max-height: 320px;
          overflow-y: auto;
        }

        @media (max-width: 768px) {
          .ne-grid-2 { grid-template-columns: 1fr; }
          .ne-grid-3 { grid-template-columns: 1fr; }
          .ne-page { padding: 1.5rem 1rem 3rem; }
        }
      `}</style>
    </DashboardLayout>
  )
}
