-- Migration: Convert slug from "name-city-DD-MM-YYYY" to parent-event-only slug
-- The slug column now stores only the slugified event name (e.g. "roland-garros")
-- instead of "roland-garros-03-06-2025". Date and city come from their own columns.

UPDATE billets
SET slug = lower(
  trim(BOTH '-' FROM
    regexp_replace(
      regexp_replace(
        normalize(evenement, NFD),
        '[\u0300-\u036f]', '', 'g'
      ),
      '[^a-z0-9]+', '-', 'gi'
    )
  )
);
