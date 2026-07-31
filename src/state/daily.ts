// DIÁRIO — persistência local dos minigames diários (progresso do dia + streak).
// localStorage puro, um namespace só ('rtm-daily-v1'), tolerante a corrupção.
// Sem cloud de propósito: o Diário é grátis e sem conta — atrito zero.

import { dateKeyOf, type LinesProgress } from '../engine/daily/lines';

const KEY = 'rtm-daily-v1';

export interface DailyStreak {
  lastDate: string;   // último dia COMPLETADO (won)
  streak: number;     // dias seguidos completando
  best: number;
  plays: number;      // total de dias jogados (won ou não)
  wins: number;
}

interface DailyStore {
  // progresso por jogo/dia — só guardamos o dia corrente (histórico não importa)
  progress: Record<string, { dateKey: string; p: LinesProgress }>;
  streaks: Record<string, DailyStreak>;
}

function load(): DailyStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DailyStore;
  } catch { /* corrompido/indisponível → recomeça */ }
  return { progress: {}, streaks: {} };
}

function save(s: DailyStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage */ }
}

export function loadDailyProgress(gameId: string, dateKey: string): LinesProgress | null {
  const s = load();
  const cur = s.progress[gameId];
  return cur && cur.dateKey === dateKey ? cur.p : null;
}

export function saveDailyProgress(gameId: string, dateKey: string, p: LinesProgress): void {
  const s = load();
  s.progress[gameId] = { dateKey, p };
  // fechou o dia com vitória → streak (ontem completa a sequência; hoje repetido é no-op)
  if (p.done) {
    const st = s.streaks[gameId] ?? { lastDate: '', streak: 0, best: 0, plays: 0, wins: 0 };
    if (st.lastDate !== dateKey) {
      st.plays += 1;
      if (p.won) {
        const yesterday = dateKeyOf(new Date(new Date(`${dateKey}T12:00:00`).getTime() - 86_400_000));
        st.streak = st.lastDate === yesterday ? st.streak + 1 : 1;
        st.best = Math.max(st.best, st.streak);
        st.wins += 1;
      } else {
        st.streak = 0;
      }
      st.lastDate = dateKey;
      s.streaks[gameId] = st;
    }
  }
  save(s);
}

export function loadDailyStreak(gameId: string): DailyStreak {
  return load().streaks[gameId] ?? { lastDate: '', streak: 0, best: 0, plays: 0, wins: 0 };
}
