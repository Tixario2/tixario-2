// pages/admin/edit-event.tsx
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

interface Props {
  userName: string | null
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
    },
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function EditEventPage({ userName }: Props) {
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
  const [image, setImage] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // SEO fields
  const [seoTitleEn, setSeoTitleEn] = useState('')
  const [seoTitleFr, setSeoTitleFr] = useState('')
  const [seoDescEn, setSeoDescEn] = useState('')
  const [seoDescFr, setSeoDescFr] = useState('')
  const [seoTextEn, setSeoTextEn] = useState('')
  const [seoTextFr, setSeoTextFr] = useState('')

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // SEO Prompt Generator
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

  // ── Event search ────────────────────────────────────────────────────

  const searchEvents = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    // Query billets for distinct events (more complete than event_meta)
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
    // Deduplicate by slug
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

    // Always set slug and name so the form renders
    setSelectedSlug(slug)
    setEvenement(name)

    // Load event_meta (may not exist yet)
    const { data: meta } = await supabase
      .from('event_meta')
      .select('*')
      .eq('slug', slug)
      .single()

    if (meta) {
      setEvenement(meta.evenement || name)
      setType(meta.type === 'sport' ? 'sport' : 'concert')
      setImage(meta.image || '')
      setImagePreview(meta.image || '')
      setSeoTitleEn(meta.seo_title_en || '')
      setSeoTitleFr(meta.seo_title_fr || '')
      setSeoDescEn(meta.seo_description_en || '')
      setSeoDescFr(meta.seo_description_fr || '')
      setSeoTextEn(meta.seo_text_en || '')
      setSeoTextFr(meta.seo_text_fr || '')
    } else {
      // No event_meta row yet — reset fields
      setType('concert')
      setImage('')
      setImagePreview('')
      setSeoTitleEn('')
      setSeoTitleFr('')
      setSeoDescEn('')
      setSeoDescFr('')
      setSeoTextEn('')
      setSeoTextFr('')
    }

    // Load billets for SEO prompt data
    const { data: rows } = await supabase
      .from('billets')
      .select('session, date, lieu, ville, pays, prix, categorie, type')
      .eq('slug', slug)
      .order('date', { ascending: true })

    if (rows && rows.length > 0) {
      // If no event_meta, infer type from billets
      if (!meta && rows[0].type) {
        setType(rows[0].type === 'sport' ? 'sport' : 'concert')
      }

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
      const categories = [...new Set(rows.map(r => r.categorie).filter(Boolean))] as string[]

      let minPrix: number | null = null
      let maxPrix: number | null = null
      let minSession = ''
      let maxSession = ''
      for (const r of rows) {
        const p = r.prix != null ? Number(r.prix) : null
        if (p != null && p > 0) {
          if (minPrix === null || p < minPrix) { minPrix = p; minSession = r.session || '(main event)' }
          if (maxPrix === null || p > maxPrix) { maxPrix = p; maxSession = r.session || '(main event)' }
        }
      }
      const resolvedType = meta?.type || rows[0].type || 'concert'
      setSeoPromptData({ evenement: name, type: resolvedType, sessions, categories, minPrix, maxPrix, minSession, maxSession })
    } else {
      setSeoPromptData(null)
    }
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

  // ── Image upload ──────────────────────────────────────────────────

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

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedSlug || !evenement) {
      setSubmitResult({ ok: false, msg: 'Select an event first.' })
      return
    }
    setSubmitting(true)
    setSubmitResult(null)

    try {
      // Only include fields that have non-empty values
      const payload: Record<string, string> = { slug: selectedSlug, evenement }
      if (type) payload.type = type
      if (image) payload.image = image
      if (seoTitleEn) payload.seo_title_en = seoTitleEn
      if (seoTitleFr) payload.seo_title_fr = seoTitleFr
      if (seoDescEn) payload.seo_description_en = seoDescEn
      if (seoDescFr) payload.seo_description_fr = seoDescFr
      if (seoTextEn) payload.seo_text_en = seoTextEn
      if (seoTextFr) payload.seo_text_fr = seoTextFr

      const resp = await fetch('/api/admin/upsert-event-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Update failed')
      setSubmitResult({ ok: true, msg: 'Event updated \u2713' })
    } catch (err: unknown) {
      setSubmitResult({ ok: false, msg: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── SEO Prompt ────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────

  return (
    <DashboardLayout userName={userName}>
      <Head>
        <title>Edit Event - Zenntry</title>
      </Head>

      <div className="ee-page">
        <h1 className="ee-heading">Edit Event</h1>

        {/* Event search */}
        <div className="ee-card" ref={searchWrapRef} style={{ position: 'relative' }}>
          <h2 className="ee-card__title">Select Event</h2>
          <div className="ee-field">
            <label className="ee-label">Search by name</label>
            <input
              className="ee-input"
              placeholder="Type an event name…"
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
            />
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="ee-dropdown">
              {searchResults.map(r => (
                <button
                  key={r.slug}
                  type="button"
                  className="ee-dropdown__item"
                  onClick={() => selectEvent(r.slug, r.evenement)}
                >
                  {r.evenement}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Edit form — only shown when event selected */}
        {selectedSlug && (
          <>
            {/* Event info */}
            <div className="ee-card">
              <h2 className="ee-card__title">Event Details</h2>
              <div className="ee-grid-2">
                <div className="ee-field">
                  <label className="ee-label">Event Name</label>
                  <input className="ee-input" value={evenement} readOnly style={{ background: '#f9fafb', color: '#6b7280' }} />
                </div>
                <div className="ee-field">
                  <label className="ee-label">Type</label>
                  <div className="ee-toggle-group">
                    <button
                      type="button"
                      className={`ee-toggle ${type === 'concert' ? 'ee-toggle--on' : ''}`}
                      onClick={() => setType('concert')}
                    >
                      Concert
                    </button>
                    <button
                      type="button"
                      className={`ee-toggle ${type === 'sport' ? 'ee-toggle--on' : ''}`}
                      onClick={() => setType('sport')}
                    >
                      Sport
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Image */}
            <div className="ee-card">
              <h2 className="ee-card__title">Event Image</h2>
              <div className="ee-grid-2">
                <div className="ee-field">
                  <label className="ee-label">Upload File</label>
                  <div
                    className="ee-dropzone"
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <span className="ee-dropzone__spinner">Uploading…</span>
                    ) : (
                      <span className="ee-dropzone__text">
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
                <div className="ee-field">
                  <label className="ee-label">Or Paste URL</label>
                  <input
                    className="ee-input"
                    value={image}
                    onChange={e => handleUrlPaste(e.target.value)}
                    placeholder="https://..."
                  />
                  {image && !image.includes('supabase') && (
                    <button
                      className="ee-btn ee-btn--small"
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
                <div className="ee-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" className="ee-preview__img" />
                </div>
              )}
            </div>

            {/* SEO Content */}
            <div className="ee-card">
              <h2 className="ee-card__title">SEO Content</h2>
              <div className="ee-grid-2">
                <div className="ee-field">
                  <label className="ee-label">SEO Title (EN) <span className="ee-char-count">{seoTitleEn.length}/60</span></label>
                  <input className="ee-input" maxLength={60} value={seoTitleEn} onChange={e => setSeoTitleEn(e.target.value)} placeholder="e.g. Rugby World Cup 2027 Tickets | Zenntry" />
                </div>
                <div className="ee-field">
                  <label className="ee-label">SEO Title (FR) <span className="ee-char-count">{seoTitleFr.length}/60</span></label>
                  <input className="ee-input" maxLength={60} value={seoTitleFr} onChange={e => setSeoTitleFr(e.target.value)} placeholder="e.g. Billets Coupe du Monde de Rugby 2027 | Zenntry" />
                </div>
                <div className="ee-field">
                  <label className="ee-label">SEO Description (EN) <span className="ee-char-count">{seoDescEn.length}/155</span></label>
                  <input className="ee-input" maxLength={155} value={seoDescEn} onChange={e => setSeoDescEn(e.target.value)} />
                </div>
                <div className="ee-field">
                  <label className="ee-label">SEO Description (FR) <span className="ee-char-count">{seoDescFr.length}/155</span></label>
                  <input className="ee-input" maxLength={155} value={seoDescFr} onChange={e => setSeoDescFr(e.target.value)} />
                </div>
              </div>
              <div className="ee-field" style={{ marginTop: '1rem' }}>
                <label className="ee-label">SEO Text (EN) — accepts HTML</label>
                <textarea className="ee-textarea" rows={12} placeholder="<h3>When is the event?</h3><p>...</p>" value={seoTextEn} onChange={e => setSeoTextEn(e.target.value)} />
              </div>
              <div className="ee-field" style={{ marginTop: '1rem' }}>
                <label className="ee-label">SEO Text (FR) — accepts HTML</label>
                <textarea className="ee-textarea" rows={12} placeholder="<h3>Quand a lieu l'événement ?</h3><p>...</p>" value={seoTextFr} onChange={e => setSeoTextFr(e.target.value)} />
              </div>
            </div>

            {/* SEO Prompt Generator */}
            <div className="ee-card ee-card--prompt">
              <h2 className="ee-card__title">Generate SEO Prompt</h2>
              <p className="ee-card__desc">
                Copy the prompt below and paste it into a Claude window with the SEO task sheet.
              </p>

              {seoPromptData ? (
                <>
                  <div className="ee-seo-data">
                    <div className="ee-seo-data__row">
                      <span className="ee-seo-data__label">Event name</span>
                      <span className="ee-seo-data__value">{seoPromptData.evenement}</span>
                    </div>
                    <div className="ee-seo-data__row">
                      <span className="ee-seo-data__label">Type</span>
                      <span className="ee-seo-data__value">{seoPromptData.type}</span>
                    </div>
                    <div className="ee-seo-data__row ee-seo-data__row--full">
                      <span className="ee-seo-data__label">Sessions ({seoPromptData.sessions.length})</span>
                      <div className="ee-seo-data__sessions">
                        {seoPromptData.sessions.map((s, i) => (
                          <div key={i} className="ee-seo-data__session">
                            {s.date} | {s.session || '(main event)'} | {s.lieu || 'TBD'} | {s.ville} | {s.pays}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ee-seo-data__row">
                      <span className="ee-seo-data__label">Categories</span>
                      <span className="ee-seo-data__value">{seoPromptData.categories.join(', ') || '(none)'}</span>
                    </div>
                    {seoPromptData.minPrix != null && seoPromptData.maxPrix != null && (
                      <div className="ee-seo-data__row">
                        <span className="ee-seo-data__label">Price range</span>
                        <span className="ee-seo-data__value">
                          &euro;{seoPromptData.minPrix} ({seoPromptData.minSession}) &mdash; &euro;{seoPromptData.maxPrix} ({seoPromptData.maxSession})
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="ee-field" style={{ marginTop: '1.25rem' }}>
                    <label className="ee-label">Prompt Preview</label>
                    <pre className="ee-seo-preview">{buildSeoPromptText()}</pre>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="ee-btn ee-btn--primary"
                      onClick={handleCopyPrompt}
                    >
                      {seoPromptCopied ? 'Copied!' : 'Copy SEO Prompt'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="ee-empty">No ticket data found for this event.</p>
              )}
            </div>

            {/* Submit */}
            <div className="ee-actions">
              {submitResult && (
                <p className={submitResult.ok ? 'ee-success' : 'ee-error'}>
                  {submitResult.msg}
                </p>
              )}
              <button
                className="ee-btn ee-btn--primary ee-btn--large"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore */}
      <style jsx>{`
        .ee-page {
          padding: 2rem 2.5rem 4rem;
          max-width: 960px;
        }
        .ee-heading {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 1.5rem;
        }

        /* Cards */
        .ee-card {
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.25rem;
          position: relative;
        }
        .ee-card--prompt {
          background: #f9fafb;
          border: 1px dashed #d1d5db;
        }
        .ee-card__title {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 20px;
          font-weight: 600;
          color: #111111;
          margin: 0 0 1.25rem;
        }
        .ee-card__desc {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        /* Grid */
        .ee-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        /* Fields */
        .ee-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .ee-label {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ee-char-count {
          font-weight: 400;
          color: #9ca3af;
          font-size: 0.75rem;
          margin-left: 0.375rem;
          text-transform: none;
          letter-spacing: 0;
        }
        .ee-input {
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
        .ee-input:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }
        .ee-textarea {
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
        .ee-textarea:focus {
          border-color: #1a3a2a;
          box-shadow: 0 0 0 3px rgba(26, 58, 42, 0.08);
        }

        /* Toggle */
        .ee-toggle-group {
          display: flex;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          overflow: hidden;
        }
        .ee-toggle {
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
        .ee-toggle + .ee-toggle {
          border-left: 1px solid #E5E5E0;
        }
        .ee-toggle--on {
          background: #1a3a2a;
          color: white;
        }

        /* Dropdown */
        .ee-dropdown {
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
        .ee-dropdown__item {
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
        .ee-dropdown__item:hover {
          background: #FAFAF8;
        }
        .ee-dropdown__item + .ee-dropdown__item {
          border-top: 1px solid #f0f0ee;
        }

        /* Dropzone */
        .ee-dropzone {
          border: 2px dashed #E5E5E0;
          border-radius: 10px;
          padding: 2rem 1rem;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .ee-dropzone:hover { border-color: #1a3a2a; }
        .ee-dropzone__text {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #9ca3af;
        }
        .ee-dropzone__spinner {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #1a3a2a;
          font-weight: 500;
        }

        /* Preview */
        .ee-preview {
          margin-top: 1rem;
          border-radius: 8px;
          overflow: hidden;
          max-width: 320px;
          border: 1px solid #E5E5E0;
        }
        .ee-preview__img {
          width: 100%;
          height: auto;
          display: block;
        }

        /* Buttons */
        .ee-btn {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
        }
        .ee-btn--primary {
          background: #1a3a2a;
          color: white;
          padding: 0.625rem 1.25rem;
        }
        .ee-btn--primary:hover { opacity: 0.9; }
        .ee-btn--primary:disabled { opacity: 0.5; cursor: default; }
        .ee-btn--large {
          font-size: 0.875rem;
          padding: 0.875rem 2rem;
        }
        .ee-btn--small {
          font-size: 0.75rem;
          padding: 0.375rem 0.75rem;
          background: #1a3a2a;
          color: white;
        }

        /* SEO data table */
        .ee-seo-data {
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          overflow: hidden;
        }
        .ee-seo-data__row {
          display: flex;
          gap: 1rem;
          padding: 0.625rem 0.75rem;
          border-bottom: 1px solid #E5E5E0;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
        }
        .ee-seo-data__row:last-child { border-bottom: none; }
        .ee-seo-data__row--full {
          flex-direction: column;
          gap: 0.375rem;
        }
        .ee-seo-data__label {
          font-weight: 600;
          color: #6b7280;
          min-width: 100px;
          flex-shrink: 0;
        }
        .ee-seo-data__value { color: #111111; }
        .ee-seo-data__sessions {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ee-seo-data__session {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #111111;
          padding: 0.25rem 0;
        }
        .ee-seo-preview {
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
          font-size: 0.75rem;
          line-height: 1.6;
          color: #111111;
          background: white;
          border: 1px solid #E5E5E0;
          border-radius: 8px;
          padding: 1rem;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          max-height: 320px;
          overflow-y: auto;
        }

        /* Actions */
        .ee-actions {
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .ee-success {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #16a34a;
          font-weight: 500;
          margin: 0;
        }
        .ee-error {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.875rem;
          color: #ef4444;
          font-weight: 500;
          margin: 0;
        }
        .ee-empty {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 0.8125rem;
          color: #9ca3af;
          margin: 0;
        }

        @media (max-width: 768px) {
          .ee-grid-2 { grid-template-columns: 1fr; }
          .ee-page { padding: 1.5rem 1rem 3rem; }
        }
      `}</style>
    </DashboardLayout>
  )
}
