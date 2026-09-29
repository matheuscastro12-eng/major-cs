import type { TPlayer } from '../../types';
import { personalityFatigueDelta } from './personality';

export const BURNOUT_THRESHOLD = 80;

export function careerPlayerId(runtimeId: string): string {
  return runtimeId.startsWith('user__') ? runtimeId.slice('user__'.length) : runtimeId;
}

export function fatigueBand(value: number): 'fresh' | 'loaded' | 'tired' | 'burnout' {
  if (value >= BURNOUT_THRESHOLD) return 'burnout';
  if (value >= 58) return 'tired';
  if (value >= 32) return 'loaded';
  return 'fresh';
}

// A forma pela fadiga (applyFatigueForm) e a recuperação (recoverFatigue) viraram
// CONDIÇÃO (fitness/ritmo) na fase 2: engine/gestao/condicao.ts (motor) e
// engine/gestao/treino.ts (recoverCondition). Aqui fica a carga por série, pura
// sobre o mapa de fadiga (0–100); a Carreira converte para fitness na borda.
export function updateMatchFatigue(
  previous: Record<string, number> | undefined,
  players: TPlayer[],
  mapsPlayed: number,
  reducedLoad: string[] | undefined,
  morale: Record<string, number> | undefined,
  recoveryBonus = 0,
): { fatigue: Record<string, number>; newBurnouts: string[] } {
  const fatigue = { ...(previous ?? {}) };
  const resting = new Set(reducedLoad ?? []);
  const newBurnouts: string[] = [];
  for (const player of players) {
    const id = careerPlayerId(player.id);
    const before = fatigue[id] ?? 0;
    const mood = morale?.[id] ?? 70;
    const moodLoad = mood < 35 ? 2 : mood >= 78 ? -1 : 0;
    const delta = resting.has(id) ? -(8 + recoveryBonus) : 4 + mapsPlayed * 2 + moodLoad + personalityFatigueDelta(id) - recoveryBonus;
    const next = Math.max(0, Math.min(100, Math.round(before + delta)));
    fatigue[id] = next;
    if (before < BURNOUT_THRESHOLD && next >= BURNOUT_THRESHOLD) newBurnouts.push(player.nick);
  }
  return { fatigue, newBurnouts };
}
