// pages/api/waitlist/subscribe.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { slug, email } = req.body as { slug?: string; email?: string }
  if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' })

  // Check if already subscribed
  const { data: existing } = await supabaseServer
    .from('waitlist')
    .select('id')
    .eq('slug', slug)
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    return res.status(200).json({ message: "You're already on the waitlist" })
  }

  const { error } = await supabaseServer
    .from('waitlist')
    .insert({ slug, email })

  if (error) {
    console.error('waitlist subscribe error:', error.message)
    return res.status(500).json({ error: 'Failed to subscribe' })
  }

  return res.status(200).json({ message: "You'll be notified when tickets become available" })
}
