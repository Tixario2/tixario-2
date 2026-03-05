-- Add fulfillment status to commandes and sourcing flag to billets
ALTER TABLE commandes ADD COLUMN statut_expedition text DEFAULT 'pending';
ALTER TABLE billets ADD COLUMN sourcing_required boolean NOT NULL DEFAULT false;
