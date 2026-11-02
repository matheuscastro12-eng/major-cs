-- Flag do paywall (PR feat/paywall-pix-recovery). Idempotente. NÃO rodada.
-- Sem esta tabela o código segue com a flag DESLIGADA (padrão OFF).
CREATE TABLE IF NOT EXISTS rtm_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- grava a flag desligada (não muda nada); para LIGAR, ver docs/paywall-flag.md
INSERT INTO rtm_settings (key, value) VALUES ('paywall_gate', 'off')
ON CONFLICT (key) DO NOTHING;

-- Lembrete de checkout abandonado: registro de quem já recebeu (evita repetir).
-- Só usado quando o envio for aprovado; hoje nada envia.
CREATE TABLE IF NOT EXISTS rtm_checkout_reminders (
  email      TEXT PRIMARY KEY,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
