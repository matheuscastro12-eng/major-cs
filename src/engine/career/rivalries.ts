import type { SeriesResult, TTeam } from '../../types';

export const RIVALRY_THRESHOLD = 4;

export function rivalryScore(book: Record<string, number> | undefined, opponentId: string): number {
  return Math.max(0, book?.[opponentId] ?? 0);
}

export function recordRivalry(
  book: Record<string, number> | undefined,
  opponentId: string,
  series: SeriesResult,
): { rivalries: Record<string, number>; before: number; score: number; becameRival: boolean } {
  const before = rivalryScore(book, opponentId);
  const roundGap = series.maps.reduce((total, map) => total + Math.abs(map.score[0] - map.score[1]), 0);
  const closeSeries = roundGap <= series.maps.length * 6;
  const score = Math.min(12, before + 1 + (closeSeries ? 1 : 0));
  return {
    rivalries: { ...(book ?? {}), [opponentId]: score },
    before,
    score,
    becameRival: before < RIVALRY_THRESHOLD && score >= RIVALRY_THRESHOLD,
  };
}

export function rivalryLabel(score: number): 'none' | 'rising' | 'classic' | 'historic' {
  if (score >= 9) return 'historic';
  if (score >= 6) return 'classic';
  if (score >= RIVALRY_THRESHOLD) return 'rising';
  return 'none';
}

export function applyRivalryFocus(team: TTeam, score: number): TTeam {
  if (score < RIVALRY_THRESHOLD) return team;
  const focus = Math.min(1.8, 0.6 + (score - RIVALRY_THRESHOLD) * 0.2);
  return { ...team, strength: team.strength + focus };
}
