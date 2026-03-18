// pages/admin/add-listings.tsx
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

export default function AddListingsPage({ userName, ownerId }: Props) {
  const [tab, setTab] = useState<'manual' | 'paste'>('manual')

  // Event search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ slug: string; evenement: string }>>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  // Selected event
  const [selectedSlug, setSelectedSlug] = useState('')
  const [evenement, setEvenement] = useState('')
  const [type, setType] = useState<'concert' | 'sport'>('concert')

  // Sub-events
  const [subEvents, setSubEvents] = useState<SubEvent[]>([emptySubEvent()])

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Session FR translations
  const [sessionsFr, setSessionsFr] = useState<Record<string, string>>({})

  // Paste mode
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  // Sub-event field suggestions
  const [suggestions, setSuggestions] = useState<{
    sessions: string[]; lieux: string[]; villes: string[]; pays: string[]
  }>({ sessions: [], lieux: [], villes: [], pays: [] })

  // ── Event search ────────────────────────────────────────────────────

  const searchEvents = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    const { data } = await supabase
      .from('billets')
      .select('slug, evenement')
      .ilike('evenement', `%${query.trim()}%`)
      .order('evenement')
      .limit(100)
    if (!data || data.length === 0) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    const seen = new Map<string, string>()
    for (const r of data) {
      if (r.slug && r.evenement && !seen.has(r.slug)) seen.set(r.slug, r.evenement)
    }
    setSearchResults(Array.from(seen, ([slug, evenement]) => ({ slug, evenement })))
    setSearchOpen(true)
  }, [])

  const handleSearchInput = (val: string) => {
    setSearchQuery(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchEvents(val), 150)
  }

  const selectEvent = async (slug: string, name: string) => {
    setSearchQuery(name)
    setSearchOpen(false)
    setSearchResults([])
    setSubmitResult(null)

    setSelectedSlug(slug)
    setEvenement(name)

    // Infer type from billets
    const { data: rows } = await supabase
      .from('billets')
      .select('type, session, lieu, ville, pays')
      .eq('slug', slug)
    if (rows && rows.length > 0) {
      if (rows[0].type === 'concert' || rows[0].type === 'sport') setType(rows[0].type)
      // Load suggestions
      const sessions = [...new Set(rows.map(r => r.session).filter(Boolean))] as string[]
      const lieux = [...new Set(rows.map(r => r.lieu).filter(Boolean))] as string[]
      const villes = [...new Set(rows.map(r => r.ville).filter(Boolean))] as string[]
      const paysList = [...new Set(rows.map(r => r.pays).filter(Boolean))] as string[]
      setSuggestions({ sessions, lieux, villes, pays: paysList })
    }

    // Reset listings
    setSubEvents([emptySubEvent()])
    setSessionsFr({})
    setRawText('')
    setParseError('')
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
    if (!selectedSlug || !evenement) {
      setSubmitResult({ ok: false, msg: 'Select an event first.' })
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

    const rows: Record<string, unknown>[] = []
    for (const se of validSubs) {
      for (const c of se.categories) {
        if (!c.categorie) continue
        const sessionName = se.session || null
        rows.push({
          id_billet: uid() + '-' + uid(),
          evenement,
          slug: selectedSlug,
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
      const resp = await fetch('/api/admin/insert-billets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Insert failed')
      setSubmitResult({ ok: true, msg: `Listings added \u2713 (${rows.length} row${rows.length > 1 ? 's' : ''})` })
      // Reset listings
      setSubEvents([emptySubEvent()])
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

      // Fill parent-level fields from first row if no event selected yet
      const first = rows[0]
      if (!selectedSlug && first.evenement) {
        setEvenement(first.evenement as string)
      }
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
          className={className || 'al-input'}
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (filtered.length > 0 || (options.length > 0 && !value)) setOpen(true) }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {open && (value ? filtered : options).length > 0 && (
          <div className="al-name-dd">
            {(value ? filtered : options).map(opt => (
              <button
                key={opt}
                type="button"
                className="al-name-dd__row"
                onClick={() => { onChange(opt); setOpen(false) }}
              >
                <span className="al-name-dd__name">{opt}</span>
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
        <title>Add Listings - Zenntry</title>
      </Head>

      <div className="al-page">
        <h1 className="al-heading">Add Listings</h1>

        {/* Event search */}
        <div className="al-card" ref={searchWrapRef} style={{ position: 'relative' }}>
          <h2 className="al-card__title">Select Event</h2>
          <div className="al-field">
            <label className="al-label">Search by name</label>
            <input
              className="al-input"
              placeholder="Type an event name…"
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
            />
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="al-dropdown">
              {searchResults.map(r => (
                <button
                  key={r.slug}
                  type="button"
                  className="al-dropdown__item"
                  onClick={() => selectEvent(r.slug, r.evenement)}
                >
                  {r.evenement}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Listings form — only shown when event selected */}
        {selectedSlug && (
          <>
            {/* Selected event info */}
            <div className="al-card">
              <div className="al-selected">
                <span className="al-selected__label">Event:</span>
                <span className="al-selected__name">{evenement}</span>
                <span className="al-selected__slug">({selectedSlug})</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="al-tabs">
              <button
                className={`al-tab ${tab === 'manual' ? 'al-tab--active' : ''}`}
                onClick={() => setTab('manual')}
              >
                Manual Form
              </button>
              <button
                className={`al-tab ${tab === 'paste' ? 'al-tab--active' : ''}`}
                onClick={() => setTab('paste')}
              >
                Paste Inventory
              </button>
            </div>

            {/* ── Paste mode ─────────────────────────────────────────── */}
            {tab === 'paste' && (
              <div className="al-card">
                <p className="al-card__desc">
                  Paste raw text from Google Sheets or notes. Our AI will extract ticket categories.
                </p>
                <textarea
                  className="al-textarea"
                  rows={12}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder="Paste tab-separated data or free-form event text here..."
                />
                <div className="al-row" style={{ marginTop: '1rem' }}>
                  <button
                    className="al-btn al-btn--primary"
                    onClick={handleParse}
                    disabled={parsing || !rawText.trim()}
                  >
                    {parsing ? 'Parsing…' : 'Parse with AI'}
                  </button>
                </div>
                {parseError && <p className="al-error">{parseError}</p>}
              </div>
            )}

            {/* ── Manual form ────────────────────────────────────────── */}
            {tab === 'manual' && (
              <>
                <div className="al-card">
                  <h2 className="al-card__title">Sub-events</h2>

                  {subEvents.map((se, seIdx) => (
                    <div key={se.id} className="al-subevent">
                      <div className="al-subevent__head">
                        <span className="al-subevent__num">Sub-event {seIdx + 1}</span>
                        {subEvents.length > 1 && (
                          <button
                            className="al-cat-row__remove"
                            onClick={() => removeSubEvent(se.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {/* Sub-event fields */}
                      <div className="al-grid-3" style={{ marginBottom: '1rem' }}>
                        <div className="al-field">
                          <label className="al-label">Session Name</label>
                          <SuggestInput
                            value={se.session}
                            onChange={v => updateSubEvent(se.id, 'session', v)}
                            options={suggestions.sessions}
                            placeholder="e.g. Bronze Final"
                          />
                        </div>
                        <div className="al-field">
                          <label className="al-label">Date *</label>
                          <input
                            className="al-input"
                            type="date"
                            value={se.date}
                            onChange={e => updateSubEvent(se.id, 'date', e.target.value)}
                          />
                        </div>
                        <div className="al-field">
                          <label className="al-label">Venue</label>
                          <SuggestInput
                            value={se.lieu}
                            onChange={v => updateSubEvent(se.id, 'lieu', v)}
                            options={suggestions.lieux}
                            placeholder="e.g. Stade de France"
                          />
                        </div>
                        <div className="al-field">
                          <label className="al-label">City *</label>
                          <SuggestInput
                            value={se.ville}
                            onChange={v => updateSubEvent(se.id, 'ville', v)}
                            options={suggestions.villes}
                            placeholder="e.g. Paris"
                          />
                        </div>
                        <div className="al-field">
                          <label className="al-label">Country</label>
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
                        <div key={cat.id} className="al-cat-row">
                          <div className="al-cat-row__head">
                            <span className="al-cat-row__num">Listing {catIdx + 1}</span>
                            {se.categories.length > 1 && (
                              <button
                                className="al-cat-row__remove"
                                onClick={() => removeCategory(se.id, cat.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="al-grid-3">
                            <div className="al-field">
                              <label className="al-label">Label *</label>
                              <input
                                className={cat.highlight?.categorie ? 'al-input al-input--hl' : 'al-input'}
                                value={cat.categorie}
                                onChange={e => updateCategory(se.id, cat.id, 'categorie', e.target.value)}
                                placeholder="e.g. Catégorie 2 – B3"
                              />
                            </div>
                            <div className="al-field">
                              <label className="al-label">Price (€)</label>
                              <input
                                className={cat.highlight?.prix ? 'al-input al-input--hl' : 'al-input'}
                                type="number"
                                min="0"
                                step="0.01"
                                value={cat.prix ?? ''}
                                onChange={e => updateCategory(se.id, cat.id, 'prix', e.target.value ? Number(e.target.value) : null)}
                                placeholder={cat.highlight?.prix ? 'Set your price' : '0.00'}
                              />
                            </div>
                            <div className="al-field">
                              <label className="al-label">Quantity</label>
                              <input
                                className={cat.highlight?.quantite ? 'al-input al-input--hl' : 'al-input'}
                                type="number"
                                min="0"
                                value={cat.quantite ?? ''}
                                onChange={e => updateCategory(se.id, cat.id, 'quantite', e.target.value ? Number(e.target.value) : null)}
                                placeholder="0"
                              />
                            </div>
                            <div className="al-field">
                              <label className="al-label">Zone ID</label>
                              <input
                                className="al-input"
                                value={cat.zone_id}
                                onChange={e => updateCategory(se.id, cat.id, 'zone_id', e.target.value)}
                                placeholder="e.g. B3"
                              />
                            </div>
                            <div className="al-field">
                              <label className="al-label">Ticket Type</label>
                              <div className="al-toggle-group">
                                <button
                                  className={`al-toggle ${cat.ticket_type === 'SEATED' ? 'al-toggle--on' : ''}`}
                                  onClick={() => updateCategory(se.id, cat.id, 'ticket_type', 'SEATED')}
                                  type="button"
                                >
                                  Seated
                                </button>
                                <button
                                  className={`al-toggle ${cat.ticket_type === 'GA' ? 'al-toggle--on' : ''}`}
                                  onClick={() => updateCategory(se.id, cat.id, 'ticket_type', 'GA')}
                                  type="button"
                                >
                                  GA
                                </button>
                              </div>
                            </div>
                            <div className="al-field">
                              <label className="al-label">Cost Price (€)</label>
                              <input
                                className="al-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={cat.cout_unitaire ?? ''}
                                onChange={e => updateCategory(se.id, cat.id, 'cout_unitaire', e.target.value ? Number(e.target.value) : null)}
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <label className="al-checkbox-label">
                            <input
                              type="checkbox"
                              checked={cat.enforce_no_solo}
                              onChange={e => updateCategory(se.id, cat.id, 'enforce_no_solo', e.target.checked)}
                            />
                            <span>Enforce no solo (never leave 1 unsold seat)</span>
                          </label>
                          <label className="al-checkbox-label">
                            <input
                              type="checkbox"
                              checked={cat.is_mixed}
                              onChange={e => updateCategory(se.id, cat.id, 'is_mixed', e.target.checked)}
                            />
                            <span>Mixed adult/child listing</span>
                          </label>
                          {cat.is_mixed && (
                            <div className="al-grid-2" style={{ marginTop: '0.75rem' }}>
                              <div className="al-field">
                                <label className="al-label">Adult Qty</label>
                                <input
                                  className="al-input"
                                  type="number"
                                  min="0"
                                  value={cat.quantite_adult ?? ''}
                                  onChange={e => updateCategory(se.id, cat.id, 'quantite_adult', e.target.value ? Number(e.target.value) : null)}
                                  placeholder="0"
                                />
                              </div>
                              <div className="al-field">
                                <label className="al-label">Child Qty</label>
                                <input
                                  className="al-input"
                                  type="number"
                                  min="0"
                                  value={cat.quantite_child ?? ''}
                                  onChange={e => updateCategory(se.id, cat.id, 'quantite_child', e.target.value ? Number(e.target.value) : null)}
                                  placeholder="0"
                                />
                              </div>
                              <div className="al-field">
                                <label className="al-label">Adult Price (€)</label>
                                <input
                                  className="al-input"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={cat.prix_adult ?? ''}
                                  onChange={e => updateCategory(se.id, cat.id, 'prix_adult', e.target.value ? Number(e.target.value) : null)}
                                  placeholder="0.00"
                                />
                              </div>
                              <div className="al-field">
                                <label className="al-label">Child Price (€)</label>
                                <input
                                  className="al-input"
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
                          <div className="al-field" style={{ marginTop: '0.75rem' }}>
                            <label className="al-label">Extra Info</label>
                            <input
                              className="al-input"
                              value={cat.extra_info}
                              onChange={e => updateCategory(se.id, cat.id, 'extra_info', e.target.value)}
                              placeholder="e.g. Under 12 only, Includes meal…"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        className="al-btn al-btn--secondary"
                        onClick={() => addCategory(se.id)}
                        type="button"
                        style={{ marginBottom: '0.5rem' }}
                      >
                        + Add Listing
                      </button>
                    </div>
                  ))}

                  <button
                    className="al-btn al-btn--secondary"
                    onClick={() => setSubEvents(prev => [...prev, emptySubEvent()])}
                    type="button"
                  >
                    + Add Sub-event
                  </button>
                </div>

                {/* Submit */}
                <div className="al-actions">
                  {submitResult && (
                    <p className={submitResult.ok ? 'al-success' : 'al-error'}>
                      {submitResult.msg}
                    </p>
                  )}
                  <button
                    className="al-btn al-btn--primary al-btn--large"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? 'Adding…' : 'Add Listings'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx>{`
        .al-page {
          padding: 2rem 2.5rem 4rem;
          max-width: 960px;
        }
        .al-heading {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 1.5rem;
        }

        /* Tabs */
        .al-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #E5E5E0;
          margin-bottom: 1.5rem;
        }
        .al-tab {
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
        .al-tab--active {
          color: #111111;
          border-bottom-color: #1a3a2a;
        }

        /* Cards */
        .al-card {
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.25rem;
          position: relative;
        }
        .al-card__title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 20px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 1.25rem;
        }
        .al-card__desc {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        /* Selected event banner */
        .al-selected {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
        }
        .al-selected__label {
          font-weight: 600;
          color: #6b7280;
        }
        .al-selected__name {
          font-weight: 600;
          color: #111111;
        }
        .al-selected__slug {
          color: #9ca3af;
          font-size: 0.8125rem;
        }

        /* Grid layouts */
        .al-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .al-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1rem;
        }

        /* Fields */
        .al-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .al-label {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .al-input {
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
        .al-input:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }
        .al-input--hl {
          background: #fefce8;
          border-color: #facc15;
        }
        .al-input--hl:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
          background: white;
        }

        /* Suggest dropdown */
        .al-name-dd {
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
        .al-name-dd__row {
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
        .al-name-dd__row:hover {
          background: #FAFAF8;
        }
        .al-name-dd__row + .al-name-dd__row {
          border-top: 1px solid #f0f0ee;
        }
        .al-name-dd__name {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #111111;
        }

        /* Toggle group */
        .al-toggle-group {
          display: flex;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          overflow: hidden;
        }
        .al-toggle {
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
        .al-toggle + .al-toggle {
          border-left: 1px solid #E5E5E0;
        }
        .al-toggle--on {
          background: #1a3a2a;
          color: white;
        }

        /* Textarea */
        .al-textarea {
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
        .al-textarea:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }

        /* Dropdown */
        .al-dropdown {
          position: absolute;
          top: calc(100% - 0.5rem);
          left: 1.5rem;
          right: 1.5rem;
          z-index: 50;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          max-height: 240px;
          overflow-y: auto;
          margin-top: 4px;
        }
        .al-dropdown__item {
          display: block;
          width: 100%;
          text-align: left;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #111111;
          padding: 0.625rem 0.875rem;
          border: none;
          background: none;
          cursor: pointer;
          transition: background 0.1s;
        }
        .al-dropdown__item:hover {
          background: #FAFAF8;
        }
        .al-dropdown__item + .al-dropdown__item {
          border-top: 1px solid #f0f0ee;
        }

        /* Sub-event block */
        .al-subevent {
          border: 1px solid #E5E5E0;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
          background: white;
        }
        .al-subevent__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .al-subevent__num {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          font-weight: 700;
          color: #1a3a2a;
        }

        /* Category row */
        .al-cat-row {
          border: 1px solid #f0f0ee;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
          background: #FAFAF8;
        }
        .al-cat-row__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .al-cat-row__num {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #111111;
        }
        .al-cat-row__remove {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.75rem;
          color: #ef4444;
          background: none;
          border: none;
          cursor: pointer;
        }
        .al-cat-row__remove:hover { text-decoration: underline; }

        /* Checkbox */
        .al-checkbox-label {
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
        .al-btn {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          padding: 0.75rem 1.5rem;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .al-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .al-btn--primary {
          background: #1a3a2a;
          color: white;
        }
        .al-btn--primary:hover:not(:disabled) { opacity: 0.9; }
        .al-btn--secondary {
          background: white;
          color: #1a3a2a;
          border: 1px solid #E5E5E0;
        }
        .al-btn--secondary:hover:not(:disabled) { background: #FAFAF8; }
        .al-btn--large {
          padding: 0.875rem 2.5rem;
          font-size: 0.9375rem;
        }

        /* Actions */
        .al-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        .al-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        /* Messages */
        .al-error {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #ef4444;
          margin: 0.75rem 0 0;
        }
        .al-success {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #16a34a;
          margin: 0;
        }

        @media (max-width: 768px) {
          .al-grid-2 { grid-template-columns: 1fr; }
          .al-grid-3 { grid-template-columns: 1fr; }
          .al-page { padding: 1.5rem 1rem 3rem; }
        }
      `}</style>
    </DashboardLayout>
  )
}
