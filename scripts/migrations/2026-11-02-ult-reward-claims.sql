-- [UT-REW2] fase 2 dos prêmios do Ultimate no servidor (PR fix/ut-server-rewards-p2)
-- NÃO RODADO. Idempotente (IF NOT EXISTS) — pode rodar mais de uma vez.
-- O código NÃO depende deste arquivo: sem ele o rewardClaim funciona igual,
-- só faz o filtro por prefixo de op_id ('rw:%', 'pass:%', 'obj:%') e o
-- contador de inscrições do Draft com o índice existente (email, id DESC).
--
-- 1) prefixo de op_id por conta (loadClaimCtx: LIKE 'rw:%' / 'pass:%' / 'obj:%')
CREATE INDEX IF NOT EXISTS rtm_ult_ledger_email_op_prefix_idx
  ON rtm_ult_ledger (email, op_id text_pattern_ops);

-- 2) inscrições do Draft nas últimas 24h (teto de claims de Draft)
CREATE INDEX IF NOT EXISTS rtm_ult_ledger_draft_entry_idx
  ON rtm_ult_ledger (email, created_at DESC)
  WHERE kind = 'spend' AND meta->>'src' = 'draft-entry';

-- 3) auditoria: packs Promo/Temporada gravados SEM débito (saldo do servidor < aparelho)
CREATE INDEX IF NOT EXISTS rtm_ult_ledger_unpaid_pack_idx
  ON rtm_ult_ledger (created_at DESC)
  WHERE op_id LIKE 'rw:pack-paid:%' AND (meta->>'unpaid') = 'true';
