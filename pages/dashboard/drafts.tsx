// pages/dashboard/drafts.tsx
import { useState, useRef, useCallback, useEffect } from 'react'
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface DraftRow {
  id: string
  owner: string
  slug: string | null
  matched: boolean
  evenement: string | null
  date: string | null
  venue: string | null
  city: string | null
  country: string | null
  categorie: string | null
  quantite: number | null
  quantite_adult: number | null
  quantite_child: number | null
  prix_adult: number | null
  prix_child: number | null
  face_value: number | null
  seat_numbers: string | null
  row: string | null
  section: string | null
  order_reference: string | null
  sender_platform: string | null
  raw_email_snippet: string | null
  prix: number | null
  status: string
  created_at: string
}

interface Props {
  userName: string | null
  drafts: DraftRow[]
  publishedToday: number
  discardedToday: number
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data: drafts } = await supabaseServer
    .from('draft_listings')
    .select('*')
    .in('status', ['draft'])
    .order('created_at', { ascending: false })

  // Count published/discarded today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count: publishedToday } = await supabaseServer
    .from('draft_listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('created_at', todayStart.toISOString())

  const { count: discardedToday } = await supabaseServer
    .from('draft_listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'discarded')
    .gte('created_at', todayStart.toISOString())

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      drafts: drafts ?? [],
      publishedToday: publishedToday ?? 0,
      discardedToday: discardedToday ?? 0,
    },
  }
}

function EventSearchDropdown({
  onSelect,
}: {
  onSelect: (slug: string, evenement: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ slug: string; evenement: string }>>([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    const { data } = await supabase
      .from('billets')
      .select('slug, evenement')
      .ilike('evenement', `%${q.trim()}%`)
      .order('evenement')
      .limit(100)
    if (!data || data.length === 0) { setResults([]); setOpen(false); return }
    const seen = new Map<string, string>()
    for (const r of data) {
      if (r.slug && r.evenement && !seen.has(r.slug)) seen.set(r.slug, r.evenement)
    }
    setResults(Array.from(seen, ([slug, evenement]) => ({ slug, evenement })))
    setOpen(true)
  }, [])

  const handleInput = (val: string) => {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 150)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] focus:border-transparent"
        placeholder="Search event..."
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
          {results.map(r => (
            <button
              key={r.slug}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              onClick={() => { onSelect(r.slug, r.evenement); setQuery(r.evenement); setOpen(false) }}
            >
              {r.evenement}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DraftsPage({ userName, drafts: initialDrafts, publishedToday: initPub, discardedToday: initDisc }: Props) {
  const [tab, setTab] = useState<'unmatched' | 'ready'>('unmatched')
  const [drafts, setDrafts] = useState(initialDrafts)
  const [loading, setLoading] = useState<string | null>(null)
  const [prixInputs, setPrixInputs] = useState<Record<string, string>>({})
  const [prixAdultInputs, setPrixAdultInputs] = useState<Record<string, string>>({})
  const [prixChildInputs, setPrixChildInputs] = useState<Record<string, string>>({})
  const [publishedCount, setPublishedCount] = useState(initPub)
  const [discardedCount, setDiscardedCount] = useState(initDisc)

  const unmatched = drafts.filter(d => !d.matched && d.status === 'draft')
  const ready = drafts.filter(d => d.matched && d.status === 'draft')

  const handleMatch = async (id: string, slug: string) => {
    setLoading(id)
    const res = await fetch('/api/dashboard/drafts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, slug, matched: true }),
    })
    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, slug, matched: true } : d))
    }
    setLoading(null)
  }

  const handleDiscard = async (id: string) => {
    setLoading(id)
    const res = await fetch('/api/dashboard/drafts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setDrafts(prev => prev.filter(d => d.id !== id))
      setDiscardedCount(c => c + 1)
    }
    setLoading(null)
  }

  const handlePublish = async (draft: DraftRow) => {
    const isMixed = draft.quantite_adult != null && draft.quantite_child != null &&
      ((draft.quantite_adult ?? 0) > 0 || (draft.quantite_child ?? 0) > 0)

    if (isMixed) {
      const pa = parseFloat(prixAdultInputs[draft.id] ?? '')
      const pc = parseFloat(prixChildInputs[draft.id] ?? '')
      if (isNaN(pa) || isNaN(pc)) { alert('Adult and child prices are required.'); return }

      setLoading(draft.id)
      // First update prices, then publish
      await fetch('/api/dashboard/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, prix_adult: pa, prix_child: pc }),
      })
    } else {
      const prix = parseFloat(prixInputs[draft.id] ?? '')
      if (isNaN(prix)) { alert('Price is required before publishing.'); return }

      setLoading(draft.id)
      await fetch('/api/dashboard/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, prix }),
      })
    }

    const res = await fetch('/api/dashboard/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish', id: draft.id }),
    })
    if (res.ok) {
      setDrafts(prev => prev.filter(d => d.id !== draft.id))
      setPublishedCount(c => c + 1)
    } else {
      const err = await res.json().catch(() => ({}))
      alert('Publish failed: ' + (err.error || 'Unknown error'))
    }
    setLoading(null)
  }

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Drafts</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { key: 'unmatched' as const, label: 'Unmatched', count: unmatched.length },
            { key: 'ready' as const, label: 'Ready to publish', count: ready.length },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-[#1a3a2a] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Unmatched tab */}
        {tab === 'unmatched' && (
          <div className="space-y-3">
            {unmatched.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                No unmatched drafts.
              </div>
            ) : (
              unmatched.map(d => (
                <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium text-black text-sm">{d.evenement ?? 'Unknown event'}</span>
                        {d.date && <span className="text-xs text-gray-500">{d.date}</span>}
                        {d.sender_platform && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{d.sender_platform}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                        {d.venue && <span>Venue: {d.venue}</span>}
                        {d.city && <span>City: {d.city}</span>}
                        {d.categorie && <span>Category: {d.categorie}</span>}
                        {d.quantite && <span>Qty: {d.quantite}</span>}
                        {d.seat_numbers && <span>Seats: {d.seat_numbers}</span>}
                        {d.face_value && <span>Face: {d.face_value} &euro;</span>}
                        {d.order_reference && <span>Ref: {d.order_reference}</span>}
                      </div>
                      {d.raw_email_snippet && (
                        <p className="text-xs text-gray-400 italic truncate">{d.raw_email_snippet}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0" style={{ width: 220 }}>
                      <EventSearchDropdown
                        onSelect={(slug) => handleMatch(d.id, slug)}
                      />
                      <button
                        onClick={() => handleDiscard(d.id)}
                        disabled={loading === d.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Ready to publish tab */}
        {tab === 'ready' && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Seats</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Face Value</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sell Price</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ready.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-400 text-sm">No drafts ready to publish.</td>
                  </tr>
                ) : (
                  ready.map(d => {
                    const isMixed = d.quantite_adult != null && d.quantite_child != null &&
                      ((d.quantite_adult ?? 0) > 0 || (d.quantite_child ?? 0) > 0)
                    const seatInfo = [d.section, d.row ? `Row ${d.row}` : null, d.seat_numbers].filter(Boolean).join(' / ')

                    return (
                      <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-black">{d.evenement ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{d.date ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{d.categorie ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {isMixed
                            ? `${d.quantite_adult}A + ${d.quantite_child}C`
                            : (d.quantite ?? '—')}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{seatInfo || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {d.face_value != null ? `${d.face_value} \u20AC` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {isMixed ? (
                            <div className="flex gap-1">
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Adult \u20AC"
                                value={prixAdultInputs[d.id] ?? ''}
                                onChange={e => setPrixAdultInputs(prev => ({ ...prev, [d.id]: e.target.value }))}
                                className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a2a]"
                              />
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Child \u20AC"
                                value={prixChildInputs[d.id] ?? ''}
                                onChange={e => setPrixChildInputs(prev => ({ ...prev, [d.id]: e.target.value }))}
                                className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a2a]"
                              />
                            </div>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              placeholder="\u20AC"
                              value={prixInputs[d.id] ?? ''}
                              onChange={e => setPrixInputs(prev => ({ ...prev, [d.id]: e.target.value }))}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a2a]"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePublish(d)}
                              disabled={loading === d.id}
                              className="text-xs px-3 py-1.5 rounded bg-[#1a3a2a] text-white hover:bg-[#15302a] disabled:opacity-50"
                            >
                              Publish
                            </button>
                            <button
                              onClick={() => handleDiscard(d.id)}
                              disabled={loading === d.id}
                              className="text-xs px-3 py-1.5 rounded bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                            >
                              Discard
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Stats */}
        <p className="text-xs text-gray-400 mt-4">
          {publishedCount} published today, {discardedCount} discarded
        </p>
      </div>
    </DashboardLayout>
  )
}
