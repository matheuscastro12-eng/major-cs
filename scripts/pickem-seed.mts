// Gera scripts/migrations/2026-10-26-pickem-seed.sql com os times de cada Stage
// (da lista única src/data/major-singapore-2026.json) e a trava proposta.
// Rodar de novo depois da lista oficial de 02/11. Não toca no banco.
import { readFileSync, writeFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('src/data/major-singapore-2026.json', 'utf8')) as { teams: { team: string; bo3Id: string; stage: number }[] };
// trava = início de cada fase em Singapura (UTC+8). Horário do 1º jogo A CONFIRMAR com a PGL.
const LOCKS: Record<string, string> = {
  s1: '2026-11-24T10:00:00+08:00',
  s2: '2026-11-28T10:00:00+08:00',
  s3: '2026-12-02T10:00:00+08:00',
  playoffs: '2026-12-10T10:00:00+08:00',
};
const ids = (n: number) => cfg.teams.filter((t) => t.stage === n).map((t) => t.bo3Id);
const rows: [string, string[]][] = [['s1', ids(1)], ['s2', ids(2)], ['s3', ids(3)], ['playoffs', []]];
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql = [
  "-- Gerado por scripts/pickem-seed.mts. NÃO rodado em produção.",
  "-- s2/s3 começam só com os convidados; os 8 que avançam do Stage anterior entram",
  "-- automaticamente quando o admin confirma o resultado (api/pickem.ts).",
  ...rows.map(([st, t]) => `INSERT INTO rtm_pickem_stages (stage, teams, locks_at) VALUES (${q(st)}, ${q(JSON.stringify(t))}::jsonb, ${q(LOCKS[st])})\n  ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now();`),
  '',
].join('\n');
writeFileSync('scripts/migrations/2026-10-26-pickem-seed.sql', sql);
console.log('ok', rows.map(([s, t]) => `${s}:${t.length}`).join(' '));
