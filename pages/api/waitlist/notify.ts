// pages/api/waitlist/notify.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'
import { resend } from '@/lib/resend'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth: either CRON_SECRET or authenticated dashboard user
  const authHeader = req.headers.authorization
  const token = req.cookies['sb-access-token']
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: { user }, error } = await supabaseServer.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })
  }

  const { slug } = req.body as { slug?: string }
  if (!slug) return res.status(400).json({ error: 'slug is required' })

  // Get event name from event_meta
  const { data: meta } = await supabaseServer
    .from('event_meta')
    .select('evenement')
    .eq('slug', slug)
    .single()

  const eventName = meta?.evenement ?? slug

  // Fetch waitlist subscribers not yet notified
  const { data: subscribers, error: subErr } = await supabaseServer
    .from('waitlist')
    .select('id, email')
    .eq('slug', slug)
    .is('notified_at', null)

  if (subErr) {
    console.error('waitlist notify query error:', subErr.message)
    return res.status(500).json({ error: subErr.message })
  }

  if (!subscribers || subscribers.length === 0) {
    return res.status(200).json({ notified: 0 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://zenntry.com'
  let notified = 0
  const ids: string[] = []

  for (const sub of subscribers) {
    try {
      await resend.emails.send({
        from: 'contact@mail.zenntry.com',
        to: sub.email,
        subject: `Tickets available — ${eventName}`,
        html: `<div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; padding: 32px 0; color: #111111;">
  <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #111111; margin: 0 0 28px;">ZENNTRY</p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
    <strong>${eventName}</strong> tickets are now available on Zenntry. Buy now before they sell out again.
  </p>
  <a href="${siteUrl}/${slug}" style="display: inline-block; background: #1a3a2a; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 500;">View Tickets</a>
  <p style="font-size: 12px; color: #999; margin: 28px 0 0;">Zenntry</p>
</div>`,
      })
      ids.push(sub.id)
      notified++
    } catch (err) {
      console.error(`waitlist notify failed for ${sub.email}:`, err)
    }
  }

  // Mark as notified
  if (ids.length > 0) {
    await supabaseServer
      .from('waitlist')
      .update({ notified_at: new Date().toISOString() })
      .in('id', ids)
  }

  return res.status(200).json({ notified })
}
