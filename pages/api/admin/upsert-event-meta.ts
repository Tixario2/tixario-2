// pages/api/admin/upsert-event-meta.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.cookies['sb-access-token']
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const { slug, evenement, type, image, seo_title_en, seo_title_fr, seo_description_en, seo_description_fr, seo_text_en, seo_text_fr } = req.body

  if (!slug || !evenement) {
    return res.status(400).json({ error: 'slug and evenement are required' })
  }

  // Build payload with only provided fields — omitted fields keep their current DB value
  const row: Record<string, string | null> = { slug, evenement }
  if (type !== undefined) row.type = type
  if (image !== undefined) row.image = image || null
  if (seo_title_en !== undefined) row.seo_title_en = seo_title_en || null
  if (seo_title_fr !== undefined) row.seo_title_fr = seo_title_fr || null
  if (seo_description_en !== undefined) row.seo_description_en = seo_description_en || null
  if (seo_description_fr !== undefined) row.seo_description_fr = seo_description_fr || null
  if (seo_text_en !== undefined) row.seo_text_en = seo_text_en || null
  if (seo_text_fr !== undefined) row.seo_text_fr = seo_text_fr || null

  const { error } = await supabaseServer
    .from('event_meta')
    .upsert(row, { onConflict: 'slug' })

  if (error) {
    console.error('upsert-event-meta error:', error.message)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ ok: true })
}
