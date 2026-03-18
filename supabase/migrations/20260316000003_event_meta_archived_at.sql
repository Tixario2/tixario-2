-- Add archived_at timestamp to event_meta for two-stage cleanup
ALTER TABLE event_meta ADD COLUMN IF NOT EXISTS archived_at timestamptz;
