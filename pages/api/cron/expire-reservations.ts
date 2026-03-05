// pages/api/cron/expire-reservations.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }

  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase.rpc('release_expired_reservations')

  if (error) {
    console.error('❌ release_expired_reservations failed:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ expired: data })
}
