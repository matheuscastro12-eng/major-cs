// dmg = base × hitMult × falloff(dist) × armorFactor  (puro)
import { WEAPONS, type WeaponId } from './weapons';

export type HitGroup = 'head' | 'torso' | 'stomach' | 'legs';

export const HIT_MULT: Record<HitGroup, number> = { head: 4.0, torso: 1.0, stomach: 1.25, legs: 0.75 };

export function falloff(weapon: WeaponId, distM: number): number {
  return Math.pow(WEAPONS[weapon].falloffPer10m, Math.max(0, distM) / 10);
}

export interface DamageResult { hp: number; armor: number }

/** dano em HP e quanto de colete cai. Pernas ignoram o colete. */
export function computeDamage(weapon: WeaponId, group: HitGroup, distM: number, armor: number): DamageResult {
  const w = WEAPONS[weapon];
  const raw = w.base * HIT_MULT[group] * falloff(weapon, distM);
  const armored = armor > 0 && group !== 'legs';
  const hp = armored ? raw * w.armorPen : raw;
  const armorLoss = armored ? Math.min(armor, hp * 0.5) : 0;
  return { hp: Math.round(hp), armor: Math.round(armorLoss) };
}

/** aplica no alvo (muta hp/armor) e devolve o dano efetivo causado */
export function applyDamage(target: { hp: number; armor: number }, weapon: WeaponId, group: HitGroup, distM: number): number {
  const d = computeDamage(weapon, group, distM, target.armor);
  const dealt = Math.min(target.hp, d.hp);
  target.hp = Math.max(0, target.hp - d.hp);
  target.armor = Math.max(0, target.armor - d.armor);
  return dealt;
}
