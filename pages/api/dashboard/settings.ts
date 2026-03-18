// pages/api/dashboard/settings.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies['sb-access-token']
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from('settings')
      .select('key, value, updated_at')
      .in('key', ['ingest_active_adrien', 'ingest_active_archie'])

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ settings: data ?? [] })
  }

  if (req.method === 'POST') {
    const { key, value } = req.body
    if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' })

    const allowed = ['ingest_active_adrien', 'ingest_active_archie']
    if (!allowed.includes(key)) return res.status(400).json({ error: 'Invalid key' })

    const { error } = await supabaseServer
      .from('settings')
      .update({ value: String(value), updated_at: new Date().toISOString() })
      .eq('key', key)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
