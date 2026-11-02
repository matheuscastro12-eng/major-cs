// [URG-5] META COMUNITÁRIA DA SEMANA — lado servidor.
// Contadores agregados por semana ISO (rtm_community_goal) e por conta
// (rtm_community_contrib). Alimentado por TODO caminho de partida online
// reportada (ranqueada/evento em api/ranking.ts, duelo, Major da Semana):
// cada report ACEITO conta +1 pro total da semana e +1 pra conta — um por
// jogador por partida, dedupe herdado das PKs de cada tabela de report.
// O prêmio segue o padrão coinsClaim: o servidor só marca `claimed`, o
// cliente credita no save. Regra pura em src/engine/ultimate/communityGoal.ts.
import {
  communityGoalFor,
  communityRewardFor,
  communityWeekId,
  progressPct,
  type CommunityGoal,
  type CommunityPackTier,
} from '../src/engine/ultimate/communityGoal.js';
import type { SqlQuery, SqlTag } from './ultimate-economy.js';

export { resolveWeekTarget } from '../src/engine/ultimate/communityGoal.js';

const WEEK_MS = 7 * 86_400_000;

export function communityGoalSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_community_goal (week_id TEXT PRIMARY KEY, target INT NOT NULL, total INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_community_contrib (week_id TEXT NOT NULL, account_id TEXT NOT NULL, matches INT NOT NULL DEFAULT 0, claimed BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY (week_id, account_id))`,
  ];
}

// ------------------------------------------------------------ regra pura

export interface ClaimInput {
  now: number;
  goal: Pick<CommunityGoal, 'target' | 'endsAt' | 'reward'>;
  total: number;
  matches: number;
  claimed: boolean;
}
export type ClaimEligibility =
  | { ok: true; credits: number; packTier: CommunityPackTier | null }
  | { ok: false; reason: 'in_progress' | 'too_few_matches' | 'already_claimed' };

/** Pode resgatar quando a semana FECHOU ou a meta foi BATIDA, com ≥ 3 partidas e sem claim anterior. */
export function claimEligibility(i: ClaimInput): ClaimEligibility {
  if (i.claimed) return { ok: false, reason: 'already_claimed' };
  const reached = i.total >= i.goal.target;
  const closed = i.now > i.goal.endsAt;
  if (!reached && !closed) return { ok: false, reason: 'in_progress' };
  const r = communityRewardFor(i.matches, i.goal.reward);
  if (r.credits <= 0) return { ok: false, reason: 'too_few_matches' };
  return { ok: true, credits: r.credits, packTier: r.packTier };
}

// --------------------------------------------------------------- SQL

/** Garante a linha da semana corrente (target escalado pelo total da semana anterior) e a devolve. */
export async function ensureCommunityWeek(sql: SqlTag, now: number): Promise<{ goal: CommunityGoal; total: number }> {
  const weekId = communityWeekId(now);
  const cur = await sql`SELECT target, total FROM rtm_community_goal WHERE week_id=${weekId}`;
  if (cur.length) return { goal: { ...communityGoalFor(now), target: Number(cur[0].target) }, total: Number(cur[0].total) };
  const prevId = communityWeekId(now - WEEK_MS);
  const prev = await sql`SELECT total FROM rtm_community_goal WHERE week_id=${prevId}`;
  const goal = communityGoalFor(now, prev.length ? Number(prev[0].total) : null);
  // corrida entre duas invocações: o primeiro INSERT vence; o alvo já gravado é a verdade
  const ins = await sql`INSERT INTO rtm_community_goal (week_id, target, total) VALUES (${weekId}, ${goal.target}, 0)
    ON CONFLICT (week_id) DO NOTHING RETURNING target`;
  if (ins.length) return { goal, total: 0 };
  const again = await sql`SELECT target, total FROM rtm_community_goal WHERE week_id=${weekId}`;
  return { goal: { ...goal, target: Number(again[0]?.target ?? goal.target) }, total: Number(again[0]?.total ?? 0) };
}

/** +1 no total da semana e +1 na conta. NUNCA derruba o report que a chamou (try/catch aqui dentro). */
export async function bumpCommunityContrib(sql: SqlTag, now: number, accountId: string): Promise<void> {
  try {
    const { goal } = await ensureCommunityWeek(sql, now);
    await sql`UPDATE rtm_community_goal SET total = total + 1 WHERE week_id=${goal.id}`;
    await sql`INSERT INTO rtm_community_contrib (week_id, account_id, matches) VALUES (${goal.id}, ${accountId}, 1)
      ON CONFLICT (week_id, account_id) DO UPDATE SET matches = rtm_community_contrib.matches + 1`;
  } catch {
    /* contador é prova social, não ledger: falhar aqui não pode falhar a partida */
  }
}

export interface CommunityWeekView {
  id: string; target: number; total: number; pct: number; remaining: number; reached: boolean; closed: boolean;
  startsAt: number; endsAt: number; reward: CommunityGoal['reward'];
}
export interface CommunityMine { myMatches: number; claimed: boolean; claimable: boolean; credits: number; packTier: CommunityPackTier | null }

export function weekView(goal: CommunityGoal, total: number, now: number): CommunityWeekView {
  return {
    id: goal.id, target: goal.target, total, pct: progressPct(total, goal.target),
    remaining: Math.max(0, goal.target - total), reached: total >= goal.target, closed: now > goal.endsAt,
    startsAt: goal.startsAt, endsAt: goal.endsAt, reward: goal.reward,
  };
}

export function mineView(goal: CommunityGoal, total: number, now: number, row: { matches: number; claimed: boolean } | null): CommunityMine {
  const matches = row?.matches ?? 0; const claimed = !!row?.claimed;
  const el = claimEligibility({ now, goal, total, matches, claimed });
  const r = communityRewardFor(matches, goal.reward);
  return { myMatches: matches, claimed, claimable: el.ok, credits: r.credits, packTier: r.packTier };
}

/** Estado público da semana corrente (+ o meu, se houver conta) e da semana passada (prêmio pendente). */
export async function communityGoalStatus(sql: SqlTag, now: number, accountId: string | null) {
  const { goal, total } = await ensureCommunityWeek(sql, now);
  const week = weekView(goal, total, now);
  if (!accountId) return { week, mine: null, lastWeek: null };
  const prevNow = now - WEEK_MS;
  const prevGoalBase = communityGoalFor(prevNow);
  const prevRow = await sql`SELECT target, total FROM rtm_community_goal WHERE week_id=${prevGoalBase.id}`;
  const rows = await sql`SELECT week_id, matches, claimed FROM rtm_community_contrib WHERE account_id=${accountId} AND week_id IN (${goal.id}, ${prevGoalBase.id})`;
  const byWeek = new Map(rows.map((r) => [String(r.week_id), { matches: Number(r.matches) || 0, claimed: !!r.claimed }]));
  const mine = mineView(goal, total, now, byWeek.get(goal.id) ?? null);
  let lastWeek: (CommunityWeekView & CommunityMine) | null = null;
  if (prevRow.length && byWeek.has(prevGoalBase.id)) {
    const prevGoal = { ...prevGoalBase, target: Number(prevRow[0].target) };
    const prevTotal = Number(prevRow[0].total);
    lastWeek = { ...weekView(prevGoal, prevTotal, now), ...mineView(prevGoal, prevTotal, now, byWeek.get(prevGoalBase.id) ?? null) };
  }
  return { week, mine, lastWeek };
}

export type ClaimResult =
  | { ok: true; credits: number; packTier: CommunityPackTier | null; replayed: boolean; weekId: string }
  | { ok: false; error: 'unknown_week' | 'in_progress' | 'too_few_matches' | 'already_claimed' };

/** Resgate idempotente: só o UPDATE que virar claimed=false→true paga; replay devolve ok sem prêmio. */
export async function communityGoalClaim(sql: SqlTag, now: number, accountId: string, weekIdRaw: string): Promise<ClaimResult> {
  const curId = communityWeekId(now);
  const prevId = communityWeekId(now - WEEK_MS);
  const weekId = weekIdRaw === prevId ? prevId : curId; // só a corrente ou a anterior
  const g = await sql`SELECT target, total FROM rtm_community_goal WHERE week_id=${weekId}`;
  if (!g.length) return { ok: false, error: 'unknown_week' };
  const base = communityGoalFor(weekId === prevId ? now - WEEK_MS : now);
  const goal: CommunityGoal = { ...base, target: Number(g[0].target) };
  const total = Number(g[0].total);
  const me = await sql`SELECT matches, claimed FROM rtm_community_contrib WHERE week_id=${weekId} AND account_id=${accountId}`;
  const matches = Number(me[0]?.matches ?? 0);
  const el = claimEligibility({ now, goal, total, matches, claimed: false });
  if (!el.ok) return { ok: false, error: el.reason };
  if (me[0]?.claimed) return { ok: true, credits: 0, packTier: null, replayed: true, weekId };
  const upd = await sql`UPDATE rtm_community_contrib SET claimed=true WHERE week_id=${weekId} AND account_id=${accountId} AND claimed=false RETURNING matches`;
  if (!upd.length) return { ok: true, credits: 0, packTier: null, replayed: true, weekId };
  return { ok: true, credits: el.credits, packTier: el.packTier, replayed: false, weekId };
}
