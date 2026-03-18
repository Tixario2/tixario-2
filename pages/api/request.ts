// pages/api/request.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }

  const {
    evenement,
    date_evenement,
    nb_billets,
    categorie_preferee,
    budget,
    canal_contact,
    telephone,
    notes_client,
  } = req.body

  if (!evenement || !nb_billets || !canal_contact || !telephone) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  if (!['whatsapp', 'telegram'].includes(canal_contact)) {
    return res.status(400).json({ error: 'Invalid canal_contact value.' })
  }

  const { error } = await supabase.from('demandes').insert({
    evenement,
    date_evenement: date_evenement || null,
    nb_billets: Number(nb_billets),
    categorie_preferee: categorie_preferee || null,
    budget: budget || null,
    canal_contact,
    telephone,
    notes_client: notes_client || null,
  })

  if (error) {
    console.error('demandes insert error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true })
}
