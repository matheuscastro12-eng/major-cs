// [W1] PRÊMIO DO PÓDIO SEMANAL DA SÉRIE DO DIA — helpers puros.
//
// O ladder semanal (api/ranking.ts, dailyWeekLadder) soma o rating dos dias
// jogados na semana (dias 1-7 da época = semana 1). Ao fechar a semana, o 1º
// vira CAMPEÃO DA SEMANA e 2º/3º levam o pódio — um selo cosmético no perfil
// do RtP. O servidor decide o pódio (rtm_daily_week_prizes, claim idempotente);
// o cliente APLICA no save (padrão coinsClaim) com applyWeeklyTitles.
//
// computeWeekPodium espelha a régua do SQL do claim pra ser testável sem banco.

import type { RoadToProSave, WeeklyTitle } from './types';

export const WEEK_PRIZE_MIN_FIELD = 5;   // pódio de 2 pessoas não premia

export interface WeekEntry {
  id: string;          // e-mail/conta (opaco aqui)
  pts: number;         // soma de rating da semana
  wins: number;        // vitórias na semana
  firstAt: number;     // epoch ms do primeiro report da semana (desempate final)
}

// Pódio da semana: pts DESC, vitórias DESC, quem chegou antes. Semana com menos
// de `minField` participantes não premia ninguém (lista vazia).
export function computeWeekPodium(entries: WeekEntry[], minField = WEEK_PRIZE_MIN_FIELD): { id: string; place: 1 | 2 | 3 }[] {
  if (entries.length < minField) return [];
  const sorted = [...entries].sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.firstAt - b.firstAt || a.id.localeCompare(b.id));
  return sorted.slice(0, 3).map((e, i) => ({ id: e.id, place: (i + 1) as 1 | 2 | 3 }));
}

// Aplica selos no save: 1 por semana (o melhor lugar vence se vier duplicado),
// ordenado por semana. Campo opcional — save antigo abre sem migração.
export function applyWeeklyTitles(save: RoadToProSave, titles: WeeklyTitle[]): RoadToProSave {
  if (!titles.length) return save;
  const byWeek = new Map<number, WeeklyTitle>();
  for (const t of [...(save.weeklyTitles ?? []), ...titles]) {
    if (!(t.week >= 1) || ![1, 2, 3].includes(t.place)) continue;
    const prev = byWeek.get(t.week);
    if (!prev || t.place < prev.place) byWeek.set(t.week, { week: t.week, place: t.place });
  }
  const merged = [...byWeek.values()].sort((a, b) => a.week - b.week);
  return { ...save, weeklyTitles: merged };
}

// Texto do selo (PT-BR, tom do jogo).
export function weeklyTitleLabel(t: WeeklyTitle): string {
  if (t.place === 1) return `🏆 CAMPEÃO DA SEMANA ${t.week}`;
  return `${t.place === 2 ? '🥈' : '🥉'} PÓDIO DA SEMANA ${t.week} · ${t.place}º`;
}

// Frase do claim na tela da Série do Dia.
export function weeklyTitleClaimText(t: WeeklyTitle): string {
  if (t.place === 1) return `Você foi CAMPEÃO da semana ${t.week} da Série do Dia.`;
  return `Você fechou a semana ${t.week} da Série do Dia em ${t.place}º — pódio.`;
}
