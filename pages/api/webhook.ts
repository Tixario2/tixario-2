import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import getRawBody from 'raw-body'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// — Client Supabase "serveur"
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// — Resend email client
export const resend = new Resend(process.env.RESEND_API_KEY!)

// — Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

export const config = { api: { bodyParser: false } }

interface BilletInfo {
  description: string
  quantite: number
  montant_total: number
  prix_unitaire: number
  evenement: string
  categorie: string
}

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

  // 3) Idempotency check — skip if already processed
  const { data: existingAudit } = await supabase
    .from('audit_log')
    .select('id')
    .eq('action', 'WEBHOOK_PROCESSED')
    .eq('record_id', event.id)
    .maybeSingle()

  if (existingAudit) {
    console.log('⚠️ Event déjà traité, ignoré:', event.id)
    return res.status(200).json({ received: true })
  }

  // 4) Only handle checkout.session.completed and checkout.session.expired
  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.expired'
  ) {
    console.log('⚠️ Event non géré:', event.type)
    return res.status(200).json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session

  // ─────────────────────────────────────────────────────────────
  // checkout.session.expired — cancel the reservation
  // ─────────────────────────────────────────────────────────────
  if (event.type === 'checkout.session.expired') {
    const reservationId = session.metadata?.reservation_id
    if (reservationId) {
      const { error: cancelErr } = await supabase
        .from('reservations')
        .update({ status: 'CANCELED' })
        .eq('id', reservationId)
        .eq('status', 'PENDING')
      if (cancelErr) console.error('❌ Erreur annulation réservation:', JSON.stringify(cancelErr))
      else console.log('✅ Réservation annulée:', reservationId)
    }

    await supabase.from('audit_log').insert({
      table_name: 'reservations',
      record_id: event.id,
      action: 'WEBHOOK_PROCESSED',
      new_data: { event_type: event.type, reservation_id: reservationId ?? null },
    })

    return res.status(200).json({ received: true })
  }

  // ─────────────────────────────────────────────────────────────
  // checkout.session.completed — finalize the reservation
  // ─────────────────────────────────────────────────────────────

  const reservationId = session.metadata?.reservation_id
  if (!reservationId) {
    console.log('⚠️ Pas de reservation_id dans session.metadata, ignoré')
    return res.status(200).json({ received: true })
  }

  // Atomically transition reservation PENDING → CAPTURED
  const { data: capturedRows, error: captureErr } = await supabase
    .from('reservations')
    .update({ status: 'CAPTURED' })
    .eq('id', reservationId)
    .eq('status', 'PENDING')
    .select('id')

  if (captureErr) {
    console.error('❌ Erreur capture réservation:', JSON.stringify(captureErr))
  }

  if (!capturedRows || capturedRows.length === 0) {
    console.log('⚠️ Réservation déjà capturée ou expirée, ignoré:', reservationId)
    return res.status(200).json({ received: true })
  }

  console.log('✅ Réservation capturée:', reservationId)
  console.log('🔍 Starting order creation for reservation:', reservationId)

  try {
    // Récupération robuste de l'email client
    console.log('✉️ session.customer_email   =', session.customer_email)
    console.log('✉️ session.customer_details =', session.customer_details)
    console.log('✉️ session.customer         =', session.customer)

    let emailClient: string | null = null
    if (session.customer_email) {
      emailClient = session.customer_email
    } else if (session.customer_details?.email) {
      emailClient = session.customer_details.email
    } else if (typeof session.customer === 'string') {
      const cust = await stripe.customers.retrieve(session.customer)
      if (!Array.isArray(cust) && !(cust as any).deleted) {
        emailClient = (cust as Stripe.Customer).email ?? null
      }
    }
    console.log('✉️ emailClient final       =', emailClient)

    // Fetch reservation_items joined to billets
    const { data: reservationItems, error: itemsErr } = await supabase
      .from('reservation_items')
      .select(`
        quantity,
        unit_price,
        billet_id,
        billets (
          evenement,
          categorie
        )
      `)
      .eq('reservation_id', reservationId)

    if (itemsErr || !reservationItems || reservationItems.length === 0) {
      console.error('❌ Erreur fetch reservation_items:', JSON.stringify(itemsErr))
      throw new Error('Failed to fetch reservation items')
    }

    // Build billetsInfos from reservation data
    const billetsInfos: BilletInfo[] = reservationItems.map((item: any) => {
      if (!item.billets || typeof item.billets !== 'object' || Array.isArray(item.billets)) {
        throw new Error('Invalid billets join result for billet_id: ' + item.billet_id)
      }
      const billets = item.billets
      const unitPrice = parseFloat(item.unit_price)
      return {
        description: billets.evenement,
        quantite: item.quantity,
        montant_total: unitPrice * item.quantity,
        prix_unitaire: unitPrice,
        evenement: billets.evenement,
        categorie: billets.categorie,
      }
    })
    const totalQty = billetsInfos.reduce((a, b) => a + b.quantite, 0)
    const totalPrice = (session.amount_total ?? 0) / 100
    const billetIds = reservationItems.map((item: any) => item.billet_id)

    // Insertion de la commande
    const { data: cmdData, error: cmdErr } = await supabase
      .from('commandes')
      .insert({
        stripe_session_id: session.id,
        email: emailClient,
        nom: session.customer_details?.name || null,
        billets: billetsInfos,
        quantite_total: totalQty,
        prix_total: totalPrice,
        date_evenement: session.metadata?.date_evenement || null,
        evenement: billetsInfos[0]?.evenement || null,
        id_billets: billetIds,
        date_creation: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (cmdErr) {
      console.error('❌ Erreur insert commande:', JSON.stringify(cmdErr))
      throw new Error('Failed to insert commande: ' + cmdErr.message)
    }
    console.log('🆔 Commande insérée, id =', cmdData?.id)

    // Audit log — WEBHOOK_PROCESSED (only after successful order creation)
    await supabase.from('audit_log').insert({
      table_name: 'reservations',
      record_id: event.id,
      action: 'WEBHOOK_PROCESSED',
      new_data: { event_type: event.type, reservation_id: reservationId, commande_id: cmdData?.id ?? null },
    })

    // Inscription en newsletter
    if (cmdData?.id && emailClient) {
      const { error: newsErr } = await supabase
        .from('newsletter')
        .insert({
          email: emailClient,
          source: 'commande',
          date_inscription: new Date().toISOString(),
        })
      if (newsErr) console.error('❌ Erreur insert newsletter:', JSON.stringify(newsErr))
      else console.log('📬 Inscription newsletter réussie')
    }

    // Envoi email de confirmation via Resend
    if (cmdData?.id && emailClient) {
      console.log('📧 Envoi email confirmation à:', emailClient)
      try {
        const result = await resend.emails.send({
          from: 'contact@mail.zenntry.com',
          to: emailClient,
          subject: 'Confirmation de votre commande – Tixario',
          html: `
            <div style="font-family: Arial; background-color: #121212; color: #fff; padding: 32px; max-width: 600px; margin: auto; border-radius: 8px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <img src="https://tixario.com/logo-tixario.png" alt="Tixario" style="height: 40px;" />
              </div>
              <h2 style="color: #eab308;">Merci pour votre commande sur Tixario</h2>
              <p style="font-size: 16px; margin-bottom: 24px;">Commande n°${cmdData?.id}</p>
              <div style="background-color: #1e1e1e; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
                <ul style="list-style: none; padding: 0; margin: 0;">
                  ${billetsInfos.map(b => `
                    <li style="margin-bottom: 10px;">
                      ${b.description} — ${b.quantite} × ${b.prix_unitaire.toFixed(2)} €
                    </li>`).join('')}
                </ul>
                <p style="margin-top: 16px; font-weight: bold;">Total : ${totalPrice.toFixed(2)} €</p>
              </div>
              <p style="font-size: 14px;">Vos billets seront envoyés sous 24 h par email ou WhatsApp.</p>
              <p style="font-size: 14px;">
                Une question ? Écrivez-nous à
                <a href="mailto:contact@tixario.com" style="color: #eab308;">
                  contact@tixario.com
                </a>.
              </p>
            </div>
          `
        })
        console.log('✅ Email confirmation envoyé:', result)
      } catch (err) {
        console.error('❌ Erreur envoi email confirmation:', err)
      }
    }

  } catch (err: any) {
    console.error('❌ Erreur lors du traitement webhook:', err.message, err.stack)
  }

  // Réponse à Stripe
  res.status(200).json({ received: true })
}
