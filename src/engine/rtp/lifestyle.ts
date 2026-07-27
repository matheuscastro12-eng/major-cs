// RTP v16 — VIDA DE PRO: os gastos de LONGO PRAZO da carreira. Puro, sem React.
//
// Motivação (feedback de jogador): com 2-3 temporadas o setup + psicólogo maxam
// (~R$ 1M) e o dinheiro para de ter função. Este módulo dá destino ao salário de
// elite pelo resto da carreira:
//   1. MORADIA   — escada de 5 níveis (quarto dos pais → mansão com sala de
//                  treino). Compra única por nível, efeito SEMANAL de recuperação
//                  (energia + deriva mental). Topo custa R$ 2,4M.
//   2. CASA DA FAMÍLIA — compra única, cara e emocional: tirar a família do
//                  aluguel. Relação com a família salta, a deriva de moral ganha
//                  um bônus permanente e o LEGADO registra (você não esquece de
//                  onde veio — e o jogo também não).
//   3. INVESTIMENTOS — aporte/resgate livres; o montante rende toda semana com
//                  taxa SEMEADA (determinística por tick): maioria das semanas
//                  positiva, algumas no vermelho. Dinheiro parado agora trabalha.
//
// Mesmo padrão do setup.ts: ações de loja puras e imutáveis (não consomem ação
// semanal nem rng do save), efeitos aplicados no weeklyTick.

import { makeRng } from '../rng';
import type { GearTier, RoadToProSave, LifestyleState } from './types';
import type { RtpIconName } from './icons';

// ─────────────────────────────────────────────────────────────────────────────
// Estado (vive em save.lifestyle — interface em types.ts; migração v15→v16
// faz o backfill)

export function STARTER_LIFESTYLE(): LifestyleState {
  return { housing: 0, familyHome: false, invested: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Moradia

export interface HousingDef {
  tier: GearTier;
  label: string;
  icon: RtpIconName;
  blurb: string;
  price: number;           // custo pra COMPRAR este nível (0 = ponto de partida)
  energyBonus: number;     // +energia na virada da semana
  recoveryBonus: number;   // +deriva semanal de moral/foco (soma ao do psicólogo)
}

export const HOUSING_TIERS: HousingDef[] = [
  { tier: 0, label: 'Quarto na casa dos pais', icon: 'home', price: 0, energyBonus: 0, recoveryBonus: 0,
    blurb: 'Cama, PC e pôster na parede. Todo mundo começa de algum lugar.' },
  { tier: 1, label: 'Kitnet própria', icon: 'home', price: 45000, energyBonus: 2, recoveryBonus: 1,
    blurb: 'Seu primeiro canto. Silêncio pra dormir e treinar sem hora pra parar.' },
  { tier: 2, label: 'Apê gamer', icon: 'home', price: 220000, energyBonus: 4, recoveryBonus: 2,
    blurb: 'Quarto de setup dedicado, ar-condicionado e cadeira que não range.' },
  { tier: 3, label: 'Cobertura', icon: 'home', price: 750000, energyBonus: 6, recoveryBonus: 3,
    blurb: 'Vista da cidade, academia no prédio e paz de campeão.' },
  { tier: 4, label: 'Mansão com sala de treino', icon: 'trophy', price: 2400000, energyBonus: 8, recoveryBonus: 4,
    blurb: 'Sala de treino profissional em casa. O bootcamp é no SEU endereço.' },
];

export function housingDef(tier: GearTier): HousingDef {
  return HOUSING_TIERS[tier] ?? HOUSING_TIERS[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Casa da família

export const FAMILY_HOME_PRICE = 350000;
export const FAMILY_HOME_REL_BOOST = 30;    // salto imediato na relação
export const FAMILY_HOME_RECOVERY = 2;      // +deriva de moral permanente

// ─────────────────────────────────────────────────────────────────────────────
// Investimentos — rendimento semanal semeado (determinístico por tick)

export const INVEST_STEPS = [10000, 50000, 250000] as const;  // botões de aporte

// Taxa da semana: -0,3%..+1,1% (média ~+0,4%/sem ≈ 23% a.a.) — na MAIORIA das
// semanas rende, mas o vermelho existe: investir não é cofre, é decisão.
export function investRate(seed: number, tick: number): number {
  const rng = makeRng(((seed ^ 0x1f7e57) ^ Math.imul(tick, 0x9e3779b1)) >>> 0);
  return -0.003 + rng() * 0.014;
}

export function investYield(invested: number, seed: number, tick: number): number {
  if (invested <= 0) return 0;
  return Math.round(invested * investRate(seed, tick));
}

// Virada de semana dos investimentos: o rendimento COMPÕE no montante aplicado
// (não pinga no bolso — resgatar é decisão sua). Chamado pelo turnWeek
// (weekly.ts — a virada canônica), sempre pós-bump do tick.
export function investWeekTick(save: RoadToProSave): RoadToProSave {
  const invested = save.lifestyle.invested;
  if (invested <= 0) return save;
  const gain = investYield(invested, save.rng.seed, save.rng.tick);
  if (gain === 0) return save;
  return { ...save, lifestyle: { ...save.lifestyle, invested: Math.max(0, invested + gain) } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Efeitos semanais agregados (consumidos pelo weeklyTick)

export function lifestyleWeeklyMods(ls: LifestyleState): { energyBonus: number; recoveryBonus: number } {
  const h = housingDef(ls.housing);
  return {
    energyBonus: h.energyBonus,
    recoveryBonus: h.recoveryBonus + (ls.familyHome ? FAMILY_HOME_RECOVERY : 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ações de loja (puras, imutáveis)

export interface LifestyleResult { ok: boolean; save: RoadToProSave; reason?: string; feedback?: string }

export function buyHousing(save: RoadToProSave): LifestyleResult {
  const cur = save.lifestyle.housing;
  if (cur >= 4) return { ok: false, save, reason: 'Você já mora no topo.' };
  const next = housingDef((cur + 1) as GearTier);
  if (save.life.money < next.price) return { ok: false, save, reason: 'Dinheiro insuficiente.' };
  return {
    ok: true,
    feedback: next.label,
    save: {
      ...save,
      life: { ...save.life, money: save.life.money - next.price },
      lifestyle: { ...save.lifestyle, housing: next.tier },
    },
  };
}

export function buyFamilyHome(save: RoadToProSave): LifestyleResult {
  if (save.lifestyle.familyHome) return { ok: false, save, reason: 'A família já tem casa própria.' };
  if (save.life.money < FAMILY_HOME_PRICE) return { ok: false, save, reason: 'Dinheiro insuficiente.' };
  return {
    ok: true,
    feedback: 'Escritura no nome da família',
    save: {
      ...save,
      life: {
        ...save.life,
        money: save.life.money - FAMILY_HOME_PRICE,
        morale: Math.min(100, save.life.morale + 10),
        rel: { ...save.life.rel, family: Math.min(100, save.life.rel.family + FAMILY_HOME_REL_BOOST) },
      },
      lifestyle: { ...save.lifestyle, familyHome: true },
    },
  };
}

export function invest(save: RoadToProSave, amount: number): LifestyleResult {
  const v = Math.floor(amount);
  if (v <= 0) return { ok: false, save, reason: 'Valor inválido.' };
  if (save.life.money < v) return { ok: false, save, reason: 'Dinheiro insuficiente.' };
  return {
    ok: true,
    feedback: `Aporte de R$ ${v.toLocaleString('pt-BR')}`,
    save: {
      ...save,
      life: { ...save.life, money: save.life.money - v },
      lifestyle: { ...save.lifestyle, invested: save.lifestyle.invested + v },
    },
  };
}

export function redeem(save: RoadToProSave, amount?: number): LifestyleResult {
  const total = save.lifestyle.invested;
  if (total <= 0) return { ok: false, save, reason: 'Nada aplicado.' };
  const v = Math.min(total, Math.floor(amount ?? total));
  if (v <= 0) return { ok: false, save, reason: 'Valor inválido.' };
  return {
    ok: true,
    feedback: `Resgate de R$ ${v.toLocaleString('pt-BR')}`,
    save: {
      ...save,
      life: { ...save.life, money: save.life.money + v },
      lifestyle: { ...save.lifestyle, invested: total - v },
    },
  };
}
