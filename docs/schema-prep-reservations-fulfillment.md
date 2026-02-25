# Schema prep: reservations + fulfillment pipeline

This change is **schema-only** and intentionally does **not** change current checkout or webhook behavior yet.

## Added tables

- `reservations`: 5-minute hold header (status lifecycle, expiry timestamp, optional Stripe session link).
- `reservation_items`: line items for each hold, linked to `reservations` and `billets`.
- `audit_log`: generic append-only event table for before/after snapshots of entity changes.

## Extended tables

- `commandes` now has fulfillment-oriented fields:
  - `status` (default `PAID_NEW`)
  - `buyer_phone`
  - `fulfillment_notes`
  - `delivery_method`
  - `delivered_at`
  - `issue_flag` (default `false`)
  - `owner_admin_id`

- `billets` now has rule/assignment fields:
  - `ticket_type` (default `SEATED`, constrained to `SEATED|GA`)
  - `enforce_no_solo` (default `true`; GA rows can set `false`)
  - `owner_admin_id`

## Why now

These schema changes prepare follow-up PRs that will:
1. create atomic reservation/expiry logic (5-minute hold),
2. connect Stripe checkout sessions to reservations,
3. move orders through a Kanban-style fulfillment process,
4. write auditable state transitions.
