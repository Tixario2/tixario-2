// pages/dashboard/index.tsx
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { format } from 'date-fns'

interface Order {
  id: string
  evenement: string | null
  email: string | null
  prix_total: number | null
  statut_expedition: string | null
  date_creation: string | null
}

interface Props {
  userName: string | null
  kpi: {
    totalOrders: number
    totalRevenue: number
    pendingFulfillment: number
    upcomingEvents: number
  }
  recentOrders: Order[]
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const token = req.cookies['sb-access-token']
  if (!token) return { redirect: { destination: '/dashboard/login', permanent: false } }

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return { redirect: { destination: '/dashboard/login', permanent: false } }

  const ownerId = user.id

  // Fetch profile name
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', ownerId)
    .single()

  // Fetch all orders for KPIs
  const { data: allOrders } = await supabaseServer
    .from('commandes')
    .select('id, prix_total, statut_expedition, date_evenement')
    .eq('owner_id', ownerId)

  const orders = allOrders ?? []
  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const totalOrders = orders.length
  const totalRevenue = orders.reduce((sum, o) => sum + (o.prix_total ?? 0), 0)
  const pendingFulfillment = orders.filter(o => !o.statut_expedition || o.statut_expedition === 'En attente').length
  const upcomingEvents = orders.filter(o => {
    if (!o.date_evenement) return false
    const d = new Date(o.date_evenement)
    return d >= now && d <= in30Days
  }).length

  // Fetch 10 most recent orders
  const { data: recentRaw } = await supabaseServer
    .from('commandes')
    .select('id, evenement, email, prix_total, statut_expedition, date_creation')
    .eq('owner_id', ownerId)
    .order('date_creation', { ascending: false })
    .limit(10)

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      kpi: { totalOrders, totalRevenue, pendingFulfillment, upcomingEvents },
      recentOrders: recentRaw ?? [],
    },
  }
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-black">{value}</p>
    </div>
  )
}

function statusBadge(status: string | null) {
  const s = status ?? 'En attente'
  const color =
    s === 'Expédié' ? 'bg-green-100 text-green-700' :
    s === 'En attente' ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{s}</span>
}

export default function DashboardPage({ userName, kpi, recentOrders }: Props) {
  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Dashboard</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard label="Total Orders" value={kpi.totalOrders} />
          <KpiCard label="Total Revenue" value={`${kpi.totalRevenue.toFixed(2)} €`} />
          <KpiCard label="Pending Fulfillment" value={kpi.pendingFulfillment} />
          <KpiCard label="Upcoming Events (30d)" value={kpi.upcomingEvents} />
        </div>

        {/* Recent Orders */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">Recent Orders</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fulfillment</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Order Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400 text-sm">No orders yet.</td>
                </tr>
              ) : (
                recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-black">{order.evenement ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-600">{order.email ?? '—'}</td>
                    <td className="px-6 py-3 text-black">{order.prix_total != null ? `${Number(order.prix_total).toFixed(2)} €` : '—'}</td>
                    <td className="px-6 py-3">{statusBadge(order.statut_expedition)}</td>
                    <td className="px-6 py-3 text-gray-500">
                      {order.date_creation ? format(new Date(order.date_creation), 'dd MMM yyyy') : '—'}
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
