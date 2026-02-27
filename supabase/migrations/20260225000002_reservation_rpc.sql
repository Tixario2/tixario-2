-- =============================================================
-- Migration : 20260225000002_reservation_rpc.sql
-- Step 2    : RPC only -- create_reservation function
--             No schema changes, no triggers, no other functions
-- =============================================================


-- -------------------------------------------------------------
-- create_reservation
--
-- Atomically validates stock, decrements billets.quantite,
-- creates a PENDING reservation, snapshots line items, and
-- writes an audit entry -- all in one transaction.
--
-- Parameters
--   p_user_id     uuid     Nullable: caller may be anonymous.
--   p_items       jsonb    Array of {billet_id: text, quantity: int}.
--   p_ttl_minutes integer  How long the reservation is held (default 5).
--
-- Returns
--   uuid of the new reservation, or NULL on any failure.
--
-- On failure
--   All stock decrements and inserts are rolled back.
--   A RESERVATION_FAILED row is written to audit_log and committed.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_reservation(
  p_user_id     uuid    DEFAULT NULL,
  p_items       jsonb   DEFAULT '[]'::jsonb,
  p_ttl_minutes integer DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id  uuid;
  v_item            record;   -- one element from p_items
  v_billet          record;   -- locked billets row
BEGIN

  -- ===========================================================
  -- Pre-loop input validation
  -- ===========================================================

  -- 3. TTL must be positive.
  IF p_ttl_minutes <= 0 THEN
    RAISE EXCEPTION 'p_ttl_minutes must be greater than 0, got %', p_ttl_minutes;
  END IF;

  -- 1. Reject an empty basket.
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must not be empty';
  END IF;

  -- 1b. Every item must have a non-null billet_id.
  IF EXISTS (
    SELECT 1
    FROM   jsonb_array_elements(p_items) AS el
    WHERE  (el->>'billet_id') IS NULL
  ) THEN
    RAISE EXCEPTION 'all items must have a non-null billet_id';
  END IF;

  -- 2a. Every item must have a non-null quantity greater than 0.
  IF EXISTS (
    SELECT 1
    FROM   jsonb_array_elements(p_items) AS el
    WHERE  (el->>'quantity') IS NULL OR (el->>'quantity')::integer <= 0
  ) THEN
    RAISE EXCEPTION 'all items must have quantity > 0';
  END IF;

  -- 2b. No duplicate billet_ids within the same call.
  IF (SELECT count(*)                          FROM jsonb_array_elements(p_items) AS el)
  != (SELECT count(DISTINCT el->>'billet_id')  FROM jsonb_array_elements(p_items) AS el)
  THEN
    RAISE EXCEPTION 'p_items contains duplicate billet_id values';
  END IF;

  -- ===========================================================
  -- Steps 1-5: iterate items, lock rows, validate, decrement
  -- Sorted by billet_id so locks are always acquired in the same
  -- order across concurrent calls, preventing deadlocks.
  -- ===========================================================

  FOR v_item IN
    SELECT
      (el->>'billet_id')::text    AS billet_id,
      (el->>'quantity')::integer  AS quantity
    FROM jsonb_array_elements(p_items) AS el
    ORDER BY (el->>'billet_id')::text
  LOOP

    -- 2. Lock the billets row for the duration of this transaction.
    --    Concurrent reservations for the same ticket will wait here.
    SELECT *
    INTO   v_billet
    FROM   billets
    WHERE  id_billet = v_item.billet_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'billet not found: %', v_item.billet_id;
    END IF;

    -- 3. Stock check.
    IF v_billet.quantite < v_item.quantity THEN
      RAISE EXCEPTION
        'insufficient stock for billet %: % available, % requested',
        v_item.billet_id, v_billet.quantite, v_item.quantity;
    END IF;

    -- 4. No-solo rule: SEATED tickets only.
    --    Blocks a purchase that would strand exactly 1 seat unsold.
    IF v_billet.ticket_type = 'SEATED'
       AND v_billet.enforce_no_solo = true
       AND (v_billet.quantite - v_item.quantity) = 1
    THEN
      RAISE EXCEPTION
        'no-solo rule violated for billet %: purchase would leave exactly 1 seat unsold',
        v_item.billet_id;
    END IF;

    -- 5. Decrement stock.
    UPDATE billets
    SET    quantite = quantite - v_item.quantity
    WHERE  id_billet = v_item.billet_id;

  END LOOP;

  -- ===========================================================
  -- Step 6: insert the reservation
  -- ===========================================================

  INSERT INTO reservations (user_id, status, expires_at)
  VALUES (
    p_user_id,
    'PENDING',
    now() + (p_ttl_minutes * interval '1 minute')
  )
  RETURNING id INTO v_reservation_id;

  -- ===========================================================
  -- Step 7: snapshot line items with unit price from billets
  --         Prix is read after the decrement; only quantite
  --         changed, so prix reflects the current listed price.
  -- ===========================================================

  INSERT INTO reservation_items (reservation_id, billet_id, quantity, unit_price)
  SELECT
    v_reservation_id,
    (el->>'billet_id')::text,
    (el->>'quantity')::integer,
    b.prix
  FROM   jsonb_array_elements(p_items) AS el
  JOIN   billets b ON b.id_billet = (el->>'billet_id')::text;

  -- ===========================================================
  -- Step 8: success audit entry
  -- ===========================================================

  INSERT INTO audit_log (table_name, record_id, action, actor_id, new_data)
  VALUES (
    'reservations',
    v_reservation_id::text,
    'RESERVATION_CREATED',
    p_user_id,
    to_jsonb((SELECT r FROM reservations r WHERE r.id = v_reservation_id))
  );

  -- ===========================================================
  -- Step 9: return the new reservation id
  -- ===========================================================

  RETURN v_reservation_id;


-- =============================================================
-- Failure handler
-- PL/pgSQL rolls back to the implicit savepoint at the start of
-- this block, undoing all stock decrements and inserts above.
-- The audit insert below runs in the outer transaction and
-- commits even though the reservation work was rolled back.
-- =============================================================

EXCEPTION
  WHEN OTHERS THEN

    INSERT INTO audit_log (table_name, record_id, action, actor_id, new_data)
    VALUES (
      'reservations',
      COALESCE(v_reservation_id::text, 'none'),
      'RESERVATION_FAILED',
      p_user_id,
      jsonb_build_object(
        'error',    SQLERRM,
        'sqlstate', SQLSTATE,
        'items',    p_items
      )
    );

    RETURN NULL;

END;
$$;
