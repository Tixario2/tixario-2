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
  date: string | null
  cout_unitaire: number
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
          categorie,
          date,
          cout_unitaire
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
        date: billets.date ?? null,
        cout_unitaire: billets.cout_unitaire ?? 0,
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

    // Set owner_id on the commande + fetch sourcing_required from the first billet
    const firstBilletId = reservationItems[0]?.billet_id
    let ownerId: string | null = null
    let sourcingRequired = false
    if (firstBilletId) {
      const { data: billetData } = await supabase
        .from('billets')
        .select('owner_id, sourcing_required')
        .eq('id_billet', firstBilletId)
        .single()
      ownerId = billetData?.owner_id ?? null
      sourcingRequired = billetData?.sourcing_required ?? false
    }

    if (ownerId && cmdData?.id) {
      const update: Record<string, any> = { owner_id: ownerId }
      if (sourcingRequired) update.statut_expedition = 'needs_sourcing'
      const { error: ownerErr } = await supabase
        .from('commandes')
        .update(update)
        .eq('id', cmdData.id)
      if (ownerErr) console.error('❌ Erreur set owner_id/statut commande:', JSON.stringify(ownerErr))
      else console.log('✅ owner_id set on commande:', ownerId, '| sourcing_required:', sourcingRequired)
    }

    // Send owner notification email (sourcing alert or simple sale notification)
    if (ownerId) {
      const { data: { user: ownerUser } } = await supabase.auth.admin.getUserById(ownerId)
      const ownerEmail = ownerUser?.email ?? null
      const eventName = billetsInfos[0]?.evenement ?? '—'

      const billetDate = billetsInfos[0]?.date ?? null
      const billetCategory = billetsInfos[0]?.categorie ?? null
      const nomClient = session.customer_details?.name ?? null
      const totalCost = billetsInfos.reduce((a, b) => a + (b.cout_unitaire * b.quantite), 0)
      const profit = totalPrice - totalCost
      const roi = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(1) : '—'
      const profitColor = profit >= 0 ? '#1a7a3a' : '#c53030'

      if (ownerEmail) {
        try {
          const orderTable = `
            <table style="width:100%; border-collapse:collapse; font-size:15px; margin: 20px 0;">
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666; width:160px;">Event</td><td style="padding:10px 0;"><strong>${eventName}</strong></td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Event date</td><td style="padding:10px 0;">${billetDate ?? '—'}</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Category / Seats</td><td style="padding:10px 0;">${billetCategory ?? '—'}</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Quantity</td><td style="padding:10px 0;">${totalQty}</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Customer</td><td style="padding:10px 0;">${nomClient ?? '—'}</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Customer email</td><td style="padding:10px 0;">${emailClient ?? '—'}</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Amount</td><td style="padding:10px 0;"><strong>${totalPrice.toFixed(2)} €</strong></td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Cost</td><td style="padding:10px 0;">${totalCost.toFixed(2)} €</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0; color:#666;">Profit</td><td style="padding:10px 0; color:${profitColor};"><strong>${profit.toFixed(2)} €</strong></td></tr>
              <tr><td style="padding:10px 0; color:#666;">ROI</td><td style="padding:10px 0; color:${profitColor};">${roi === '—' ? '—' : roi + '%'}</td></tr>
            </table>
          `
          const ctaButton = `<a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/fulfillment" style="background:#1a3a2a; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block; font-size:15px;">Open Fulfillment Dashboard</a>`

          if (sourcingRequired) {
            // Sourcing alert — owner must source and send tickets
            await resend.emails.send({
              from: 'contact@mail.zenntry.com',
              to: ownerEmail,
              subject: '🎟 New order — action required',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; color: #111; padding: 24px;">
                  <div style="margin-bottom: 20px;">
                    <img src="${process.env.NEXT_PUBLIC_SITE_URL}/logo.png" height="32" style="margin-bottom: 16px;" />
                    <h2 style="margin: 0; font-size: 20px;">New Order — Action Required</h2>
                    <p style="color: #666; margin: 4px 0 0;">Invoice #${cmdData?.id}</p>
                  </div>
                  ${orderTable}
                  <p style="color: #c53030; font-weight: bold; margin-bottom: 16px;">⚡ This ticket needs to be sourced and sent to the customer as soon as possible.</p>
                  ${ctaButton}
                </div>
              `,
            })
            console.log('📧 Sourcing alert envoyé à owner:', ownerEmail)
          } else {
            // Sale notification — tickets already in hand
            await resend.emails.send({
              from: 'contact@mail.zenntry.com',
              to: ownerEmail,
              subject: `🎟 New sale — ${eventName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; color: #111; padding: 24px;">
                  <div style="margin-bottom: 20px;">
                    <img src="${process.env.NEXT_PUBLIC_SITE_URL}/logo.png" height="32" style="margin-bottom: 16px;" />
                    <h2 style="margin: 0; font-size: 20px;">New Sale — ${eventName}</h2>
                    <p style="color: #666; margin: 4px 0 0;">Invoice #${cmdData?.id}</p>
                  </div>
                  ${orderTable}
                  ${ctaButton}
                </div>
              `,
            })
            console.log('📧 Sale notification envoyée à owner:', ownerEmail)
          }
        } catch (err) {
          console.error('❌ Erreur envoi owner email:', err)
        }
      }
    }

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
