-- =============================================================
-- Migration : 20260227000003_webhook_idempotency.sql
-- Step 3    : Unique constraints for webhook idempotency
-- =============================================================

-- Prevent the same Stripe event from being marked WEBHOOK_PROCESSED twice
CREATE UNIQUE INDEX audit_log_webhook_processed_unique ON audit_log (record_id) WHERE action = 'WEBHOOK_PROCESSED';

-- Prevent duplicate orders for the same Stripe session
ALTER TABLE commandes
  ADD CONSTRAINT commandes_stripe_session_id_unique UNIQUE (stripe_session_id);
