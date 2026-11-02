-- A/B dos cards de oferta: atribuição (ref/utm + variante) em cadastros
-- pendentes e pedidos de coins. Idempotente. NÃO rodado — precisa do ok do Matheus.
-- O código tolera as colunas ausentes (UPDATE best-effort em try/catch).
ALTER TABLE rtm_pending_signups ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE rtm_pending_signups ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE rtm_pending_signups ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE rtm_pending_signups ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE rtm_pending_signups ADD COLUMN IF NOT EXISTS offer_variant TEXT;
ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS offer_variant TEXT;
-- conferência
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('rtm_pending_signups', 'rtm_coin_orders')
  AND column_name IN ('ref', 'utm_source', 'utm_medium', 'utm_campaign', 'offer_variant')
ORDER BY 1, 2;
