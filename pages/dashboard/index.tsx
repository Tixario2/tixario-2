// pages/dashboard/index.tsx
import type { GetServerSideProps } from 'next'
import dynamic from 'next/dynamic'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { getAuthUser, LOGIN_REDIRECT } from '@/lib/authGuard'
import { format } from 'date-fns'

// Recharts must be loaded client-side only (no SSR)
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const ComposedChart = dynamic(() => import('recharts').then(m => m.ComposedChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false })

interface RecentOrder {
  id: string
  evenement: string | null
  email: string | null
  prix_total: number | null
  statut_expedition: string | null
  date_creation: string | null
  billets: BilletInfo[] | null
}

interface BilletInfo {
  quantite: number
  prix_unitaire: number
  cout_unitaire: number
  montant_total?: number
}

interface MonthData {
  month: string
  revenue: number
  profit: number
  cost: number
  tickets: number
}

interface Props {
  userName: string | null
  kpi: {
    totalRevenue: number
    totalProfit: number
    totalTicketsSold: number
    totalInventoryCost: number
  }
  monthlyData: MonthData[]
  recentOrders: RecentOrder[]
}

/** Safely coerce Supabase numeric (returned as string) to number */
function num(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const user = await getAuthUser(ctx)
  if (!user) return LOGIN_REDIRECT

  const ownerId = user.id

  // Fetch profile name
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('name')
    .eq('id', ownerId)
    .single()

  // Fetch all orders with billets JSONB for KPIs + monthly chart
  const { data: allOrders } = await supabaseServer
    .from('commandes')
    .select('id, prix_total, statut_expedition, date_evenement, date_creation, billets, owner_id')
    .eq('owner_id', ownerId)

  const orders = allOrders ?? []

  // ── KPI calculations ──────────────────────────────────────────
  let totalRevenue = 0
  let totalProfit = 0
  let totalTicketsSold = 0

  for (const o of orders) {
    // prix_total from commandes row; fallback to sum of billets montant_total
    let revenue = num(o.prix_total)
    const billets = o.billets as BilletInfo[] | null

    if (revenue === 0 && billets && Array.isArray(billets)) {
      for (const b of billets) {
        revenue += num(b.montant_total)
      }
    }

    totalRevenue += revenue

    if (billets && Array.isArray(billets)) {
      let orderCost = 0
      let orderTickets = 0
      for (const b of billets) {
        const qty = num(b.quantite)
        orderTickets += qty
        orderCost += num(b.cout_unitaire) * qty
      }
      totalTicketsSold += orderTickets
      totalProfit += revenue - orderCost
    } else {
      totalProfit += revenue
    }
  }

  // Total inventory cost from available billets
  const { data: availableBillets } = await supabaseServer
    .from('billets')
    .select('cout_unitaire, quantite, quantite_adult, quantite_child')
    .eq('owner_id', ownerId)
    .eq('disponible', true)
  let totalInventoryCost = 0
  if (availableBillets) {
    for (const b of availableBillets) {
      const qty = num(b.quantite) + num(b.quantite_adult) + num(b.quantite_child)
      totalInventoryCost += num(b.cout_unitaire) * qty
    }
  }

  // ── Monthly chart data (last 12 months) ────────────────────────
  const now = new Date()
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthlyMap = new Map<string, { revenue: number; profit: number; tickets: number }>()

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(key, { revenue: 0, profit: 0, tickets: 0 })
  }

  for (const o of orders) {
    if (!o.date_creation) continue
    const d = new Date(o.date_creation)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthlyMap.has(key)) continue

    const entry = monthlyMap.get(key)!
    let revenue = num(o.prix_total)
    const billets = o.billets as BilletInfo[] | null

    if (revenue === 0 && billets && Array.isArray(billets)) {
      for (const b of billets) {
        revenue += num(b.montant_total)
      }
    }

    entry.revenue += revenue

    if (billets && Array.isArray(billets)) {
      let orderCost = 0
      let orderTickets = 0
      for (const b of billets) {
        const qty = num(b.quantite)
        orderTickets += qty
        orderCost += num(b.cout_unitaire) * qty
      }
      entry.tickets += orderTickets
      entry.profit += revenue - orderCost
    } else {
      entry.profit += revenue
    }
  }

  const monthlyData: MonthData[] = Array.from(monthlyMap.entries()).map(([key, val]) => {
    const [, m] = key.split('-')
    const profit = Math.round(val.profit * 100) / 100
    const revenue = Math.round(val.revenue * 100) / 100
    return {
      month: monthLabels[parseInt(m, 10) - 1],
      revenue,
      profit,
      cost: Math.round((revenue - profit) * 100) / 100,
      tickets: val.tickets,
    }
  })

  // Fetch 10 most recent orders (include billets for P&L column)
  const { data: recentRaw } = await supabaseServer
    .from('commandes')
    .select('id, evenement, email, prix_total, statut_expedition, date_creation, billets')
    .eq('owner_id', ownerId)
    .order('date_creation', { ascending: false })
    .limit(10)

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      kpi: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalTicketsSold,
        totalInventoryCost: Math.round(totalInventoryCost * 100) / 100,
      },
      monthlyData,
      recentOrders: recentRaw ?? [],
    },
  }
}

function KpiCard({ label, value, subtitle, borderColor }: {
  label: string
  value: string | number
  subtitle: string
  borderColor: string
}) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-5"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-black">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{subtitle}</p>
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

function formatEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function orderPnL(order: RecentOrder): { value: number; display: string } | null {
  const revenue = num(order.prix_total)
  const billets = order.billets
  if (!billets || !Array.isArray(billets) || billets.length === 0) return null
  let cost = 0
  for (const b of billets) {
    cost += num(b.cout_unitaire) * num(b.quantite)
  }
  const pnl = revenue - cost
  const rounded = Math.round(pnl * 100) / 100
  return { value: rounded, display: `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)} €` }
}

export default function DashboardPage({ userName, kpi, recentOrders, monthlyData }: Props) {
  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Dashboard</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard label="Total Revenue" value={formatEur(kpi.totalRevenue)} subtitle="from completed orders" borderColor="#1a3a2a" />
          <KpiCard label="Total Profit" value={formatEur(kpi.totalProfit)} subtitle="after inventory cost" borderColor="#4a9a6a" />
          <KpiCard label="Tickets Sold" value={kpi.totalTicketsSold} subtitle="across all orders" borderColor="#6b7280" />
          <KpiCard label="Inventory Cost" value={formatEur(kpi.totalInventoryCost)} subtitle="current available stock" borderColor="#92400e" />
        </div>

        {/* Sales + Profit by Month */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
          <h2
            className="text-sm font-semibold mb-4"
            style={{ color: '#1a3a2a', fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Sales &amp; Profit by Month
          </h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#6b7280', fontFamily: "'Inter', system-ui, sans-serif" }}
                  axisLine={{ stroke: '#E5E5E0' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#6b7280', fontFamily: "'Inter', system-ui, sans-serif" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: "'Inter', system-ui, sans-serif" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '0.8125rem',
                    borderRadius: 8,
                    border: '1px solid #E5E5E0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const data = payload[0]?.payload as MonthData | undefined
                    if (!data) return null
                    return (
                      <div style={{
                        fontFamily: "'Inter', system-ui, sans-serif",
                        fontSize: '0.8125rem',
                        borderRadius: 8,
                        border: '1px solid #E5E5E0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        background: '#fff',
                        padding: '10px 14px',
                      }}>
                        <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{label}</p>
                        <p style={{ margin: '2px 0', color: '#1a3a2a' }}>Revenue: {data.revenue.toLocaleString('fr-FR')} €</p>
                        <p style={{ margin: '2px 0', color: '#4a9a6a' }}>Profit: {data.profit.toLocaleString('fr-FR')} €</p>
                        <p style={{ margin: '2px 0', color: '#9ca3af' }}>Tickets: {data.tickets}</p>
                      </div>
                    )
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '0.75rem',
                  }}
                  formatter={(value: string) =>
                    value === 'cost' ? 'Revenue' : value === 'profit' ? 'Profit' : 'Tickets'
                  }
                />
                <Bar yAxisId="left" dataKey="profit" stackId="revenue" fill="#4a9a6a" barSize={28} />
                <Bar yAxisId="left" dataKey="cost" stackId="revenue" fill="#1a3a2a" radius={[4, 4, 0, 0]} barSize={28} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="tickets"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#9ca3af' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
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
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">P&amp;L</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fulfillment</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Order Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-sm">No orders yet.</td>
                </tr>
              ) : (
                recentOrders.map(order => {
                  const pnl = orderPnL(order)
                  return (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-black">{order.evenement ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-600">{order.email ?? '—'}</td>
                      <td className="px-6 py-3 text-black">{order.prix_total != null ? `${Number(order.prix_total).toFixed(2)} €` : '—'}</td>
                      <td className="px-6 py-3">
                        {pnl ? (
                          <span className={`font-medium ${pnl.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {pnl.display}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">{statusBadge(order.statut_expedition)}</td>
                      <td className="px-6 py-3 text-gray-500">
                        {order.date_creation ? format(new Date(order.date_creation), 'dd MMM yyyy') : '—'}
                      </td>
                    </tr>
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
