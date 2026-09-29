import type { Player } from '../../types';
import { hashStr } from '../../state/hash';
import { playerOrgId } from '../../state/career-player-route';
import bo3Ages from '../../data/bo3-ages.json';
import { parseRegenPlayerId } from './signings';
import { parseNewgenId } from '../mundo/juventude';

export const CAREER_SPLITS_PER_YEAR = 3;

export interface YouthDebut {
  age: number;
  split: number;
}

export function careerYearsAtSplit(split: number): number {
  return Math.floor((Math.max(1, Math.floor(split)) - 1) / CAREER_SPLITS_PER_YEAR);
}

export function ageFromCareerStart(baseAge: number, split: number): number {
  return Math.max(15, Math.round(baseAge) + careerYearsAtSplit(split));
}

export function ageFromDebut(debut: YouthDebut, split: number): number {
  const elapsed = Math.max(0, Math.floor(split) - Math.max(1, Math.floor(debut.split)));
  return Math.max(15, Math.round(debut.age)) + Math.floor(elapsed / CAREER_SPLITS_PER_YEAR);
}

export function youthDebutAtPromotion(age: number, split: number): YouthDebut {
  return {
    age: Math.max(15, Math.min(30, Math.round(age))),
    split: Math.max(1, Math.floor(split)),
  };
}

export function academyAgeAfterSplit(age: number, closingSplit: number): number {
  return Math.max(15, Math.round(age))
    + (Math.max(1, Math.floor(closingSplit)) % CAREER_SPLITS_PER_YEAR === 0 ? 1 : 0);
}

export function legacyYouthBaseAgeAtPromotion(age: number, split: number): number {
  return Math.max(1, Math.round(age) - careerYearsAtSplit(split));
}

// idades REAIS do bo3 (196/240) por nick; quem falta recebe uma idade plausível
// determinística. A idade efetiva sobe ~1 ano a cada 3 splits de carreira.
export const REAL_AGES = bo3Ages as Record<string, { age: number; born: string }>;
export function baseAge(p: Pick<Player, 'id' | 'nick' | 'age'>, youthAge?: Record<string, number>): number {
  // prospecto promovido da academia: idade-base guardada na promoção. Vem ANTES do
  // lookup por nick (um prospecto pode ter um nick que colide com um pro real).
  const y = youthAge?.[p.id];
  if (y != null) return y;
  // idade editada no CRM (override global): tem prioridade sobre a tabela por nick.
  if (p.age != null && p.age >= 15 && p.age <= 45) return p.age;
  const real = REAL_AGES[p.nick]?.age;
  if (real && real >= 15 && real <= 45) return real;
  // sem dado: assume AUGE (25-29), não juventude. Um pro de elenco real não pode
  // virar ct('jovem em ascensão') só por falta de idade na tabela (bug do coldzera/fer).
  // Jovens de verdade vêm da academia, que grava a idade na promoção (youthAge).
  return 25 + (hashStr(`age:${p.id}`) % 5);
}

// ─── idade de um jogador na Carreira (relógio canônico) ─────────────────────
// Ordem: regen/newgen (relógio no id) > youthDebut (promoção da base / idade
// editada) > idade-base do split 1 (youthAge legado > p.age > bo3 > hash).
// O id é NORMALIZADO (playerOrgId): o perfil/peek recebem o jogador do elenco
// com o id de runtime (`user__<id>`), e as tabelas do save (youthDebut,
// youthAge) são indexadas pelo id do save. Sem isso o perfil caía em
// baseAge(p.age = idade NA PROMOÇÃO) + anos desde o split 1 — o "subiu com 23,
// 1–2 temporadas depois está com 30+" (e o newgen ia de 17 para 32).
export function effectiveAge(
  p: Pick<Player, 'id' | 'nick' | 'age'>,
  split: number,
  youthAge?: Record<string, number>,
  youthDebut?: Record<string, YouthDebut>,
): number {
  const id = playerOrgId(p.id);
  const rg = parseRegenPlayerId(id) ?? parseNewgenId(id);
  if (rg) return rg.ageAtDebut + Math.floor(Math.max(0, split - rg.debut) / CAREER_SPLITS_PER_YEAR);
  const debut = youthDebut?.[id];
  if (debut) return ageFromDebut(debut, split);
  return ageFromCareerStart(baseAge(id === p.id ? p : { ...p, id }, youthAge), split);
}
