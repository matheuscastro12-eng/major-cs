import type { TPlayer, TTeam } from '../../types';

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

export function applyFatigueForm(
  team: TTeam,
  fatigue: Record<string, number> | undefined,
  reducedLoad: string[] | undefined,
): TTeam {
  if (!team.isUser) return team;
  const resting = new Set(reducedLoad ?? []);
  return {
    ...team,
    players: team.players.map((player) => {
      const id = careerPlayerId(player.id);
      const load = fatigue?.[id] ?? 0;
      const fatiguePenalty = Math.max(0, load - 30) * 0.00145;
      const reducedLoadPenalty = resting.has(id) ? 0.018 : 0;
      return { ...player, form: Math.max(0.88, Math.min(1.12, (player.form ?? 1) * (1 - fatiguePenalty - reducedLoadPenalty))) };
    }),
  };
}

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
    const delta = resting.has(id) ? -(8 + recoveryBonus) : 4 + mapsPlayed * 2 + moodLoad - recoveryBonus;
    const next = Math.max(0, Math.min(100, Math.round(before + delta)));
    fatigue[id] = next;
    if (before < BURNOUT_THRESHOLD && next >= BURNOUT_THRESHOLD) newBurnouts.push(player.nick);
  }
  return { fatigue, newBurnouts };
}

export function recoverFatigue(previous: Record<string, number> | undefined, amount: number): Record<string, number> {
  return Object.fromEntries(Object.entries(previous ?? {}).map(([id, value]) => [id, Math.max(0, Math.round(value - amount))]));
}
