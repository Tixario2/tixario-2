-- Settings table for feature toggles
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO settings (key, value) VALUES
  ('ingest_active_adrien', 'false'),
  ('ingest_active_archie', 'false')
ON CONFLICT (key) DO NOTHING;

-- Draft listings table for email-ingested tickets
CREATE TABLE IF NOT EXISTS draft_listings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner text NOT NULL,
  slug text,
  matched boolean DEFAULT false,
  evenement text,
  date text,
  venue text,
  city text,
  country text,
  categorie text,
  quantite integer,
  quantite_adult integer,
  quantite_child integer,
  prix_adult numeric,
  prix_child numeric,
  face_value numeric,
  seat_numbers text,
  row text,
  section text,
  order_reference text,
  sender_platform text,
  raw_email_snippet text,
  prix numeric,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);
