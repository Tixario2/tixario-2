// pages/api/admin/parse-inventory.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { rawText } = req.body
  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'rawText is required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `Extract ticket data from raw text into a flat JSON array. One object per input row — never merge rows.

Fields per object:
- evenement (string): parent event name, same for all rows
- slug (string): lowercase-hyphen slug of parent event only (no city/date)
- session (string|null): sub-event/match name, null if single-date event
- date (string): YYYY-MM-DD
- ville (string): city
- lieu (string): venue
- pays (string|null): country
- categorie (string): ticket category
- prix (number|null): SELLING price per ticket, null if not given (never use purchase price)
- quantite (number): ticket count
- cout_unitaire (number|null): total PURCHASE cost for the row (not per ticket), null if not given
- type (string): "concert" or "sport"

Rules: group sub-events under one parent event. Slug = parent event name only. Output count must equal input row count. Return ONLY raw JSON array, no markdown.`,
      messages: [
        { role: 'user', content: rawText },
      ],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return res.status(500).json({ error: 'No text response from API' })
    }

    // Strip markdown code fences if present
    let jsonStr = textBlock.text.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(jsonStr)
    return res.status(200).json({ rows: parsed })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Parse inventory error:', errorMessage)
    return res.status(500).json({ error: errorMessage })
  }
}
