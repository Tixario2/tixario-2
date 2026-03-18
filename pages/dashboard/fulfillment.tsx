// pages/dashboard/fulfillment.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'

type FulfillmentStatus = 'needs_sourcing' | 'sourced' | 'waiting_for_transfer' | 'sent' | 'complete' | null

interface Order {
  id: string
  evenement: string | null
  email: string | null
  nom: string | null
  quantite_total: number | null
  date_evenement: string | null
  date_creation: string | null
  statut_expedition: FulfillmentStatus
  billets: any[] | null
  stripe_session_id: string | null
}

interface Props {
  userName: string | null
  orders: Order[]
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data: orders } = await supabaseServer
    .from('commandes')
    .select('id, evenement, email, nom, quantite_total, date_evenement, date_creation, statut_expedition, billets, stripe_session_id')
    .eq('owner_id', user.id)
    .order('date_evenement', { ascending: true })

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      orders: orders ?? [],
    },
  }
}

const STATUS_OPTIONS: FulfillmentStatus[] = ['needs_sourcing', 'sourced', 'waiting_for_transfer', 'sent', 'complete']

const STATUS_LABELS: Record<string, string> = {
  needs_sourcing: 'Needs sourcing',
  sourced: 'Sourced',
  waiting_for_transfer: 'Waiting for transfer',
  sent: 'Sent',
  complete: 'Complete',
}

const STATUS_BADGE: Record<string, string> = {
  needs_sourcing:       'bg-red-100 text-red-700',
  sourced:              'bg-emerald-100 text-emerald-700',
  waiting_for_transfer: 'bg-amber-100 text-amber-700',
  sent:                 'bg-emerald-200 text-emerald-800',
  complete:             'bg-green-200 text-green-800',
}

const STATUS_STRIPE: Record<string, string> = {
  needs_sourcing:       'bg-red-500',
  sourced:              'bg-emerald-400',
  waiting_for_transfer: 'bg-amber-400',
  sent:                 'bg-emerald-600',
  complete:             'bg-green-700',
}

function statusBadge(status: FulfillmentStatus) {
  const s = status ?? 'needs_sourcing'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[s] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[s] ?? s}
    </span>
  )
}

function statusStripeColor(status: FulfillmentStatus): string {
  const key = status ?? 'needs_sourcing'
  return STATUS_STRIPE[key] ?? 'bg-gray-300'
}

const PENDING_STATUSES: (string | null)[] = [null, 'needs_sourcing', 'sourced', 'waiting_for_transfer']

export default function FulfillmentPage({ userName, orders }: Props) {
  const [tab, setTab] = useState<'pending' | 'sent' | 'archive'>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [localOrders, setLocalOrders] = useState<Order[]>(orders)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const isPending = (o: Order) => PENDING_STATUSES.includes(o.statut_expedition)
  const isSent = (o: Order) => o.statut_expedition === 'sent' && (!o.date_evenement || o.date_evenement >= today)
  const isArchive = (o: Order) => {
    const eventPassed = o.date_evenement != null && o.date_evenement < today
    return (o.statut_expedition === 'sent' && eventPassed) || o.statut_expedition === 'complete'
  }

  const filtered = localOrders.filter(o =>
    tab === 'pending' ? isPending(o) :
    tab === 'sent' ? isSent(o) :
    isArchive(o)
  )

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id)

  const updateStatus = async (orderId: string, status: string) => {
    setUpdatingId(orderId)
    const res = await fetch('/api/dashboard/update-order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status }),
    })
    if (res.ok) {
      setLocalOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, statut_expedition: status as FulfillmentStatus } : o)
      )
    }
    setUpdatingId(null)
  }

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Fulfillment</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { key: 'pending' as const, label: 'Pending', filter: isPending },
            { key: 'sent' as const, label: 'Sent', filter: isSent },
            { key: 'archive' as const, label: 'Archive', filter: isArchive },
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
                {localOrders.filter(t.filter).length}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-1 p-0" />
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Qty</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Order Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-400">No orders in this category.</td>
                </tr>
              ) : (
                filtered.map(order => {
                  const expanded = expandedId === order.id
                  return (
                    <>
                      <tr
                        key={order.id}
                        onClick={() => toggle(order.id)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="w-1 p-0">
                          <div className={`w-1 h-full min-h-[48px] ${statusStripeColor(order.statut_expedition)}`} />
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="px-4 py-3 font-medium text-black">{order.evenement ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{order.email ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{order.quantite_total ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {order.date_evenement ? format(new Date(order.date_evenement), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3">{statusBadge(order.statut_expedition)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {order.date_creation ? format(new Date(order.date_creation), 'dd MMM yyyy') : '—'}
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${order.id}-expanded`} className="border-b border-gray-100 bg-gray-50">
                          <td className="w-1 p-0">
                            <div className={`w-1 h-full min-h-[48px] ${statusStripeColor(order.statut_expedition)}`} />
                          </td>
                          <td colSpan={7} className="px-8 py-5">
                            <div className="grid grid-cols-3 gap-6 text-sm">
                              {/* Customer details */}
                              <div>
                                <h3 className="font-semibold text-black mb-2">Customer</h3>
                                <div className="space-y-1 text-gray-600">
                                  <p><span className="text-gray-400">Name:</span> {order.nom ?? '—'}</p>
                                  <p><span className="text-gray-400">Email:</span> {order.email ?? '—'}</p>
                                  <p><span className="text-gray-400">Event date:</span> {order.date_evenement ? format(new Date(order.date_evenement), 'dd MMM yyyy') : '—'}</p>
                                  <p><span className="text-gray-400">Stripe:</span> <span className="font-mono text-xs">{order.stripe_session_id ?? '—'}</span></p>
                                </div>
                              </div>

                              {/* Tickets */}
                              <div>
                                <h3 className="font-semibold text-black mb-2">Tickets</h3>
                                {order.billets && order.billets.length > 0 ? (
                                  <div className="space-y-1 text-gray-600">
                                    {order.billets.map((b: any, i: number) => (
                                      <div key={i} className="flex justify-between">
                                        <span>{b.categorie} × {b.quantite}</span>
                                        <span>{(b.prix_unitaire * b.quantite).toFixed(2)} €</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-gray-400">No ticket details.</p>
                                )}
                              </div>

                              {/* Update status */}
                              <div>
                                <h3 className="font-semibold text-black mb-2">Update status</h3>
                                <select
                                  value={order.statut_expedition ?? 'needs_sourcing'}
                                  disabled={updatingId === order.id}
                                  onChange={e => updateStatus(order.id, e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1a3a2a] disabled:opacity-50"
                                >
                                  {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s ?? 'needs_sourcing'}>
                                      {STATUS_LABELS[s ?? 'needs_sourcing']}
                                    </option>
                                  ))}
                                </select>
                                {updatingId === order.id && (
                                  <p className="text-xs text-gray-400 mt-1">Saving…</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
