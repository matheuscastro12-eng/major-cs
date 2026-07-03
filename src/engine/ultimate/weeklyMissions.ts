// Missões SEMANAIS renováveis — 3 metas sorteadas deterministicamente pela
// semana ISO (mesmo padrão seeded das diárias em missions.ts), com metas e
// recompensas maiores. Completar as 3 libera um pack bônus barato (resgate na
// store, que tem catálogo). Progresso = contadores do perfil MENOS o baseline
// capturado na abertura da semana (profile.weekly.base). Puro.
import { makeRng } from '../rng';

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
  { id: 'w-bazaar3', name: 'Olho no mercado', desc: 'Compre 3 cartas no bazar esta semana', metric: 'bazaarWeek', target: 3, credits: 3000 },
];

export const WEEKLY_PER_WEEK = 3;
// completar as 3 missões da semana libera um pack bônus (o mais barato da Loja).
export const WEEKLY_BONUS_PACK = 'bronze';

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

// hash simples e estável da weekKey → seed do sorteio da semana.
function weekHash(week: string): number {
  let h = 0;
  for (let i = 0; i < week.length; i++) h = ((h * 31) + week.charCodeAt(i)) >>> 0;
  return h || 1;
}

export function missionsForWeek(week: string): WeeklyMissionDef[] {
  const rng = makeRng(weekHash(week));
  const pool = [...WEEKLY_POOL];
  const out: WeeklyMissionDef[] = [];
  for (let i = 0; i < WEEKLY_PER_WEEK && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export interface WeeklyFacts { winsWeek: number; matchesWeek: number; packsWeek: number; sbcWeek: number; bazaarWeek: number }

export function weeklyProgress(def: WeeklyMissionDef, facts: WeeklyFacts): { value: number; done: boolean; pct: number } {
  const value = Math.max(0, facts[def.metric] ?? 0);
  return { value, done: value >= def.target, pct: Math.min(100, Math.round((value / def.target) * 100)) };
}

export function weeklyMissionById(id: string): WeeklyMissionDef | undefined {
  return WEEKLY_POOL.find((m) => m.id === id);
}
