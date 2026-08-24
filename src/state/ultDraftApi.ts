// DRAFT DO DIA (Ultimate) — cliente do ranking diário (api/ranking.ts).
// A 1ª run do dia usa a seed global (todo mundo no mesmo draft); o servidor é
// a autoridade (PK day+email, primeiro report vale). Mesmo padrão do
// dailySeriesApi da Série do Dia.

import { getToken } from './account';

export interface UltDraftRow { rank: number; nick: string; wins: number; ovr: number }
export interface UltDraftBoard { day: number; total: number; ladder: UltDraftRow[] }

export async function fetchUltDraftBoard(day?: number): Promise<UltDraftBoard | null> {
  try {
    const r = await fetch(`/api/ranking?action=ultDraftBoard${day ? `&day=${day}` : ''}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return (await r.json()) as UltDraftBoard;
  } catch { return null; }
}

// Reporta o resultado do run diário. null = deslogado (convidado não rankeia)
// ou rede fora — o run em si não depende disso (fire-and-forget do caller).
export async function reportUltDraft(day: number, wins: number, ovr: number): Promise<{ rank: number; duplicate: boolean } | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const r = await fetch('/api/ranking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'ultDraftReport', token, day, wins, ovr }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { rank?: number; duplicate?: boolean };
    return { rank: Number(d.rank ?? 0) || 0, duplicate: !!d.duplicate };
  } catch { return null; }
}
