// pages/dashboard/events/[slug].tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import Link from 'next/link'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'
import { format } from 'date-fns'
import { ArrowLeft } from 'lucide-react'

function num(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

type EventStatus = 'live' | 'paused' | 'sold_out' | 'archived'

interface SessionRow {
  date: string
  session: string | null
  stockRemaining: number
  inventoryCost: number
  revenue: number
  soldCount: number
}

interface SaleRow {
  id: string
  date_creation: string | null
  email: string | null
  categorie: string
  quantite: number
  prix_total: number
  pnl: number
}

interface Props {
  userName: string | null
  slug: string
  evenement: string
  status: EventStatus
  image: string | null
  dateRange: string
  venue: string
  kpi: {
    ticketsSold: number
    revenue: number
    profit: number
    waitlistCount: number
  }
  sessions: SessionRow[]
  sales: SaleRow[]
  paused: boolean
  archived: boolean
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const ownerId = user.id
  const slug = ctx.params!.slug as string

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', ownerId)
    .single()

  // Billets for this slug owned by user
  const { data: billets } = await supabaseServer
    .from('billets')
    .select('date, session, quantite, quantite_adult, quantite_child, cout_unitaire, disponible, prix, evenement')
    .eq('slug', slug)
    .eq('owner_id', ownerId)

  if (!billets || billets.length === 0) return { notFound: true }

  // Derive event name from billets
  const evenementName = billets[0].evenement

  // Event meta (optional — may not exist)
  const { data: meta } = await supabaseServer
    .from('event_meta')
    .select('image, paused, archived')
    .eq('slug', slug)
    .maybeSingle()

  // Orders for this event
  const { data: orders } = await supabaseServer
    .from('commandes')
    .select('id, prix_total, date_creation, email, billets')
    .eq('owner_id', ownerId)
    .eq('evenement', evenementName)
    .order('date_creation', { ascending: false })

  // Waitlist count
  const { count: waitlistCount } = await supabaseServer
    .from('waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('slug', slug)
    .is('notified_at', null)

  // Build sessions
  const sessionMap = new Map<string, SessionRow>()
  for (const b of (billets ?? [])) {
    const key = `${b.date}__${b.session ?? ''}`
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        date: b.date,
        session: b.session ?? null,
        stockRemaining: 0,
        inventoryCost: 0,
        revenue: 0,
        soldCount: 0,
      })
    }
    const s = sessionMap.get(key)!
    if (b.disponible) {
      const qty = num(b.quantite) + num(b.quantite_adult) + num(b.quantite_child)
      s.stockRemaining += qty
      s.inventoryCost += num(b.cout_unitaire) * qty
    }
  }

  // KPI + sales
  let totalRevenue = 0
  let totalProfit = 0
  let totalTicketsSold = 0
  const sales: SaleRow[] = []

  for (const o of (orders ?? [])) {
    const rev = num(o.prix_total)
    totalRevenue += rev
    const billetsArr = o.billets as Array<{ quantite: number; cout_unitaire: number; categorie: string }> | null
    let orderCost = 0
    let orderQty = 0
    let categorie = '—'
    if (billetsArr && Array.isArray(billetsArr)) {
      for (const b of billetsArr) {
        const qty = num(b.quantite)
        orderQty += qty
        orderCost += num(b.cout_unitaire) * qty
      }
      if (billetsArr.length > 0) categorie = billetsArr[0].categorie ?? '—'
    }
    totalTicketsSold += orderQty
    totalProfit += rev - orderCost

    sales.push({
      id: o.id,
      date_creation: o.date_creation,
      email: o.email,
      categorie,
      quantite: orderQty,
      prix_total: rev,
      pnl: Math.round((rev - orderCost) * 100) / 100,
    })
  }

  // Assign revenue to sessions (simplified — by date matching)
  for (const o of (orders ?? [])) {
    const billetsArr = o.billets as Array<{ date?: string; quantite: number }> | null
    if (!billetsArr) continue
    for (const b of billetsArr) {
      const dateKey = b.date ?? ''
      for (const [key, s] of sessionMap) {
        if (key.startsWith(dateKey + '__')) {
          s.revenue += num(o.prix_total) / billetsArr.length
          s.soldCount += num(b.quantite)
        }
      }
    }
  }

  const sessions = Array.from(sessionMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Date range + venue
  const dates = (billets ?? []).map(b => b.date).filter(Boolean).sort()
  const fmtRange = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const dateRange = dates.length > 1 && dates[0] !== dates[dates.length - 1]
    ? `${fmtRange(dates[0])} — ${fmtRange(dates[dates.length - 1])}`
    : dates.length > 0 ? fmtRange(dates[0]) : '—'

  // Status
  let status: EventStatus = 'live'
  const totalStock = sessions.reduce((a, s) => a + s.stockRemaining, 0)
  if (meta?.archived) status = 'archived'
  else if (meta?.paused) status = 'paused'
  else if (totalStock === 0) status = 'sold_out'

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      slug,
      evenement: evenementName,
      status,
      image: meta?.image ?? null,
      dateRange,
      venue: '—',
      kpi: {
        ticketsSold: totalTicketsSold,
        revenue: Math.round(totalRevenue * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        waitlistCount: waitlistCount ?? 0,
      },
      sessions: sessions.map(s => ({
        ...s,
        inventoryCost: Math.round(s.inventoryCost * 100) / 100,
        revenue: Math.round(s.revenue * 100) / 100,
      })),
      sales,
      paused: meta?.paused ?? false,
      archived: meta?.archived ?? false,
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

function formatEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

export default function EventDetailPage({
  userName, slug, evenement, status, image, dateRange, venue,
  kpi, sessions, sales, paused, archived,
}: Props) {
  const [currentStatus, setCurrentStatus] = useState(status)
  const [isPaused, setIsPaused] = useState(paused)
  const [isArchived, setIsArchived] = useState(archived)
  const [actionLoading, setActionLoading] = useState(false)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)

  const handleAction = async (action: 'pause' | 'resume' | 'archive' | 'unarchive') => {
    setActionLoading(true)
    const res = await fetch('/api/dashboard/update-event-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, action }),
    })
    if (res.ok) {
      if (action === 'pause') { setIsPaused(true); setCurrentStatus('paused') }
      else if (action === 'resume') { setIsPaused(false); setCurrentStatus(kpi.ticketsSold > 0 || sessions.some(s => s.stockRemaining > 0) ? 'live' : 'sold_out') }
      else if (action === 'unarchive') { setIsArchived(false); setIsPaused(true); setCurrentStatus('paused') }
      else { setIsArchived(true); setCurrentStatus('archived') }
    }
    setActionLoading(false)
  }

  const handleNotify = async () => {
    setNotifyLoading(true)
    const res = await fetch('/api/waitlist/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    const data = await res.json()
    setNotifyResult(`Notified ${data.notified ?? 0} subscribers`)
    setNotifyLoading(false)
  }

  const imgSrc = image ? (image.startsWith('http') ? image : `/images/events/${image}`) : null

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        {/* Back + Header */}
        <Link href="/dashboard/events" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black mb-4">
          <ArrowLeft size={14} /> Back to Events
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            {imgSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt={evenement} className="w-16 h-16 rounded-lg object-cover" />
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-black">{evenement}</h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[currentStatus]}`}>
                  {STATUS_LABEL[currentStatus]}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{dateRange} · {venue}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isArchived ? (
              <button
                onClick={() => handleAction('unarchive')}
                disabled={actionLoading}
                className="text-sm px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Restore
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button
                    onClick={() => handleAction('resume')}
                    disabled={actionLoading}
                    className="text-sm px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction('pause')}
                    disabled={actionLoading}
                    className="text-sm px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                <button
                  onClick={() => handleAction('archive')}
                  disabled={actionLoading}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                >
                  Archive
                </button>
              </>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-5" style={{ borderLeft: '4px solid #6b7280' }}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tickets Sold</p>
            <p className="text-2xl font-bold text-black">{kpi.ticketsSold}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5" style={{ borderLeft: '4px solid #1a3a2a' }}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Revenue</p>
            <p className="text-2xl font-bold text-black">{formatEur(kpi.revenue)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5" style={{ borderLeft: '4px solid #4a9a6a' }}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Profit</p>
            <p className="text-2xl font-bold text-black">{formatEur(kpi.profit)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5" style={{ borderLeft: '4px solid #92400e' }}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Waitlist</p>
            <p className="text-2xl font-bold text-black">{kpi.waitlistCount}</p>
          </div>
        </div>

        {/* Sessions table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">Sessions</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Session</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Stock</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Inv. Cost</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sold</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No sessions.</td></tr>
              ) : sessions.map((s, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-6 py-3 text-gray-600">{format(new Date(s.date), 'dd MMM yyyy')}</td>
                  <td className="px-6 py-3 text-gray-600">{s.session || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{s.stockRemaining}</td>
                  <td className="px-6 py-3 text-gray-600">{formatEur(s.inventoryCost)}</td>
                  <td className="px-6 py-3 text-black font-medium">{formatEur(s.revenue)}</td>
                  <td className="px-6 py-3 text-gray-600">{s.soldCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sales table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">Sales</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Qty</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Price</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No sales yet.</td></tr>
              ) : sales.map(s => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="px-6 py-3 text-gray-500">{s.date_creation ? format(new Date(s.date_creation), 'dd MMM yyyy') : '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{s.email ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{s.categorie}</td>
                  <td className="px-6 py-3 text-gray-600">{s.quantite}</td>
                  <td className="px-6 py-3 text-black">{s.prix_total.toFixed(2)} €</td>
                  <td className="px-6 py-3">
                    <span className={`font-medium ${s.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)} €
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Waitlist section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-black mb-1">Waitlist</h2>
              <p className="text-sm text-gray-500">{kpi.waitlistCount} subscriber{kpi.waitlistCount !== 1 ? 's' : ''} waiting</p>
            </div>
            {kpi.waitlistCount > 0 && (
              <div className="flex items-center gap-3">
                {notifyResult && <span className="text-sm text-green-600">{notifyResult}</span>}
                <button
                  onClick={handleNotify}
                  disabled={notifyLoading}
                  className="px-4 py-2 bg-[#1a3a2a] text-white rounded-lg text-sm font-medium hover:bg-[#15302a] disabled:opacity-50"
                >
                  {notifyLoading ? 'Sending…' : 'Notify all now'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
