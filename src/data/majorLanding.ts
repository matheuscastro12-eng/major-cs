// Landing (rota /) durante o PGL Major Singapore: qual hero mostrar, em que
// fase o Major está e quais portas/modos entram em cada seção. Lógica pura
// (o tempo entra por parâmetro) testada em scripts/test-landing-major.mts.
//
// A landing está no chunk inicial (vite.config.ts): este módulo NÃO pode
// importar data/major-singapore-2026.json nem o engine do Major. Os favoritos
// abaixo são uma cópia pequena do painel "Favoritos (1.000 simulações)" do
// Modo Major (titleOdds(D, 1000), seed 1) e o teste recalcula e compara: quem
// atualizar o JSON (lista oficial em 02/11) vê o teste apontar os números novos.
import { majorPromoOn } from './majorWindow';

// 00:00 de Brasília (UTC-3) de cada data do JSON (event.start / playoffsStart / end)
export const MAJOR_SG_START_MS = Date.UTC(2026, 10, 24, 3, 0, 0);    // 24/11/2026
export const MAJOR_SG_PLAYOFFS_MS = Date.UTC(2026, 11, 10, 3, 0, 0); // 10/12/2026
export const MAJOR_SG_FINAL_MS = Date.UTC(2026, 11, 13, 3, 0, 0);    // 13/12/2026
const DAY_MS = 86_400_000;

/** Régua do hero: início (Stage 1), playoffs e final. `label` em pt (a UI passa por ct). */
export const MAJOR_SG_MILESTONES = [
  { ms: MAJOR_SG_START_MS, date: '24/11', label: 'Stage 1' },
  { ms: MAJOR_SG_PLAYOFFS_MS, date: '10/12', label: 'Playoffs' },
  { ms: MAJOR_SG_FINAL_MS, date: '13/12', label: 'Final' },
] as const;

/** Quantos marcos da régua já chegaram (0 antes de 24/11, 3 no dia da final). */
export function milestonesReached(nowMs: number): number {
  return MAJOR_SG_MILESTONES.filter((m) => nowMs >= m.ms).length;
}

/** 'major' enquanto a vitrine do Modo Major estiver no ar (e o App souber abrir o modo). */
export type LandingHero = 'major' | 'geral';

export function landingHero(nowMs: number, canOpenMajor: boolean): LandingHero {
  return canOpenMajor && majorPromoOn(nowMs) ? 'major' : 'geral';
}

/** Onde o Major está agora: falta quanto, stages suíços, playoffs ou acabou. */
export type MajorPhase =
  | { kind: 'pre'; days: number }
  | { kind: 'stages' }
  | { kind: 'playoffs' }
  | { kind: 'over' };

export function majorPhase(nowMs: number): MajorPhase {
  if (nowMs < MAJOR_SG_START_MS) return { kind: 'pre', days: Math.max(1, Math.ceil((MAJOR_SG_START_MS - nowMs) / DAY_MS)) };
  if (nowMs < MAJOR_SG_PLAYOFFS_MS) return { kind: 'stages' };
  if (majorPromoOn(nowMs)) return { kind: 'playoffs' };
  return { kind: 'over' };
}

// ── portas ("Em 1 minuto") e modos (seção compacta) ─────────────────────────
// Durante o Major: Modo Major (~1 min), Diário (2 min) e Draft (~15 min), os
// mesmos tempos do onboarding (onboard.*Meta) e dos cards do Início. Depois:
// Diário, Draft e Carreira. O que não é porta vai pra seção compacta.
export type LandingDoorId = 'major' | 'diario' | 'draft' | 'carreira';
/** Porta que o App abre (o Modo Major tem o próprio onMajor). */
export type LandingDoor = Exclude<LandingDoorId, 'major'>;
export type LandingModeId = 'carreira' | 'rtp' | 'ultimate' | 'online';

export function landingDoors(hero: LandingHero): LandingDoorId[] {
  return hero === 'major' ? ['major', 'diario', 'draft'] : ['diario', 'draft', 'carreira'];
}

export function landingModes(hero: LandingHero): LandingModeId[] {
  const doors = new Set<string>(landingDoors(hero));
  return (['carreira', 'rtp', 'ultimate', 'online'] as const).filter((m) => !doors.has(m));
}

// ── favoritos (cópia do painel do Modo Major; conferida pelo teste) ─────────
export interface MajorFavorite { id: string; tag: string; name: string; /** chance de título, % com 1 casa */ pct: number }

export const MAJOR_FAVORITES: {
  runs: number;
  /** 'projecao' até a lista oficial (listDate); depois 'oficial' */
  status: 'projecao' | 'oficial';
  listDate: string;
  teams: MajorFavorite[];
} = {
  runs: 1000,
  status: 'projecao',
  listDate: '2026-11-02',
  teams: [
    { id: 'team-vitality', tag: 'VIT', name: 'Team Vitality', pct: 31.6 },
    { id: 'team-spirit', tag: 'TS', name: 'Team Spirit', pct: 24.0 },
    { id: 'team-falcons', tag: 'FLC', name: 'Team Falcons', pct: 15.4 },
    { id: 'furia', tag: 'FURIA', name: 'FURIA', pct: 10.0 },
  ],
};
