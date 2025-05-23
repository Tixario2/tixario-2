// pages/api/checkout.ts
import Stripe from 'stripe';
import { NextApiRequest, NextApiResponse } from 'next';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2022-11-15',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { cartItems } = req.body;

  const line_items = cartItems.map((item) => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: `${item.evenement} – ${item.categorie} [ID:${item.id_billet}]`,
      },
      unit_amount: item.prix * 100,
    },
    quantity: item.quantite,
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items,
    success_url: `${req.headers.origin}/success`,
    cancel_url: `${req.headers.origin}/cancel`,
    customer_creation: 'always', // ✅ pour créer un client avec email
  });

  res.status(200).json({ url: session.url });
}
