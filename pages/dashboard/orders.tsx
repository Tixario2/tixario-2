// pages/dashboard/orders.tsx
import { useState } from 'react'
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface BilletInfo {
  description: string
  quantite: number
  prix_unitaire: number
  evenement: string
  categorie: string
}

interface Order {
  id: string
  evenement: string | null
  nom: string | null
  email: string | null
  quantite_total: number | null
  prix_total: number | null
  statut_expedition: string | null
  date_creation: string | null
  date_evenement: string | null
  billets: BilletInfo[] | null
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
    .select('id, evenement, nom, email, quantite_total, prix_total, statut_expedition, date_creation, date_evenement, billets, stripe_session_id')
    .eq('owner_id', user.id)
    .order('date_creation', { ascending: false })

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      orders: orders ?? [],
    },
  }
}

function statusBadge(status: string | null) {
  const s = status ?? 'En attente'
  const color =
    s === 'Expédié' ? 'bg-green-100 text-green-700' :
    s === 'En attente' ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{s}</span>
}

export default function OrdersPage({ userName, orders }: Props) {
  const [sortBy, setSortBy] = useState<'date_creation' | 'date_evenement'>('date_creation')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sorted = [...orders].sort((a, b) => {
    const da = a[sortBy] ? new Date(a[sortBy]!).getTime() : 0
    const db = b[sortBy] ? new Date(b[sortBy]!).getTime() : 0
    return db - da
  })

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id)

  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-black">Orders</h1>

          {/* Sort toggle */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Sort by:</span>
            <button
              onClick={() => setSortBy('date_creation')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                sortBy === 'date_creation'
                  ? 'bg-[#1a3a2a] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Order date
            </button>
            <button
              onClick={() => setSortBy('date_evenement')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                sortBy === 'date_evenement'
                  ? 'bg-[#1a3a2a] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Event date
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Qty</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fulfillment</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Order Date</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">No orders yet.</td>
                </tr>
              ) : (
                sorted.map(order => {
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
                        <td className="px-4 py-3 text-gray-600">
                          <div>{order.nom ?? '—'}</div>
                          <div className="text-xs text-gray-400">{order.email ?? ''}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{order.quantite_total ?? '—'}</td>
                        <td className="px-4 py-3 text-black font-medium">
                          {order.prix_total != null ? `${Number(order.prix_total).toFixed(2)} €` : '—'}
                        </td>
                        <td className="px-4 py-3">{statusBadge(order.statut_expedition)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {order.date_creation ? format(new Date(order.date_creation), 'dd MMM yyyy') : '—'}
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${order.id}-expanded`} className="border-b border-gray-100 bg-gray-50">
                          <td colSpan={7} className="px-8 py-4">
                            <div className="grid grid-cols-2 gap-6 text-sm">
                              <div>
                                <h3 className="font-semibold text-black mb-2">Customer details</h3>
                                <div className="space-y-1 text-gray-600">
                                  <p><span className="text-gray-400">Name:</span> {order.nom ?? '—'}</p>
                                  <p><span className="text-gray-400">Email:</span> {order.email ?? '—'}</p>
                                  <p><span className="text-gray-400">Event date:</span> {order.date_evenement ? format(new Date(order.date_evenement), 'dd MMM yyyy') : '—'}</p>
                                  <p><span className="text-gray-400">Stripe session:</span> <span className="font-mono text-xs">{order.stripe_session_id ?? '—'}</span></p>
                                </div>
                              </div>
                              <div>
                                <h3 className="font-semibold text-black mb-2">Tickets</h3>
                                {order.billets && order.billets.length > 0 ? (
                                  <div className="space-y-1">
                                    {order.billets.map((b, i) => (
                                      <div key={i} className="flex justify-between text-gray-600">
                                        <span>{b.categorie} × {b.quantite}</span>
                                        <span>{(b.prix_unitaire * b.quantite).toFixed(2)} €</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-gray-400">No ticket details available.</p>
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
