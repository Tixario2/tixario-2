// pages/api/demandes/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH'])
    return res.status(405).end('Method Not Allowed')
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing id.' })
  }

  const { statut, notes_internes } = req.body as {
    statut?: string
    notes_internes?: string
  }

  const update: Record<string, string> = { updated_at: new Date().toISOString() }
  if (statut !== undefined) update.statut = statut
  if (notes_internes !== undefined) update.notes_internes = notes_internes

  const { error } = await supabaseServer
    .from('demandes')
    .update(update)
    .eq('id', id)

  if (error) {
    console.error('demandes update error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true })
}
