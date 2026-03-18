CREATE TABLE demandes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  evenement text NOT NULL,
  date_evenement text,
  nb_billets integer NOT NULL,
  categorie_preferee text,
  budget text,
  canal_contact text NOT NULL CHECK (canal_contact IN ('whatsapp', 'telegram')),
  telephone text NOT NULL,
  notes_client text,
  statut text NOT NULL DEFAULT 'received' CHECK (statut IN ('received', 'quote_sent', 'paid', 'tickets_sent')),
  notes_internes text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE demandes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON demandes USING (true) WITH CHECK (true);
