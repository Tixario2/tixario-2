// pages/dashboard/inventory.tsx
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'
import { format } from 'date-fns'

interface Billet {
  id_billet: string
  evenement: string | null
  date: string | null
  categorie: string | null
  prix: number | null
  quantite: number | null
}

interface Props {
  userName: string | null
  billets: Billet[]
  kpi: {
    totalEvents: number
    totalTickets: number
    totalValue: number
  }
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

  const { data: billets } = await supabaseServer
    .from('billets')
    .select('id_billet, evenement, date, categorie, prix, quantite')
    .eq('owner_id', user.id)
    .order('date', { ascending: true })

  const rows = billets ?? []
  const eventNames = new Set(rows.map(b => b.evenement).filter(Boolean))
  const totalTickets = rows.reduce((sum, b) => sum + (b.quantite ?? 0), 0)
  const totalValue = rows.reduce((sum, b) => sum + ((b.prix ?? 0) * (b.quantite ?? 0)), 0)

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
      billets: rows,
      kpi: {
        totalEvents: eventNames.size,
        totalTickets,
        totalValue,
      },
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

export default function InventoryPage({ userName, billets, kpi }: Props) {
  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Inventory</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <KpiCard label="Total Events" value={kpi.totalEvents} />
          <KpiCard label="Total Tickets" value={kpi.totalTickets} />
          <KpiCard label="Inventory Value" value={`${kpi.totalValue.toFixed(2)} €`} />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Price</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Stock</th>
              </tr>
            </thead>
            <tbody>
              {billets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">No inventory found.</td>
                </tr>
              ) : (
                billets.map(billet => (
                  <tr key={billet.id_billet} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-black">{billet.evenement ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {billet.date ? format(new Date(billet.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{billet.categorie ?? '—'}</td>
                    <td className="px-4 py-3 text-black font-medium">
                      {billet.prix != null ? `${Number(billet.prix).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        (billet.quantite ?? 0) === 0
                          ? 'bg-red-100 text-red-700'
                          : (billet.quantite ?? 0) <= 3
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {billet.quantite ?? 0}
                      </span>
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
