// pages/api/test-commandes.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialise le client Supabase avec la service role key
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string; data?: any }>
) {
  // On n'accepte que les GET ou POST, au choix :
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // Insère une ligne de test dans commandes
    const { data, error } = await supabase
      .from('commandes')
      .insert({
        stripe_session_id: 'test-' + Date.now(),
        email: 'test@example.com',
        nom: 'Test User',
        billets: [
          {
            description: 'Test billet',
            quantite: 1,
            montant_total: 0,
            prix_unitaire: 0,
            evenement: 'Test Event',
            categorie: 'Test',
          },
        ],
        quantite_total: 1,
        prix_total: 0,
        date_evenement: null,
        evenement: 'Test Event',
        id_billets: ['test-id'],
        date_creation: new Date().toISOString(),
      })
      .select(); // pour renvoyer l’objet créé

    if (error) {
      console.error('❌ test-commandes insert error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ test-commandes insert success:', data);
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error('❌ test-commandes exception:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

