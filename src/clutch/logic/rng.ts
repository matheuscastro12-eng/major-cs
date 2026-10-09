// mulberry32 semeado: toda aleatoriedade do sim passa por aqui (determinismo).
import { hashStr } from '../../state/hash';

export interface RngState { s: number }

export function makeRng(seed: number | string): RngState {
  return { s: (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x9e3779b9 };
}

export function rand(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** normal padrão (Box-Muller) */
export function gauss(r: RngState): number {
  const u = Math.max(1e-9, rand(r));
  const v = rand(r);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
