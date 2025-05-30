import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import getRawBody from 'raw-body'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// — 4.1) Client Supabase “serveur”
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Resend
export const resend = new Resend(process.env.RESEND_API_KEY!)

// Stripe setup
const stripeSecretKey = process.env.STRIPE_SECRET_KEY!
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-04-30.basil' })

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

  // 1) Lire le raw body et la signature
  const rawBody = await getRawBody(req)
  console.log('📦 rawBody length:', rawBody.length)
  const sig = req.headers['stripe-signature']
  console.log('🔖 stripe-signature header:', sig)
  if (typeof sig !== 'string') {
    return res.status(400).end('Missing Stripe signature')
  }

  // 2) Valider l’événement Stripe
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret)
    console.log('✅ signature OK, event.type =', event.type)
  } catch (err: any) {
    console.error('❌ Invalid Stripe webhook signature:', err.message)
    return res.status(400).json({ received: false, error: err.message })
  }

  // Test event
  console.log('📩 Stripe webhook received:', event.type)

  // 3) Bloc métier
  if (event.type === 'checkout.session.completed') {
    console.log('🎉 on entre bien dans checkout.session.completed')
    const session = event.data.object as Stripe.Checkout.Session

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 100 }
      )
      console.log('🛒 lignes de paiement trouvées =', lineItems.data.length)

      const billetsInfos: BilletInfo[] = []
      const billetIds: string[] = []

      // 4.2a) Décrémenter le stock
      for (const item of lineItems.data) {
        const desc = item.description || ''
        const match = desc.match(/\[ID:(.+?)\]/)
        const billetId = match?.[1]
        const qty = item.quantity ?? 1

        if (billetId) {
          billetIds.push(billetId)
          console.log('🔽 Décrémentation billet', billetId, 'par', qty)

          const { data: current, error: fetchError } = await supabase
            .from('billets')
            .select('quantite')
            .eq('id_billet', billetId)
            .single()

          if (fetchError) {
            console.error('❌ Erreur lecture stock:', fetchError)
          } else {
            const nouvelleQuantite = Math.max((current.quantite || 0) - qty, 0)
            const { data: updated, error: stockError } = await supabase
              .from('billets')
              .update({ quantite: nouvelleQuantite })
              .eq('id_billet', billetId)

            if (stockError)
              console.error('❌ Erreur mise à jour stock:', stockError)
            else
              console.log(
                '✅ Stock mis à jour pour',
                billetId,
                '→',
                nouvelleQuantite
              )
          }
        }

        const [evenementPart, categoriePart] = desc
          .split('–')
          .map(s => s.trim())
        const montantTotal = (item.amount_total ?? 0) / 100
        const prixUnitaire =
          ((item.amount_subtotal ?? 0) / (item.quantity ?? 1)) / 100

        billetsInfos.push({
          description: evenementPart,
          quantite: qty,
          montant_total: montantTotal,
          prix_unitaire: prixUnitaire,
          evenement: evenementPart,
          categorie: categoriePart?.split('[')[0].trim() ?? '',
        })
      }

      // Totaux
      const quantiteTotale = lineItems.data.reduce(
        (sum, i) => sum + (i.quantity ?? 0),
        0
      )
      const prixTotal = (session.amount_total ?? 0) / 100
      const nomEvenement = billetsInfos[0]?.evenement ?? ''

      // Récup email client
      let emailClient = session.customer_email
      if (!emailClient && session.customer) {
        const customer = await stripe.customers.retrieve(
          session.customer as string
        )
        if (
          !Array.isArray(customer) &&
          typeof customer === 'object' &&
          'deleted' in customer &&
          (customer as any).deleted === false
        ) {
          emailClient = (customer as Stripe.Customer).email ?? null
        }
      }

      // 4.2b) Insertion dans commandes
      const { data: commandeData, error: commandeError } = await supabase
        .from('commandes')
        .insert({
          stripe_session_id: session.id,
          email: emailClient,
          nom: session.customer_details?.name ?? '',
          billets: billetsInfos,
          quantite_total: quantiteTotale,
          prix_total: prixTotal,
          date_evenement: session.metadata?.date_evenement ?? null,
          evenement: nomEvenement,
          id_billets: billetIds,
          date_creation: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (commandeError) {
        console.error('❌ Order insertion error:', commandeError)
      } else {
        console.log('🆔 Commande enregistrée, id =', commandeData?.id)
      }

      // 4.2c) Insertion dans newsletter
      if (commandeData?.id && emailClient) {
        const { error: newsError } = await supabase
          .from('newsletter')
          .insert({
            email: emailClient,
            source: 'commande',
            date_inscription: new Date().toISOString(),
          })
        if (newsError) console.error('❌ Newsletter insertion error:', newsError)
        else console.log('📬 Email ajouté à newsletter:', emailClient)
      }

      // 4.2d) Envoi de l’email via Resend
      if (commandeData?.id && emailClient) {
        console.log('🔑 Resend API Key loaded:', !!process.env.RESEND_API_KEY)
        console.log('📧 Envoi email à:', emailClient)
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
                <p style="font-size: 16px; margin-bottom: 24px;">Commande n°${commandeData?.id}</p>
                <div style="background-color: #1e1e1e; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
                  <ul style="list-style: none; padding: 0; margin: 0;">
                    ${billetsInfos
                      .map(
                        b => `
                      <li style="margin-bottom: 10px;">
                        ${b.description} — ${b.quantite} × ${b.prix_unitaire.toFixed(
                          2
                        )} €
                      </li>`
                      )
                      .join('')}
                  </ul>
                  <p style="margin-top: 16px; font-weight: bold;">Total : ${prixTotal.toFixed(
                    2
                  )} €</p>
                </div>
                <p style="font-size: 14px;">Vos billets seront envoyés sous 24 h par email ou WhatsApp.</p>
                <p style="font-size: 14px;">
                  Une question ? Écrivez-nous à
                  <a href="mailto:contact@tixario.com" style="color: #eab308;">
                    contact@tixario.com
                  </a>.
                </p>
              </div>
            `,
          })
          console.log('✅ Confirmation email sent:', result)
        } catch (err) {
          console.error('❌ Resend send error:', err)
        }
      } else {
        console.warn('⚠️ Pas d’email client ou pas d’ID commande, email non envoyé.')
      }
    } catch (err) {
      console.error('❌ Webhook handler error:', err)
    }
  } else {
    console.warn('⚠️ reçu un event différent de checkout.session.completed')
  }

  res.status(200).json({ received: true })
}



