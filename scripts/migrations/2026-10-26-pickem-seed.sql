-- SEED do Pick'em: abre o Stage 1. Gerado por scripts/pickem-seed.mts — não editar à mão.
-- Rodar DEPOIS de 2026-10-26-pickem.sql, no Neon SQL Editor. Idempotente (upsert por stage).
-- ATENÇÃO: times ainda são PROJEÇÃO (lista oficial sai em 2026-11-02). Atualize o JSON
-- (status='oficial'), rode `npx tsx scripts/pickem-seed.mts` e só então execute este arquivo.
--
-- locks_at PROPOSTO: 2026-11-24T02:00:00Z = 24/11/2026 10:00 em Singapura (23/11 23:00 em Brasília).
-- O horário da 1ª partida do Stage 1 ainda não foi publicado pela PGL: confirme e ajuste se preciso.
-- A trava vale pelo relógio do servidor (now() < locks_at).

INSERT INTO rtm_pickem_stages (stage, teams, locks_at)
VALUES ('s1', '["betboom","magic","pain-gaming","mibr","faze-clan","ninjas-in-pyjamas","lynn-vision","wildcard","envy","heroic","big","tyloo","m80","jijiehao","team-liquid","thunder-downunder"]'::jsonb, '2026-11-24T02:00:00Z')
ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();

-- s2, s3 e playoffs: os times dependem dos resultados (Stage 2 = seeds 9-16 + 8 classificados do
-- Stage 1; Stage 3 = seeds 1-8 + 8 do Stage 2; Playoffs = 8 do Stage 3). Quando cada fase anterior
-- terminar, abra a próxima no admin (api/pickem, action 'admin:upsertStage') ou com o mesmo INSERT acima:
--   INSERT INTO rtm_pickem_stages (stage, teams, locks_at)
--   VALUES ('s2', '["<16 ids do JSON>"]'::jsonb, '<início do Stage 2, UTC>')
--   ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();
-- Playoffs: 8 ids. Datas: Stage 2 28/11, Stage 3 02/12, Playoffs 10/12 (horários a confirmar).
