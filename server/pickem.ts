// PICK'EM do Major Singapore — camada de banco (Neon). Regras puras em
// src/engine/majorSingapore/pickem.ts. Três tabelas (scripts/migrations/
// 2026-10-26-pickem.sql): rtm_pickem_stages (times, trava e resultado de cada
// Stage), rtm_pickem_picks (1 palpite por conta por Stage) e rtm_pickem_prizes
// (ganhadores propostos, só saem de 'review' com o ok manual do admin).
//
// A TRAVA é do relógio do SERVIDOR: o INSERT/UPDATE só acontece se
// now() < locks_at no próprio SQL — mesmo que o cliente mande depois da hora ou
// com relógio adulterado, o banco não grava (a rota responde 423).
import {
  PICKEM_SCORING, PICKEM_STAGES, isLocked, pickWinners, rankEntries, validatePick,
  type Entry, type PickemStageId, type Ranked, type StagePick, type StageResult,
} from '../src/engine/majorSingapore/pickem.js';

type Row = Record<string, unknown>;
export type SqlQuery = PromiseLike<Row[]>;
export interface SqlTag {
  (strings: TemplateStringsArray, ...params: unknown[]): SqlQuery;
  transaction(queries: SqlQuery[]): Promise<Row[][]>;
}

export const isStageId = (v: unknown): v is PickemStageId => typeof v === 'string' && (PICKEM_STAGES as string[]).includes(v);

let schemaReady = false;
export const resetPickemSchemaFlag = () => { schemaReady = false; };
/** Mesmo DDL do arquivo de migração (idempotente). Só roda se a env PICKEM_AUTO_SCHEMA=1. */
export async function ensurePickemSchema(sql: SqlTag): Promise<void> {
  if (schemaReady || process.env.PICKEM_AUTO_SCHEMA !== '1') return;
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_pickem_stages (stage TEXT PRIMARY KEY, teams JSONB NOT NULL DEFAULT '[]'::jsonb, locks_at TIMESTAMPTZ, result JSONB, result_source TEXT, proposed_result JSONB, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pickem_picks (email TEXT NOT NULL, stage TEXT NOT NULL REFERENCES rtm_pickem_stages(stage), nick TEXT NOT NULL, pick JSONB NOT NULL, saved_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (email, stage))`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pickem_prizes (rank INT PRIMARY KEY CHECK (rank BETWEEN 1 AND 10), email TEXT NOT NULL UNIQUE, nick TEXT NOT NULL, points INT NOT NULL, status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','approved','delivered','rejected')), note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ, decided_by TEXT)`,
  ]);
  schemaReady = true;
}

export interface StageRow { stage: PickemStageId; teams: string[]; locksAt: string | null; locked: boolean; result: StageResult | null; resultSource: string | null; proposedResult: StageResult | null }

const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? (JSON.parse(v) as string[]) : []);
const asObj = <T>(v: unknown): T | null => (v == null ? null : typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

export async function listStages(sql: SqlTag): Promise<{ stages: StageRow[]; serverNow: string }> {
  const rows = await sql`SELECT stage, teams, locks_at, result, result_source, proposed_result, now() AS server_now FROM rtm_pickem_stages`;
  const serverNow = iso(rows[0]?.server_now) ?? new Date().toISOString();
  const now = new Date(serverNow);
  const stages = rows.filter((r) => isStageId(r.stage)).map((r) => ({
    stage: r.stage as PickemStageId,
    teams: asArr(r.teams),
    locksAt: iso(r.locks_at),
    locked: isLocked(iso(r.locks_at), now),
    result: asObj<StageResult>(r.result),
    resultSource: (r.result_source as string) ?? null,
    proposedResult: asObj<StageResult>(r.proposed_result),
  })).sort((a, b) => PICKEM_STAGES.indexOf(a.stage) - PICKEM_STAGES.indexOf(b.stage));
  return { stages, serverNow };
}

export async function myPicks(sql: SqlTag, email: string): Promise<Partial<Record<PickemStageId, { pick: StagePick; savedAt: string }>>> {
  const rows = await sql`SELECT stage, pick, saved_at FROM rtm_pickem_picks WHERE email = ${email}`;
  const out: Partial<Record<PickemStageId, { pick: StagePick; savedAt: string }>> = {};
  for (const r of rows) if (isStageId(r.stage)) out[r.stage] = { pick: asObj<StagePick>(r.pick)!, savedAt: iso(r.saved_at)! };
  return out;
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; status: 400 | 404 | 423; error: string };

export async function savePick(sql: SqlTag, email: string, nick: string, stage: PickemStageId, raw: unknown): Promise<SaveResult> {
  const st = (await sql`SELECT teams, locks_at, now() AS server_now FROM rtm_pickem_stages WHERE stage = ${stage}`)[0];
  if (!st) return { ok: false, status: 404, error: 'Stage ainda não abriu para palpites.' };
  if (isLocked(iso(st.locks_at), new Date(iso(st.server_now)!))) return { ok: false, status: 423, error: 'Palpites deste Stage já estão travados.' };
  const v = validatePick(stage, raw, asArr(st.teams));
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  // trava no próprio SQL (o check acima é só pra mensagem; este é o que vale)
  const rows = await sql`
    INSERT INTO rtm_pickem_picks (email, stage, nick, pick, saved_at)
    SELECT ${email}, s.stage, ${nick}, ${JSON.stringify(v.pick)}::jsonb, now()
      FROM rtm_pickem_stages s WHERE s.stage = ${stage} AND s.locks_at IS NOT NULL AND now() < s.locks_at
    ON CONFLICT (email, stage) DO UPDATE SET pick = EXCLUDED.pick, nick = EXCLUDED.nick, saved_at = now()
      WHERE now() < (SELECT locks_at FROM rtm_pickem_stages WHERE stage = EXCLUDED.stage)
    RETURNING saved_at`;
  if (!rows.length) return { ok: false, status: 423, error: 'Palpites deste Stage já estão travados.' };
  return { ok: true, savedAt: iso(rows[0].saved_at)! };
}

export async function board(sql: SqlTag, cfg = PICKEM_SCORING): Promise<Ranked[]> {
  const { stages } = await listStages(sql);
  const results: Partial<Record<PickemStageId, StageResult>> = {};
  for (const s of stages) if (s.result) results[s.stage] = s.result;
  const rows = await sql`SELECT email, nick, stage, pick, saved_at FROM rtm_pickem_picks`;
  const by = new Map<string, Entry>();
  for (const r of rows) {
    if (!isStageId(r.stage)) continue;
    const email = String(r.email);
    const e = by.get(email) ?? { email, nick: String(r.nick), picks: {}, savedAt: iso(r.saved_at)! };
    e.picks[r.stage] = asObj<StagePick>(r.pick)!;
    const t = iso(r.saved_at)!;
    if (t > e.savedAt) e.savedAt = t; // desempate: horário do ÚLTIMO palpite salvo
    by.set(email, e);
  }
  return rankEntries([...by.values()], results, cfg);
}

/** Visão pública do placar: sem e-mail. */
export const publicBoard = (ranked: Ranked[], limit = 100) => ranked.slice(0, limit).map(({ email: _e, ...r }) => r);

// ------------------------------------------------------------------ admin

export async function adminUpsertStage(sql: SqlTag, stage: PickemStageId, teams: string[], locksAt: string): Promise<void> {
  if (!teams.length || !Number.isFinite(new Date(locksAt).getTime())) throw new Error('teams/locksAt inválidos');
  await sql`
    INSERT INTO rtm_pickem_stages (stage, teams, locks_at) VALUES (${stage}, ${JSON.stringify(teams)}::jsonb, ${locksAt})
    ON CONFLICT (stage) DO UPDATE SET teams = EXCLUDED.teams, locks_at = EXCLUDED.locks_at, updated_at = now()`;
}

/** Resultado oficial. source: 'manual' (admin digitou) ou 'bo3' (confirmou o proposto). */
export async function adminSetResult(sql: SqlTag, stage: PickemStageId, result: StageResult, source: 'manual' | 'bo3'): Promise<void> {
  await sql`UPDATE rtm_pickem_stages SET result = ${JSON.stringify(result)}::jsonb, result_source = ${source}, updated_at = now() WHERE stage = ${stage}`;
}

export async function adminProposeResult(sql: SqlTag, stage: PickemStageId, result: StageResult): Promise<void> {
  await sql`UPDATE rtm_pickem_stages SET proposed_result = ${JSON.stringify(result)}::jsonb, updated_at = now() WHERE stage = ${stage}`;
}

/** Grava os ganhadores em 'review'. Não sobrescreve quem já foi decidido. */
export async function adminProposeWinners(sql: SqlTag, cfg = PICKEM_SCORING): Promise<Ranked[]> {
  const winners = pickWinners(await board(sql, cfg), cfg);
  for (const w of winners) {
    await sql`
      INSERT INTO rtm_pickem_prizes (rank, email, nick, points) VALUES (${w.rank}, ${w.email}, ${w.nick}, ${w.points})
      ON CONFLICT (rank) DO UPDATE SET email = EXCLUDED.email, nick = EXCLUDED.nick, points = EXCLUDED.points, created_at = now()
        WHERE rtm_pickem_prizes.status = 'review'`;
  }
  return winners;
}

export type PrizeDecision = 'approved' | 'rejected' | 'delivered';
/** Ok manual. review→approved|rejected; approved→delivered. Nunca volta, nunca entrega 2x. */
export async function adminDecidePrize(sql: SqlTag, rank: number, decision: PrizeDecision, by: string, note = ''): Promise<boolean> {
  const from = decision === 'delivered' ? 'approved' : 'review';
  const rows = await sql`
    UPDATE rtm_pickem_prizes SET status = ${decision}, decided_at = now(), decided_by = ${by}, note = ${note}
     WHERE rank = ${rank} AND status = ${from} RETURNING rank`;
  return rows.length === 1;
}

export async function listPrizes(sql: SqlTag): Promise<Row[]> {
  return [...await sql`SELECT rank, email, nick, points, status, note, created_at, decided_at, decided_by FROM rtm_pickem_prizes ORDER BY rank`];
}
