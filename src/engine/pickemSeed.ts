// Seed dos Stages do Pick'em (ids do JSON do Major = ids que o conversor envia).
export interface SeedTeam { id: string; seed: number; name?: string }
export interface SeedData { event: { status?: string; listDate?: string }; teams: SeedTeam[] }

/** Trava do Stage 1: 24/11/2026 00:00 de Singapura (UTC+8) = 23/11 16:00 UTC = 13:00 de
 *  Brasília. É a mesma trava do navegador (PICKEM_LOCKS em data/majorLive.ts), pedida pela Central
 *  em 02/11 até o Matheus dizer outra coisa. */
export const S1_LOCKS_AT = '2026-11-23T16:00:00Z';
/** @deprecated nome antigo, mesmo valor */
export const S1_LOCKS_AT_PROPOSED = S1_LOCKS_AT;

export function stage1Teams(d: SeedData): string[] {
  return [...d.teams].sort((a, b) => a.seed - b.seed).slice(16, 32).map((t) => t.id);
}

export function buildSeedSql(d: SeedData): string {
  const ids = stage1Teams(d);
  const known = new Set(d.teams.map((t) => t.id));
  if (ids.length !== 16 || ids.some((i) => !known.has(i)) || new Set(ids).size !== 16) throw new Error('Stage 1 precisa de 16 ids únicos do JSON');
  const proj = d.event.status !== 'oficial';
  return `-- SEED do Pick'em: abre o Stage 1. Gerado por scripts/pickem-seed.mts — não editar à mão.
-- Rodar DEPOIS de 2026-10-26-pickem.sql, no Neon SQL Editor. Idempotente (upsert por stage).
${proj ? `-- ATENÇÃO: times ainda são PROJEÇÃO (lista oficial sai em ${d.event.listDate}). Atualize o JSON
-- (status='oficial'), rode \`npx tsx scripts/pickem-seed.mts\` e só então execute este arquivo.\n` : ''}--
-- locks_at: ${S1_LOCKS_AT} = 24/11/2026 00:00 em Singapura = 23/11 13:00 em Brasília,
-- a mesma trava do placar no navegador. A trava vale pelo relógio do servidor (now() < locks_at).

INSERT INTO rtm_pickem_stages (stage, teams, locks_at)
VALUES ('s1', '${JSON.stringify(ids)}'::jsonb, '${S1_LOCKS_AT}')
ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();

-- s2, s3 e playoffs: os times dependem dos resultados (Stage 2 = seeds 9-16 + 8 classificados do
-- Stage 1; Stage 3 = seeds 1-8 + 8 do Stage 2; Playoffs = 8 do Stage 3). Quando cada fase anterior
-- terminar, abra a próxima no admin (api/pickem, action 'admin:upsertStage') ou com o mesmo INSERT acima:
--   INSERT INTO rtm_pickem_stages (stage, teams, locks_at)
--   VALUES ('s2', '["<16 ids do JSON>"]'::jsonb, '<início do Stage 2, UTC>')
--   ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();
-- Playoffs: 8 ids. Datas: Stage 2 28/11, Stage 3 02/12, Playoffs 10/12 (horários a confirmar).
`;
}
