// [URG-5] META COMUNITÁRIA DA SEMANA — definição pura.
// "Se a comunidade jogar N partidas online até domingo, todo mundo que
// participou ganha X." Semana ISO em UTC (segunda 00:00 → domingo 23:59:59),
// id determinístico `cg-YYYY-WW`. O servidor (api/ranking.ts) conta as
// partidas reportadas; aqui só vive a régua — nada de Date.now/Math.random,
// o tempo entra por parâmetro.

export type CommunityPackTier = 'gold';

export interface CommunityGoalReward {
  /** coins pra quem contribuiu com pelo menos `minMatches` partidas */
  credits: number;
  minMatches: number;
  /** pacote extra pra quem contribuiu com pelo menos `packMinMatches` partidas */
  packTier: CommunityPackTier;
  packMinMatches: number;
}

export interface CommunityGoal {
  id: string;
  /** partidas online reportadas que a comunidade precisa somar na semana */
  target: number;
  startsAt: number; // ms UTC, segunda 00:00:00
  endsAt: number;   // ms UTC, domingo 23:59:59.999
  reward: CommunityGoalReward;
}

export const COMMUNITY_GOAL_REWARD: CommunityGoalReward = { credits: 5_000, minMatches: 3, packTier: 'gold', packMinMatches: 10 };
export const COMMUNITY_GOAL_FIRST_TARGET = 300;
export const COMMUNITY_GOAL_MIN_TARGET = 200;
export const COMMUNITY_GOAL_MAX_TARGET = 5_000;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Segunda-feira 00:00 UTC da semana ISO que contém `now`. */
export function isoWeekStart(now: number): number {
  const d = new Date(now);
  const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day0).getUTCDay() + 6) % 7; // 0 = segunda … 6 = domingo
  return day0 - dow * DAY_MS;
}

/** Ano e número da semana ISO 8601 (a semana 1 é a que contém a 1ª quinta do ano). */
export function isoWeekOf(now: number): { year: number; week: number } {
  const start = isoWeekStart(now);
  const thursday = new Date(start + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursdayWeekStart = isoWeekStart(Date.UTC(year, 0, 4));
  const week = Math.round((start - firstThursdayWeekStart) / WEEK_MS) + 1;
  return { year, week };
}

export function communityWeekId(now: number): string {
  const { year, week } = isoWeekOf(now);
  return `cg-${year}-${String(week).padStart(2, '0')}`;
}

/** Escala automática: 15% acima do total da semana anterior, arredondado em
 *  degraus de 50 e preso a [200, 5000]. Sem histórico (primeira semana) → 300. */
export function resolveWeekTarget(prevWeekTotal?: number | null): number {
  if (prevWeekTotal == null || !Number.isFinite(prevWeekTotal)) return COMMUNITY_GOAL_FIRST_TARGET;
  const raw = Math.round((Math.max(0, prevWeekTotal) * 1.15) / 50) * 50;
  return Math.max(COMMUNITY_GOAL_MIN_TARGET, Math.min(COMMUNITY_GOAL_MAX_TARGET, raw));
}

export function communityGoalFor(now: number, prevWeekTotal?: number | null): CommunityGoal {
  const startsAt = isoWeekStart(now);
  return {
    id: communityWeekId(now),
    target: resolveWeekTarget(prevWeekTotal),
    startsAt,
    endsAt: startsAt + WEEK_MS - 1,
    reward: COMMUNITY_GOAL_REWARD,
  };
}

/** 0..100, inteiro. Meta batida = 100 mesmo que a comunidade passe do alvo. */
export function progressPct(count: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((Math.max(0, count) / target) * 100)));
}

/** O que UMA conta leva pela sua contribuição (coins a partir de 3, pacote a partir de 10). */
export function communityRewardFor(matches: number, reward: CommunityGoalReward = COMMUNITY_GOAL_REWARD): { credits: number; packTier: CommunityPackTier | null } {
  const n = Math.max(0, Math.floor(matches));
  if (n < reward.minMatches) return { credits: 0, packTier: null };
  return { credits: reward.credits, packTier: n >= reward.packMinMatches ? reward.packTier : null };
}

/** Faltam quantas partidas (0 quando batida). */
export function communityRemaining(total: number, target: number): number {
  return Math.max(0, target - Math.max(0, total));
}

export function describeCommunityGoal(goal: CommunityGoal): string {
  const r = goal.reward;
  return `Se a comunidade somar ${goal.target.toLocaleString('pt-BR')} partidas online até domingo, quem jogou ${r.minMatches}+ ganha ${r.credits.toLocaleString('pt-BR')} coins — e quem jogou ${r.packMinMatches}+ leva um Pacote Ouro de brinde.`;
}

/** "3d 4h" / "5h" / "12min" — tempo até `endsAt`, em PT-BR. */
export function describeTimeLeft(now: number, endsAt: number): string {
  const ms = Math.max(0, endsAt - now);
  const d = Math.floor(ms / DAY_MS);
  const h = Math.floor((ms % DAY_MS) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}min`;
}

/** Texto pronto pra compartilhar (clipboard / share sheet). */
export function communityShareText(total: number, goal: CommunityGoal): string {
  const left = communityRemaining(total, goal.target);
  if (left === 0) return `A comunidade do Road to Major bateu a meta da semana: ${goal.target.toLocaleString('pt-BR')} partidas e ${goal.reward.credits.toLocaleString('pt-BR')} coins pra todo mundo que jogou. Bora: roadtomajor.com.br`;
  return `Faltam ${left.toLocaleString('pt-BR')} partidas pra comunidade do Road to Major bater a meta da semana e liberar ${goal.reward.credits.toLocaleString('pt-BR')} coins pra todo mundo. Bora: roadtomajor.com.br`;
}
