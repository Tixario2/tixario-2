import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import getRawBody from 'raw-body'
import { createClient } from '@supabase/supabase-js'

// Initialise le client Supabase avec la service role key
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

export const config = { api: { bodyParser: false } }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ received: boolean; error?: string }>
) {
  console.log('🚀 webhook handler démarré')

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end('Method Not Allowed')
  }

  // 1) Lire le raw body
  let rawBody: Buffer
  try {
    rawBody = await getRawBody(req)
  } catch (err: any) {
    console.error('❌ Erreur lecture rawBody:', err)
    return res.status(400).json({ received: false, error: err.message })
  }
  const sig = req.headers['stripe-signature']
  if (typeof sig !== 'string') {
    console.error('❌ Header stripe-signature manquant')
    return res.status(400).json({ received: false, error: 'Missing Stripe signature' })
  }

  // 2) Valider l'événement Stripe
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
    console.log('✅ Stripe event validé, type =', event.type)
  } catch (err: any) {
    console.error('❌ Signature Stripe invalide:', err.message)
    return res.status(400).json({ received: false, error: err.message })
  }

  // Traiter uniquement les paiements complétés
  if (event.type !== 'checkout.session.completed') {
    console.log('⚠️ Event non géré:', event.type)
    return res.status(200).json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  console.log('📩 Traitement session.id =', session.id)

  try {
    // 3) Récupérer les line items
    const lineItems = await stripe.checkout.sessions.listLineItems(
      session.id,
      { limit: 100 }
    )
    console.log('🛒 lineItems count =', lineItems.data.length)

    // Décrémenter le stock pour chaque billet
    const billetIds: string[] = []
    for (const item of lineItems.data) {
      const desc = item.description || ''
      const match = desc.match(/\[ID:(.+?)\]/)
      const billetId = match?.[1]
      const qty = item.quantity ?? 1
      if (billetId) {
        billetIds.push(billetId)
        console.log('🔽 Décrémentation billet', billetId, 'par', qty)
        // Récup quantité actuelle
        const { data: cur, error: e1 } = await supabase
          .from('billets')
          .select('quantite')
          .eq('id_billet', billetId)
          .single()
        if (e1) {
          console.error('❌ Erreur fetch stock:', JSON.stringify(e1))
        } else {
          const newQty = Math.max((cur.quantite || 0) - qty, 0)
          const { error: e2 } = await supabase
            .from('billets')
            .update({ quantite: newQty })
            .eq('id_billet', billetId)
          if (e2) console.error('❌ Erreur update stock:', JSON.stringify(e2))
          else console.log('✅ Stock mis à jour', billetId, '→', newQty)
        }
      }
    }

    // 4) Insérer la commande
    const billetsInfos = lineItems.data.map(item => {
      const desc = item.description || ''
      const [evPart, catPart] = desc.split('–').map(s => s.trim())
      return {
        description: evPart,
        quantite: item.quantity ?? 1,
        montant_total: (item.amount_total ?? 0) / 100,
        prix_unitaire: ((item.amount_subtotal ?? 0) / (item.quantity ?? 1)) / 100,
        evenement: evPart,
        categorie: catPart?.split('[')[0].trim() || ''
      }
    })
    const totalQty = billetsInfos.reduce((a, b) => a + b.quantite, 0)
    const totalPrice = (session.amount_total ?? 0) / 100

    const { data: cmdData, error: cmdErr } = await supabase
      .from('commandes')
      .insert({
        stripe_session_id: session.id,
        email: session.customer_email,
        nom: session.customer_details?.name || null,
        billets: billetsInfos,
        quantite_total: totalQty,
        prix_total: totalPrice,
        date_evenement: session.metadata?.date_evenement || null,
        evenement: billetsInfos[0]?.evenement || null,
        id_billets: billetIds,
        date_creation: new Date().toISOString()
      })
      .select('id')
      .single()

    if (cmdErr) console.error('❌ Erreur insert commande:', JSON.stringify(cmdErr))
    else console.log('🆔 Commande insérée, id =', cmdData?.id)

    // 5) Inscrire en newsletter
    if (cmdData?.id && session.customer_email) {
      const { error: newsErr } = await supabase
        .from('newsletter')
        .insert({
          email: session.customer_email,
          source: 'commande',
          date_inscription: new Date().toISOString()
        })
      if (newsErr) console.error('❌ Erreur insert newsletter:', JSON.stringify(newsErr))
      else console.log('📬 Inscription newsletter réussie')
    }

  } catch (err: any) {
    console.error('❌ Erreur lors du traitement webhook:', err)
  }

  // 6) Répondre à Stripe
  res.status(200).json({ received: true })
}




