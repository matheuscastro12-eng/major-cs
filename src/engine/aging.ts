// Aging — T3.9 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Players envelhecem ao longo dos splits (~1 ano por split do CS profissional).
// Pico de habilidade depende do ROLE:
//   - Entry/Duelist: pico cedo (22), declina rápido (reflexos)
//   - Rifler/AWP:    pico ~24, declina moderado
//   - Support/Lurker: pico ~26, declina lento (jogo passa pela cabeça)
//   - IGL:           pico ~27, declina muito lento (xadrez tático)
//
// Após o peak, OVR declina ~0.5/ano até 30, depois acelera (1.5/ano após 32).
// Acima de 33 com OVR < 65 vira candidato a aposentadoria.
//
// Funções PURAS. O CareerScreen chama `tickAging(state, rng)` no advanceSplit
// e aplica os deltas/retirees ao squad/youth.

import type { Role } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export interface AgingState {
  /** Split atual */
  split: number;
  /** Lista de playerIds já aposentados (não recebe mais decline) */
  retired?: string[];
  /** Snapshot dos OVR atuais dos players (calculado em runtime) */
  players: { id: string; nick: string; ovr: number; age: number; role: Role }[];
}

export interface AgingResult {
  /** Deltas no OVR — `evo` (acumulado no save). Negativo = declínio. */
  ovrDeltas: Record<string, number>;
  /** Players novos aposentados (com nick pra notícia) */
  newRetirees: { id: string; nick: string; age: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Peak por role

const PEAK_AGES: Record<Role, number> = {
  Entry: 22,
  AWP: 24,
  Rifler: 24,
  Support: 26,
  Lurker: 26,
  IGL: 27,
};

export function peakAgeForRole(role: Role): number {
  return PEAK_AGES[role] ?? 24;
}

// ─────────────────────────────────────────────────────────────────────────────
// Curva de decline
//
// Antes do peak → ainda evolui (delta positivo)
// No peak (±1 ano) → estável
// Após peak → declina, acelera após 32

export function ovrDeltaForSplit(role: Role, age: number, currentOvr: number): number {
  const peak = peakAgeForRole(role);
  const yearsAfterPeak = age - peak;

  // Ainda jovem (pre-peak) — engine de evolução existente já dá ganho.
  // Aqui só consideramos DECLINE quando passou do peak.
  if (yearsAfterPeak < 1) return 0;

  // Curva: 0.5/ano após peak até idade 32; depois 1.5/ano
  let baseDecline = 0;
  for (let y = 1; y <= yearsAfterPeak; y++) {
    const ageAtYear = peak + y;
    if (ageAtYear < 32) baseDecline += 0.5;
    else baseDecline += 1.5;
  }
  // Mas isso seria o TOTAL cumulativo desde o peak — não queremos. Queremos
  // o delta DESTE split. Que é só a parcela do último ano:
  const thisYearDecline = age < 32 ? 0.5 : 1.5;

  // Player com OVR já baixo (<70) declina menos (já está no chão)
  const ovrCushion = currentOvr < 70 ? 0.5 : 1.0;

  void baseDecline; // kept for clarity; cumulative cálculo
  return -Math.round(thisYearDecline * ovrCushion * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retirement

const MIN_AGE_TO_RETIRE = 31;
const MAX_OVR_TO_RETIRE = 70;
const ELITE_OVR_KEEP_PLAYING = 86; // OVR ≥ 86 nunca se aposenta automaticamente

export function shouldRetire(age: number, ovr: number): boolean {
  if (age < MIN_AGE_TO_RETIRE) return false;
  if (ovr >= ELITE_OVR_KEEP_PLAYING) return false;
  if (ovr > MAX_OVR_TO_RETIRE) return age >= 35; // só super-veteranos
  // 31+ e OVR < 70 → bem provável
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick principal

/**
 * Calcula deltas de OVR + aposentadorias pra todos os players do snapshot.
 * Pure: não muta nada. CareerScreen aplica os retornos no save.
 */
export function tickAging(state: AgingState): AgingResult {
  const ovrDeltas: Record<string, number> = {};
  const newRetirees: { id: string; nick: string; age: number }[] = [];
  const retiredSet = new Set(state.retired ?? []);

  for (const p of state.players) {
    if (retiredSet.has(p.id)) continue;

    const delta = ovrDeltaForSplit(p.role, p.age, p.ovr);
    if (delta !== 0) ovrDeltas[p.id] = delta;

    if (shouldRetire(p.age, p.ovr)) {
      newRetirees.push({ id: p.id, nick: p.nick, age: p.age });
    }
  }

  return { ovrDeltas, newRetirees };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers

export function retirementChipLabel(age: number): string {
  if (age >= 35) return `Aposentado · ${age} anos`;
  return `Aposentado · ${age} anos (cedo)`;
}
