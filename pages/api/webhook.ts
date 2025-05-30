import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import getRawBody from 'raw-body'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// — Client Supabase “serveur”
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

  // On ne traite que checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    console.log('⚠️ Event non géré:', event.type)
    return res.status(200).json({ received: true })
  }

  // 3) Extraire la session
  const session = event.data.object as Stripe.Checkout.Session
  console.log('✉️ session.customer_email   =', session.customer_email)
  console.log('✉️ session.customer_details =', session.customer_details)
  console.log('✉️ session.customer         =', session.customer)

  // 4) Récupération robuste de l'email client
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

  try {
    // 5) Récupérer les line items
    const lineItems = await stripe.checkout.sessions.listLineItems(
      session.id,
      { limit: 100 }
    )
    console.log('🛒 lineItems count =', lineItems.data.length)

    // 6) Décrémentation du stock
    const billetIds: string[] = []
    for (const item of lineItems.data) {
      const desc = item.description || ''
      const match = desc.match(/\[ID:(.+?)\]/)
      const billetId = match?.[1]
      const qty = item.quantity ?? 1
      if (billetId) {
        billetIds.push(billetId)
        console.log('🔽 Décrémentation billet', billetId, 'par', qty)
        const { data: cur, error: fetchErr } = await supabase
          .from('billets')
          .select('quantite')
          .eq('id_billet', billetId)
          .single()
        if (fetchErr) {
          console.error('❌ Erreur fetch stock:', JSON.stringify(fetchErr))
        } else {
          const newQty = Math.max((cur.quantite || 0) - qty, 0)
          const { error: updErr } = await supabase
            .from('billets')
            .update({ quantite: newQty })
            .eq('id_billet', billetId)
          if (updErr) console.error('❌ Erreur update stock:', JSON.stringify(updErr))
          else console.log('✅ Stock mis à jour', billetId, '→', newQty)
        }
      }
    }

    // 7) Préparer données commande
    const billetsInfos: BilletInfo[] = lineItems.data.map(item => {
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

    // 8) Insertion de la commande
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
        date_creation: new Date().toISOString()
      })
      .select('id')
      .single()
    if (cmdErr) console.error('❌ Erreur insert commande:', JSON.stringify(cmdErr))
    else console.log('🆔 Commande insérée, id =', cmdData?.id)

    // 9) Inscription en newsletter
    if (cmdData?.id && emailClient) {
      const { error: newsErr } = await supabase
        .from('newsletter')
        .insert({
          email: emailClient,
          source: 'commande',
          date_inscription: new Date().toISOString()
        })
      if (newsErr) console.error('❌ Erreur insert newsletter:', JSON.stringify(newsErr))
      else console.log('📬 Inscription newsletter réussie')
    }

    // 10) Envoi email de confirmation via Resend
    if (cmdData?.id && emailClient) {
      console.log('📧 Envoi email confirmation à:', emailClient)
      try {
        const result = await resend.emails.send({
          from: 'contact@tixario.com',
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
    console.error('❌ Erreur lors du traitement webhook:', err)
  }

  // 11) Réponse à Stripe
  res.status(200).json({ received: true })
}




