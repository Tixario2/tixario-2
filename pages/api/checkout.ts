// pages/api/checkout.ts
import Stripe from 'stripe';
import type { NextApiRequest, NextApiResponse } from 'next';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2022-11-15',
});

interface CartItem {
  evenement: string;
  categorie: string;
  id_billet: string;
  prix: number;
  quantite: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const { cartItems } = req.body as { cartItems: CartItem[] };

  const line_items = cartItems.map(item => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: `${item.evenement} – ${item.categorie} [ID:${item.id_billet}]`,
      },
      unit_amount: Math.round(item.prix * 100),
    },
    quantity: item.quantite,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${req.headers.origin}/success`,
      cancel_url: `${req.headers.origin}/cancel`,
      customer_creation: 'always',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session creation failed:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
