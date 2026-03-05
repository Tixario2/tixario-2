// pages/dashboard/fulfillment.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'

type FulfillmentStatus = 'needs_sourcing' | 'sourced' | 'sent' | 'complete' | null

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

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const token = req.cookies['sb-access-token']
  if (!token) return { redirect: { destination: '/dashboard/login', permanent: false } }

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return { redirect: { destination: '/dashboard/login', permanent: false } }

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

const STATUS_OPTIONS: FulfillmentStatus[] = ['needs_sourcing', 'sourced', 'sent', 'complete']

const STATUS_LABELS: Record<string, string> = {
  needs_sourcing: 'Needs sourcing',
  sourced: 'Sourced',
  sent: 'Sent',
  complete: 'Complete',
}

function statusBadge(status: FulfillmentStatus) {
  const s = status ?? 'needs_sourcing'
  const styles: Record<string, string> = {
    needs_sourcing: 'bg-red-100 text-red-700',
    sourced:        'bg-blue-100 text-blue-700',
    sent:           'bg-purple-100 text-purple-700',
    complete:       'bg-green-100 text-green-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[s] ?? s}
    </span>
  )
}

const PENDING_STATUSES = [null, 'needs_sourcing', 'sourced']
const COMPLETE_STATUSES = ['sent', 'complete']

export default function FulfillmentPage({ userName, orders }: Props) {
  const [tab, setTab] = useState<'pending' | 'complete'>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [localOrders, setLocalOrders] = useState<Order[]>(orders)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const filtered = localOrders.filter(o =>
    tab === 'pending'
      ? PENDING_STATUSES.includes(o.statut_expedition)
      : COMPLETE_STATUSES.includes(o.statut_expedition as string)
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
          {(['pending', 'complete'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t
                  ? 'bg-[#1a3a2a] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {localOrders.filter(o =>
                  t === 'pending'
                    ? PENDING_STATUSES.includes(o.statut_expedition)
                    : COMPLETE_STATUSES.includes(o.statut_expedition as string)
                ).length}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
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
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">No orders in this category.</td>
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
