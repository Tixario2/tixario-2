-- =============================================================
-- Migration : 20260305000004_expire_reservations_rpc.sql
-- Step 4    : Atomic expiry RPC — release_expired_reservations
--
-- Finds all PENDING reservations past their expires_at,
-- claims them in one UPDATE, restores stock atomically,
-- writes audit entries — all in a single transaction.
--
-- Returns
--   integer  Number of reservations expired.
-- =============================================================

CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN

  -- ===========================================================
  -- Single atomic statement:
  --   1. Claim all expired PENDING reservations (mutex via WHERE)
  --   2. Restore stock with atomic increment (no read-then-write)
  --   3. Insert audit log entries
  -- ===========================================================

  WITH claimed AS (
    UPDATE reservations
    SET    status = 'EXPIRED'
    WHERE  status = 'PENDING'
      AND  expires_at < now()
    RETURNING id
  ),
  stock_restored AS (
    UPDATE billets b
    SET    quantite = b.quantite + agg.total_quantity
    FROM (
      SELECT ri.billet_id, sum(ri.quantity) AS total_quantity
      FROM   reservation_items ri
      JOIN   claimed ON claimed.id = ri.reservation_id
      GROUP  BY ri.billet_id
    ) AS agg
    WHERE  b.id_billet = agg.billet_id
  ),
  audit_inserted AS (
    INSERT INTO audit_log (table_name, record_id, action, new_data)
    SELECT
      'reservations',
      claimed.id::text,
      'RESERVATION_EXPIRED',
      jsonb_build_object('reservation_id', claimed.id)
    FROM claimed
  )
  SELECT count(*)::integer
  INTO   v_count
  FROM   claimed;

  RETURN v_count;

END;
$$;
