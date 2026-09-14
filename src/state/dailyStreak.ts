// [URG-4] STREAK DO DIÁRIO — persistência local (todo mundo) + espelho no
// servidor (conta logada). A regra vive em engine/daily/streak.ts; aqui é
// localStorage, fetch e o merge "o MAIOR vence" entre local e nuvem.

import { getToken } from './account';
import { dayKey, emptyStreak, mergeStreak, recordDailyPlay, type StreakState } from '../engine/daily/streak';

const KEY = 'rtm-daily-streak';

function normalize(v: unknown): StreakState {
  if (!v || typeof v !== 'object') return emptyStreak();
  const o = v as Partial<StreakState>;
  const current = Math.max(0, Math.floor(Number(o.current) || 0));
  const best = Math.max(current, Math.floor(Number(o.best) || 0));
  const lastDay = typeof o.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.lastDay) ? o.lastDay : null;
  return { current: lastDay ? current : 0, best, lastDay };
}

export function loadStreakState(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* corrompido/indisponível → zero */ }
  return emptyStreak();
}

function save(s: StreakState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage */ }
}

/** Registra "joguei hoje" (dia de SP). Idempotente no mesmo dia. */
export function recordStreakPlay(nowMs: number): StreakState {
  const next = recordDailyPlay(loadStreakState(), dayKey(nowMs));
  save(next);
  void syncStreakWithServer(next);
  return next;
}

// Espelho na nuvem: manda o local, recebe o merge do servidor e guarda o
// maior. Fire-and-forget — offline ou sem conta, o local basta.
let syncing = false;
export async function syncStreakWithServer(local: StreakState = loadStreakState()): Promise<StreakState> {
  const token = getToken();
  if (!token || syncing) return local;
  syncing = true;
  try {
    const r = await fetch('/api/ranking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'dailyStreak', token, current: local.current, best: local.best, lastDay: local.lastDay }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return local;
    const d = (await r.json()) as { streak?: unknown };
    const merged = mergeStreak(loadStreakState(), normalize(d.streak));
    save(merged);
    return merged;
  } catch { return local; }
  finally { syncing = false; }
}
