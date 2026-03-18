-- Waitlist table (already created manually — included for completeness)
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  notified_at timestamptz
);

-- Prevent duplicate subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_slug_email_unique ON waitlist (slug, email);

-- event_meta: add paused and archived columns
ALTER TABLE event_meta ADD COLUMN IF NOT EXISTS paused boolean DEFAULT false;
ALTER TABLE event_meta ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
