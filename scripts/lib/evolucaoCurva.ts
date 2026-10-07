// Medidas da curva de evolução (usadas por scripts/test-evolucao.mts e pela
// calibração): jovem rumo ao PA, queda por idade, IGL × Entry. Puras.
import { ALL_ATTRS, type AttrKey } from '../../src/engine/attributes.ts';
import { deriveAttrs, ovrFromAttrs, caFromOvr, type PlayerAttrs } from '../../src/engine/attrs/model.ts';
import { evolveAttrs, type EvolveContext } from '../../src/engine/attrs/progression.ts';
import { makeNewgen } from '../../src/engine/mundo/juventude.ts';
import { SPLITS_PER_YEAR } from '../../src/engine/clock.ts';
import type { Role } from '../../src/types.ts';

export type Regime = 'bom' | 'neutro' | 'banco';
const ALL_MUL = (v: number) => Object.fromEntries(ALL_ATTRS.map((k) => [k, v])) as Record<AttrKey, number>;
export function regimeCtx(r: Regime): Partial<EvolveContext> {
  if (r === 'bom') return { growthMul: 1.2, trainMul: ALL_MUL(1.25), rating: 1.1, mapsPlayed: 12 };
  if (r === 'banco') return { mapsPlayed: 2 };
  return {};
}

/** CA/PA médio de jovens de 18 com PA `pa` depois de `years` anos. */
export function youthShare(pa: number, r: Regime, years = 3, n = 120): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const id = `yc${i}`;
    let x: PlayerAttrs = makeNewgen({ id, seed: id, region: 'europe', age: 18, pa }).attrs;
    for (let s = 1; s <= years * SPLITS_PER_YEAR; s++) {
      const age = 18 + Math.floor((s - 1) / SPLITS_PER_YEAR);
      x = evolveAttrs(x, { playerId: id, split: s, age, ...regimeCtx(r) }).attrs;
    }
    sum += caFromOvr(ovrFromAttrs(x)) / pa;
  }
  return sum / n;
}

/** Variação média de OVR por ANO de jogadores de `age0` (OVR ~80, sem teto). */
export function declinePerYear(age0: number, years: number, role: Role = 'Rifler', n = 200): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const id = `dc${role}${age0}:${i}`;
    const x0 = deriveAttrs({ id, role, age: age0, aim: 82, awp: role === 'AWP' ? 84 : 66, igl: role === 'IGL' ? 84 : 68, clutch: 79, consistency: 80 });
    let x: PlayerAttrs = { ...x0, pa: x0.ca }; // no teto: mede a curva de idade
    for (let s = 1; s <= years * SPLITS_PER_YEAR; s++) {
      const age = age0 + Math.floor((s - 1) / SPLITS_PER_YEAR);
      x = evolveAttrs(x, { playerId: id, split: s, age, role }).attrs;
    }
    sum += ovrFromAttrs(x) - ovrFromAttrs(x0);
  }
  return sum / n / years;
}
