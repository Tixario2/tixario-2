# Repo audit summary

## Data model (inferred from code)

- `billets`: ticket inventory rows keyed by `id_billet`, with fields used by app including `quantite`, `prix`, `categorie`, `disponible`, `evenement`, `ville`, `pays`, `slug`, `date`, `session`, `zone_id`, `map_png`, `map_svg`, `logo_artiste`, `image`.
- `commandes`: order rows inserted by webhook, including `stripe_session_id`, `email`, `nom`, JSON `billets`, `quantite_total`, `prix_total`, `date_evenement`, `evenement`, `id_billets`, `date_creation`.
- `newsletter`: rows inserted from webhook and test route with fields `email`, `source`, `date_inscription`.
- `contacts`: contact form submissions (`nom`, `email`, `sujet`, `message`).

## Supabase usage

- Public anon client (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) is used in pages and static generation to read `billets` and insert `contacts`.
- Service-role client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) is used server-side in webhook and test API to update `billets` and insert into `commandes` / `newsletter`.

## Checkout flow

1. User picks quantity on event/date page and either adds to local cart or buys now.
2. Cart page posts `cartItems` to `/api/checkout`.
3. `/api/checkout` builds Stripe line items; encodes `id_billet` into product name with `[ID:<id>]`.
4. Stripe session returns URL; browser redirects to Stripe Checkout.
5. Success return is `/success` and cancel is `/cancel`.

## Webhook flow

1. `/api/webhook` reads raw body and verifies Stripe signature.
2. Handles only `checkout.session.completed`.
3. Fetches line items from Stripe session.
4. For each line item, extracts billet ID from description (`[ID:...]`) and decrements `billets.quantite`.
5. Builds order payload and inserts a row into `commandes`.
6. Inserts purchaser into `newsletter`.
7. Sends confirmation email via Resend.

## Where inventory is updated

- Inventory decrement occurs only in `pages/api/webhook.ts` after checkout completion by reading then writing `billets.quantite`.
- Frontend checks and cart limits are client-side only and do not reserve inventory.

## Oversell risk highlights

- No reservation/hold before payment: multiple customers can checkout same stock concurrently.
- Non-atomic read-then-update in webhook can lose updates under concurrent webhook execution.
- Stock is derived from line-item description parsing; malformed description or missing ID skips decrement.
- Idempotency missing for webhook processing by `session.id`; duplicate webhook deliveries can decrement multiple times.
- Checkout API trusts client-provided `prix` and `quantite` without server-side revalidation against DB.
- Static pages revalidate every 60s, so displayed availability can be stale.
