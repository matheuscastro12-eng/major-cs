-- DESAFIO DA SEMANA (Modo Cenário) — 2026-10-07
-- Idempotente. A API (api/cenarios.ts) também garante o schema 1x por instância;
-- este arquivo existe pra rodar manualmente antes do deploy, se preferir.
-- NÃO foi rodado em produção pelo agente que criou a frente.
--
-- Uma linha por (semana, conta): a melhor pontuação da semana (o servidor
-- recalcula a partir do log do run; nunca grava o número do cliente).
CREATE TABLE IF NOT EXISTS rtm_cenario_weekly (
  week_id      TEXT NOT NULL,         -- 'wk-AAAA-SS' (semana ISO, UTC)
  email        TEXT NOT NULL,         -- conta (PK de rtm_accounts)
  nick         TEXT,                  -- nick da CONTA no momento do start
  started_at   TIMESTAMPTZ,           -- largada da última tentativa (tempo mínimo real)
  attempts     INT NOT NULL DEFAULT 0,
  score        INT,
  grade        TEXT,
  mods         TEXT,                  -- modificadores mantidos, separados por vírgula
  submitted_at TIMESTAMPTZ,
  PRIMARY KEY (week_id, email)
);

-- placar da semana (ORDER BY score DESC, submitted_at ASC LIMIT 50) por índice
CREATE INDEX IF NOT EXISTS rtm_cenario_weekly_board_idx
  ON rtm_cenario_weekly (week_id, score DESC, submitted_at ASC) WHERE score IS NOT NULL;

-- Retenção: 26 semanas. Roda FORA do caminho de escrita: server/cenarios.ts
-- maybeCleanup() no GET público do placar, no máximo 1x a cada 6h por instância,
-- usando o prefixo week_id da PK (range scan). Equivalente manual:
-- DELETE FROM rtm_cenario_weekly WHERE week_id < 'wk-2026-15';
