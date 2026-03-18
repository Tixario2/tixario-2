-- Migration: Add mixed adult/child listing columns to billets
ALTER TABLE billets
  ADD COLUMN IF NOT EXISTS quantite_adult  integer,
  ADD COLUMN IF NOT EXISTS quantite_child  integer,
  ADD COLUMN IF NOT EXISTS prix_adult      numeric,
  ADD COLUMN IF NOT EXISTS prix_child      numeric,
  ADD COLUMN IF NOT EXISTS extra_info      text;
