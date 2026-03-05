// pages/api/dashboard/update-order-status.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

const VALID_STATUSES = ['needs_sourcing', 'sourced', 'sent', 'complete']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }

  // Verify auth
  const token = req.cookies['sb-access-token']
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { orderId, status } = req.body as { orderId: string; status: string }

  if (!orderId || !status) {
    return res.status(400).json({ error: 'orderId and status are required' })
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` })
  }

  // Update only if owner_id matches authenticated user
  const { data, error } = await supabaseServer
    .from('commandes')
    .update({ statut_expedition: status })
    .eq('id', orderId)
    .eq('owner_id', user.id)
    .select('id')
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Order not found or not owned by you' })
  }

  return res.status(200).json({ success: true })
}
