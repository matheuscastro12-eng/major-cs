// [URG-4] STREAK DO DIÁRIO — puro. Dias SEGUIDOS jogando qualquer jogo do
// Diário (não precisa vencer: o loop é "voltar todo dia"). Separado das
// streaks por jogo de state/daily.ts (aquelas contam VITÓRIAS por jogo).
//
// Dia = calendário de America/Sao_Paulo (UTC-3 fixo — o Brasil não tem
// horário de verão desde 2019), independente do fuso do aparelho: o desafio
// vira à meia-noite de Brasília pra todo mundo. Tempo sempre por parâmetro
// (nowMs) — nada de Date.now() aqui.

export interface StreakState {
  current: number;          // dias seguidos até lastDay
  best: number;
  lastDay: string | null;   // YYYY-MM-DD (SP) do último dia jogado
}

export interface StreakStatus {
  current: number;          // streak VIVA (0 se perdeu)
  atRisk: boolean;          // tinha streak ontem e ainda não jogou hoje
  hoursLeft: number;        // horas (inteiras, arredondadas pra cima) até a meia-noite de SP
  lost: boolean;            // último dia é anterior a ontem (a streak morreu)
  previous: number;         // dias que a streak perdida tinha (0 se não perdeu)
}

const SP_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

export const emptyStreak = (): StreakState => ({ current: 0, best: 0, lastDay: null });

export function dayKey(nowMs: number): string {
  const d = new Date(nowMs - SP_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// meia-noite de SP do dia `key`, em epoch ms
function dayStartMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + SP_OFFSET_MS;
}

export function addDays(key: string, n: number): string {
  return dayKey(dayStartMs(key) + n * DAY_MS + DAY_MS / 2);
}

export function recordDailyPlay(state: StreakState, day: string): StreakState {
  if (state.lastDay === day) return state;                       // mesmo dia = no-op
  const current = state.lastDay && addDays(state.lastDay, 1) === day ? state.current + 1 : 1;
  return { current, best: Math.max(state.best, current), lastDay: day };
}

export function streakStatus(state: StreakState, nowMs: number): StreakStatus {
  const today = dayKey(nowMs);
  const hoursLeft = Math.max(1, Math.ceil((dayStartMs(today) + DAY_MS - nowMs) / 3_600_000));
  if (!state.lastDay || state.current <= 0) return { current: 0, atRisk: false, hoursLeft, lost: false, previous: 0 };
  if (state.lastDay === today) return { current: state.current, atRisk: false, hoursLeft, lost: false, previous: 0 };
  if (state.lastDay === addDays(today, -1)) return { current: state.current, atRisk: true, hoursLeft, lost: false, previous: 0 };
  return { current: 0, atRisk: false, hoursLeft, lost: true, previous: state.current };
}

// Local × servidor: vence quem tem o último dia mais recente (a streak mais
// velha já está desatualizada); empate no dia = maior current. best é o maior
// dos dois — nunca regride.
export function mergeStreak(a: StreakState, b: StreakState): StreakState {
  const best = Math.max(a.best, b.best, a.current, b.current);
  if (!a.lastDay) return { ...b, best };
  if (!b.lastDay) return { ...a, best };
  if (a.lastDay === b.lastDay) return { current: Math.max(a.current, b.current), best, lastDay: a.lastDay };
  return { ...(a.lastDay > b.lastDay ? a : b), best };
}

// ── Marcos e prêmios ────────────────────────────────────────────────────────
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export interface StreakReward { days: number; coins?: number; frame?: string }
export const STREAK_REWARDS: StreakReward[] = [
  { days: 3, coins: 1000 },
  { days: 7, coins: 3000, frame: 'streak-7' },
  { days: 14 },
  { days: 30, coins: 15000, frame: 'streak-30' },
  { days: 60 },
  { days: 100, frame: 'streak-100' },
];
export const streakKey = (days: number) => `streak:${days}`;
export const streakRewardFor = (days: number): StreakReward | null => STREAK_REWARDS.find((r) => r.days === days) ?? null;

// próximo marco acima de `current` (null depois do último)
export function nextMilestone(current: number): number | null {
  return STREAK_MILESTONES.find((m) => m > current) ?? null;
}

// marcos já atingidos (best) e ainda não resgatados — em ordem
export function pendingMilestones(best: number, claimedIds: string[]): number[] {
  return STREAK_MILESTONES.filter((m) => best >= m && !claimedIds.includes(streakKey(m)));
}
