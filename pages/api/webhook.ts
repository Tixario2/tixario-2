// pages/api/webhook.ts
import { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { supabase } from '@/supabaseClient';
import getRawBody from 'raw-body';
import { resend } from '@/lib/resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2022-11-15',
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST')
    return res.status(405).end('Method Not Allowed');

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Erreur de signature Stripe :', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("📩 Webhook Stripe reçu !", event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      // 1) On retire le stock et on prépare billetsInfos
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      const billetsInfos: any[] = [];
      const billetIds: string[] = [];

      for (const item of lineItems.data) {
        const billetId = item.description?.match(/\[ID:(.+?)\]/)?.[1];
        const qty = item.quantity || 1;

        if (billetId) {
          billetIds.push(billetId);
          const { error } = await supabase.rpc('retirer_quantite_billet', {
            billet_id: billetId,
            qtt: qty,
          });
          if (error) console.error('❌ Erreur retrait stock :', error);
        }

        billetsInfos.push({
          description:       item.description?.split(' [ID:')[0],
          quantite:          item.quantity,
          montant_total:     item.amount_total! / 100,
          prix_unitaire:     item.amount_subtotal! / (item.quantity || 1) / 100,
          evenement:         item.description?.split('–')[0]?.trim(),
          categorie:         item.description?.split('–')[1]?.split('[')[0]?.trim(),
        });
      }

      // 2) Calculs généraux
      const quantiteTotale = lineItems.data.reduce((acc, item) => acc + (item.quantity || 0), 0);
      const prixTotal      = (session.amount_total || 0) / 100;
      const nomEvenement   = billetsInfos[0]?.evenement || '';

      // 3) Récupération / fallback de l'email client
      let emailClient = session.customer_email;
      if (!emailClient && session.customer) {
        const customer = await stripe.customers.retrieve(session.customer as string);
        if (typeof customer === 'object' && customer.email) {
          emailClient = customer.email;
        }
      }

      // 4) Insertion dans commandes
      const { data: commandeData, error: commandeError } = await supabase
        .from('commandes')
        .insert({
          stripe_session_id: session.id,
          email:             emailClient,
          nom:               session.customer_details?.name || '',
          billets:           billetsInfos,
          quantite_total:    quantiteTotale,
          prix_total:        prixTotal,
          date_evenement:    session.metadata?.date_evenement || null,
          evenement:         nomEvenement,
          id_billets:        billetIds,
        })
        .select('id')
        .single();

      if (commandeError) {
        console.error('❌ Erreur insertion commande :', commandeError);
      } else {
        // 5) **Insertion dans newsletters**
        if (emailClient) {
          const { error: newsError } = await supabase
            .from('newsletters')
            .insert({
              email:             emailClient,
              source:            'commande',         // ou tout autre tag pertinent
              date_inscription:  new Date().toISOString(),
            });
          if (newsError) console.error('❌ Erreur insertion newsletter :', newsError);
        }

        // 6) Envoi de l’email de confirmation
        if (!emailClient) {
          console.warn('⚠️ Email client manquant. Aucune confirmation envoyée.');
          return res.status(200).json({ received: true });
        }

        const result = await resend.emails.send({
          from:    'onboarding@resend.dev',
          to:      emailClient,
          subject: 'Confirmation de votre commande – Tixario',
          html:    `
            <div style="font-family: Arial; background-color: #121212; color: #fff; padding: 32px; max-width: 600px; margin: auto; border-radius: 8px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <img src="https://tixario.com/logo-tixario.png" alt="Tixario" style="height: 40px;" />
              </div>
              <h2 style="color: #eab308;">Merci pour votre commande sur Tixario</h2>
              <p style="font-size: 16px; margin-bottom: 24px;">Commande n°${commandeData.id}</p>
              <div style="background-color: #1e1e1e; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
                <ul style="list-style: none; padding: 0; margin: 0;">
                  ${billetsInfos.map(b => `
                    <li style="margin-bottom: 10px;">
                      ${b.description} — ${b.quantite} × ${b.prix_unitaire.toFixed(2)} €
                    </li>`).join('')}
                </ul>
                <p style="margin-top: 16px; font-weight: bold;">Total : ${prixTotal.toFixed(2)} €</p>
              </div>
              <p style="font-size: 14px;">Vos billets seront envoyés par email ou WhatsApp très bientôt.</p>
              <p style="font-size: 14px;">Une question ? Écrivez-nous à <a href="mailto:contact@tixario.com" style="color: #eab308;">contact@tixario.com</a> ou sur Insta <a href="https://instagram.com/tixario" style="color: #eab308;">@tixario</a>.</p>
            </div>
          `
        });
        console.log('📧 Email envoyé :', result);
      }
    } catch (err) {
      console.error("❌ Erreur traitement commande :", err);
    }
  }

  // Toujours renvoyer 200 à Stripe
  res.status(200).json({ received: true });
}
