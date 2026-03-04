// pages/api/checkout.ts
import Stripe from 'stripe';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

interface RequestItem {
  billet_id: string;
  quantity: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const { items, user_id } = req.body as {
    items: RequestItem[];
    user_id?: string;
  };

  // 1) Call the create_reservation RPC
  const { data: reservationId, error: rpcError } = await supabase.rpc(
    'create_reservation',
    {
      p_user_id: user_id ?? null,
      p_items: items,
      p_ttl_minutes: 10,
    }
  );

  if (rpcError) {
    console.error('create_reservation RPC error:', rpcError);
    return res.status(400).json({ error: rpcError.message });
  }

  if (!reservationId) {
    return res.status(400).json({ error: 'Reservation could not be created — stock unavailable or validation failed.' });
  }

  // 2) Fetch the reservation's expires_at
  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .select('expires_at')
    .eq('id', reservationId)
    .single();

  if (reservationError || !reservation) {
    console.error('Failed to fetch reservation:', reservationError);
    return res.status(500).json({ error: 'Failed to fetch reservation details.' });
  }

  // 3) Build line items from reservation_items joined to billets
  const { data: reservationItems, error: itemsError } = await supabase
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
    .eq('reservation_id', reservationId);

  if (itemsError || !reservationItems || reservationItems.length === 0) {
    console.error('Failed to fetch reservation items:', itemsError);
    return res.status(500).json({ error: 'Failed to fetch reservation items.' });
  }

  const line_items = reservationItems.map((item: any) => {
    if (!item.billets || typeof item.billets !== 'object' || Array.isArray(item.billets)) {
      throw new Error('Invalid billets join result for billet_id: ' + item.billet_id);
    }
    return {
    price_data: {
      currency: 'eur',
      product_data: {
        name: `${item.billets.evenement} – ${item.billets.categorie}`,
      },
      unit_amount: Math.round(parseFloat(item.unit_price) * 100),
    },
    quantity: item.quantity,
    };
  });

  // 4) Create the Stripe Checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_intent_data: {
        metadata: {
          reservation_id: reservationId,
        },
      },
      payment_method_options: {
        card: {
          request_three_d_secure: 'any',
        },
      },
      line_items,
      metadata: {
        reservation_id: reservationId,
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,
    });

    if (!session.url) {
      return res.status(500).json({ error: 'Stripe session created but returned no URL.' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session creation failed:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
