-- PICK'EM do Major Singapore — 2026-10-26
-- Idempotente: pode rodar quantas vezes quiser (só IF NOT EXISTS, nada é apagado).
-- Como rodar: cole o arquivo INTEIRO no Neon SQL Editor e execute (uma transação).
-- Pré-requisito: rtm_accounts já existe (a API lê o nick de lá).
-- PICKEM_AUTO_SCHEMA não tem efeito em produção: esta migração é o caminho.

BEGIN;

CREATE TABLE IF NOT EXISTS rtm_pickem_stages (
  stage           TEXT PRIMARY KEY,                 -- 's1' | 's2' | 's3' | 'playoffs'
  teams           JSONB NOT NULL DEFAULT '[]'::jsonb, -- ids do JSON do Major (ex.: 'legacy'), os mesmos que o conversor envia
  locks_at        TIMESTAMPTZ,                      -- trava: relógio do SERVIDOR (now() < locks_at)
  result          JSONB,                            -- resultado oficial (vale para o placar)
  result_source   TEXT,                             -- 'manual' | 'bo3'
  proposed_result JSONB,                            -- puxado do bo3.gg, aguardando confirmação
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rtm_pickem_picks (
  email    TEXT NOT NULL,                           -- conta (rtm_accounts.email); grátis ou paga
  stage    TEXT NOT NULL REFERENCES rtm_pickem_stages(stage),
  nick     TEXT NOT NULL,                           -- nick da conta no momento do palpite
  pick     JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),      -- desempate: quem salvou antes
  PRIMARY KEY (email, stage)
);

CREATE TABLE IF NOT EXISTS rtm_pickem_prizes (
  rank       INT PRIMARY KEY CHECK (rank BETWEEN 1 AND 10),
  email      TEXT NOT NULL UNIQUE,
  nick       TEXT NOT NULL,
  points     INT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','approved','delivered','rejected')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

-- placar e "meus palpites" filtram por stage / email
CREATE INDEX IF NOT EXISTS rtm_pickem_picks_stage_idx ON rtm_pickem_picks (stage);

COMMIT;

-- Abertura dos Stages: ver scripts/migrations/2026-10-26-pickem-seed.sql
-- (gerado por scripts/pickem-seed.mts a partir da lista; refazer após 02/11).
