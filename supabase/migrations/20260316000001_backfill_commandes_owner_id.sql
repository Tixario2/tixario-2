-- Backfill owner_id on commandes where it was missed during webhook processing.
-- Derives owner_id from the first billet referenced in id_billets.
UPDATE commandes c
SET owner_id = b.owner_id
FROM billets b
WHERE c.owner_id IS NULL
  AND b.id_billet = c.id_billets[1];
