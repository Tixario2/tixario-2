# Reservation RPC (Step 2, DB-only)

This step introduces atomic Supabase/PostgreSQL RPCs for stock reservation and expiry release.
It does **not** modify `/api/checkout` or `/api/webhook` yet.

## Function signatures

```sql
select public.reserve_cart(items := '[{"billet_id":"<uuid>","qty":2}]'::jsonb);
```

```sql
select public.release_expired_reservations();
select public.release_expired_reservations(1000);
```

## `reserve_cart(items jsonb)`

### Input
A non-empty JSON array:

```json
[
  { "billet_id": "<uuid>", "qty": 2 },
  { "billet_id": "<uuid>", "qty": 1 }
]
```

### Output
JSON object:

```json
{
  "reservation_id": "<uuid>",
  "expires_at": "2026-02-25T12:34:56.000Z",
  "items_reserved": [
    { "billet_id": "<uuid>", "qty": 2, "unit_price": 12500, "currency": "EUR" }
  ]
}
```

## Invariants guaranteed by the RPC

- **Atomicity**: all items are reserved, or none are.
- **No oversell**: each `billets` row is locked (`FOR UPDATE`) before validation/decrement.
- **No-solo rule** (SEATED or `enforce_no_solo=true`): reservation fails if `(quantite - qty) = 1`.
- **GA exception**: when `ticket_type='GA'` and `enforce_no_solo=false`, only stock availability is enforced.
- **Rollback on any invalid item**: if one item fails, all prior changes in the same call are rolled back.

## `release_expired_reservations(limit_count int default 500)`

- Finds reservations with `status='HELD'` and `expires_at < now()`.
- Restores `billets.quantite` from `reservation_items.qty`.
- Marks each released reservation as `EXPIRED`.
- Writes inventory restore events to `audit_log`.
- Returns the number of reservations released.

## Manual SQL test harness (required cases)

> Run these in Supabase SQL editor.
> Use two known existing billets: `:seated_billet` and `:ga_billet`.

### 0) Prepare baseline fixtures

```sql
-- Choose IDs first:
-- select id_billet, quantite, ticket_type, enforce_no_solo from billets limit 20;

update billets
set quantite = 4,
    disponible = true,
    prix = 100,
    ticket_type = 'SEATED',
    enforce_no_solo = true
where id_billet = :seated_billet;

update billets
set quantite = 4,
    disponible = true,
    prix = 100,
    ticket_type = 'GA',
    enforce_no_solo = false
where id_billet = :ga_billet;
```

### 1) SEATED billet quantite=4: reserve qty=3 must fail; qty=2 must succeed

```sql
-- Must fail (would leave exactly 1)
select public.reserve_cart(
  jsonb_build_array(jsonb_build_object('billet_id', :seated_billet::text, 'qty', 3))
);

-- Must succeed
select public.reserve_cart(
  jsonb_build_array(jsonb_build_object('billet_id', :seated_billet::text, 'qty', 2))
) as seated_ok;
```

### 2) GA billet quantite=4 and enforce_no_solo=false: reserve qty=3 must succeed

```sql
select public.reserve_cart(
  jsonb_build_array(jsonb_build_object('billet_id', :ga_billet::text, 'qty', 3))
) as ga_ok;
```

### 3) Multi-item cart atomicity: one invalid item => none reserved

```sql
-- Reset both to 4 before test
update billets set quantite = 4 where id_billet in (:seated_billet, :ga_billet);

-- second item invalid (qty too high), whole call must fail
select public.reserve_cart(
  jsonb_build_array(
    jsonb_build_object('billet_id', :seated_billet::text, 'qty', 2),
    jsonb_build_object('billet_id', :ga_billet::text, 'qty', 99)
  )
);

-- Verify both unchanged at 4
select id_billet, quantite
from billets
where id_billet in (:seated_billet, :ga_billet);
```

### 4) Expiry release: past HELD reservation should restore stock

```sql
-- Create a HELD reservation by reserving GA qty=2
with r as (
  select public.reserve_cart(
    jsonb_build_array(jsonb_build_object('billet_id', :ga_billet::text, 'qty', 2))
  ) as payload
)
select (payload->>'reservation_id')::uuid as reservation_id
from r;

-- Force expiry in the past
update reservations
set expires_at = now() - interval '1 minute'
where id = :reservation_id;

-- Release expired reservations
select public.release_expired_reservations(500) as released_count;

-- Verify reservation status + restored stock
select id, status, expires_at from reservations where id = :reservation_id;
select id_billet, quantite from billets where id_billet = :ga_billet;
```

## How Step 3 will use this

In Step 3, `/api/checkout` will call `reserve_cart(items)` before creating Stripe Checkout Session.
The returned `reservation_id` can be stored in Stripe metadata and later reconciled in webhook processing.
