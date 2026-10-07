// [evolução] Treino de base intenso (FM): o prospecto NA ACADEMIA cresce pela
// curva única (evolveAttrs) com um multiplicador próprio, escalado pela
// estrutura de treino do CT e pela formação de jovens da comissão
// (staffEffects.youthGrowth; 1 = mediana). O teto (potencial) nunca é furado
// (evolveAttrs). Promovido ao time principal, volta à curva normal. A IA não usa.
import { attrsOf, caFromOvr, legacyFromAttrs, ovrFromAttrs, type PlayerAttrs } from '../attrs/model';
import { evolveAttrs } from '../attrs/progression';
import { FACILITY_MAX_LEVEL } from './facilities';
import { academyAgeAfterSplit } from './playerAge';
import type { Player } from '../../types';

/** Base do treino de base: calibrada em scripts/test-evolucao.mts
 *  (16 anos, OVR 65, pot 86 → 85–90% do teto em ~8–10 splits, estrutura média). */
export const ACADEMY_BASE_MUL = 2.25;

export function academyGrowthMul(trainingLv: number, youthGrowth = 1): number {
  return ACADEMY_BASE_MUL * (1 + 0.35 * (trainingLv / FACILITY_MAX_LEVEL)) * youthGrowth;
}

export type AcademyLike = Player & { age: number; potential: number; attrs?: PlayerAttrs };

/** Um split de academia (o fechamento de `split`). */
export function evolveAcademyProspect(a: AcademyLike, split: number, growthMul: number, focused: boolean): { attrs: PlayerAttrs; age: number } {
  const x = attrsOf({ ...a, age: a.age });
  const r = evolveAttrs({ ...x, pa: Math.max(x.ca, caFromOvr(a.potential)) }, {
    playerId: a.id, split, age: a.age, role: a.role, growthMul, focusPlayer: focused,
  });
  return { attrs: r.attrs, age: academyAgeAfterSplit(a.age, split) };
}

/** Projeção (determinística): OVR depois de `n` splits. */
export function projectAcademyOvr(a: AcademyLike, split: number, n: number, growthMul: number, focused: boolean): number[] {
  let cur: AcademyLike = a;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = evolveAcademyProspect(cur, split + i, growthMul, focused);
    cur = { ...cur, ...legacyFromAttrs(r.attrs), age: r.age, attrs: r.attrs };
    out.push(ovrFromAttrs(r.attrs));
  }
  return out;
}
