// MODO MAJOR — o PGL Major Singapore 2026 (formato real dos Majors de CS2 desde
// Austin 2025): 32 times em 3 stages suíços de 16 (o stage para quando 8
// fecham 3 vitórias) + playoffs de 8 em mata-mata MD3 com final MD5.
//
//   Stage 1: seeds 17–32 (16)              → 8 classificados
//   Stage 2: 8 do Stage 1 + seeds 9–16     → 8 classificados
//   Stage 3: 8 do Stage 2 + seeds 1–8      → 8 classificados
//   Playoffs: QF 1×8, 4×5, 2×7, 3×6 → SF → final
//
// TS PURO: sem React, sem window. A lista de times vem de um JSON
// (src/data/major-singapore-2026.json) pra ser trocada sem mexer em código
// quando a lista oficial sair. Determinístico pelo seed (engine/rng).
// Testado em scripts/test-major-singapore.mts.

import { makeRng, type Rng } from './rng.js'; // .js: a função de preview (api/og-pickem*) carrega este arquivo em Node ESM puro

export interface MajorTeam {
  id: string;
  name: string;
  tag: string;
  /** país/região ISO-2 minúsculo (ou 'eu', 'world') — só para bandeira */
  country: string;
  /** seed 1..32 (1 = melhor). Define o stage de entrada. */
  seed: number;
  /** força relativa estilo Elo (~1500 médio). Só a simulação usa. */
  rating: number;
  /** cores do card [fundo, destaque] */
  colors?: [string, string];
  /** true = vaga confirmada oficialmente; false = projeção (ranking VRS) */
  confirmed?: boolean;
}

export interface MajorData {
  event: {
    name: string;
    city: string;
    start: string;        // AAAA-MM-DD
    end: string;
    playoffsStart: string;
    listDate: string;     // data da lista oficial de times
    status: 'projecao' | 'oficial';
    updatedAt: string;
    sources: string[];
  };
  teams: MajorTeam[];
}

export type StageNo = 1 | 2 | 3;

export interface MajorMatch {
  a: string;
  b: string;
  bestOf: 1 | 3 | 5;
  winner: string;
  /** mapas [a, b] */
  score: [number, number];
  /** rótulo: 'R1'…'R5' no suíço; 'QF1'…'F' nos playoffs */
  label: string;
}

export interface SwissRecord { id: string; w: number; l: number }

export interface StageResult {
  stage: StageNo;
  teams: string[];
  rounds: MajorMatch[][];
  /** classificados em ordem de seed para o próximo stage */
  advanced: string[];
  eliminated: string[];
  records: SwissRecord[];
}

export interface PlayoffResult {
  seeds: string[];        // 8, seed 1..8
  qf: MajorMatch[];
  sf: MajorMatch[];
  final: MajorMatch;
  champion: string;
}

export interface MajorResult {
  stages: [StageResult, StageResult, StageResult];
  playoffs: PlayoffResult;
}

// ---------------------------------------------------------------- dados

/** valida o JSON; devolve a lista de problemas (vazia = ok). */
export function validateMajorData(d: MajorData): string[] {
  const errs: string[] = [];
  if (!d?.teams || d.teams.length !== 32) errs.push(`precisa de 32 times (tem ${d?.teams?.length ?? 0})`);
  const ids = new Set<string>();
  const seeds = new Set<number>();
  for (const t of d?.teams ?? []) {
    if (!t.id || !/^[a-z0-9-]+$/.test(t.id)) errs.push(`id inválido: ${t.id}`);
    if (ids.has(t.id)) errs.push(`id repetido: ${t.id}`);
    ids.add(t.id);
    if (!Number.isInteger(t.seed) || t.seed < 1 || t.seed > 32) errs.push(`seed inválido em ${t.id}: ${t.seed}`);
    if (seeds.has(t.seed)) errs.push(`seed repetido: ${t.seed}`);
    seeds.add(t.seed);
    if (!Number.isFinite(t.rating)) errs.push(`rating inválido em ${t.id}`);
  }
  return errs;
}

/** times por seed (1..32) */
export function bySeed(d: MajorData): MajorTeam[] {
  return [...d.teams].sort((a, b) => a.seed - b.seed);
}

/** quem ENTRA direto em cada stage (sem os que vêm do stage anterior) */
export function stageEntrants(d: MajorData, stage: StageNo): MajorTeam[] {
  const s = bySeed(d);
  return stage === 1 ? s.slice(16, 32) : stage === 2 ? s.slice(8, 16) : s.slice(0, 8);
}

// ---------------------------------------------------------------- partida

/** chance de vencer UM mapa (Elo, 400 pontos = 10:1) */
export function mapWinP(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/** chance de vencer a série MDn dado p por mapa */
export function seriesWinP(p: number, bestOf: 1 | 3 | 5): number {
  if (bestOf === 1) return p;
  const need = (bestOf + 1) / 2;
  // soma P(vencer `need` mapas antes de perder `need`)
  let total = 0;
  for (let lost = 0; lost < need; lost++) total += binom(need - 1 + lost, lost) * p ** need * (1 - p) ** lost;
  return total;
}
function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Quem decide uma série. O padrão sorteia pelo rating (playSeries). O modo
 * jogado (engine/majorCampaign.ts) troca por um que devolve o resultado da Sala
 * nas séries do time do usuário. Fase: 1..3 = stages, 4 = playoffs.
 */
export type SeriesPlayer = (a: MajorTeam, b: MajorTeam, bestOf: 1 | 3 | 5, label: string, rng: Rng, phase: 1 | 2 | 3 | 4) => MajorMatch;

export const simSeries: SeriesPlayer = (a, b, bestOf, label, rng) => playSeries(a, b, bestOf, label, rng);

function playSeries(a: MajorTeam, b: MajorTeam, bestOf: 1 | 3 | 5, label: string, rng: Rng): MajorMatch {
  const p = mapWinP(a.rating, b.rating);
  const need = (bestOf + 1) / 2;
  let sa = 0;
  let sb = 0;
  while (sa < need && sb < need) {
    if (rng() < p) sa++;
    else sb++;
  }
  return { a: a.id, b: b.id, bestOf, winner: sa > sb ? a.id : b.id, score: [sa, sb], label };
}

// ---------------------------------------------------------------- suíço

/**
 * MD do jogo no suíço: Stage 1 e 2 jogam MD1, menos as partidas que
 * classificam ou eliminam (2 vitórias ou 2 derrotas), que são MD3.
 * Stage 3 é todo MD3.
 */
export function swissBestOf(stage: StageNo, w: number, l: number): 1 | 3 {
  if (stage === 3) return 3;
  return w === 2 || l === 2 ? 3 : 1;
}

/**
 * Pareamento dentro de um grupo de mesmo record: melhor seed × pior seed,
 * evitando revanche quando der (troca com o vizinho).
 */
function pairGroup(ids: string[], played: Set<string>): [string, string][] {
  const pool = [...ids];
  const out: [string, string][] = [];
  while (pool.length >= 2) {
    const a = pool.shift()!;
    let j = pool.length - 1;
    while (j > 0 && played.has(key(a, pool[j]))) j--;
    const b = pool.splice(j, 1)[0];
    out.push([a, b]);
  }
  return out;
}
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Roda um stage suíço de 16. `ordered` em ordem de seed (o primeiro é o
 * melhor). Rodada 1: 1×9, 2×10… (metade de cima contra a de baixo).
 */
export function runSwissStage(stage: StageNo, ordered: MajorTeam[], rng: Rng, play: SeriesPlayer = simSeries): StageResult {
  if (ordered.length !== 16) throw new Error(`stage ${stage} precisa de 16 times`);
  const team = new Map(ordered.map((t) => [t.id, t]));
  const rank = new Map(ordered.map((t, i) => [t.id, i]));
  const rec = new Map(ordered.map((t) => [t.id, { w: 0, l: 0 }]));
  const played = new Set<string>();
  const rounds: MajorMatch[][] = [];
  const done = (id: string) => rec.get(id)!.w >= 3 || rec.get(id)!.l >= 3;

  for (let r = 1; r <= 5; r++) {
    const alive = ordered.map((t) => t.id).filter((id) => !done(id));
    if (!alive.length) break;
    let pairs: [string, string][];
    if (r === 1) {
      pairs = Array.from({ length: 8 }, (_, i) => [ordered[i].id, ordered[i + 8].id] as [string, string]);
    } else {
      const groups = new Map<string, string[]>();
      for (const id of alive) {
        const g = `${rec.get(id)!.w}-${rec.get(id)!.l}`;
        groups.set(g, [...(groups.get(g) ?? []), id]);
      }
      pairs = [];
      for (const ids of groups.values()) pairs.push(...pairGroup(ids.sort((x, y) => rank.get(x)! - rank.get(y)!), played));
    }
    const matches = pairs.map(([a, b]) => {
      const ra = rec.get(a)!;
      const m = play(team.get(a)!, team.get(b)!, swissBestOf(stage, ra.w, ra.l), `R${r}`, rng, stage);
      played.add(key(a, b));
      const loser = m.winner === a ? b : a;
      rec.get(m.winner)!.w++;
      rec.get(loser)!.l++;
      return m;
    });
    rounds.push(matches);
  }

  const records = ordered.map((t) => ({ id: t.id, ...rec.get(t.id)! }));
  const byRecord = (x: SwissRecord, y: SwissRecord) => x.l - y.l || y.w - x.w || rank.get(x.id)! - rank.get(y.id)!;
  const advanced = records.filter((x) => x.w >= 3).sort(byRecord).map((x) => x.id);
  const eliminated = records.filter((x) => x.w < 3).sort(byRecord).map((x) => x.id);
  return { stage, teams: ordered.map((t) => t.id), rounds, advanced, eliminated, records };
}

// ---------------------------------------------------------------- playoffs

/** pares das quartas a partir dos 8 seeds (índices) */
export const QF_PAIRS: [number, number][] = [[0, 7], [3, 4], [1, 6], [2, 5]];

export function runPlayoffs(seeds: MajorTeam[], rng: Rng, play: SeriesPlayer = simSeries): PlayoffResult {
  const playSeries = (a: MajorTeam, b: MajorTeam, bo: 1 | 3 | 5, label: string, r: Rng) => play(a, b, bo, label, r, 4);
  const qf = QF_PAIRS.map(([i, j], k) => playSeries(seeds[i], seeds[j], 3, `QF${k + 1}`, rng));
  const get = (id: string) => seeds.find((t) => t.id === id)!;
  const sf = [0, 1].map((k) => playSeries(get(qf[k * 2].winner), get(qf[k * 2 + 1].winner), 3, `SF${k + 1}`, rng));
  const final = playSeries(get(sf[0].winner), get(sf[1].winner), 5, 'F', rng);
  return { seeds: seeds.map((t) => t.id), qf, sf, final, champion: final.winner };
}

// ---------------------------------------------------------------- Major

/** stage N recebe os 8 do anterior + os 8 seeds diretos; ordem = seed do evento */
function stageField(d: MajorData, stage: StageNo, fromPrev: string[]): MajorTeam[] {
  const all = new Map(d.teams.map((t) => [t.id, t]));
  const field = [...stageEntrants(d, stage), ...fromPrev.map((id) => all.get(id)!)];
  return field.sort((a, b) => a.seed - b.seed);
}

export function simulateMajor(d: MajorData, seed: number, play: SeriesPlayer = simSeries): MajorResult {
  const rng = makeRng(seed);
  const s1 = runSwissStage(1, stageField(d, 1, []), rng, play);
  const s2 = runSwissStage(2, stageField(d, 2, s1.advanced), rng, play);
  const s3 = runSwissStage(3, stageField(d, 3, s2.advanced), rng, play);
  const all = new Map(d.teams.map((t) => [t.id, t]));
  const playoffs = runPlayoffs(s3.advanced.map((id) => all.get(id)!), rng, play);
  return { stages: [s1, s2, s3], playoffs };
}

/** chance de título de cada time em N simulações (pro painel de favoritos) */
export function titleOdds(d: MajorData, runs: number, seed = 1): Map<string, number> {
  const wins = new Map<string, number>(d.teams.map((t) => [t.id, 0]));
  for (let i = 0; i < runs; i++) {
    const c = simulateMajor(d, seed + i * 7919).playoffs.champion;
    wins.set(c, wins.get(c)! + 1);
  }
  return new Map([...wins].map(([id, w]) => [id, w / runs]));
}

// ---------------------------------------------------------------- pick'em

/**
 * O palpite: os 8 classificados de cada stage e o chaveamento dos playoffs
 * (vencedores QF1..QF4, SF1, SF2 e o campeão).
 */
export interface MajorPicks {
  s1: string[];
  s2: string[];
  s3: string[];
  /** 7 vencedores: QF1..QF4, SF1, SF2, F (campeão) — '' = sem palpite */
  bracket: string[];
  /** por stage, até 2 times que você acha que fecham 3-0 (saem dos 8 classificados) */
  x30: [string[], string[], string[]];
  /** por stage, até 2 times que você acha que caem 0-3 (fora dos 8 classificados) */
  x03: [string[], string[], string[]];
}

export const EXTREME_PICKS = 2;

export const emptyPicks = (): MajorPicks => ({ s1: [], s2: [], s3: [], bracket: ['', '', '', '', '', '', ''], x30: [[], [], []], x03: [[], [], []] });

/** quem pode ser escolhido no stage, dado o palpite dos stages anteriores */
export function pickPool(d: MajorData, p: MajorPicks, stage: StageNo): MajorTeam[] {
  const prev = stage === 1 ? [] : stage === 2 ? p.s1 : p.s2;
  return stageField(d, stage, prev.length === 8 ? prev : []);
}

/** os 8 do playoff do palpite, em ordem de seed do evento */
export function pickSeeds(d: MajorData, p: MajorPicks): MajorTeam[] {
  const all = new Map(d.teams.map((t) => [t.id, t]));
  return p.s3.map((id) => all.get(id)!).filter(Boolean).sort((a, b) => a.seed - b.seed);
}

/** os dois lados de cada jogo do chaveamento do palpite (ids ou '' se indefinido) */
export function bracketSides(d: MajorData, p: MajorPicks): [string, string][] {
  const s = pickSeeds(d, p).map((t) => t.id);
  const at = (i: number) => s[i] ?? '';
  const qf = QF_PAIRS.map(([i, j]) => [at(i), at(j)] as [string, string]);
  const sf: [string, string][] = [[p.bracket[0], p.bracket[1]], [p.bracket[2], p.bracket[3]]];
  return [...qf, ...sf, [p.bracket[4], p.bracket[5]]];
}

/**
 * Ajusta o palpite depois de uma mudança: tira dos stages seguintes quem não
 * está mais no pool, e limpa vencedores de chave que deixaram de estar na chave.
 */
export function normalizePicks(d: MajorData, p: MajorPicks): MajorPicks {
  const three = (x: unknown): [string[], string[], string[]] => {
    const a = Array.isArray(x) ? x : [];
    return [0, 1, 2].map((i) => (Array.isArray(a[i]) ? (a[i] as unknown[]).map(String) : [])) as [string[], string[], string[]];
  };
  const out: MajorPicks = { s1: [...p.s1], s2: [...p.s2], s3: [...p.s3], bracket: [...p.bracket], x30: three(p.x30), x03: three(p.x03) };
  for (const st of [1, 2, 3] as StageNo[]) {
    const k = `s${st}` as 's1' | 's2' | 's3';
    const pool = new Set(pickPool(d, out, st).map((t) => t.id));
    const prevFull = st === 1 || out[`s${st - 1}` as 's1' | 's2'].length === 8;
    out[k] = prevFull ? out[k].filter((id) => pool.has(id)).slice(0, 8) : [];
  }
  // 3-0 só entre os seus classificados; 0-3 só entre os que você deixou de fora
  for (let i = 0; i < 3; i++) {
    const st = (i + 1) as StageNo;
    const adv = out[`s${st}` as 's1' | 's2' | 's3'];
    const prevFull = st === 1 || out[`s${st - 1}` as 's1' | 's2'].length === 8;
    const pool = new Set(prevFull ? pickPool(d, out, st).map((t) => t.id) : []);
    out.x30[i] = [...new Set(out.x30[i])].filter((id) => adv.includes(id)).slice(0, EXTREME_PICKS);
    out.x03[i] = [...new Set(out.x03[i])].filter((id) => pool.has(id) && !adv.includes(id)).slice(0, EXTREME_PICKS);
  }
  while (out.bracket.length < 7) out.bracket.push('');
  if (out.s3.length < 8) out.bracket = ['', '', '', '', '', '', ''];
  for (let i = 0; i < 7; i++) {
    const sides = bracketSides(d, out)[i];
    if (out.bracket[i] && !sides.includes(out.bracket[i])) out.bracket[i] = '';
  }
  // um vencedor limpo invalida os jogos à frente
  for (let i = 4; i < 7; i++) {
    const sides = bracketSides(d, out)[i];
    if (out.bracket[i] && (!sides[0] || !sides[1] || !sides.includes(out.bracket[i]))) out.bracket[i] = '';
  }
  return out;
}

export function picksComplete(p: MajorPicks): boolean {
  return p.s1.length === 8 && p.s2.length === 8 && p.s3.length === 8 && p.bracket.every(Boolean);
}

export const champion = (p: MajorPicks): string => p.bracket[6] ?? '';

// ---------------------------------------------------------------- pontuação

export interface PicksScore {
  stage: [number, number, number]; // acertos de classificados (0..8)
  x30: [number, number, number];   // acertos de 3-0 (0..2)
  x03: [number, number, number];   // acertos de 0-3 (0..2)
  playoff: number;                 // acertos de vencedores na chave (0..7)
  champion: boolean;
  points: number;
  max: number;
}

/** 1 ponto por classificado certo, 2 por 3-0 ou 0-3 certo, 2 por vencedor de QF/SF, 5 pelo campeão */
export function scorePicks(p: MajorPicks, r: MajorResult): PicksScore {
  const hit = (mine: string[], real: string[]) => mine.filter((id) => real.includes(id)).length;
  const stage: [number, number, number] = [hit(p.s1, r.stages[0].advanced), hit(p.s2, r.stages[1].advanced), hit(p.s3, r.stages[2].advanced)];
  const real = [...r.playoffs.qf, ...r.playoffs.sf].map((m) => m.winner);
  // vencedor de QF/SF conta se o time escolhido venceu ALGUM jogo daquela fase
  const qfWin = new Set(real.slice(0, 4));
  const sfWin = new Set(real.slice(4, 6));
  let playoff = 0;
  p.bracket.slice(0, 4).forEach((id) => { if (id && qfWin.has(id)) playoff++; });
  p.bracket.slice(4, 6).forEach((id) => { if (id && sfWin.has(id)) playoff++; });
  const champ = !!p.bracket[6] && p.bracket[6] === r.playoffs.champion;
  if (champ) playoff++;
  const rec = (i: number, w: number, l: number) => new Set(r.stages[i].records.filter((x) => x.w === w && x.l === l).map((x) => x.id));
  const x30 = [0, 1, 2].map((i) => (p.x30?.[i] ?? []).filter((id) => rec(i, 3, 0).has(id)).length) as [number, number, number];
  const x03 = [0, 1, 2].map((i) => (p.x03?.[i] ?? []).filter((id) => rec(i, 0, 3).has(id)).length) as [number, number, number];
  const extremes = [...x30, ...x03].reduce((a, b) => a + b, 0) * 2;
  const points = stage[0] + stage[1] + stage[2] + extremes + (playoff - (champ ? 1 : 0)) * 2 + (champ ? 5 : 0);
  return { stage, x30, x03, playoff, champion: champ, points, max: 24 + 24 + 12 + 5 };
}

// ---------------------------------------------------------------- link

// Palpite no link: cada time vira 1 caractere (índice na ordem de seed, base32),
// prefixado pela versão da lista (hash curto dos ids). Link de uma lista
// antiga não é decodificado em times errados: devolve null.
const ALPHA = '0123456789abcdefghijklmnopqrstuv';

export function listVersion(d: MajorData): string {
  let h = 0;
  for (const id of bySeed(d).map((t) => t.id).join(',')) h = (h * 31 + id.charCodeAt(0)) >>> 0;
  return h.toString(36).slice(-4).padStart(4, '0');
}

export function encodePicks(d: MajorData, p: MajorPicks): string {
  const order = bySeed(d).map((t) => t.id);
  const ch = (id: string) => (id ? ALPHA[order.indexOf(id)] ?? '_' : '_');
  const part = (ids: string[]) => Array.from({ length: 8 }, (_, i) => ch(ids[i] ?? '')).join('');
  const br = Array.from({ length: 7 }, (_, i) => ch(p.bracket[i] ?? '')).join('');
  const ext = [0, 1, 2].map((i) => [0, 1].map((j) => ch(p.x30?.[i]?.[j] ?? '')).join('') + [0, 1].map((j) => ch(p.x03?.[i]?.[j] ?? '')).join('')).join('');
  const base = `${listVersion(d)}.${part(p.s1)}${part(p.s2)}${part(p.s3)}${br}`;
  // links antigos (sem 3-0/0-3) continuam válidos: o trecho extra é opcional
  return /[^_]/.test(ext) ? `${base}.${ext}` : base;
}

export function decodePicks(d: MajorData, code: string): MajorPicks | null {
  const m = /^([0-9a-z]{4})\.([0-9a-v_]{31})(?:\.([0-9a-v_]{12}))?$/.exec(code.trim().toLowerCase());
  if (!m || m[1] !== listVersion(d)) return null;
  const order = bySeed(d).map((t) => t.id);
  const id = (c: string) => (c === '_' ? '' : order[ALPHA.indexOf(c)] ?? '');
  const body = m[2];
  const ids = (from: number, n: number) => Array.from(body.slice(from, from + n)).map(id);
  const raw: MajorPicks = {
    s1: ids(0, 8).filter(Boolean),
    s2: ids(8, 8).filter(Boolean),
    s3: ids(16, 8).filter(Boolean),
    bracket: ids(24, 7),
    x30: [[], [], []],
    x03: [[], [], []],
  };
  if (m[3]) {
    for (let i = 0; i < 3; i++) {
      const seg = Array.from(m[3].slice(i * 4, i * 4 + 4)).map(id);
      raw.x30[i] = seg.slice(0, 2).filter(Boolean);
      raw.x03[i] = seg.slice(2, 4).filter(Boolean);
    }
  }
  return normalizePicks(d, raw);
}
