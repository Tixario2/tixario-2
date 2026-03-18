// pages/api/admin/insert-billets.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth check: verify the user is logged in
  const token = req.cookies['sb-access-token']
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const { rows } = req.body
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' })
  }

  // Verify all rows have owner_id matching the authenticated user
  for (const row of rows) {
    if (row.owner_id !== user.id) {
      return res.status(403).json({ error: 'owner_id mismatch' })
    }
  }

  const { error } = await supabaseServer.from('billets').insert(rows)
  if (error) {
    console.error('insert-billets error:', JSON.stringify(error))
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ ok: true, count: rows.length })
}
