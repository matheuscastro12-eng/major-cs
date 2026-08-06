// DIÁRIO — persistência local dos minigames diários (progresso do dia + streak).
// localStorage puro, um namespace só ('rtm-daily-v1'), tolerante a corrupção.
// Sem cloud de propósito: o Diário é grátis e sem conta — atrito zero.

import { dateKeyOf } from '../engine/daily/lines';

// forma mínima que o store precisa entender — cada jogo tem seu shape completo
// (LinesProgress, WhoisProgress, ImpostorProgress…), todos com done/won.
export interface DailyProgressBase { done: boolean; won: boolean }

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
  progress: Record<string, { dateKey: string; p: DailyProgressBase }>;
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

export function loadDailyProgress<T extends DailyProgressBase = DailyProgressBase>(gameId: string, dateKey: string): T | null {
  const s = load();
  const cur = s.progress[gameId];
  return cur && cur.dateKey === dateKey ? (cur.p as T) : null;
}

export function saveDailyProgress(gameId: string, dateKey: string, p: DailyProgressBase): void {
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

// ─────────────────────────────────────────────────────────────────────────────
// DIA PERFEITO — o meta-loop do hub: venceu os 4 jogos do dia = ✨. Tem streak
// própria (chave reservada 'perfect', fora do namespace dos jogos).

export const PERFECT_KEY = 'perfect';

export interface DailyDayStatus {
  perGame: Record<string, DailyProgressBase | null>;
  done: number;      // jogos fechados hoje
  won: number;       // jogos vencidos hoje
  total: number;
  perfect: boolean;  // venceu TODOS
}

export function dailyDayStatus(gameIds: string[], dateKey: string): DailyDayStatus {
  const s = load();
  const perGame: Record<string, DailyProgressBase | null> = {};
  let done = 0, won = 0;
  for (const id of gameIds) {
    const cur = s.progress[id];
    const p = cur && cur.dateKey === dateKey ? cur.p : null;
    perGame[id] = p;
    if (p?.done) done += 1;
    if (p?.done && p.won) won += 1;
  }
  return { perGame, done, won, total: gameIds.length, perfect: gameIds.length > 0 && won === gameIds.length };
}

// chama após QUALQUER jogo fechar: se o dia ficou perfeito, avança a streak
// global (mesma regra dos jogos: ontem encadeia; repetido no dia é no-op).
export function syncPerfectStreak(gameIds: string[], dateKey: string): DailyStreak {
  const s = load();
  const st = s.streaks[PERFECT_KEY] ?? { lastDate: '', streak: 0, best: 0, plays: 0, wins: 0 };
  const status = dailyDayStatus(gameIds, dateKey);
  if (status.perfect && st.lastDate !== dateKey) {
    const yesterday = dateKeyOf(new Date(new Date(`${dateKey}T12:00:00`).getTime() - 86_400_000));
    st.streak = st.lastDate === yesterday ? st.streak + 1 : 1;
    st.best = Math.max(st.best, st.streak);
    st.wins += 1;
    st.plays += 1;
    st.lastDate = dateKey;
    s.streaks[PERFECT_KEY] = st;
    save(s);
  }
  return st;
}
