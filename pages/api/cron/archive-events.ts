// pages/api/cron/archive-events.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── Stage 1: Archive ──────────────────────────────────────────
  // If max session date < now minus 12 hours → set archived + archived_at
  const { data: liveEvents, error: evErr } = await supabaseServer
    .from('event_meta')
    .select('slug')
    .eq('archived', false)

  if (evErr) {
    console.error('archive-events: failed to fetch events:', evErr.message)
    return res.status(500).json({ error: evErr.message })
  }

  let archived = 0

  for (const ev of (liveEvents ?? [])) {
    const { data: rows } = await supabaseServer
      .from('billets')
      .select('date')
      .eq('slug', ev.slug)
      .order('date', { ascending: false })
      .limit(1)

    if (!rows || rows.length === 0) continue

    const maxDate = rows[0].date
    if (!maxDate || maxDate >= twelveHoursAgo) continue

    const { error: archErr } = await supabaseServer
      .from('event_meta')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq('slug', ev.slug)

    if (archErr) {
      console.error(`archive-events: failed to archive ${ev.slug}:`, archErr.message)
    } else {
      archived++
      console.log(`archive-events: archived ${ev.slug} (max date: ${maxDate})`)
    }
  }

  // ── Stage 2: Delete ───────────────────────────────────────────
  // If archived_at < now minus 7 days → hard delete event_meta, billets, waitlist
  const { data: staleEvents, error: staleErr } = await supabaseServer
    .from('event_meta')
    .select('slug')
    .eq('archived', true)
    .lt('archived_at', sevenDaysAgo)

  if (staleErr) {
    console.error('archive-events: failed to fetch stale events:', staleErr.message)
    return res.status(200).json({ archived, deleted: 0 })
  }

  let deleted = 0

  for (const ev of (staleEvents ?? [])) {
    const { error: delBillets } = await supabaseServer
      .from('billets')
      .delete()
      .eq('slug', ev.slug)

    if (delBillets) {
      console.error(`archive-events: failed to delete billets for ${ev.slug}:`, delBillets.message)
      continue
    }

    const { error: delWaitlist } = await supabaseServer
      .from('waitlist')
      .delete()
      .eq('slug', ev.slug)

    if (delWaitlist) {
      console.error(`archive-events: failed to delete waitlist for ${ev.slug}:`, delWaitlist.message)
    }

    const { error: delMeta } = await supabaseServer
      .from('event_meta')
      .delete()
      .eq('slug', ev.slug)

    if (delMeta) {
      console.error(`archive-events: failed to delete event_meta for ${ev.slug}:`, delMeta.message)
    } else {
      deleted++
      console.log(`archive-events: deleted ${ev.slug}`)
    }
  }

  return res.status(200).json({ archived, deleted })
}
