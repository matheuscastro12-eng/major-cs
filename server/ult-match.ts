// [F2] Partida PvP do Ultimate resolvida NO SERVIDOR (decisões simultâneas por
// beat, polling). O motor é puro e compartilhado (src/engine/ultimate/pvpMatch);
// aqui ficam a linha persistida (`ult_match`), prazo, escolha automática, W.O.,
// concorrência otimista e o fechamento ranqueado (MMR + prêmio uma vez só).
//
// Concorrência: toda escrita é UPDATE ... WHERE version = $v (CAS). Duas
// requisições que tentam resolver o mesmo beat leem a mesma versão; só uma
// grava, a outra relê e já encontra o beat resolvido. Por isso nenhum beat é
// resolvido duas vezes.
//
// Fechamento ranqueado: só quem vira `settled_at` de NULL para now() aplica o
// MMR (claim atômico); o prêmio usa o op_id `pvp-ranked:<code>` da Fase 1 no
// ledger (idempotente). O report pareado legado (api/ranking.ts) vê a linha em
// ult_match e não aplica nada por cima.
import {
  createPvpMatch, defaultStyle, forfeitPvp, isPvpStyle, normalizePvpMatch, pvpBeatView, resolvePvpBeat,
  type MatchStatus, type MatchView, type PvpMatchState, type PvpSide, type PvpSquadIn, type PvpStyle,
} from '../src/engine/ultimate/pvpMatch.js';
import { creditRankedPvpReward } from './ultimate-pvp-reward.js';
import { recordCardStats } from './ultimate-card-stats.js';
import { rankedDelta } from '../api/_reportPairing.js';
import { RANKED_K, rankedSeasonNo } from './rankedSeason.js';
import type { SqlQuery, SqlTag } from './ultimate-economy.js';

export const BEAT_DEADLINE_MS = 20_000;   // prazo comum por beat
export const WO_MISSED_BEATS = 3;         // beats seguidos sem decidir = W.O.
export const WO_SILENCE_MS = 60_000;      // sem poll por isso = W.O.
const SEEN_WRITE_MS = 5_000;              // poll só grava presença a cada 5s

export type { MatchStatus, MatchView };

export interface UltMatchRow {
  code: string;
  seed: number;
  ranked: boolean;
  emails: [string | null, string | null];
  nicks: [string, string];
  state: PvpMatchState;
  pending: [PvpStyle | null, PvpStyle | null];
  deadline: number;
  seen: [number, number];
  missed: [number, number];
  version: number;
  status: MatchStatus;
  winner: PvpSide | null;
  reason: 'played' | 'wo' | null;
  settled: boolean;
  // [CSM-3] cópias autoritativas de cada lado (squad montado no servidor); []
  // quando o squad não veio do servidor (amistoso legado) — aí não há história.
  cardIds?: [string[], string[]];
}

export interface UltMatchStore {
  get(code: string): Promise<UltMatchRow | null>;
  insert(row: UltMatchRow): Promise<boolean>;                 // false = já existia
  update(row: UltMatchRow, expectedVersion: number): Promise<boolean>; // CAS
  claimSettle(code: string): Promise<boolean>;                // true só para quem marcou
}

export interface RankedSettler {
  applyMmr(email: string, won: boolean): Promise<void>;
  credit(email: string, code: string, won: boolean): Promise<void>;
  legacyApplied(code: string): Promise<boolean>;              // report pareado já aplicou?
  recordCardStats?(email: string, code: string, cardIds: string[], delta: CardStatsDelta): Promise<void>; // [CSM-3]
}

// [CSM-3] O que o motor do duelo PRODUZ de fato, por lado. O PvP por beats não
// tem kill feed nem MVP por jogador: tudo aqui é do TIME e vale para as 5
// cartas escaladas. Clutch = o beat 'clutch' do roteiro (último vivo), jogado
// e vencido. W.O. conta jogo e resultado, mas não rounds nem clutch.
export interface CardStatsDelta {
  games: number; wins: number; losses: number;
  roundsWon: number; roundsLost: number;
  clutchesWon: number; clutchesPlayed: number;
}

export function cardStatsDelta(row: UltMatchRow, side: PvpSide): CardStatsDelta | null {
  if (row.status !== 'done' || row.winner == null) return null;
  const won = row.winner === side;
  const played = row.reason === 'played';
  const fs = row.state.finalScore;
  const clutch = played ? row.state.history.filter((b) => b.kind === 'clutch') : [];
  return {
    games: 1, wins: won ? 1 : 0, losses: won ? 0 : 1,
    roundsWon: played && fs ? fs[side] : 0, roundsLost: played && fs ? fs[1 - side] : 0,
    clutchesWon: clutch.filter((b) => b.winner === side).length, clutchesPlayed: clutch.length,
  };
}

// ───────────────────────────────────────────────────────────── lógica pura

/** Avança a linha até onde o relógio permite: resolve beats com as duas
 *  decisões, aplica a escolha automática no prazo vencido e detecta W.O. */
export function stepRow(row: UltMatchRow, now: number): UltMatchRow {
  let r = row;
  // silêncio primeiro: quem sumiu não "joga" beats automáticos até o fim.
  if (r.status === 'live') {
    const silent0 = now - r.seen[0] > WO_SILENCE_MS, silent1 = now - r.seen[1] > WO_SILENCE_MS;
    if (silent0 || silent1) return woRow(r, silent0, silent1);
  }
  for (let guard = 0; guard < 20 && r.status === 'live'; guard++) {
    const both = r.pending[0] != null && r.pending[1] != null;
    const expired = now >= r.deadline;
    if (!both && !expired) break;
    const auto: [boolean, boolean] = [r.pending[0] == null, r.pending[1] == null];
    const a = r.pending[0] ?? defaultStyle(r.state, 0);
    const b = r.pending[1] ?? defaultStyle(r.state, 1);
    const { state } = resolvePvpBeat(r.state, a, b, undefined, auto);
    const missed: [number, number] = [auto[0] ? r.missed[0] + 1 : 0, auto[1] ? r.missed[1] + 1 : 0];
    // prazo encadeado: ausência longa resolve vários beats num poll só.
    const deadline = both ? now + BEAT_DEADLINE_MS : r.deadline + BEAT_DEADLINE_MS;
    r = { ...r, state, pending: [null, null], missed, deadline };
    if (state.status === 'done') { r = { ...r, status: 'done', winner: state.winner, reason: 'played' }; break; }
    const gone0 = missed[0] >= WO_MISSED_BEATS, gone1 = missed[1] >= WO_MISSED_BEATS;
    if (gone0 || gone1) { r = woRow(r, gone0, gone1); break; }
  }
  return r;
}

function woRow(r: UltMatchRow, gone0: boolean, gone1: boolean): UltMatchRow {
  if (gone0 && gone1) return { ...r, status: 'abandoned', winner: null, reason: 'wo' };
  const winner: PvpSide = gone0 ? 1 : 0;
  return { ...r, state: forfeitPvp(r.state, winner), status: 'done', winner, reason: 'wo' };
}

export interface MatchPlayerIn { nick: string; email: string | null; squad: PvpSquadIn; cardIds?: string[] }

export function newMatchRow(input: { code: string; seed: number; ranked: boolean; players: [MatchPlayerIn, MatchPlayerIn] }, now: number): UltMatchRow {
  const [p0, p1] = input.players;
  return {
    code: input.code, seed: input.seed >>> 0, ranked: input.ranked,
    emails: [p0.email, p1.email], nicks: [p0.nick, p1.nick],
    state: createPvpMatch({ seed: input.seed, squads: [p0.squad, p1.squad] }),
    pending: [null, null], deadline: now + BEAT_DEADLINE_MS, seen: [now, now], missed: [0, 0],
    version: 1, status: 'live', winner: null, reason: null, settled: false,
    cardIds: [p0.cardIds ?? [], p1.cardIds ?? []],
  };
}

/** Lado de quem chama: ranqueada pela conta (e-mail), amistoso pelo nick. */
export function sideOf(row: UltMatchRow, who: { email: string | null; nick: string }): PvpSide | null {
  if (row.ranked) {
    if (!who.email) return null;
    const i = row.emails.findIndex((e) => e != null && e === who.email);
    return i === 0 || i === 1 ? i : null;
  }
  const n = who.nick.toLowerCase();
  const i = row.nicks.findIndex((x) => x.toLowerCase() === n);
  return i === 0 || i === 1 ? i : null;
}

export function matchView(row: UltMatchRow, side: PvpSide, now: number): MatchView {
  const o = (1 - side) as PvpSide;
  const flip = <T,>(p: [T, T]): [T, T] => (side === 0 ? p : [p[1], p[0]]);
  const h = row.state.history;
  const lastRec = h[h.length - 1];
  return {
    code: row.code, side, status: row.status, ranked: row.ranked, version: row.version,
    names: flip(row.state.names), score: flip(row.state.score), finalScore: row.state.finalScore ? flip(row.state.finalScore) : null,
    map: row.state.map,
    beat: row.status === 'live' ? pvpBeatView(row.state, side) : null,
    myDecision: row.pending[side], oppDecided: row.pending[o] != null,
    deadlineIn: row.status === 'live' ? Math.max(0, row.deadline - now) : 0,
    last: lastRec ? {
      idx: lastRec.idx, kind: lastRec.kind, roll: lastRec.roll,
      mine: lastRec.styles[side], theirs: lastRec.styles[o], myAuto: lastRec.auto[side], theirAuto: lastRec.auto[o],
      won: lastRec.winner === side, pWin: side === 0 ? lastRec.pA : Math.round((1 - lastRec.pA) * 1000) / 1000,
      scoreAfter: flip(lastRec.scoreAfter),
    } : null,
    history: h.map((x) => ({ won: x.winner === side, mine: x.styles[side], theirs: x.styles[o] })),
    won: row.winner == null ? null : row.winner === side,
    reason: row.reason,
    serverNow: now,
  };
}

// ───────────────────────────────────────────────────────────── ações

export type ActionResult = { ok: true; view: MatchView } | { ok: false; status: number; error: string };

const RETRIES = 5;

/** Cria a partida (idempotente: a mesma sala devolve a mesma partida). */
export async function startMatch(
  store: UltMatchStore, input: { code: string; seed: number; ranked: boolean; players: [MatchPlayerIn, MatchPlayerIn] },
  who: { email: string | null; nick: string }, now: number,
): Promise<ActionResult> {
  let row = await store.get(input.code);
  if (row && row.seed !== (input.seed >>> 0) && !row.ranked && row.status !== 'live') {
    // revanche do amistoso (nextSeason trocou o run_seed): partida nova no mesmo código.
    const fresh = { ...newMatchRow(input, now), version: row.version + 1 };
    if (await store.update(fresh, row.version)) row = fresh; else row = await store.get(input.code);
  }
  if (!row) {
    const fresh = newMatchRow(input, now);
    row = (await store.insert(fresh)) ? fresh : await store.get(input.code);
  }
  if (!row) return { ok: false, status: 500, error: 'partida indisponível' };
  const side = sideOf(row, who);
  if (side == null) return { ok: false, status: 403, error: 'Você não joga esta partida.' };
  return pollMatch(store, input.code, who, now);
}

/** Poll: marca presença, resolve preguiçosamente (prazo/W.O.) e devolve a visão. */
export async function pollMatch(store: UltMatchStore, code: string, who: { email: string | null; nick: string }, now: number, settler?: RankedSettler): Promise<ActionResult> {
  return mutate(store, code, who, now, settler, (row) => row);
}

/** Decisão do lado de quem chama para o beat `beatIdx` (trava; não troca depois). */
export async function decideMatch(
  store: UltMatchStore, code: string, who: { email: string | null; nick: string }, style: unknown, beatIdx: number, now: number, settler?: RankedSettler,
): Promise<ActionResult> {
  if (!isPvpStyle(style)) return { ok: false, status: 400, error: 'decisão inválida' };
  return mutate(store, code, who, now, settler, (row, side) => {
    if (row.status !== 'live' || row.state.idx !== beatIdx || row.pending[side] != null) return row; // beat já passou ou já decidiu
    const pending: [PvpStyle | null, PvpStyle | null] = [...row.pending];
    pending[side] = style;
    return { ...row, pending };
  });
}

async function mutate(
  store: UltMatchStore, code: string, who: { email: string | null; nick: string }, now: number, settler: RankedSettler | undefined,
  apply: (row: UltMatchRow, side: PvpSide) => UltMatchRow,
): Promise<ActionResult> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const row = await store.get(code);
    if (!row) return { ok: false, status: 404, error: 'partida não encontrada' };
    const side = sideOf(row, who);
    if (side == null) return { ok: false, status: 403, error: 'Você não joga esta partida.' };
    if (row.status !== 'live') {
      await settleIfNeeded(store, row, settler);
      return { ok: true, view: matchView(row, side, now) };
    }
    const touched = apply(row, side);
    const seen: [number, number] = [...touched.seen];
    seen[side] = now;
    const withSeen = { ...touched, seen };
    const next = stepRow(withSeen, now);
    const progressed = next.state !== withSeen.state || next.status !== withSeen.status;
    const changed = touched !== row || progressed || now - row.seen[side] >= SEEN_WRITE_MS;
    if (!changed) return { ok: true, view: matchView(row, side, now) };
    const written = { ...next, version: row.version + 1 };
    if (await store.update(written, row.version)) {
      await settleIfNeeded(store, written, settler);
      return { ok: true, view: matchView(written, side, now) };
    }
    // outra requisição gravou antes: relê e tenta de novo (nada resolvido em dobro).
  }
  return { ok: false, status: 409, error: 'partida ocupada, tente de novo' };
}

/** Fechamento ranqueado: MMR + prêmio pelo resultado DO SERVIDOR, uma vez só. */
export async function settleIfNeeded(store: UltMatchStore, row: UltMatchRow, settler?: RankedSettler): Promise<boolean> {
  if (!settler || !row.ranked || row.settled || row.status !== 'done' || row.winner == null) return false;
  if (!(await store.claimSettle(row.code))) return false;
  // cliente antigo já fechou pelo report pareado: não aplica de novo.
  if (await settler.legacyApplied(row.code)) return false;
  for (const side of [0, 1] as const) {
    const email = row.emails[side];
    if (!email) continue;
    const won = row.winner === side;
    try { await settler.applyMmr(email, won); } catch (e) { console.error('[ult-match] mmr', row.code, e); }
    try { await settler.credit(email, row.code, won); } catch (e) { console.error('[ult-match] prêmio', row.code, e); }
    const ids = row.cardIds?.[side] ?? [];
    const delta = cardStatsDelta(row, side);
    if (settler.recordCardStats && ids.length && delta) {
      try { await settler.recordCardStats(email, row.code, ids, delta); } catch (e) { console.error('[ult-match] história da carta', row.code, e); }
    }
  }
  return true;
}

// ───────────────────────────────────────────────────────────── SQL (Neon)

export function ultMatchSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS ult_match (
      code TEXT PRIMARY KEY, seed BIGINT NOT NULL, ranked BOOLEAN NOT NULL DEFAULT false,
      email_a TEXT, email_b TEXT, nick_a TEXT NOT NULL, nick_b TEXT NOT NULL,
      state JSONB NOT NULL, beat INT NOT NULL DEFAULT 0, pend_a TEXT, pend_b TEXT,
      deadline_ms BIGINT NOT NULL, seen_a BIGINT NOT NULL, seen_b BIGINT NOT NULL,
      miss_a INT NOT NULL DEFAULT 0, miss_b INT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'live', winner INT, reason TEXT, settled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE INDEX IF NOT EXISTS ult_match_status_idx ON ult_match (status, updated_at)`,
    sql`ALTER TABLE ult_match ADD COLUMN IF NOT EXISTS card_ids JSONB`, // [CSM-3]
  ];
}

const pend = (v: unknown): PvpStyle | null => (isPvpStyle(v) ? v : null);

function cardIdsFromDb(v: unknown): [string[], string[]] {
  const o = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  const side = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string').slice(0, 5) : []);
  return Array.isArray(o) ? [side(o[0]), side(o[1])] : [[], []];
}

export function rowFromDb(r: Record<string, unknown>): UltMatchRow | null {
  const state = normalizePvpMatch(typeof r.state === 'string' ? JSON.parse(r.state) : r.state);
  if (!state) return null;
  const st = String(r.status);
  return {
    code: String(r.code), seed: Number(r.seed), ranked: r.ranked === true,
    emails: [r.email_a == null ? null : String(r.email_a), r.email_b == null ? null : String(r.email_b)],
    nicks: [String(r.nick_a), String(r.nick_b)],
    state, pending: [pend(r.pend_a), pend(r.pend_b)],
    deadline: Number(r.deadline_ms), seen: [Number(r.seen_a), Number(r.seen_b)], missed: [Number(r.miss_a), Number(r.miss_b)],
    version: Number(r.version), status: st === 'done' || st === 'abandoned' ? st : 'live',
    winner: r.winner === 0 || r.winner === 1 ? r.winner : null,
    reason: r.reason === 'played' || r.reason === 'wo' ? r.reason : null,
    settled: r.settled_at != null,
    cardIds: cardIdsFromDb(r.card_ids),
  };
}

export function sqlMatchStore(sql: SqlTag): UltMatchStore {
  return {
    async get(code) {
      const rows = await sql`SELECT * FROM ult_match WHERE code = ${code}`;
      return rows.length ? rowFromDb(rows[0]) : null;
    },
    async insert(m) {
      const ins = await sql`INSERT INTO ult_match (code, seed, ranked, email_a, email_b, nick_a, nick_b, state, beat, pend_a, pend_b, deadline_ms, seen_a, seen_b, miss_a, miss_b, version, status, winner, reason, card_ids)
        VALUES (${m.code}, ${m.seed}, ${m.ranked}, ${m.emails[0]}, ${m.emails[1]}, ${m.nicks[0]}, ${m.nicks[1]}, ${JSON.stringify(m.state)}::jsonb, ${m.state.idx}, ${m.pending[0]}, ${m.pending[1]},
          ${m.deadline}, ${m.seen[0]}, ${m.seen[1]}, ${m.missed[0]}, ${m.missed[1]}, ${m.version}, ${m.status}, ${m.winner}, ${m.reason}, ${JSON.stringify(m.cardIds ?? [[], []])}::jsonb)
        ON CONFLICT (code) DO NOTHING RETURNING code`;
      return ins.length > 0;
    },
    async update(m, expected) {
      const up = await sql`UPDATE ult_match SET seed = ${m.seed}, ranked = ${m.ranked}, email_a = ${m.emails[0]}, email_b = ${m.emails[1]}, nick_a = ${m.nicks[0]}, nick_b = ${m.nicks[1]},
          state = ${JSON.stringify(m.state)}::jsonb, beat = ${m.state.idx}, pend_a = ${m.pending[0]}, pend_b = ${m.pending[1]}, deadline_ms = ${m.deadline},
          seen_a = ${m.seen[0]}, seen_b = ${m.seen[1]}, miss_a = ${m.missed[0]}, miss_b = ${m.missed[1]}, version = ${m.version},
          status = ${m.status}, winner = ${m.winner}, reason = ${m.reason}, card_ids = ${JSON.stringify(m.cardIds ?? [[], []])}::jsonb, updated_at = now()
        WHERE code = ${m.code} AND version = ${expected} RETURNING code`;
      return up.length > 0;
    },
    async claimSettle(code) {
      const c = await sql`UPDATE ult_match SET settled_at = now() WHERE code = ${code} AND settled_at IS NULL AND status = 'done' RETURNING code`;
      return c.length > 0;
    },
  };
}

/** MMR (mesma fórmula do report: rankedDelta) + prêmio do ledger (op_id da F1). */
export function sqlRankedSettler(sql: SqlTag, now = new Date()): RankedSettler {
  const season = rankedSeasonNo(now);
  return {
    async applyMmr(email, won) {
      const cur = await sql`SELECT mmr, season_games, season FROM rtm_ranking WHERE email = ${email}`;
      if (!cur.length) {
        await sql`INSERT INTO rtm_ranking (email, nick, season, season_games) VALUES (${email}, ${email.split('@')[0]}, ${season}, 0) ON CONFLICT (email) DO NOTHING`;
      } else if (cur[0].season != null && Number(cur[0].season) !== season) {
        // linha de temporada velha: o reset lazy (archive) é do api/ranking 'me'. Não pontua aqui.
        console.warn('[ult-match] temporada antiga, MMR não aplicado', email);
        return;
      }
      const row = cur.length ? cur[0] : { mmr: 1000, season_games: 0 };
      const before = Number(row.mmr ?? 1000);
      const games = Number(row.season_games ?? 0);
      const delta = rankedDelta(won, before, games, RANKED_K);
      const after = Math.max(0, before + delta);
      await sql`UPDATE rtm_ranking SET mmr = ${after}, wins = wins + ${won ? 1 : 0}, losses = losses + ${won ? 0 : 1}, season = ${season}, season_games = ${games + 1}, peak = GREATEST(peak, ${after}), updated_at = now() WHERE email = ${email}`;
    },
    async credit(email, code, won) {
      await creditRankedPvpReward(sql, email, code, won);
    },
    async recordCardStats(email, code, cardIds, d) {
      await recordCardStats(sql, email, code, cardIds, d);
    },
    async legacyApplied(code) {
      try {
        const r = await sql`SELECT 1 FROM rtm_match_reports WHERE code = ${code} AND status IN ('applied', 'applied-solo') LIMIT 1`;
        return r.length > 0;
      } catch { return false; }
    },
  };
}
