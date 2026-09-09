// [W1] Pódio SEMANAL da Série do Dia — cliente do claim (api/ranking.ts).
// O servidor grava o claim (PK week+email — idempotente) e devolve só os selos
// NOVOS; o CALLER aplica no save (applyWeeklyTitles) — padrão coinsClaim.

import { getToken } from './account';
import type { WeeklyTitle } from '../engine/rtp/types';

export async function claimWeeklyTitles(): Promise<WeeklyTitle[]> {
  const token = getToken();
  if (!token) return [];
  try {
    const r = await fetch('/api/ranking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'dailyWeekClaim', token }),
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { titles?: { week: number; place: number }[] };
    return (Array.isArray(d.titles) ? d.titles : [])
      .filter((t) => t.week >= 1 && (t.place === 1 || t.place === 2 || t.place === 3))
      .map((t) => ({ week: t.week, place: t.place as 1 | 2 | 3 }));
  } catch { return []; }
}

// pódio da última semana fechada (público, cacheado) — prova social.
export interface WeekPodiumRow { place: number; nick: string; pts: number; days: number; wins: number }
export interface WeekPodium { week: number; total: number; podium: WeekPodiumRow[] }

export async function fetchWeekPodium(week?: number): Promise<WeekPodium | null> {
  try {
    const r = await fetch(`/api/ranking?action=dailyWeekChampions${week ? `&week=${week}` : ''}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as WeekPodium;
  } catch { return null; }
}
