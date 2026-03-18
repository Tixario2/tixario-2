// pages/api/cron/event-reminders.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'
import { resend } from '@/lib/resend'
import { format } from 'date-fns'

const REMINDER_DAYS = [30, 15, 7, 2, 0]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Fetch all available billets with stock
  const { data: billets, error } = await supabaseServer
    .from('billets')
    .select('slug, evenement, date, ville, lieu, owner_id, quantite, quantite_adult, quantite_child, cout_unitaire')
    .eq('disponible', true)

  if (error) {
    console.error('event-reminders query error:', error.message)
    return res.status(500).json({ error: error.message })
  }

  if (!billets || billets.length === 0) {
    return res.status(200).json({ sent: 0 })
  }

  // Group by slug + date + owner_id
  interface Group {
    slug: string
    evenement: string
    date: string
    ville: string
    lieu: string
    owner_id: string
    totalTickets: number
    totalCost: number
  }

  const groups = new Map<string, Group>()
  for (const b of billets) {
    if (!b.date || !b.owner_id) continue

    const key = `${b.slug}__${b.date}__${b.owner_id}`
    const stock = (b.quantite_adult != null && b.quantite_child != null)
      ? (b.quantite_adult + b.quantite_child)
      : (b.quantite ?? 0)

    if (stock <= 0) continue

    if (!groups.has(key)) {
      groups.set(key, {
        slug: b.slug,
        evenement: b.evenement,
        date: b.date,
        ville: b.ville ?? '',
        lieu: b.lieu ?? '',
        owner_id: b.owner_id,
        totalTickets: 0,
        totalCost: 0,
      })
    }
    const g = groups.get(key)!
    g.totalTickets += stock
    g.totalCost += (b.cout_unitaire ?? 0) * stock
  }

  // Calculate days until event and filter for reminder days
  const todayMs = new Date(today).getTime()
  let sent = 0

  // Cache owner emails
  const emailCache = new Map<string, string | null>()

  for (const g of groups.values()) {
    const eventMs = new Date(g.date).getTime()
    const daysUntil = Math.round((eventMs - todayMs) / (1000 * 60 * 60 * 24))

    if (!REMINDER_DAYS.includes(daysUntil)) continue

    // Fetch owner email
    if (!emailCache.has(g.owner_id)) {
      const { data: { user } } = await supabaseServer.auth.admin.getUserById(g.owner_id)
      emailCache.set(g.owner_id, user?.email ?? null)
    }
    const ownerEmail = emailCache.get(g.owner_id)
    if (!ownerEmail) continue

    const daysLabel = daysUntil === 0 ? 'today' : `${daysUntil} days`
    const subject = daysUntil === 0
      ? `${g.evenement} — today`
      : `${g.evenement} ${g.ville ? g.ville + ' ' : ''}— ${daysUntil} days`

    const formattedDate = format(new Date(g.date), 'dd MMMM yyyy')

    const html = `<div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; padding: 32px 0; color: #111111;">
  <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #111111; margin: 0 0 28px;">ZENNTRY</p>

  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
    <strong>${g.evenement}</strong> at ${g.lieu || '—'}, ${g.ville || '—'} is on <strong>${formattedDate}</strong> — ${daysLabel} from now.
  </p>

  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 6px; color: #555;">Your current inventory:</p>
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 4px;">Tickets remaining: <strong>${g.totalTickets}</strong></p>
  <p style="font-size: 14px; line-height: 1.6; margin: 0 0 28px;">Total cost: <strong>${g.totalCost.toFixed(2)} &euro;</strong></p>

  <p style="font-size: 12px; color: #999; margin: 0;">Zenntry</p>
</div>`

    try {
      await resend.emails.send({
        from: 'contact@mail.zenntry.com',
        to: ownerEmail,
        subject,
        html,
      })
      sent++
      console.log(`event-reminder sent: ${g.evenement} ${g.date} → ${ownerEmail} (${daysLabel})`)
    } catch (err) {
      console.error(`event-reminder failed: ${g.evenement} ${g.date} → ${ownerEmail}`, err)
    }
  }

  return res.status(200).json({ sent })
}
