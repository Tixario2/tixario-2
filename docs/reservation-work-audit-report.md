# Reservation work audit report

## Scope
Audit of branch/history and migration presence for Step 1 (schema prep) and Step 2 (reservation RPC).

## 1) Remotes and branches

- `git fetch --all --prune` completed with no remote updates.
- No git remotes are configured in this local checkout.
- Branches available during audit:
  - `work`
  - `feature/audit-reservation-work` (this audit branch)

### Branch names related to schema/reservation/rpc

- `feature/audit-reservation-work` (audit branch only).
- No other local/remote branch names containing `schema`, `reservation`, or `rpc` were found.

## 2) `main` log check and Step 1 presence on main

- There is no `main` ref in this checkout (`git log main` fails with unknown revision).
- Fallback reference used: `work` branch (appears to be current production branch in this environment).
- `work` last commits include:
  - `d4aacca Add reservations + fulfillment schema and atomic reserve_cart/release_expired_reservations RPCs`

Conclusion for this environment:
- Step 1 appears present on `work`.
- Main cannot be directly verified because `main` branch is not available locally and no remotes are configured.

## 3) Migration/object search results

### Step 1 objects found

- Migration file:
  - `supabase/migrations/20260224120000_prepare_reservations_and_fulfillment.sql`
- Contains:
  - tables `reservations`, `reservation_items`, `audit_log`
  - `commandes` columns: `status`, `buyer_phone`, `fulfillment_notes`, `delivery_method`, `delivered_at`, `issue_flag`, `owner_admin_id`
  - `billets` columns: `ticket_type`, `enforce_no_solo`, `owner_admin_id`

### Step 2 objects found

- Migration file:
  - `supabase/migrations/20260225101500_reservation_rpc.sql`
- Contains:
  - function `public.reserve_cart(items jsonb)`
  - function `public.release_expired_reservations(limit_count integer default 500)`

## 4) Missing/inconsistent items

- No missing SQL objects were found relative to requested Step 1 + Step 2 scope.
- Step 2 depends on Step 1 tables/columns and is timestamped later than Step 1 migration, so migration ordering is consistent.
- Because `main` is unavailable in this local clone, branch-level presence is validated only against `work`.
