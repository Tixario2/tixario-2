-- Atomic reservation RPCs for multi-item carts.
-- This migration is DB-only and does not change checkout/webhook application code.

create extension if not exists pgcrypto;

-- Supporting indexes (idempotent if they already exist from prior migrations)
create index if not exists reservations_status_expires_at_idx
  on public.reservations (status, expires_at);
create index if not exists reservation_items_reservation_id_idx
  on public.reservation_items (reservation_id);
create index if not exists reservation_items_billet_id_idx
  on public.reservation_items (billet_id);

create or replace function public.reserve_cart(items jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_reservation_id uuid;
  v_expires_at timestamptz;
  v_item jsonb;
  v_billet_id uuid;
  v_qty integer;
  v_quantite_before integer;
  v_quantite_after integer;
  v_prix integer;
  v_disponible boolean;
  v_ticket_type text;
  v_enforce_no_solo boolean;
  v_items_reserved jsonb := '[]'::jsonb;
  v_position integer := 0;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty JSON array of {billet_id, qty}';
  end if;

  insert into public.reservations (status, expires_at, created_at, updated_at)
  values ('HELD', now() + interval '5 minutes', now(), now())
  returning id, expires_at into v_reservation_id, v_expires_at;

  for v_item in
    select value
    from jsonb_array_elements(items)
  loop
    v_position := v_position + 1;

    begin
      v_billet_id := (v_item ->> 'billet_id')::uuid;
    exception
      when others then
        raise exception 'items[%] has invalid billet_id: %', v_position, v_item ->> 'billet_id';
    end;

    begin
      v_qty := (v_item ->> 'qty')::integer;
    exception
      when others then
        raise exception 'items[%] has invalid qty: %', v_position, v_item ->> 'qty';
    end;

    if v_qty is null or v_qty < 1 then
      raise exception 'items[%] qty must be >= 1', v_position;
    end if;

    select b.quantite, b.prix, b.disponible, b.ticket_type, b.enforce_no_solo
      into v_quantite_before, v_prix, v_disponible, v_ticket_type, v_enforce_no_solo
    from public.billets b
    where b.id_billet = v_billet_id
    for update;

    if not found then
      raise exception 'items[%] billet not found: %', v_position, v_billet_id;
    end if;

    if coalesce(v_disponible, false) = false then
      raise exception 'items[%] billet % is not disponible', v_position, v_billet_id;
    end if;

    if v_quantite_before < v_qty then
      raise exception 'items[%] insufficient stock for billet % (have %, need %)',
        v_position, v_billet_id, v_quantite_before, v_qty;
    end if;

    if (coalesce(v_ticket_type, 'SEATED') = 'SEATED' or coalesce(v_enforce_no_solo, true))
       and (v_quantite_before - v_qty) = 1 then
      raise exception 'items[%] no-solo rule violation for billet % (would leave exactly 1)',
        v_position, v_billet_id;
    end if;

    update public.billets
      set quantite = quantite - v_qty
    where id_billet = v_billet_id
    returning quantite into v_quantite_after;

    insert into public.reservation_items (
      reservation_id,
      billet_id,
      qty,
      unit_price,
      currency
    )
    values (
      v_reservation_id,
      v_billet_id,
      v_qty,
      coalesce(v_prix, 0),
      'EUR'
    );

    insert into public.audit_log (
      actor,
      entity_type,
      entity_id,
      action,
      before_json,
      after_json,
      created_at
    )
    values (
      'system',
      'billets',
      v_billet_id::text,
      'RESERVE_DECREMENT',
      jsonb_build_object(
        'quantite', v_quantite_before,
        'reservation_id', v_reservation_id,
        'qty', v_qty
      ),
      jsonb_build_object(
        'quantite', v_quantite_after,
        'reservation_id', v_reservation_id,
        'qty', v_qty
      ),
      now()
    );

    v_items_reserved := v_items_reserved || jsonb_build_array(
      jsonb_build_object(
        'billet_id', v_billet_id,
        'qty', v_qty,
        'unit_price', coalesce(v_prix, 0),
        'currency', 'EUR'
      )
    );
  end loop;

  return jsonb_build_object(
    'reservation_id', v_reservation_id,
    'expires_at', v_expires_at,
    'items_reserved', v_items_reserved
  );
end;
$$;

create or replace function public.release_expired_reservations(limit_count integer default 500)
returns integer
language plpgsql
as $$
declare
  v_reservation record;
  v_item record;
  v_quantite_before integer;
  v_quantite_after integer;
  v_released_count integer := 0;
begin
  if limit_count is null or limit_count < 1 then
    raise exception 'limit_count must be >= 1';
  end if;

  for v_reservation in
    select r.id
    from public.reservations r
    where r.status = 'HELD'
      and r.expires_at < now()
    order by r.expires_at asc
    limit limit_count
    for update skip locked
  loop
    for v_item in
      select ri.billet_id, ri.qty
      from public.reservation_items ri
      where ri.reservation_id = v_reservation.id
    loop
      select b.quantite
        into v_quantite_before
      from public.billets b
      where b.id_billet = v_item.billet_id
      for update;

      if not found then
        raise exception 'billet not found while releasing reservation %: %',
          v_reservation.id, v_item.billet_id;
      end if;

      update public.billets
      set quantite = quantite + v_item.qty
      where id_billet = v_item.billet_id
      returning quantite into v_quantite_after;

      insert into public.audit_log (
        actor,
        entity_type,
        entity_id,
        action,
        before_json,
        after_json,
        created_at
      )
      values (
        'system',
        'billets',
        v_item.billet_id::text,
        'RESERVATION_EXPIRE_RESTORE',
        jsonb_build_object(
          'quantite', v_quantite_before,
          'reservation_id', v_reservation.id,
          'qty', v_item.qty
        ),
        jsonb_build_object(
          'quantite', v_quantite_after,
          'reservation_id', v_reservation.id,
          'qty', v_item.qty
        ),
        now()
      );
    end loop;

    update public.reservations
      set status = 'EXPIRED',
          updated_at = now()
    where id = v_reservation.id
      and status = 'HELD';

    v_released_count := v_released_count + 1;
  end loop;

  return v_released_count;
end;
$$;
