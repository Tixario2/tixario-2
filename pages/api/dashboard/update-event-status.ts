// pages/api/dashboard/update-event-status.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.cookies['sb-access-token']
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { slug, action } = req.body as { slug?: string; action?: string }
  console.log('[update-event-status] slug:', slug, 'action:', action)
  if (!slug || !action) return res.status(400).json({ error: 'slug and action are required' })

  let fields: Record<string, boolean | string | null>
  if (action === 'pause') fields = { paused: true }
  else if (action === 'resume') fields = { paused: false }
  else if (action === 'archive') fields = { archived: true, archived_at: new Date().toISOString() }
  else if (action === 'unarchive') fields = { archived: false, archived_at: null, paused: true }
  else return res.status(400).json({ error: 'Invalid action' })

  // Check if event_meta row exists
  const { data: existing } = await supabaseServer
    .from('event_meta')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle()

  console.log('[update-event-status] existing row:', existing ? 'yes' : 'no')

  if (existing) {
    // Update existing row
    const { error } = await supabaseServer
      .from('event_meta')
      .update(fields)
      .eq('slug', slug)

    if (error) {
      console.error('[update-event-status] update error:', error.message)
      return res.status(500).json({ error: error.message })
    }
  } else {
    // Get event name + type from billets to create the row
    const { data: billet } = await supabaseServer
      .from('billets')
      .select('evenement, type')
      .eq('slug', slug)
      .limit(1)
      .single()

    if (!billet) return res.status(404).json({ error: 'Event not found' })

    const { error } = await supabaseServer
      .from('event_meta')
      .insert({
        slug,
        evenement: billet.evenement,
        type: billet.type ?? 'concert',
        ...fields,
      })

    if (error) return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true })
}
