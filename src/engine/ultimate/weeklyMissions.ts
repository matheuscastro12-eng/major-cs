// Missões SEMANAIS renováveis — 3 metas sorteadas deterministicamente pela
// semana ISO (mesmo padrão seeded das diárias em missions.ts), com metas e
// recompensas maiores. Completar as 3 libera um pack bônus barato (resgate na
// store, que tem catálogo). Progresso = contadores do perfil MENOS o baseline
// capturado na abertura da semana (profile.weekly.base). Puro.
// Sorteio/hash/progresso vivem no núcleo compartilhado (missionCore.ts).
import { drawMissions, goalProgress } from './missionCore';
import type { UltimateProfile } from './state';

export type WeeklyMetric = 'winsWeek' | 'matchesWeek' | 'packsWeek' | 'sbcWeek' | 'bazaarWeek';

export interface WeeklyMissionDef {
  id: string;
  name: string;
  desc: string;
  metric: WeeklyMetric;
  target: number;
  credits: number;
}

export const WEEKLY_POOL: WeeklyMissionDef[] = [
  { id: 'w-win5', name: 'Semana sólida', desc: 'Vença 5 partidas esta semana', metric: 'winsWeek', target: 5, credits: 3500 },
  { id: 'w-win7', name: 'Semana perfeita', desc: 'Vença 7 partidas ranqueadas esta semana', metric: 'winsWeek', target: 7, credits: 5500 },
  { id: 'w-win10', name: 'Rolo compressor', desc: 'Vença 10 partidas esta semana', metric: 'winsWeek', target: 10, credits: 8000 },
  { id: 'w-play12', name: 'Grind semanal', desc: 'Jogue 12 partidas esta semana', metric: 'matchesWeek', target: 12, credits: 5000 },
  { id: 'w-pack5', name: 'Semana de sorte', desc: 'Abra 5 pacotes esta semana', metric: 'packsWeek', target: 5, credits: 4000 },
  { id: 'w-pack8', name: 'Chuva de cartas', desc: 'Abra 8 pacotes esta semana', metric: 'packsWeek', target: 8, credits: 6500 },
  { id: 'w-sbc3', name: 'Maratona de desafios', desc: 'Conclua 3 desafios (SBC) esta semana', metric: 'sbcWeek', target: 3, credits: 7000 },
  // métrica bazaarWeek herdada do bazar de IA (removido) — hoje conta compras
  // no Mercado entre managers (marketBuyApply incrementa profile.bazaarBuys).
  { id: 'w-bazaar3', name: 'Olho no mercado', desc: 'Compre 3 cartas no Mercado esta semana', metric: 'bazaarWeek', target: 3, credits: 3000 },
];

export const WEEKLY_PER_WEEK = 3;
// completar (e resgatar) as 3 missões da semana libera um pack bônus GRÁTIS. Antes
// era 'bronze' (o pack MAIS BARATO da Loja: 55% bronze/35% prata, garante só 1
// prata) — capstone de uma semana inteira das 3 metas mais duras que valia menos
// que a diária de login. As win-missions semanais já pagam ~700-800/vitória, o
// MESMO ou MENOS que a diária m-win1 (800/vit), então a faixa semanal não tinha
// prêmio-prêmio nenhum sobre grindar diárias. Subir p/ 'silver' (garante 1 OURO)
// dá um momento de pull de verdade ao capstone sem inflar credits: o pack é
// gratuito e travado atrás de completar E resgatar as 3 missões da semana.
export const WEEKLY_BONUS_PACK = 'silver';

// chave ISO-8601 da semana ("2026-W27") no fuso LOCAL — semana começa na
// segunda; W01 é a semana da 1ª quinta-feira do ano (mesma família do dateKey).
export function weekKey(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7;      // 0 = segunda
  t.setDate(t.getDate() - dow + 3);      // quinta-feira da semana define o ano ISO
  const y = t.getFullYear();
  const jan4 = new Date(y, 0, 4);        // 4/jan está sempre na W01
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

export function missionsForWeek(week: string): WeeklyMissionDef[] {
  return drawMissions(WEEKLY_POOL, week, WEEKLY_PER_WEEK);
}

export interface WeeklyFacts { winsWeek: number; matchesWeek: number; packsWeek: number; sbcWeek: number; bazaarWeek: number }

// fatos semanais do perfil (contadores atuais MENOS o baseline da semana) —
// derivação ÚNICA usada pela tela e pelo claim do store, pra nunca divergirem.
// Sem semana aberta ainda → tudo zero.
export function weeklyFactsOf(p: UltimateProfile): WeeklyFacts {
  const b = p.weekly?.base;
  if (!b) return { winsWeek: 0, matchesWeek: 0, packsWeek: 0, sbcWeek: 0, bazaarWeek: 0 };
  return {
    winsWeek: p.w - b.w,
    matchesWeek: (p.w + p.l) - (b.w + b.l),
    packsWeek: p.packSeedCounter - b.packs,
    sbcWeek: p.sbcDone.length - b.sbc,
    bazaarWeek: p.bazaarBuys - b.bazaar,
  };
}

export function weeklyProgress(def: WeeklyMissionDef, facts: WeeklyFacts): { value: number; done: boolean; pct: number } {
  return goalProgress(def, facts);
}

export function weeklyMissionById(id: string): WeeklyMissionDef | undefined {
  return WEEKLY_POOL.find((m) => m.id === id);
}
