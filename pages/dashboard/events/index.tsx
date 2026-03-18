// pages/dashboard/events/index.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'

function num(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

type EventStatus = 'live' | 'paused' | 'sold_out' | 'archived'

interface EventRow {
  slug: string
  evenement: string
  status: EventStatus
  stockLeft: number
  inventoryCost: number
  revenue: number
  lastSaleDate: string | null
  lastSaleAmount: number | null
  paused: boolean
  archived: boolean
}

interface Props {
  userName: string | null
  events: EventRow[]
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const ownerId = user.id

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', ownerId)
    .single()

  // Fetch billets for this owner — derive events from billets (event_meta may not exist)
  const { data: billets } = await supabaseServer
    .from('billets')
    .select('slug, evenement, quantite, quantite_adult, quantite_child, cout_unitaire, disponible')
    .eq('owner_id', ownerId)

  if (!billets || billets.length === 0) {
    return { props: { userName: profile?.name ?? user.email ?? null, events: [] } }
  }

  // Derive distinct slugs from billets
  const slugSet = new Map<string, string>()
  for (const b of billets) {
    if (b.slug && !slugSet.has(b.slug)) {
      slugSet.set(b.slug, b.evenement)
    }
  }

  // Fetch event_meta flags for these slugs
  const slugs = Array.from(slugSet.keys())
  const { data: metas } = await supabaseServer
    .from('event_meta')
    .select('slug, paused, archived')
    .in('slug', slugs)

  const metaMap = new Map<string, { paused: boolean; archived: boolean }>()
  for (const m of (metas ?? [])) {
    metaMap.set(m.slug, { paused: m.paused ?? false, archived: m.archived ?? false })
  }

  // Fetch commandes for revenue + last sale
  const { data: orders } = await supabaseServer
    .from('commandes')
    .select('evenement, prix_total, date_creation')
    .eq('owner_id', ownerId)

  const events: EventRow[] = Array.from(slugSet.entries()).map(([slug, evenement]) => {
    const slugBillets = billets.filter(b => b.slug === slug)
    const availBillets = slugBillets.filter(b => b.disponible)

    let stockLeft = 0
    let inventoryCost = 0
    for (const b of availBillets) {
      const qty = num(b.quantite) + num(b.quantite_adult) + num(b.quantite_child)
      stockLeft += qty
      inventoryCost += num(b.cout_unitaire) * qty
    }

    const slugOrders = (orders ?? []).filter(o => o.evenement === evenement)
    let revenue = 0
    for (const o of slugOrders) revenue += num(o.prix_total)

    // Last sale
    let lastSaleDate: string | null = null
    let lastSaleAmount: number | null = null
    if (slugOrders.length > 0) {
      const sorted = [...slugOrders].sort((a, b) =>
        (b.date_creation ?? '').localeCompare(a.date_creation ?? '')
      )
      lastSaleDate = sorted[0].date_creation
      lastSaleAmount = num(sorted[0].prix_total)
    }

    // Status from event_meta flags
    const flags = metaMap.get(slug) ?? { paused: false, archived: false }
    let status: EventStatus = 'live'
    if (flags.archived) status = 'archived'
    else if (flags.paused) status = 'paused'
    else if (stockLeft === 0) status = 'sold_out'

    return {
      slug,
      evenement,
      status,
      stockLeft,
      inventoryCost: Math.round(inventoryCost * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      lastSaleDate,
      lastSaleAmount,
      paused: flags.paused,
      archived: flags.archived,
    }
  })

  // Sort: live first, then paused, sold_out, archived
  const order: Record<EventStatus, number> = { live: 0, paused: 1, sold_out: 2, archived: 3 }
  events.sort((a, b) => order[a.status] - order[b.status])

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      events,
    },
  }
}

const STATUS_STYLE: Record<EventStatus, string> = {
  live: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  sold_out: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<EventStatus, string> = {
  live: 'Live',
  paused: 'Paused',
  sold_out: 'Sold Out',
  archived: 'Archived',
}

type Filter = 'all' | EventStatus

function formatEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EventsPage({ userName, events: initialEvents }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [events, setEvents] = useState(initialEvents)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? events.filter(e => e.status !== 'archived')
    : events.filter(e => e.status === filter)

  const counts: Record<Filter, number> = {
    all: events.filter(e => e.status !== 'archived').length,
    live: events.filter(e => e.status === 'live').length,
    paused: events.filter(e => e.status === 'paused').length,
    sold_out: events.filter(e => e.status === 'sold_out').length,
    archived: events.filter(e => e.status === 'archived').length,
  }

  const handleAction = async (slug: string, action: 'pause' | 'resume' | 'archive' | 'unarchive') => {
    setActionLoading(slug)
    try {
      const res = await fetch('/api/dashboard/update-event-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('update-event-status failed:', res.status, err)
      } else {
        setEvents(prev => prev.map(e => {
          if (e.slug !== slug) return e
          if (action === 'pause') return { ...e, paused: true, status: 'paused' as EventStatus }
          if (action === 'resume') return { ...e, paused: false, status: e.stockLeft === 0 ? 'sold_out' as EventStatus : 'live' as EventStatus }
          if (action === 'unarchive') return { ...e, archived: false, paused: true, status: 'paused' as EventStatus }
          return { ...e, archived: true, status: 'archived' as EventStatus }
        }))
      }
    } catch (err) {
      console.error('update-event-status error:', err)
    }
    setActionLoading(null)
  }

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Events</h1>

        {/* Filter bar */}
        <div className="flex gap-2 mb-6">
          {(['all', 'live', 'paused', 'sold_out', 'archived'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-[#1a3a2a] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                filter === f ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        {/* Events table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Stock Left</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Inv. Cost</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last Sale</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400 text-sm">No events found.</td>
                </tr>
              ) : (
                filtered.map(ev => (
                  <tr key={ev.slug} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/dashboard/events/${ev.slug}`} className="font-medium text-black hover:underline">
                        {ev.evenement}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[ev.status]}`}>
                        {STATUS_LABEL[ev.status]}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{ev.stockLeft}</td>
                    <td className="px-6 py-3 text-gray-600">{formatEur(ev.inventoryCost)}</td>
                    <td className="px-6 py-3 text-black font-medium">{formatEur(ev.revenue)}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {ev.lastSaleDate
                        ? `${formatDate(ev.lastSaleDate)} · ${ev.lastSaleAmount?.toFixed(2)} €`
                        : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        {ev.archived ? (
                          <button
                            onClick={() => handleAction(ev.slug, 'unarchive')}
                            disabled={actionLoading === ev.slug}
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            {ev.paused ? (
                              <button
                                onClick={() => handleAction(ev.slug, 'resume')}
                                disabled={actionLoading === ev.slug}
                                className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                              >
                                Resume
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAction(ev.slug, 'pause')}
                                disabled={actionLoading === ev.slug}
                                className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                              >
                                Pause
                              </button>
                            )}
                            <button
                              onClick={() => handleAction(ev.slug, 'archive')}
                              disabled={actionLoading === ev.slug}
                              className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                            >
                              Archive
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
