// PICK'EM do Major Singapore — regras puras (sem banco, sem DOM), usadas pelo
// servidor (server/pickem.ts, que decide a pontuação oficial) e pela tela.
//
// Formato estilo Valve: em cada Stage suíço o jogador escolhe 2 times que vão
// passar invictos (3-0), 2 que vão cair sem vencer (0-3) e 6 que vão avançar
// (3-1 ou 3-2). Depois, nos playoffs, os 4 vencedores das quartas, os 2 das
// semis e o campeão. A pontuação e os desempates ficam em PICKEM_SCORING para
// o Matheus aprovar/ajustar sem mexer no resto.

export type SwissStageId = 's1' | 's2' | 's3';
export type PickemStageId = SwissStageId | 'playoffs';
export const PICKEM_STAGES: PickemStageId[] = ['s1', 's2', 's3', 'playoffs'];

export interface SwissPick { threeZero: string[]; zeroThree: string[]; advance: string[] }
export interface PlayoffPick { semis: string[]; final: string[]; champion: string }
export type StagePick = SwissPick | PlayoffPick;

export interface SwissResult { threeZero: string[]; zeroThree: string[]; advanced: string[] }
export interface PlayoffResult { semis: string[]; final: string[]; champion: string | null }
export type StageResult = SwissResult | PlayoffResult;

export const SWISS_SLOTS = { threeZero: 2, zeroThree: 2, advance: 6 } as const;
export const PLAYOFF_SLOTS = { semis: 4, final: 2 } as const;

/** Proposta de pontuação (configurável). */
export const PICKEM_SCORING = {
  swiss: {
    threeZero: 3,        // acertou um 3-0
    zeroThree: 3,        // acertou um 0-3
    advance: 2,          // acertou um time que avança (3-1/3-2)
    threeZeroAdvanced: 1, // palpite de 3-0 que avançou, mas não invicto (crédito parcial)
  },
  playoffs: { semis: 2, final: 4, champion: 8 },
  /** ordem dos desempates depois dos pontos (todos "maior vence", exceto savedAt). */
  tiebreak: ['exact', 'champion', 'playoffHits', 'savedAt'] as const,
  winners: 3,
};
export type PickemScoring = typeof PICKEM_SCORING;

const uniq = (a: string[]) => new Set(a).size === a.length;
const isStrArr = (v: unknown, n: number): v is string[] => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 64);

export type Validation = { ok: true; pick: StagePick } | { ok: false; error: string };

/** Valida e normaliza o palpite de um Stage contra os times que jogam nele. */
export function validatePick(stage: PickemStageId, raw: unknown, teams: string[]): Validation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'palpite inválido' };
  const o = raw as Record<string, unknown>;
  const pool = new Set(teams);
  const inPool = (ids: string[]) => ids.every((id) => pool.has(id));
  if (stage === 'playoffs') {
    if (!isStrArr(o.semis, PLAYOFF_SLOTS.semis) || !isStrArr(o.final, PLAYOFF_SLOTS.final) || typeof o.champion !== 'string') return { ok: false, error: 'escolha 4 semifinalistas, 2 finalistas e o campeão' };
    const semis = o.semis, final = o.final, champion = o.champion;
    if (!uniq(semis) || !uniq(final)) return { ok: false, error: 'time repetido' };
    if (!inPool(semis)) return { ok: false, error: 'time fora dos playoffs' };
    if (!final.every((t) => semis.includes(t))) return { ok: false, error: 'finalista precisa estar nas semis' };
    if (!final.includes(champion)) return { ok: false, error: 'campeão precisa ser finalista' };
    return { ok: true, pick: { semis, final, champion } };
  }
  if (!isStrArr(o.threeZero, SWISS_SLOTS.threeZero) || !isStrArr(o.zeroThree, SWISS_SLOTS.zeroThree) || !isStrArr(o.advance, SWISS_SLOTS.advance)) {
    return { ok: false, error: 'escolha 2 times 3-0, 2 times 0-3 e 6 que avançam' };
  }
  const all = [...o.threeZero, ...o.zeroThree, ...o.advance];
  if (!uniq(all)) return { ok: false, error: 'cada time só pode aparecer uma vez' };
  if (!inPool(all)) return { ok: false, error: 'time fora deste Stage' };
  return { ok: true, pick: { threeZero: o.threeZero, zeroThree: o.zeroThree, advance: o.advance } };
}

/** A trava: palpite só vale antes de locksAt (o servidor repete a regra no próprio SQL). */
export const isLocked = (locksAt: string | Date | null | undefined, now: Date = new Date()): boolean => {
  if (!locksAt) return true;
  const t = new Date(locksAt).getTime();
  return !Number.isFinite(t) || now.getTime() >= t;
};

export interface StageScore { points: number; exact: number; hits: number; champion: boolean }
const ZERO: StageScore = { points: 0, exact: 0, hits: 0, champion: false };

export function scoreStage(stage: PickemStageId, pick: StagePick | null | undefined, result: StageResult | null | undefined, cfg: PickemScoring = PICKEM_SCORING): StageScore {
  if (!pick || !result) return { ...ZERO };
  if (stage === 'playoffs') {
    const p = pick as PlayoffPick, r = result as PlayoffResult;
    const semis = p.semis.filter((t) => r.semis.includes(t)).length;
    const final = p.final.filter((t) => r.final.includes(t)).length;
    const champion = !!r.champion && p.champion === r.champion;
    return { points: semis * cfg.playoffs.semis + final * cfg.playoffs.final + (champion ? cfg.playoffs.champion : 0), exact: 0, hits: semis + final + (champion ? 1 : 0), champion };
  }
  const p = pick as SwissPick, r = result as SwissResult;
  const tz = p.threeZero.filter((t) => r.threeZero.includes(t)).length;
  const tzAdv = p.threeZero.filter((t) => !r.threeZero.includes(t) && r.advanced.includes(t)).length;
  const zt = p.zeroThree.filter((t) => r.zeroThree.includes(t)).length;
  const adv = p.advance.filter((t) => r.advanced.includes(t) && !r.threeZero.includes(t)).length;
  const s = cfg.swiss;
  return { points: tz * s.threeZero + zt * s.zeroThree + adv * s.advance + tzAdv * s.threeZeroAdvanced, exact: tz + zt, hits: tz + zt + adv, champion: false };
}

export interface Entry { email: string; nick: string; picks: Partial<Record<PickemStageId, StagePick>>; savedAt: string }
export interface Ranked { rank: number; email: string; nick: string; points: number; exact: number; champion: boolean; playoffHits: number; savedAt: string; byStage: Partial<Record<PickemStageId, number>> }

export function rankEntries(entries: Entry[], results: Partial<Record<PickemStageId, StageResult>>, cfg: PickemScoring = PICKEM_SCORING): Ranked[] {
  const rows = entries.map((e) => {
    const byStage: Partial<Record<PickemStageId, number>> = {};
    let points = 0, exact = 0, champion = false, playoffHits = 0;
    for (const st of PICKEM_STAGES) {
      const sc = scoreStage(st, e.picks[st], results[st], cfg);
      byStage[st] = sc.points; points += sc.points; exact += sc.exact;
      if (st === 'playoffs') { champion = sc.champion; playoffHits = sc.hits; }
    }
    return { rank: 0, email: e.email, nick: e.nick, points, exact, champion, playoffHits, savedAt: e.savedAt, byStage };
  });
  const cmp = (a: Ranked, b: Ranked) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const k of cfg.tiebreak) {
      if (k === 'savedAt') { const d = new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime(); if (d) return d; continue; }
      const av = Number(a[k]), bv = Number(b[k]);
      if (bv !== av) return bv - av;
    }
    return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
  };
  rows.sort(cmp);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Os N ganhadores (padrão 3). Quem tem 0 ponto não ganha. */
export const pickWinners = (ranked: Ranked[], cfg: PickemScoring = PICKEM_SCORING) => ranked.filter((r) => r.points > 0).slice(0, cfg.winners);

/** Resultado de um Stage suíço a partir das séries terminadas (fonte: bo3.gg ou admin). */
export interface SeriesResult { a: string; b: string; winner: string }
export function deriveSwissResult(series: SeriesResult[]): SwissResult & { complete: boolean } {
  const rec = new Map<string, { w: number; l: number }>();
  const get = (t: string) => { let r = rec.get(t); if (!r) { r = { w: 0, l: 0 }; rec.set(t, r); } return r; };
  for (const s of series) {
    if (s.winner !== s.a && s.winner !== s.b) continue;
    const loser = s.winner === s.a ? s.b : s.a;
    get(s.winner).w++; get(loser).l++;
  }
  const threeZero: string[] = [], zeroThree: string[] = [], advanced: string[] = [];
  for (const [t, r] of rec) {
    if (r.w >= 3) { advanced.push(t); if (r.l === 0) threeZero.push(t); }
    else if (r.l >= 3 && r.w === 0) zeroThree.push(t);
  }
  const done = [...rec.values()].filter((r) => r.w >= 3 || r.l >= 3).length;
  return { threeZero: threeZero.sort(), zeroThree: zeroThree.sort(), advanced: advanced.sort(), complete: rec.size >= 16 && done === rec.size };
}
