// pages/api/dashboard/drafts.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies['sb-access-token']
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'PATCH') {
    const { id, slug, matched, status, prix, prix_adult, prix_child } = req.body

    if (!id) return res.status(400).json({ error: 'id is required' })

    const updates: Record<string, unknown> = {}
    if (slug !== undefined) updates.slug = slug
    if (matched !== undefined) updates.matched = matched
    if (status !== undefined) updates.status = status
    if (prix !== undefined) updates.prix = prix
    if (prix_adult !== undefined) updates.prix_adult = prix_adult
    if (prix_child !== undefined) updates.prix_child = prix_child

    const { error } = await supabaseServer
      .from('draft_listings')
      .update(updates)
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { error } = await supabaseServer
      .from('draft_listings')
      .update({ status: 'discarded' })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'POST' && req.body.action === 'publish') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id is required' })

    // Fetch the draft
    const { data: draft, error: fetchErr } = await supabaseServer
      .from('draft_listings')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !draft) return res.status(404).json({ error: 'Draft not found' })
    if (!draft.slug) return res.status(400).json({ error: 'Draft not matched to an event' })
    if (!draft.prix && !draft.prix_adult) return res.status(400).json({ error: 'Price is required' })

    // Get event info from billets for this slug
    const { data: existingBillet } = await supabaseServer
      .from('billets')
      .select('evenement, type, ville, pays, image, logo_artiste')
      .eq('slug', draft.slug)
      .limit(1)
      .single()

    const isMixed = draft.quantite_adult != null && draft.quantite_child != null &&
      (draft.quantite_adult > 0 || draft.quantite_child > 0)

    const billetRow: Record<string, unknown> = {
      evenement: draft.evenement ?? existingBillet?.evenement ?? 'Unknown',
      slug: draft.slug,
      date: draft.date ?? null,
      ville: draft.city ?? existingBillet?.ville ?? null,
      pays: draft.country ?? existingBillet?.pays ?? null,
      categorie: draft.categorie ?? null,
      prix: isMixed ? null : (draft.prix ?? 0),
      quantite: isMixed ? null : (draft.quantite ?? 1),
      quantite_adult: isMixed ? (draft.quantite_adult ?? 0) : null,
      quantite_child: isMixed ? (draft.quantite_child ?? 0) : null,
      prix_adult: isMixed ? (draft.prix_adult ?? 0) : null,
      prix_child: isMixed ? (draft.prix_child ?? 0) : null,
      cout_unitaire: draft.face_value ?? 0,
      disponible: true,
      owner_id: user.id,
      sourcing_required: false,
      type: existingBillet?.type ?? 'concert',
      image: existingBillet?.image ?? null,
      logo_artiste: existingBillet?.logo_artiste ?? null,
      extra_info: [draft.seat_numbers, draft.row, draft.section]
        .filter(Boolean).join(' / ') || null,
    }

    const { error: insertErr } = await supabaseServer.from('billets').insert(billetRow)
    if (insertErr) return res.status(500).json({ error: insertErr.message })

    // Mark as published
    const { error: updateErr } = await supabaseServer
      .from('draft_listings')
      .update({ status: 'published' })
      .eq('id', id)

    if (updateErr) return res.status(500).json({ error: updateErr.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
