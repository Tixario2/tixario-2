-- Add per-ticket purchase cost to billets
ALTER TABLE billets ADD COLUMN cout_unitaire numeric(10,2) DEFAULT 0;
