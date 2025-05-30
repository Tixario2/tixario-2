// pages/api/test-commandes.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Utilise l'API crypto de Node pour générer un UUID valide
const generateUUID = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // fallback simple
  return '00000000-0000-4000-8000-000000000000';
};

// Initialise le client Supabase avec la service role key
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string; data?: any }>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // Génère un UUID pour simuler un id de billet valide
    const testBilletId = generateUUID();

    // Insère une ligne de test dans commandes
    const { data: cmdData, error: cmdError } = await supabase
      .from('commandes')
      .insert({
        stripe_session_id: 'test-' + Date.now(),
        email: 'test-user@example.com',
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
        id_billets: [testBilletId],
        date_creation: new Date().toISOString(),
      })
      .select()
      .single();

    if (cmdError) {
      console.error('❌ test-commandes insert commandes error:', cmdError);
      return res.status(500).json({ success: false, error: cmdError.message });
    }
    console.log('✅ test-commandes insert commandes success:', cmdData);

    // Insère une ligne de test dans newsletter
    const randomEmail = `user${Date.now()}@example.com`;
    const { data: newsData, error: newsError } = await supabase
      .from('newsletter')
      .insert({
        email: randomEmail,
        source: 'test-commandes',
        date_inscription: new Date().toISOString(),
      })
      .select()
      .single();

    if (newsError) {
      console.error('❌ test-commandes insert newsletter error:', newsError);
      return res.status(500).json({ success: false, error: newsError.message });
    }
    console.log('✅ test-commandes insert newsletter success:', newsData);

    // Retourne les deux inserts
    return res.status(200).json({
      success: true,
      data: { commande: cmdData, newsletter: newsData },
    });
  } catch (err: any) {
    console.error('❌ test-commandes exception:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


