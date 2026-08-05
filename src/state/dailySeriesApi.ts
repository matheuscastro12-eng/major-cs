// SÉRIE DO DIA — cliente do ranking diário (api/ranking.ts) + trava local de
// "1 jogada por dia". O servidor é a autoridade (PK day+email, primeiro vale);
// o localStorage só evita re-jogar de bobeira na mesma máquina.

import { getToken } from './account';

export interface DailyLadderRow { rank: number; nick: string; rating: number; won: boolean; mapScore: [number, number] }
export interface DailyLadder { day: number; total: number; ladder: DailyLadderRow[] }

export async function fetchDailyLadder(day?: number): Promise<DailyLadder | null> {
  try {
    const r = await fetch(`/api/ranking?action=dailyLadder${day ? `&day=${day}` : ''}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as DailyLadder;
  } catch { return null; }
}

export async function reportDailySeries(day: number, rating: number, won: boolean, mapScore: [number, number]): Promise<{ rank: number; duplicate: boolean } | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const r = await fetch('/api/ranking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'dailyReport', token, day, rating, won, mapA: mapScore[0], mapB: mapScore[1] }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { rank?: number; duplicate?: boolean };
    return { rank: Number(d.rank ?? 0) || 0, duplicate: !!d.duplicate };
  } catch { return null; }
}

// trava local: resultado do dia já jogado nesta máquina (+ streak simples).
const KEY = 'rtm-serie-do-dia-v1';
export interface DailyPlayed { day: number; rating: number; won: boolean; mapScore: [number, number]; rank: number | null; streak: number }

export function loadDailyPlayed(day: number): DailyPlayed | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DailyPlayed;
    return d.day === day ? d : null;
  } catch { return null; }
}

export function saveDailyPlayed(p: DailyPlayed): void {
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DailyPlayed | null;
    // streak: ontem jogado → soma; buraco → recomeça.
    const streak = prev && prev.day === p.day - 1 ? (prev.streak || 1) + 1 : prev?.day === p.day ? prev.streak : 1;
    localStorage.setItem(KEY, JSON.stringify({ ...p, streak }));
  } catch { /* sem storage */ }
}
