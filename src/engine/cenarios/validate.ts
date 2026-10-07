// Plausibilidade do log enviado ao ranking. O servidor RECALCULA a pontuação
// com evaluateRun e recusa um log impossível pela estrutura do calendário
// (3 etapas por split, 1 fechamento de split, 1 Major por split, tier andando
// no máximo 1 degrau por split, campeão = 1º lugar...).
import { endSplitOf, evaluateRun } from './run.js';
import type { CenarioDef, CenarioResult, CenarioRun } from './types.js';

export const EVENTS_PER_SPLIT_MAX = 3;
/** espelha MAJOR_EVERY de engine/mundo/circuito.ts (sem importar: a cadeia da API exige ESM com .js) */
export const CEN_MAJOR_EVERY = 4;
const isMajorSplit = (split: number) => split % CEN_MAJOR_EVERY === 0;
/** tempo REAL mínimo por split jogado (s) entre o 'start' no servidor e o envio */
export const MIN_SECONDS_PER_SPLIT = 90;

export type LogProblem =
  | 'split_out_of_range' | 'out_of_order' | 'too_many_events' | 'too_many_closes' | 'too_many_majors'
  | 'champion_not_first' | 'bad_pos' | 'major_won_not_qualified' | 'tier_jump' | 'bad_budget' | 'not_finished' | 'bad_tier';

export function validateLog(def: CenarioDef, run: CenarioRun): LogProblem | null {
  const end = endSplitOf(def, run);
  let prevS = run.startSplit;
  let prevTier = run.startTier;
  const perSplit = new Map<number, { e: number; s: number; m: number }>();
  for (const e of run.log) {
    if (e.s < run.startSplit || e.s > end) return 'split_out_of_range';
    if (e.s < prevS) return 'out_of_order';
    prevS = e.s;
    if (e.t < 1 || e.t > 3) return 'bad_tier';
    if (!(e.b >= -100_000 && e.b <= 1_000_000)) return 'bad_budget'; // em milhares: -R$100 mi .. R$1 bi
    const c = perSplit.get(e.s) ?? { e: 0, s: 0, m: 0 };
    if (e.pos != null) {
      c.e += 1;
      if (c.e > EVENTS_PER_SPLIT_MAX) return 'too_many_events';
      if (e.pos < 1 || e.pos > 64) return 'bad_pos';
    } else if (e.p === 'e') return 'bad_pos';
    if (e.c && e.pos !== 1) return 'champion_not_first';
    if (e.p === 'e') {
      if (e.w) return 'major_won_not_qualified';
    } else {
      // fechamento do split (com ou sem Major): um só por split, tier anda 1 degrau
      if (c.s >= 1) return 'too_many_closes';
      c.s += 1;
      if (Math.abs(e.t - prevTier) > 1) return 'tier_jump';
      prevTier = e.t;
      if (e.p === 's' && e.w) return 'major_won_not_qualified';
      if (e.p === 'm') {
        c.m += 1;
        if (!isMajorSplit(e.s)) return 'too_many_majors';
        if (e.w && !e.q) return 'major_won_not_qualified';
      }
    }
    perSplit.set(e.s, c);
  }
  return null;
}

/** Confere tudo e devolve a pontuação RECALCULADA (o número do cliente é ignorado). */
export function verifySubmission(def: CenarioDef, run: CenarioRun, elapsedSec: number): { ok: true; result: CenarioResult } | { ok: false; reason: LogProblem | 'too_fast' } {
  const problem = validateLog(def, run);
  if (problem) return { ok: false, reason: problem };
  const lastSplit = run.log.length ? run.log[run.log.length - 1].s : run.startSplit;
  const result = evaluateRun(def, run, lastSplit + 1);
  if (!result.finished) return { ok: false, reason: 'not_finished' };
  const splitsPlayed = lastSplit - run.startSplit + 1;
  if (elapsedSec < splitsPlayed * MIN_SECONDS_PER_SPLIT) return { ok: false, reason: 'too_fast' };
  return { ok: true, result };
}

/** Teto teórico da pontuação de um cenário (todos os mods, tudo no 1º split). Sanidade extra do servidor. */
export function maxScore(def: CenarioDef): number {
  const objMax = def.objectives.reduce((a, o) => a + o.pts, 0);
  const speed = def.objectives.reduce((a, o) => a + Math.round(o.pts * 0.5 * (def.deadline - 1) / Math.max(1, def.deadline)), 0);
  const perf = def.deadline * (EVENTS_PER_SPLIT_MAX * 30 + 40 + 200); // folgado: Major só a cada 4 splits
  return Math.round((objMax + speed + perf) * 2.5);
}
