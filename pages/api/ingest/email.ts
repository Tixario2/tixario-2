// pages/api/ingest/email.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseServer } from '@/lib/supabaseServer'

const SUBJECT_SIGNALS = [
  'order confirmation', 'booking confirmation', 'your tickets',
  'your order', 'confirmation de commande', 'vos billets',
  'ticket confirmation', 'purchase confirmation', 'order receipt',
  'your purchase', 'billets commandés', 'commande confirmée',
  'billet', 'ticket', 'confirmation',
]

const SENDER_DOMAINS = [
  'ticketmaster', 'seetickets', 'axs.com', 'fifa.com', 'uefa.com',
  'rolandgarros.com', 'francebillet.com', 'fnacspectacles.com',
  'livenation.com', 'eventim', 'dice.fm', 'twickets',
  'tickets.com', 'stagefront', 'viagogo', 'stubhub',
]

const STRIP_PATTERNS = [
  /unsubscribe/i,
  /privacy policy/i,
  /terms/i,
  /copyright/i,
  /©/,
  /view in browser/i,
  /click here/i,
  /legal/i,
  /footer/i,
]

function stripEmail(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]+>/g, ' ')
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  // Filter out noise lines
  const lines = text.split('\n').filter(line => {
    const trimmed = line.trim()
    if (!trimmed) return false
    return !STRIP_PATTERNS.some(p => p.test(trimmed))
  })
  // Truncate to 1500 chars
  return lines.join('\n').slice(0, 1500)
}

interface ParsedListing {
  evenement?: string
  date?: string | null
  venue?: string | null
  city?: string | null
  country?: string | null
  categorie?: string | null
  quantite?: number | null
  seat_numbers?: string | null
  row?: string | null
  section?: string | null
  face_value?: number | null
  order_reference?: string | null
  sender_platform?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const { from, to, subject, text, html } = req.body as {
      from?: string
      to?: string
      subject?: string
      text?: string
      html?: string
    }

    // Step 1 — Identify owner
    const toStr = (to ?? '').toLowerCase()
    let owner: string | null = null
    if (toStr.includes('drops-adrien')) owner = 'adrien'
    else if (toStr.includes('drops-archie')) owner = 'archie'
    if (!owner) return res.status(200).json({ ok: true, skipped: 'unknown recipient' })

    // Step 2 — Check toggle
    const { data: setting } = await supabaseServer
      .from('settings')
      .select('value')
      .eq('key', `ingest_active_${owner}`)
      .single()

    if (!setting || setting.value !== 'true') {
      return res.status(200).json({ ok: true, skipped: 'ingest disabled' })
    }

    // Step 3 — Pre-filter
    const subjectLower = (subject ?? '').toLowerCase()
    const fromLower = (from ?? '').toLowerCase()

    const subjectMatch = SUBJECT_SIGNALS.some(s => subjectLower.includes(s))
    const senderMatch = SENDER_DOMAINS.some(d => fromLower.includes(d))

    if (!subjectMatch || !senderMatch) {
      return res.status(200).json({ ok: true, skipped: 'no signal match' })
    }

    // Step 4 — Strip email
    const rawContent = html || text || ''
    const stripped = stripEmail(rawContent)
    if (!stripped.trim()) {
      return res.status(200).json({ ok: true, skipped: 'empty content' })
    }

    // Step 5 — Parse with Haiku
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[ingest/email] ANTHROPIC_API_KEY not configured')
      return res.status(200).json({ ok: true, error: 'api key missing' })
    }

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Extract ticket purchase data from this confirmation email text. Return only valid JSON, no other text:
{
  "evenement": "event name",
  "date": "YYYY-MM-DD or null",
  "venue": "venue name or null",
  "city": "city or null",
  "country": "country or null",
  "categorie": "ticket category/section or null",
  "quantite": number or null,
  "seat_numbers": "e.g. A1, A2 or null",
  "row": "row or null",
  "section": "section or null",
  "face_value": number or null,
  "order_reference": "order ref or null",
  "sender_platform": "platform name"
}
If multiple separate orders in one email, return an array of objects.`,
      messages: [{ role: 'user', content: stripped }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[ingest/email] No text response from AI')
      return res.status(200).json({ ok: true, error: 'no AI response' })
    }

    let jsonStr = textBlock.text.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let parsed: ParsedListing[]
    try {
      const result = JSON.parse(jsonStr)
      parsed = Array.isArray(result) ? result : [result]
    } catch {
      console.error('[ingest/email] Failed to parse AI JSON:', jsonStr.slice(0, 200))
      return res.status(200).json({ ok: true, error: 'json parse failed' })
    }

    // Step 6 & 7 — Match and insert
    const snippet = stripped.slice(0, 200)
    const rows = []

    for (const listing of parsed) {
      let slug: string | null = null
      let matched = false

      if (listing.evenement) {
        // Try to match to existing event
        let query = supabaseServer
          .from('billets')
          .select('slug')
          .ilike('evenement', `%${listing.evenement}%`)
          .limit(1)

        if (listing.date) {
          query = query.eq('date', listing.date)
        }

        const { data: matchRows } = await query
        if (matchRows && matchRows.length > 0 && matchRows[0].slug) {
          slug = matchRows[0].slug
          matched = true
        }
      }

      rows.push({
        owner,
        slug,
        matched,
        evenement: listing.evenement ?? null,
        date: listing.date ?? null,
        venue: listing.venue ?? null,
        city: listing.city ?? null,
        country: listing.country ?? null,
        categorie: listing.categorie ?? null,
        quantite: listing.quantite ?? null,
        seat_numbers: listing.seat_numbers ?? null,
        row: listing.row ?? null,
        section: listing.section ?? null,
        face_value: listing.face_value ?? null,
        order_reference: listing.order_reference ?? null,
        sender_platform: listing.sender_platform ?? null,
        raw_email_snippet: snippet,
        status: 'draft',
      })
    }

    if (rows.length > 0) {
      const { error } = await supabaseServer.from('draft_listings').insert(rows)
      if (error) {
        console.error('[ingest/email] Insert error:', error.message)
      }
    }

    return res.status(200).json({ ok: true, inserted: rows.length })
  } catch (err) {
    console.error('[ingest/email] Unexpected error:', err)
    // Always return 200 so Resend doesn't retry
    return res.status(200).json({ ok: true, error: 'unexpected error' })
  }
}
