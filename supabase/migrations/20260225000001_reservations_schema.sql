-- =============================================================
-- Migration : 20260225000001_reservations_schema.sql
-- Step 1    : Schema only
--             Enums, Tables, Indexes, RLS, Immutable audit
--             No RPC, no business logic
-- =============================================================


-- -------------------------------------------------------------
-- 1. ENUMS
-- -------------------------------------------------------------

CREATE TYPE reservation_status AS ENUM (
  'PENDING',
  'CAPTURED',
  'EXPIRED',
  'CANCELED'
);

CREATE TYPE order_status AS ENUM (
  'CREATED',
  'PAID',
  'FULFILLING',
  'DELIVERED',
  'ISSUE',
  'REFUNDED',
  'CANCELED'
);

CREATE TYPE ticket_type AS ENUM (
  'SEATED',
  'GA'
);


-- -------------------------------------------------------------
-- 2. NEW COLUMNS ON EXISTING TABLES
-- -------------------------------------------------------------

-- billets.ticket_type
-- Nullable on purpose: existing rows have no classification yet.
-- Backfill before adding NOT NULL in a follow-up migration.
ALTER TABLE billets
  ADD COLUMN ticket_type       ticket_type,
  ADD COLUMN enforce_no_solo   boolean     NOT NULL DEFAULT false,
  ADD COLUMN owner_admin_id    uuid        REFERENCES auth.users (id);

-- billets.quantite: enforce non-negative stock and NOT NULL on existing column.
ALTER TABLE billets
  ALTER COLUMN quantite SET NOT NULL,
  ADD CONSTRAINT chk_billets_quantite CHECK (quantite >= 0);

-- commandes.status
-- DEFAULT 'CREATED' makes this safe for existing rows.
ALTER TABLE commandes
  ADD COLUMN status order_status NOT NULL DEFAULT 'CREATED';


-- -------------------------------------------------------------
-- 3. RESERVATIONS
-- -------------------------------------------------------------

CREATE TABLE reservations (
  id         uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: checkout may begin before the user authenticates.
  -- Link to auth.users after session is established.
  user_id    uuid               REFERENCES auth.users (id),
  status     reservation_status NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz        NOT NULL,
  created_at timestamptz        NOT NULL DEFAULT now(),
  updated_at timestamptz        NOT NULL DEFAULT now()
);


-- -------------------------------------------------------------
-- 4. RESERVATION_ITEMS
-- -------------------------------------------------------------
-- NOTE: billet_id is text to match the confirmed type of billets.id_billet.

CREATE TABLE reservation_items (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid           NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
  billet_id      text           NOT NULL REFERENCES billets (id_billet),
  quantity       integer        NOT NULL CHECK (quantity > 0),
  unit_price     numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  created_at     timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, billet_id)
);


-- -------------------------------------------------------------
-- 5. AUDIT_LOG
-- -------------------------------------------------------------
-- action accepts any SCREAMING_SNAKE_CASE string, e.g.:
--   INSERT, UPDATE, DELETE, RESERVATION_CREATED,
--   RESERVATION_FAILED, WEBHOOK_PROCESSED, etc.

CREATE TABLE audit_log (
  id         bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  table_name text        NOT NULL,
  record_id  text        NOT NULL,
  action     text        NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]*$'),
  old_data   jsonb,
  new_data   jsonb,
  actor_id   uuid,
  actor_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- -------------------------------------------------------------
-- 6. INDEXES
-- -------------------------------------------------------------

-- Composite covers both single-column look-ups on status and
-- expires_at, as well as the combined query. No separate singles
-- are needed.
CREATE INDEX idx_reservations_status_expires_at
  ON reservations (status, expires_at);

-- reservation_items FK traversal
CREATE INDEX idx_reservation_items_reservation_id
  ON reservation_items (reservation_id);

-- reservation_items to billets look-ups
CREATE INDEX idx_reservation_items_billet_id
  ON reservation_items (billet_id);

-- audit_log retrieval patterns
CREATE INDEX idx_audit_log_table_record
  ON audit_log (table_name, record_id);

CREATE INDEX idx_audit_log_created_at
  ON audit_log (created_at);


-- -------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- RLS enabled with zero policies = deny-by-default for every
-- Supabase role (anon, authenticated). Explicit policies will
-- be added in later migrations alongside RPC grants.
-- -------------------------------------------------------------

ALTER TABLE reservations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 8. UPDATED_AT AUTO-UPDATE
-- Keeps reservations.updated_at accurate without relying on the
-- application layer to set it on every write.
-- -------------------------------------------------------------

CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- -------------------------------------------------------------
-- 9. AUDIT_LOG IMMUTABILITY
-- Two independent enforcement layers:
--   a) Privilege revocation: no UPDATE/DELETE right for public roles.
--   b) Trigger: blocks mutation even via service role, which
--      bypasses RLS but does not bypass triggers.
-- -------------------------------------------------------------

-- 9a. Strip mutation rights from both public Supabase roles.
REVOKE UPDATE, DELETE ON TABLE audit_log FROM anon;
REVOKE UPDATE, DELETE ON TABLE audit_log FROM authenticated;

-- 9b. Trigger function -- infrastructure only, no business logic.
CREATE FUNCTION audit_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log is append-only: % is forbidden on this table',
    TG_OP;
  RETURN NULL; -- unreachable; required for trigger function type-check
END;
$$;

-- Fire BEFORE so the mutation never reaches storage.
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_block_mutation();
