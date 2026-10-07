// DESAFIO DA SEMANA (Modo Cenário) — lado servidor.
// Uma linha por conta por semana (rtm_cenario_weekly). Fluxo:
//   start  → grava started_at (a largada da tentativa; conta tentativas)
//   submit → recebe o LOG do run (nunca a pontuação), valida plausibilidade,
//            exige tempo real mínimo desde o start e RECALCULA a pontuação com
//            o mesmo engine do cliente. Guarda só a MELHOR da semana.
//   board  → top 50 da semana (público, cacheado no edge)
//   me     → minha melhor + posição
// Retenção (26 semanas) num DELETE separado, throttled por instância e só no
// caminho de LEITURA pública — nunca grudado no INSERT/UPDATE.
import { cenarioById } from '../src/engine/cenarios/catalog.js';
import { parseRun } from '../src/engine/cenarios/run.js';
import { maxScore, verifySubmission } from '../src/engine/cenarios/validate.js';
import { weeklyFromId, weeklyId } from '../src/engine/cenarios/weekly.js';
import type { SqlQuery, SqlTag } from './ultimate-economy.js';

export const RETENTION_WEEKS = 26;
const WEEK_MS = 7 * 86_400_000;
/** tolerância pra enviar o run da semana que acabou de fechar */
export const SUBMIT_GRACE_MS = 36 * 3_600_000;

export function cenarioSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_cenario_weekly (week_id TEXT NOT NULL, email TEXT NOT NULL, nick TEXT, started_at TIMESTAMPTZ, attempts INT NOT NULL DEFAULT 0, score INT, grade TEXT, mods TEXT, submitted_at TIMESTAMPTZ, PRIMARY KEY (week_id, email))`,
    sql`CREATE INDEX IF NOT EXISTS rtm_cenario_weekly_board_idx ON rtm_cenario_weekly (week_id, score DESC, submitted_at ASC) WHERE score IS NOT NULL`,
  ];
}

/** id da semana mais antiga que ainda fica no banco */
export const retentionCutoffId = (now: number) => weeklyId(now - RETENTION_WEEKS * WEEK_MS);

let lastCleanupAt = 0;
const CLEANUP_MS = 6 * 3_600_000;
/** Retenção throttled (1x/6h por instância). Chamada só pelo board público; falha não derruba nada. */
export async function maybeCleanup(sql: SqlTag, now: number): Promise<boolean> {
  if (now - lastCleanupAt < CLEANUP_MS) return false;
  lastCleanupAt = now;
  try { await sql`DELETE FROM rtm_cenario_weekly WHERE week_id < ${retentionCutoffId(now)}`; } catch { /* limpeza é best-effort */ }
  return true;
}
export function resetCleanupClock(): void { lastCleanupAt = 0; }

/** Semana aceita pra start (só a corrente) ou submit (corrente ou a anterior dentro da tolerância). */
export function acceptWeek(id: string, now: number, kind: 'start' | 'submit'): boolean {
  const w = weeklyFromId(id);
  if (!w) return false;
  if (now >= w.startsAt && now <= w.endsAt) return true;
  return kind === 'submit' && now > w.endsAt && now - w.endsAt <= SUBMIT_GRACE_MS;
}

export type StartResult = { ok: true; weekId: string; attempts: number } | { ok: false; error: 'bad_week' };
export async function cenarioStart(sql: SqlTag, now: number, email: string, nick: string, weekId: string): Promise<StartResult> {
  if (!acceptWeek(weekId, now, 'start')) return { ok: false, error: 'bad_week' };
  const at = new Date(now).toISOString();
  const rows = await sql`INSERT INTO rtm_cenario_weekly (week_id, email, nick, started_at, attempts) VALUES (${weekId}, ${email}, ${nick}, ${at}, 1)
    ON CONFLICT (week_id, email) DO UPDATE SET started_at = ${at}, nick = ${nick}, attempts = rtm_cenario_weekly.attempts + 1
    RETURNING attempts`;
  return { ok: true, weekId, attempts: Number(rows[0]?.attempts ?? 1) };
}

export type SubmitResult =
  | { ok: true; score: number; grade: string; best: number; improved: boolean; rank: number }
  | { ok: false; error: string };

export async function cenarioSubmit(sql: SqlTag, now: number, email: string, weekId: string, rawRun: unknown): Promise<SubmitResult> {
  if (!acceptWeek(weekId, now, 'submit')) return { ok: false, error: 'bad_week' };
  const w = weeklyFromId(weekId)!;
  const run = parseRun(rawRun);
  if (!run) return { ok: false, error: 'bad_run' };
  if (run.weekly !== weekId || run.defId !== w.def.id || run.seed !== w.seed) return { ok: false, error: 'wrong_challenge' };
  const def = cenarioById(run.defId);
  if (!def) return { ok: false, error: 'wrong_challenge' };
  const row = await sql`SELECT started_at, score FROM rtm_cenario_weekly WHERE week_id=${weekId} AND email=${email}`;
  if (!row.length || !row[0].started_at) return { ok: false, error: 'not_started' };
  const startedAt = new Date(String(row[0].started_at)).getTime();
  const elapsedSec = Math.floor((now - startedAt) / 1000);
  const v = verifySubmission(def, run, elapsedSec);
  if (!v.ok) return { ok: false, error: v.reason };
  const score = v.result.score;
  if (score < 0 || score > maxScore(def)) return { ok: false, error: 'implausible' };
  const at = new Date(now).toISOString();
  const upd = await sql`UPDATE rtm_cenario_weekly SET score=${score}, grade=${v.result.grade}, mods=${v.result.modsKept.join(',')}, submitted_at=${at}
    WHERE week_id=${weekId} AND email=${email} AND (score IS NULL OR score < ${score}) RETURNING score`;
  const best = upd.length ? score : Number(row[0].score ?? score);
  const better = await sql`SELECT count(*)::int AS n FROM rtm_cenario_weekly WHERE week_id=${weekId} AND score > ${best}`;
  return { ok: true, score, grade: v.result.grade, best, improved: upd.length > 0, rank: Number(better[0]?.n ?? 0) + 1 };
}

export interface BoardRow { rank: number; nick: string; score: number; grade: string; mods: string[] }
export async function cenarioBoard(sql: SqlTag, weekId: string): Promise<{ weekId: string; total: number; board: BoardRow[] }> {
  const rows = await sql`SELECT nick, score, grade, mods FROM rtm_cenario_weekly WHERE week_id=${weekId} AND score IS NOT NULL ORDER BY score DESC, submitted_at ASC LIMIT 50`;
  const total = await sql`SELECT count(*)::int AS n FROM rtm_cenario_weekly WHERE week_id=${weekId} AND score IS NOT NULL`;
  return {
    weekId,
    total: Number(total[0]?.n ?? 0),
    board: rows.map((r, i) => ({ rank: i + 1, nick: String(r.nick ?? 'manager').slice(0, 24), score: Number(r.score), grade: String(r.grade ?? 'C'), mods: String(r.mods ?? '').split(',').filter(Boolean) })),
  };
}

export async function cenarioMe(sql: SqlTag, email: string, weekId: string): Promise<{ best: number | null; grade: string | null; rank: number | null; attempts: number }> {
  const row = await sql`SELECT score, grade, attempts FROM rtm_cenario_weekly WHERE week_id=${weekId} AND email=${email}`;
  if (!row.length) return { best: null, grade: null, rank: null, attempts: 0 };
  const best = row[0].score == null ? null : Number(row[0].score);
  let rank: number | null = null;
  if (best != null) {
    const better = await sql`SELECT count(*)::int AS n FROM rtm_cenario_weekly WHERE week_id=${weekId} AND score > ${best}`;
    rank = Number(better[0]?.n ?? 0) + 1;
  }
  return { best, grade: row[0].grade == null ? null : String(row[0].grade), rank, attempts: Number(row[0].attempts ?? 0) };
}
