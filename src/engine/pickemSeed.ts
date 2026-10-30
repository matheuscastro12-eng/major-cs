// Seed dos Stages do Pick'em (ids do JSON do Major = ids que o conversor envia).
export interface SeedTeam { id: string; seed: number; name?: string }
export interface SeedData { event: { status?: string; listDate?: string }; teams: SeedTeam[] }

/** PROPOSTO: início do Stage 1 (24/11/2026). PGL ainda não publicou o horário da 1ª partida;
 *  10:00 de Singapura (UTC+8) = 02:00 UTC = 23:00 de 23/11 em Brasília. Confirmar antes de rodar. */
export const S1_LOCKS_AT_PROPOSED = '2026-11-24T02:00:00Z';

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
-- locks_at PROPOSTO: ${S1_LOCKS_AT_PROPOSED} = 24/11/2026 10:00 em Singapura (23/11 23:00 em Brasília).
-- O horário da 1ª partida do Stage 1 ainda não foi publicado pela PGL: confirme e ajuste se preciso.
-- A trava vale pelo relógio do servidor (now() < locks_at).

INSERT INTO rtm_pickem_stages (stage, teams, locks_at)
VALUES ('s1', '${JSON.stringify(ids)}'::jsonb, '${S1_LOCKS_AT_PROPOSED}')
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
