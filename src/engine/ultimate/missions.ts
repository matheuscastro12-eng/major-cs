// Missões diárias rotativas — 3 metas sorteadas deterministicamente pelo dia
// (mesmo padrão seeded do bazar). Progresso = contadores do perfil MENOS o
// baseline capturado na abertura do dia (profile.missions.base). Puro.
// Sorteio/hash/progresso vivem no núcleo compartilhado (missionCore.ts).
import { drawMissions, goalProgress } from './missionCore';

export type MissionMetric = 'winsToday' | 'matchesToday' | 'packsToday' | 'sbcToday';

export interface MissionDef {
  id: string;
  name: string;
  desc: string;
  metric: MissionMetric;
  target: number;
  credits: number;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'm-win1', name: 'Vitória do dia', desc: 'Vença 1 partida hoje', metric: 'winsToday', target: 1, credits: 800 },
  { id: 'm-win2', name: 'Dobradinha', desc: 'Vença 2 partidas hoje', metric: 'winsToday', target: 2, credits: 1400 },
  { id: 'm-win3', name: 'Hat-trick', desc: 'Vença 3 partidas hoje', metric: 'winsToday', target: 3, credits: 2200 },
  { id: 'm-play2', name: 'Ritmo de jogo', desc: 'Jogue 2 partidas hoje', metric: 'matchesToday', target: 2, credits: 900 },
  { id: 'm-play4', name: 'Maratona', desc: 'Jogue 4 partidas hoje', metric: 'matchesToday', target: 4, credits: 1800 },
  { id: 'm-pack1', name: 'Abre-alas', desc: 'Abra 1 pacote hoje', metric: 'packsToday', target: 1, credits: 700 },
  { id: 'm-pack2', name: 'Colecionador do dia', desc: 'Abra 2 pacotes hoje', metric: 'packsToday', target: 2, credits: 1500 },
  { id: 'm-sbc1', name: 'Desafiante do dia', desc: 'Conclua 1 desafio (SBC) hoje', metric: 'sbcToday', target: 1, credits: 1600 },
];

export const MISSIONS_PER_DAY = 3;

export function missionsForDay(day: string): MissionDef[] {
  return drawMissions(MISSION_POOL, day, MISSIONS_PER_DAY);
}

export interface MissionFacts { winsToday: number; matchesToday: number; packsToday: number; sbcToday: number }

export function missionProgress(def: MissionDef, facts: MissionFacts): { value: number; done: boolean; pct: number } {
  return goalProgress(def, facts);
}

export function missionById(id: string): MissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}
