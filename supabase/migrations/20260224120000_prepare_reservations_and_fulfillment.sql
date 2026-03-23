-- Prepare schema for reservation workflow (5-minute holds)
-- and Kanban-style fulfillment tracking.
-- No checkout/webhook behavior is changed by this migration.

create extension if not exists pgcrypto;

-- 1) Reservations (header)
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'HELD',
  expires_at timestamptz not null,
  stripe_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_status_check check (status in ('HELD', 'CAPTURED', 'EXPIRED'))
);

-- Helpful lookups for expirer jobs and Stripe reconciliation.
create index if not exists reservations_status_expires_at_idx
  on public.reservations (status, expires_at);
create index if not exists reservations_stripe_session_id_idx
  on public.reservations (stripe_session_id)
  where stripe_session_id is not null;

-- 1b) Reservation line items
create table if not exists public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  billet_id uuid not null references public.billets(id_billet),
  qty integer not null,
  unit_price integer not null,
  currency text not null default 'EUR',
  constraint reservation_items_qty_positive check (qty > 0),
  constraint reservation_items_unit_price_nonnegative check (unit_price >= 0),
  constraint reservation_items_currency_nonempty check (char_length(trim(currency)) > 0)
);

create index if not exists reservation_items_reservation_id_idx
  on public.reservation_items (reservation_id);
create index if not exists reservation_items_billet_id_idx
  on public.reservation_items (billet_id);

-- 2) Extend commandes for fulfillment workflow
alter table public.commandes
  add column if not exists status text not null default 'PAID_NEW',
  add column if not exists buyer_phone text,
  add column if not exists fulfillment_notes text,
  add column if not exists delivery_method text,
  add column if not exists delivered_at timestamptz,
  add column if not exists issue_flag boolean not null default false,
  add column if not exists owner_admin_id text;

-- 3) Extend billets for ticketing rules and assignment
alter table public.billets
  add column if not exists ticket_type text not null default 'SEATED',
  add column if not exists enforce_no_solo boolean not null default true,
  add column if not exists owner_admin_id text;

-- guardrail for ticket_type domain
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billets_ticket_type_check'
  ) THEN
    ALTER TABLE public.billets
      ADD CONSTRAINT billets_ticket_type_check
      CHECK (ticket_type IN ('SEATED', 'GA'));
  END IF;
END $$;

-- 4) Generic audit log table
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  entity_type text,
  entity_id text,
  action text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
