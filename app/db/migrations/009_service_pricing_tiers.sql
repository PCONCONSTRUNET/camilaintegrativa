-- Migração 009: Opções e pacotes de preços para serviços (múltiplos valores)
ALTER TABLE services ADD COLUMN IF NOT EXISTS pricing_tiers TEXT;
