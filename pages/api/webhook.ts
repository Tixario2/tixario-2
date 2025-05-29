// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { supabase } from '@/supabaseClient';
import getRawBody from 'raw-body';
import { resend } from '@/lib/resend';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}
if (!stripeWebhookSecret) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2022-11-15',
});

export const config = {
  api: {
    bodyParser: false,
  },
};

interface BilletInfo {
  description: string;
  quantite: number;
  montant_total: number;
  prix_unitaire: number;
  evenement: string;
  categorie: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ received: true }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  if (typeof sig !== 'string') {
    return res.status(400).end('Missing Stripe signature');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
  } catch (err: any) {
    console.error('❌ Invalid Stripe webhook signature:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📩 Stripe webhook received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 100 }
      );

      const billetsInfos: BilletInfo[] = [];
      const billetIds: string[] = [];

      for (const item of lineItems.data) {
        const desc = item.description || '';
        const match = desc.match(/\[ID:(.+?)\]/);
        const billetId = match?.[1];
        const qty = item.quantity ?? 1;

        if (billetId) {
          billetIds.push(billetId);
          const { error: stockError } = await supabase.rpc(
            'retirer_quantite_billet',
            {
              billet_id: billetId,
              qtt: qty,
            }
          );
          if (stockError) console.error('❌ Stock removal error:', stockError);
        }

        const [evenementPart, categoriePart] = desc.split('–').map(s => s.trim());
        const montantTotal = (item.amount_total ?? 0) / 100;
        const prixUnitaire =
          ((item.amount_subtotal ?? 0) / (item.quantity ?? 1)) / 100;

        billetsInfos.push({
          description: evenementPart,
          quantite: qty,
          montant_total: montantTotal,
          prix_unitaire: prixUnitaire,
          evenement: evenementPart,
          categorie: categoriePart?.split('[')[0].trim() ?? '',
        });
      }

      const quantiteTotale = lineItems.data.reduce(
        (sum, i) => sum + (i.quantity ?? 0),
        0
      );
      const prixTotal = (session.amount_total ?? 0) / 100;
      const nomEvenement = billetsInfos[0]?.evenement ?? '';

      let emailClient = session.customer_email;
      if (!emailClient && session.customer) {
        const customer = await stripe.customers.retrieve(
          session.customer as string
        );
        if (!Array.isArray(customer) && customer.email) {
          emailClient = customer.email;
        }
      }

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
        })
        .select('id')
        .single();

      if (commandeError) {
        console.error('❌ Order insertion error:', commandeError);
      } else if (emailClient) {
        const { error: newsError } = await supabase
          .from('newsletters')
          .insert({
            email: emailClient,
            source: 'commande',
            date_inscription: new Date().toISOString(),
          });
        if (newsError) console.error('❌ Newsletter insertion error:', newsError);

        const result = await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: emailClient,
          subject: 'Confirmation de votre commande – Tixario',
          html: `
            <div style="font-family: Arial; background-color: #121212; color: #fff; padding: 32px; max-width: 600px; margin: auto; border-radius: 8px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <img src="https://tixario.com/logo-tixario.png" alt="Tixario" style="height: 40px;" />
              </div>
              <h2 style="color: #eab308;">Merci pour votre commande sur Tixario</h2>
              <p style="font-size: 16px; margin-bottom: 24px;">Commande n°${commandeData.id}</p>
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
              <p style="font-size: 14px;">Vos billets seront envoyés par email ou WhatsApp très bientôt.</p>
              <p style="font-size: 14px;">
                Une question ? Écrivez-nous à
                <a href="mailto:contact@tixario.com" style="color: #eab308;">contact@tixario.com</a>
                ou sur Insta
                <a href="https://instagram.com/tixario" style="color: #eab308;">@tixario</a>.
              </p>
            </div>
          `,
        });
        console.log('📧 Confirmation email sent:', result);
      } else {
        console.warn('⚠️ No customer email; skipping confirmation email.');
      }
    } catch (err) {
      console.error('❌ Webhook handler error:', err);
    }
  }

  res.status(200).json({ received: true });
}
