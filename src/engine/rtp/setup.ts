// RTP v6 — SETUP: periféricos + psicólogo. Puro, sem React.
//
// Filosofia (pedido do usuário): você começa TODO SUCATEADO (tier 0 em tudo) e
// vai melhorando conforme ganha dinheiro e evolui a carreira. O gear impacta
// DIRETO o desempenho: cada slot dá (a) bônus de TREINO na sua categoria
// (catBonus, cumulativo) e (b) um delta de CONDIÇÃO em partida (mod). No tier 0
// (sucata) cada slot ainda PESA CONTRA — a barra começa negativa, e escapar dela
// é o primeiro objetivo. O psicólogo é um trilho à parte: resistência a tilt,
// recuperação semanal e um bônus de composição em partida (mediante mensalidade).
//
// Tudo é INCREMENTAL: ter tier 3 = soma dos efeitos de tier 1+2+3.

import type { TrainFocus } from './weekly';
import type { ConditionFactor } from './matchSim';
import type { PeripheralSlot, GearTier, SetupState } from './types';
import type { RtpIconName } from './icons';

export const GEAR_SLOTS: PeripheralSlot[] = [
  'mouse', 'keyboard', 'monitor', 'headset', 'mousepad', 'chair', 'pc', 'internet',
];

// Nomes de tier compartilhados (0 = sucata … 4 = elite).
export const TIER_NAMES = ['Sucata', 'Básico', 'Intermediário', 'Avançado', 'Elite'] as const;

export interface PeripheralDef {
  slot: PeripheralSlot;
  label: string;
  icon: RtpIconName;
  cat: TrainFocus | null;       // categoria de treino beneficiada (null = só partida)
  blurb: string;                // o que esse periférico faz por você
  prices: number[];             // custo pra subir PRA tier 1,2,3,4 (4 valores)
  trainPer: number;             // fração somada ao catBonus por tier (cumulativa)
  matchPer: number;             // delta de condição (%) por tier (cumulativa)
  t0Penalty: number;            // delta de condição (%) NEGATIVO enquanto tier 0
}

// ── Tabela dos 8 periféricos ────────────────────────────────────────────────
// Balance (validado contra o teto de condição e a escada de premiação):
//  • setup elite completo ≈ +0.06 de mod em partida (soma dos matchPer×4)
//  • setup todo sucata     ≈ −0.064 de mod (soma dos t0Penalty) — o boot dói
//  • cada categoria de treino chega a ~+12% no full (catBonus)
export const PERIPHERALS: PeripheralDef[] = [
  { slot: 'mouse', label: 'Mouse', icon: 'mouse', cat: 'mechanical',
    blurb: 'Sensor e clique — mira e flick.',
    prices: [2500, 8000, 28000, 95000], trainPer: 0.018, matchPer: 0.20, t0Penalty: -1.0 },
  { slot: 'keyboard', label: 'Teclado', icon: 'keyboard', cat: 'mechanical',
    blurb: 'Resposta de tecla — movimento e spray.',
    prices: [1500, 5000, 16000, 52000], trainPer: 0.008, matchPer: 0.10, t0Penalty: -0.5 },
  { slot: 'mousepad', label: 'Mousepad', icon: 'pad', cat: 'mechanical',
    blurb: 'Deslize consistente — controle fino.',
    prices: [400, 1200, 4000, 12000], trainPer: 0.004, matchPer: 0.07, t0Penalty: -0.3 },
  { slot: 'monitor', label: 'Monitor', icon: 'monitor', cat: 'mental',
    blurb: 'Hz e clareza — você LÊ o round melhor.',
    prices: [3500, 12000, 40000, 130000], trainPer: 0.018, matchPer: 0.30, t0Penalty: -1.2 },
  { slot: 'headset', label: 'Headset', icon: 'headset', cat: 'mental',
    blurb: 'Áudio posicional — info e calls.',
    prices: [1200, 4500, 15000, 48000], trainPer: 0.012, matchPer: 0.17, t0Penalty: -0.5 },
  { slot: 'chair', label: 'Cadeira', icon: 'chair', cat: 'physical',
    blurb: 'Postura — menos fadiga, mais stamina.',
    prices: [1500, 5000, 16000, 52000], trainPer: 0.015, matchPer: 0.07, t0Penalty: -0.5 },
  { slot: 'pc', label: 'PC', icon: 'pc', cat: 'physical',
    blurb: 'FPS estável — input limpo o jogo todo.',
    prices: [4000, 14000, 45000, 150000], trainPer: 0.015, matchPer: 0.27, t0Penalty: -1.0 },
  { slot: 'internet', label: 'Internet', icon: 'wifi', cat: null,
    blurb: 'Ping baixo — sem lag nas trocas.',
    prices: [800, 2500, 8000, 24000], trainPer: 0, matchPer: 0.33, t0Penalty: -1.4 },
];

export function peripheralDef(slot: PeripheralSlot): PeripheralDef {
  return PERIPHERALS.find((p) => p.slot === slot) ?? PERIPHERALS[0];
}

// ── Psicólogo ───────────────────────────────────────────────────────────────
export interface PsychTierDef {
  tier: GearTier;
  label: string;
  buyPrice: number;     // custo único pra subir pra este tier
  retainer: number;     // R$/semana debitado no weeklyTick
  tiltResist: number;   // 0..1 — suaviza a queda de moral pós-derrota
  recovery: number;     // +moral/foco na deriva semanal
  matchPct: number;     // fator "Mentalidade" de condição (delta)
}

export const PSYCH_TIERS: PsychTierDef[] = [
  { tier: 0, label: 'Sem psicólogo', buyPrice: 0, retainer: 0, tiltResist: 0, recovery: 0, matchPct: 0 },
  { tier: 1, label: 'Psicólogo iniciante', buyPrice: 8000, retainer: 300, tiltResist: 0.15, recovery: 2, matchPct: 0.8 },
  { tier: 2, label: 'Psicólogo experiente', buyPrice: 25000, retainer: 700, tiltResist: 0.30, recovery: 3, matchPct: 1.5 },
  { tier: 3, label: 'Psicólogo de equipe', buyPrice: 60000, retainer: 1500, tiltResist: 0.45, recovery: 4, matchPct: 2.2 },
  { tier: 4, label: 'Psicólogo de elite', buyPrice: 150000, retainer: 3000, tiltResist: 0.60, recovery: 5, matchPct: 3.0 },
];

export function psychDef(tier: GearTier): PsychTierDef {
  return PSYCH_TIERS[tier] ?? PSYCH_TIERS[0];
}

// ── Factory do setup inicial (TUDO sucata) — fresh object por chamada ────────
export function STARTER_SETUP(): SetupState {
  return {
    gear: { mouse: 0, keyboard: 0, monitor: 0, headset: 0, mousepad: 0, chair: 0, pc: 0, internet: 0 },
    psychTier: 0,
  };
}

// Nível agregado do setup (0..36) pra barra de progresso.
export function setupLevel(setup: SetupState): number {
  const g = GEAR_SLOTS.reduce((a, s) => a + (setup.gear[s] ?? 0), 0);
  return g + (setup.psychTier ?? 0);
}

// ── Modificadores de TREINO (consumido por weekly.applyTraining) ─────────────
// trainScale fica SEMPRE 1: todo o efeito flui pelo catBonus (anti double-dip).
export function setupTrainingMods(setup: SetupState): {
  trainScale: number;
  catBonus: Record<TrainFocus, number>;
} {
  const catBonus: Record<TrainFocus, number> = { mechanical: 0, mental: 0, physical: 0 };
  for (const def of PERIPHERALS) {
    if (!def.cat) continue;
    const tier = setup.gear[def.slot] ?? 0;
    if (tier > 0) catBonus[def.cat] += def.trainPer * tier;   // cumulativo (linear)
  }
  return { trainScale: 1, catBonus };
}

// Delta de condição agregado do gear (soma de todos os slots). Tier 0 aplica a
// penalidade de sucata; tier ≥1 aplica matchPer×tier.
export function gearMatchDelta(setup: SetupState): number {
  let d = 0;
  for (const def of PERIPHERALS) {
    const tier = setup.gear[def.slot] ?? 0;
    d += tier === 0 ? def.t0Penalty : def.matchPer * tier;
  }
  return Math.round(d * 100) / 100;
}

// ── Modificadores de CONDIÇÃO (consumido por matchSim.conditionModifiers) ────
export function setupConditionMods(setup: SetupState): {
  factors: ConditionFactor[];
  recoveryBonus: number;
  tiltResist: number;
} {
  const factors: ConditionFactor[] = [];
  const gd = gearMatchDelta(setup);
  if (Math.abs(gd) >= 0.05) {
    factors.push({ label: gd >= 0 ? 'Setup afiado' : 'Setup sucateado', delta: gd, good: gd >= 0 });
  }
  const psy = psychDef(setup.psychTier ?? 0);
  if (psy.matchPct > 0) {
    factors.push({ label: 'Mentalidade (psicólogo)', delta: psy.matchPct, good: true });
  }
  return { factors, recoveryBonus: psy.recovery, tiltResist: psy.tiltResist };
}

// ── Ações de loja (puras, imutáveis — NÃO consomem ação semanal nem rng) ─────
export interface BuyResult { ok: boolean; save: import('./types').RoadToProSave; reason?: string; feedback?: string; }

export function buyGear(save: import('./types').RoadToProSave, slot: PeripheralSlot): BuyResult {
  const def = peripheralDef(slot);
  const cur = save.setup.gear[slot] ?? 0;
  if (cur >= 4) return { ok: false, save, reason: 'Já está no nível máximo.' };
  const price = def.prices[cur];               // preço pra subir PRA cur+1
  if (save.life.money < price) return { ok: false, save, reason: 'Dinheiro insuficiente.' };
  const nextTier = (cur + 1) as GearTier;
  return {
    ok: true,
    feedback: `${def.label} → ${TIER_NAMES[nextTier]}`,
    save: {
      ...save,
      life: { ...save.life, money: save.life.money - price },
      setup: { ...save.setup, gear: { ...save.setup.gear, [slot]: nextTier } },
    },
  };
}

export function hirePsych(save: import('./types').RoadToProSave): BuyResult {
  const cur = save.setup.psychTier ?? 0;
  if (cur >= 4) return { ok: false, save, reason: 'Já tem o melhor psicólogo.' };
  const next = psychDef((cur + 1) as GearTier);
  if (save.life.money < next.buyPrice) return { ok: false, save, reason: 'Dinheiro insuficiente.' };
  return {
    ok: true,
    feedback: next.label,
    save: {
      ...save,
      life: { ...save.life, money: save.life.money - next.buyPrice },
      setup: { ...save.setup, psychTier: (cur + 1) as GearTier },
    },
  };
}
