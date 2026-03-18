// pages/api/admin/check-event.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name } = req.body
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' })
  }

  try {
    const { data, error } = await supabaseServer
      .from('billets')
      .select('evenement, slug, date, ville, image, type')
      .ilike('evenement', `%${name}%`)

    if (error) throw error

    // Group by slug to show distinct events
    const slugMap = new Map<string, { evenement: string; dates: string[]; ville: string; image: string | null; type: string | null }>()
    for (const row of data ?? []) {
      if (!row.slug) continue
      if (!slugMap.has(row.slug)) {
        slugMap.set(row.slug, { evenement: row.evenement, dates: [], ville: row.ville || '', image: row.image || null, type: row.type || null })
      }
      if (row.date && !slugMap.get(row.slug)!.dates.includes(row.date)) {
        slugMap.get(row.slug)!.dates.push(row.date)
      }
    }

    const matches = Array.from(slugMap.entries()).map(([slug, info]) => ({
      slug,
      evenement: info.evenement,
      ville: info.ville,
      dates: info.dates.sort(),
      image: info.image,
      type: info.type,
    }))

    return res.status(200).json({ exists: matches.length > 0, matches })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('check-event error:', msg)
    return res.status(500).json({ error: msg })
  }
}
