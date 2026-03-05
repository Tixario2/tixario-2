// pages/dashboard/purchases.tsx
import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { supabaseServer } from '@/lib/supabaseServer'

interface Props {
  userName: string | null
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

  return {
    props: {
      userName: profile?.name ?? user.email ?? null,
    },
  }
}

export default function PurchasesPage({ userName }: Props) {
  return (
    <DashboardLayout userName={userName}>
      <div className="p-8">
        <h1 className="text-xl font-bold text-black mb-6">Purchases</h1>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Coming soon</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
