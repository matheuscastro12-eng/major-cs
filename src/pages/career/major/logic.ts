// [super atualização 2 · Major como espetáculo] Lógica PURA da apresentação do
// Major: pick'em, momentos (eliminação / decider / final), quadro suíço por
// recorde, segmentação dos stages, números do torneio e a chance de título.
// Nada aqui decide resultado: só lê o Tournament que o motor já resolveu.

import { computeDisplay, mergeLines } from '../../../engine/match';
import { pSeriesWin, seedRng } from '../../../engine/mundo/mundoSim';
import type { Pairing, PlayerLine, Tournament, TTeam } from '../../../types';

export type HistoryItem = Tournament['history'][number];

// ─── Pick'em ────────────────────────────────────────────────────────────────
// Um palpite aponta um confronto PENDENTE. `n` = quantas vezes o mesmo confronto
// (a|b|rótulo) já apareceu resolvido no histórico combinado na hora do palpite;
// o resultado do palpite é a ocorrência de índice n (o histórico só cresce).
export interface MajorPick { a: string; b: string; label: string; pick: string; n: number; stage: number }
export interface PickemBook { picks: Record<string, MajorPick> }
export interface PickemGrade { score: number; total: number; pending: number; streak: number; rows: { key: string; pick: MajorPick; hit: boolean | null; winner?: string }[] }

export const emptyBook = (): PickemBook => ({ picks: {} });
export const pickKey = (stage: number, p: Pick<Pairing, 'a' | 'b' | 'label'>): string => `${stage}:${p.a}|${p.b}|${p.label}`;
const sameMatch = (h: Pairing, m: Pick<Pairing, 'a' | 'b' | 'label'>) => h.a === m.a && h.b === m.b && h.label === m.label;

/** confronto que aceita palpite: sem resultado e sem o usuário */
export const pickable = (p: Pairing, userId = 'user'): boolean => !p.result && p.a !== userId && p.b !== userId;

export function addPick(book: PickemBook, stage: number, p: Pairing, teamId: string, history: HistoryItem[], userId = 'user'): PickemBook {
  if (!pickable(p, userId) || (teamId !== p.a && teamId !== p.b)) return book;
  const n = history.filter((h) => !!h.pairing.result && sameMatch(h.pairing, p)).length;
  const key = pickKey(stage, p);
  return { picks: { ...book.picks, [key]: { a: p.a, b: p.b, label: p.label, pick: teamId, n, stage } } };
}

export function gradePicks(book: PickemBook, history: HistoryItem[]): PickemGrade {
  const rows: PickemGrade['rows'] = [];
  let score = 0; let total = 0; let pending = 0;
  for (const [key, pick] of Object.entries(book.picks)) {
    const occ = history.filter((h) => !!h.pairing.result && sameMatch(h.pairing, pick));
    const h = occ[pick.n];
    if (!h?.pairing.result) { pending++; rows.push({ key, pick, hit: null }); continue; }
    const winner = h.pairing.result.winner === 0 ? h.pairing.a : h.pairing.b;
    const hit = winner === pick.pick;
    total++; if (hit) score++;
    rows.push({ key, pick, hit, winner });
  }
  // sequência atual de acertos na ordem em que os confrontos foram resolvidos
  const order = (r: PickemGrade['rows'][number]) => history.findIndex((h, i) => sameMatch(h.pairing, r.pick) && history.slice(0, i + 1).filter((x) => sameMatch(x.pairing, r.pick)).length === r.pick.n + 1);
  const resolved = rows.filter((r) => r.hit !== null).sort((x, y) => order(x) - order(y));
  let streak = 0;
  for (let i = resolved.length - 1; i >= 0 && resolved[i].hit; i--) streak++;
  return { score, total, pending, streak, rows };
}

/** os palpites do stage atual no formato que o Hub lê (chave `a|b`) */
export function hubPicks(book: PickemBook, stage: number, pairings: Pairing[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairings) { const k = book.picks[pickKey(stage, p)]; if (k) out[`${p.a}|${p.b}`] = k.pick; }
  return out;
}

// ─── Momentos ───────────────────────────────────────────────────────────────
export type Moment = 'opener' | 'elimination' | 'decider' | 'advancement' | 'quarters' | 'semis' | 'final';

export function momentOf(t: Pick<Tournament, 'phase'>, p: Pick<Pairing, 'label'>): Moment {
  if (t.phase === 'final' || p.label === 'FINAL') return 'final';
  if (t.phase === 'semis') return 'semis';
  if (t.phase === 'quarters') return 'quarters';
  const m = /^(\d)-(\d)$/.exec(p.label);
  if (!m) return 'opener';
  const w = Number(m[1]); const l = Number(m[2]);
  if (w === 2 && l === 2) return 'decider';
  if (l === 2) return 'elimination';
  if (w === 2) return 'advancement';
  return 'opener';
}

// ─── Quadro suíço por recorde ───────────────────────────────────────────────
export interface SwissCell { label: string; matches: { a: string; b: string; winner?: string; score?: [number, number]; pending: boolean; pairing: Pairing }[] }
export interface SwissColumn { round: number; cells: SwissCell[] }
export interface SwissBoard { columns: SwissColumn[]; qualified: { id: string; rec: string }[]; eliminated: { id: string; rec: string }[] }

const roundOf = (phase: string): number => { const m = /(\d+)\s*$/.exec(phase); return m ? Number(m[1]) : 0; };

/** monta as colunas (rodadas 1–5) agrupadas por recorde, a partir do histórico do stage + rodada pendente */
export function swissBoard(stageHistory: HistoryItem[], live?: { round: number; pairings: Pairing[] }): SwissBoard {
  const byRound = new Map<number, Pairing[]>();
  for (const h of stageHistory) {
    if (!/Su[ií]/.test(h.phase) && !/Rodada|Round/.test(h.phase)) continue;
    const r = roundOf(h.phase);
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(h.pairing);
  }
  if (live && live.pairings.length) {
    const cur = byRound.get(live.round) ?? [];
    const seen = new Set(cur.map((p) => `${p.a}|${p.b}`));
    byRound.set(live.round, [...cur, ...live.pairings.filter((p) => !seen.has(`${p.a}|${p.b}`))]);
  }
  const rec: Record<string, [number, number]> = {};
  const columns: SwissColumn[] = [];
  for (const r of [...byRound.keys()].sort((x, y) => x - y)) {
    const groups = new Map<string, SwissCell>();
    for (const p of byRound.get(r)!) {
      const label = /^\d-\d$/.test(p.label) ? p.label : `${(rec[p.a] ?? [0, 0])[0]}-${(rec[p.a] ?? [0, 0])[1]}`;
      if (!groups.has(label)) groups.set(label, { label, matches: [] });
      const res = p.result;
      const winner = res ? (res.winner === 0 ? p.a : p.b) : undefined;
      groups.get(label)!.matches.push({ a: p.a, b: p.b, winner, score: res?.mapScore, pending: !res, pairing: p });
    }
    for (const p of byRound.get(r)!) {
      if (!p.result) continue;
      const w = p.result.winner === 0 ? p.a : p.b; const l = w === p.a ? p.b : p.a;
      rec[w] = [(rec[w]?.[0] ?? 0) + 1, rec[w]?.[1] ?? 0];
      rec[l] = [rec[l]?.[0] ?? 0, (rec[l]?.[1] ?? 0) + 1];
    }
    const cells = [...groups.values()].sort((x, y) => {
      const [xw, xl] = x.label.split('-').map(Number); const [yw, yl] = y.label.split('-').map(Number);
      return (yw - yl) - (xw - xl) || yw - xw;
    });
    columns.push({ round: r, cells });
  }
  const qualified = Object.entries(rec).filter(([, v]) => v[0] >= 3).map(([id, v]) => ({ id, rec: `${v[0]}-${v[1]}` })).sort((x, y) => x.rec.localeCompare(y.rec));
  const eliminated = Object.entries(rec).filter(([, v]) => v[1] >= 3).map(([id, v]) => ({ id, rec: `${v[0]}-${v[1]}` })).sort((x, y) => y.rec.localeCompare(x.rec));
  return { columns, qualified, eliminated };
}

/** separa o histórico combinado do Major em stages (cada suíço recomeça na rodada 1; o mata-mata é o último) */
export function segmentStages(history: HistoryItem[]): HistoryItem[][] {
  const segs: HistoryItem[][] = [];
  let lastRound = Infinity; let inPlayoffs = false;
  for (const h of history) {
    const swiss = /Su[ií]/.test(h.phase);
    const r = swiss ? roundOf(h.phase) : 99;
    if (!segs.length || (swiss && r < lastRound) || (!swiss && !inPlayoffs)) { segs.push([]); inPlayoffs = !swiss; }
    if (swiss) inPlayoffs = false;
    segs[segs.length - 1].push(h);
    lastRound = r;
  }
  return segs;
}

// ─── Números do torneio ─────────────────────────────────────────────────────
export interface PlayerStar { id: string; nick: string; country: string; teamId: string; rating: number; kills: number; maps: number; adr: number }
export interface MajorNumbers {
  series: number; maps: number; rounds: number; overtimes: number; kills: number; headshots: number;
  closest?: { a: string; b: string; score: [number, number]; map: string };
  blowout?: { a: string; b: string; score: [number, number]; map: string };
  mvp?: PlayerStar; topFrag?: PlayerStar;
  userMaps: { w: number; l: number }; userSeries: { w: number; l: number };
}

export function majorNumbers(history: HistoryItem[], teams: TTeam[], userId = 'user', minMaps = 4): MajorNumbers {
  const out: MajorNumbers = { series: 0, maps: 0, rounds: 0, overtimes: 0, kills: 0, headshots: 0, userMaps: { w: 0, l: 0 }, userSeries: { w: 0, l: 0 } };
  const lines = new Map<string, PlayerLine[]>();
  let closeDiff = 99; let blowDiff = -1;
  for (const h of history) {
    const p = h.pairing; const r = p.result; if (!r) continue;
    out.series++;
    const ui = p.a === userId ? 0 : p.b === userId ? 1 : -1;
    if (ui >= 0) { if (r.winner === ui) out.userSeries.w++; else out.userSeries.l++; }
    for (const m of r.maps) {
      out.maps++;
      out.rounds += m.score[0] + m.score[1];
      if (m.ot) out.overtimes++;
      if (ui >= 0) { if (m.winner === ui) out.userMaps.w++; else out.userMaps.l++; }
      const d = Math.abs(m.score[0] - m.score[1]);
      if (d < closeDiff || (d === closeDiff && m.ot)) { closeDiff = d; out.closest = { a: p.a, b: p.b, score: m.score, map: m.map }; }
      if (d > blowDiff) { blowDiff = d; out.blowout = { a: p.a, b: p.b, score: m.score, map: m.map }; }
      for (const [pid, st] of Object.entries(m.stats ?? {})) {
        out.kills += st.both.kills; out.headshots += st.both.hsKills;
        if (!lines.has(pid)) lines.set(pid, []);
        lines.get(pid)!.push(st.both);
      }
    }
  }
  const owner = new Map<string, { t: TTeam; nick: string; country: string }>();
  for (const t of teams) for (const pl of [...t.players, ...(t.bench ?? [])]) owner.set(pl.id, { t, nick: pl.nick, country: pl.country });
  const stars: PlayerStar[] = [];
  for (const [id, ls] of lines) {
    const o = owner.get(id); if (!o) continue;
    const merged = mergeLines(ls);
    const d = computeDisplay(merged);
    stars.push({ id, nick: o.nick, country: o.country, teamId: o.t.id, rating: d.rating, kills: merged.kills, maps: ls.length, adr: merged.rounds ? merged.dmg / merged.rounds : 0 });
  }
  const eligible = stars.filter((s) => s.maps >= minMaps);
  const pool = eligible.length ? eligible : stars;
  out.mvp = [...pool].sort((x, y) => y.rating - x.rating || y.kills - x.kills)[0];
  out.topFrag = [...stars].sort((x, y) => y.kills - x.kills)[0];
  return out;
}

// ─── Chance de título (pelo VRS/força) ──────────────────────────────────────
// Monte Carlo do que FALTA do Major com o modelo de força do mundo
// (logística 0,15/ponto por mapa — o mesmo de engine/mundo/mundoSim).
export interface OddsInput {
  teams: { id: string; s: number; w: number; l: number; status: 'alive' | 'advanced' | 'eliminated' }[];
  phase: Tournament['phase'];
  stageOnly: boolean;
  /** seeds que entram nos próximos stages (Stage 2, Stage 3), em ordem */
  laterSeeds: { id: string; s: number }[][];
  /** playoffs em andamento: times vivos no mata-mata, na ordem da chave */
  bracketAlive?: string[];
}
export interface Odds { title: number; playoffs: number; favorites: { id: string; p: number }[] }

type Rng = () => number;
const series = (rng: Rng, a: { id: string; s: number }, b: { id: string; s: number }, bo: 1 | 3 | 5) => (rng() < pSeriesWin(a.s - b.s, bo) ? a : b);

function swissFrom(rng: Rng, field: { id: string; s: number; w: number; l: number }[]): { id: string; s: number; l: number }[] {
  const rec = field.map((t) => ({ ...t }));
  for (let guard = 0; guard < 8; guard++) {
    const alive = rec.filter((t) => t.w < 3 && t.l < 3);
    if (!alive.length) break;
    const groups = new Map<string, typeof alive>();
    for (const t of alive) { const k = `${t.w}-${t.l}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t); }
    const leftovers: typeof alive = [];
    for (const g of groups.values()) {
      const arr = [...g].sort(() => rng() - 0.5);
      if (arr.length % 2) leftovers.push(arr.pop()!);
      for (let i = 0; i < arr.length; i += 2) {
        const bo = arr[i].w === 2 || arr[i].l === 2 ? 3 : 1;
        const w = series(rng, arr[i], arr[i + 1], bo); const l = w === arr[i] ? arr[i + 1] : arr[i];
        w.w++; l.l++;
      }
    }
    for (let i = 0; i + 1 < leftovers.length; i += 2) { const w = series(rng, leftovers[i], leftovers[i + 1], 1); const l = w === leftovers[i] ? leftovers[i + 1] : leftovers[i]; w.w++; l.l++; }
    if (leftovers.length % 2) { const t = leftovers[leftovers.length - 1]; if (rng() < 0.5) t.w++; else t.l++; }
  }
  return rec.filter((t) => t.w >= 3).sort((x, y) => x.l - y.l || y.s - x.s).slice(0, 8);
}

function knockout(rng: Rng, seeds: { id: string; s: number }[]): string {
  let round = seeds;
  if (round.length === 8) round = [round[0], round[7], round[3], round[4], round[1], round[6], round[2], round[5]];
  while (round.length > 1) {
    const next: typeof round = [];
    for (let i = 0; i + 1 < round.length; i += 2) next.push(series(rng, round[i], round[i + 1], round.length === 2 ? 5 : 3));
    if (round.length % 2) next.push(round[round.length - 1]);
    round = next;
  }
  return round[0]?.id ?? '';
}

export function titleOdds(inp: OddsInput, userId = 'user', iters = 1200, seedKey = 'odds'): Odds {
  const rng = seedRng(seedKey);
  const wins = new Map<string, number>(); let po = 0;
  const sOf = new Map(inp.teams.map((t) => [t.id, t.s] as const));
  for (const g of inp.laterSeeds) for (const t of g) sOf.set(t.id, t.s);
  for (let it = 0; it < iters; it++) {
    let champ: string;
    if (!inp.stageOnly) {
      const alive = inp.bracketAlive ?? inp.teams.filter((t) => t.status !== 'eliminated').map((t) => t.id);
      champ = knockout(rng, alive.map((id) => ({ id, s: sOf.get(id) ?? 70 })));
      if (alive.includes(userId)) po++;
    } else {
      let adv = inp.phase === 'done'
        ? inp.teams.filter((t) => t.status === 'advanced').map((t) => ({ id: t.id, s: t.s, l: t.l }))
        : swissFrom(rng, inp.teams.map((t) => ({ id: t.id, s: t.s, w: t.w, l: t.l })));
      for (const seeds of inp.laterSeeds) adv = swissFrom(rng, [...adv, ...seeds].map((t) => ({ id: t.id, s: t.s, w: 0, l: 0 })));
      if (adv.some((t) => t.id === userId)) po++;
      champ = knockout(rng, adv);
    }
    wins.set(champ, (wins.get(champ) ?? 0) + 1);
  }
  const favorites = [...wins.entries()].map(([id, n]) => ({ id, p: n / iters })).sort((a, b) => b.p - a.p).slice(0, 4);
  return { title: (wins.get(userId) ?? 0) / iters, playoffs: po / iters, favorites };
}

/** "Dia N" da LAN: cada rodada suíça é um dia; o mata-mata segue a contagem */
export function eventDay(stage: number, t: Pick<Tournament, 'phase' | 'swissRound'>): number {
  const base = Math.max(0, stage - 1) * 5;
  if (t.phase === 'swiss') return base + t.swissRound;
  const po = { quarters: 1, semis: 2, final: 3, done: 3, swiss: 0 }[t.phase];
  return 15 + po;
}
