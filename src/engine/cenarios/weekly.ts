// Desafio da Semana: cenário + modificador em destaque escolhidos pela semana
// ISO (UTC), iguais pra todo mundo, com a seed do mundo fixa da semana.
import { isoWeekOf, isoWeekStart } from '../ultimate/communityGoal.js';
import { CENARIOS } from './catalog.js';
import { MODIFIER_IDS } from './modifiers.js';
import type { CenarioDef, ModifierId } from './types.js';

const WEEK_MS = 7 * 86_400_000;

export function weeklyId(now: number): string {
  const { year, week } = isoWeekOf(now);
  return `wk-${year}-${String(week).padStart(2, '0')}`;
}

/** hash estável (FNV-1a 32 bits) */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export interface WeeklyChallenge {
  id: string;            // wk-AAAA-SS
  def: CenarioDef;
  featuredMod: ModifierId; // modificador sugerido da semana (opcional pro jogador)
  seed: string;          // seed fixa do mundo
  startsAt: number;
  endsAt: number;
}

/** Desafio de uma semana a partir do id (o servidor valida o id recebido assim). */
export function weeklyFromId(id: string): WeeklyChallenge | null {
  const m = /^wk-(\d{4})-(\d{2})$/.exec(id);
  if (!m) return null;
  const year = Number(m[1]), week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const w1 = isoWeekStart(Date.UTC(year, 0, 4));
  const startsAt = w1 + (week - 1) * WEEK_MS;
  if (weeklyId(startsAt) !== id) return null;
  // rotação: sem repetir o cenário em semanas seguidas (índice sequencial embaralhado)
  const n = Math.round(startsAt / WEEK_MS);
  const order = [...CENARIOS].sort((a, b) => hash32(`${year}:${a.id}`) - hash32(`${year}:${b.id}`));
  const def = order[((n % order.length) + order.length) % order.length];
  const featuredMod = MODIFIER_IDS[hash32(`mod:${id}`) % MODIFIER_IDS.length];
  return { id, def, featuredMod, seed: `cen:${id}`, startsAt, endsAt: startsAt + WEEK_MS - 1 };
}

export function weeklyChallenge(now: number): WeeklyChallenge {
  return weeklyFromId(weeklyId(now))!;
}
