// Objetivos (missões) — metas de coleção/competição que dão DIREÇÃO ao jogador
// e recompensam com credits (e às vezes uma carta). Puro: os "facts" vêm do
// estado + squad atual; a UI computa progresso e chama claimObjective ao resgatar.
// Marco único por objetivo (não repetível) — ver profile.objectivesClaimed.
import type { UltRarity } from './rarities';

export interface ObjectiveFact {
  wins: number;
  packsOpened: number;
  uniqueCards: number;
  totalCards: number;
  squadOvr: number;
  chem: number;
  streak: number;
  iconsOwned: number;
  sbcDone: number;
  peakElo: number;
}

export type ObjectiveGroup = 'competir' | 'colecionar' | 'montar';

export interface ObjectiveDef {
  id: string;
  name: string;
  desc: string;
  metric: keyof ObjectiveFact;
  target: number;
  reward: { credits?: number; card?: UltRarity };
  group: ObjectiveGroup;
}

export const OBJECTIVES: ObjectiveDef[] = [
  // competir
  { id: 'first-blood', name: 'Primeiro sangue', desc: 'Vença sua 1ª ranqueada', metric: 'wins', target: 1, reward: { credits: 1500 }, group: 'competir' },
  { id: 'win-5', name: 'Aquecendo', desc: 'Vença 5 ranqueadas', metric: 'wins', target: 5, reward: { credits: 4000 }, group: 'competir' },
  { id: 'win-20', name: 'Dono do servidor', desc: 'Vença 20 ranqueadas', metric: 'wins', target: 20, reward: { credits: 12000, card: 'rareGold' }, group: 'competir' },
  { id: 'streak-3', name: 'Em chamas', desc: 'Emplaque 3 vitórias seguidas', metric: 'streak', target: 3, reward: { credits: 3000 }, group: 'competir' },
  { id: 'peak-1200', name: 'Subindo de elo', desc: 'Alcance 1200 RP de pico', metric: 'peakElo', target: 1200, reward: { credits: 5000 }, group: 'competir' },
  // colecionar
  { id: 'open-5', name: 'Abridor de pacotes', desc: 'Abra 5 pacotes', metric: 'packsOpened', target: 5, reward: { credits: 2500 }, group: 'colecionar' },
  { id: 'unique-25', name: 'Colecionador', desc: 'Tenha 25 cartas únicas', metric: 'uniqueCards', target: 25, reward: { credits: 5000 }, group: 'colecionar' },
  { id: 'unique-60', name: 'Enciclopédia', desc: 'Tenha 60 cartas únicas', metric: 'uniqueCards', target: 60, reward: { credits: 12000, card: 'elite' }, group: 'colecionar' },
  { id: 'icon-1', name: 'Lenda viva', desc: 'Possua 1 carta Ícone', metric: 'iconsOwned', target: 1, reward: { credits: 8000 }, group: 'colecionar' },
  // montar
  { id: 'ovr-80', name: 'Time de respeito', desc: 'Monte um squad 80+ OVR', metric: 'squadOvr', target: 80, reward: { credits: 6000 }, group: 'montar' },
  { id: 'chem-12', name: 'Entrosados', desc: 'Química 12+ no squad ativo', metric: 'chem', target: 12, reward: { credits: 4000 }, group: 'montar' },
  { id: 'sbc-2', name: 'Desafiante', desc: 'Conclua 2 desafios (SBC)', metric: 'sbcDone', target: 2, reward: { credits: 4000 }, group: 'montar' },
];

export interface ObjectiveProgress {
  def: ObjectiveDef;
  value: number;
  pct: number;   // 0..100
  done: boolean;
}

export function evaluateObjectives(facts: ObjectiveFact): ObjectiveProgress[] {
  return OBJECTIVES.map((def) => {
    const value = Math.max(0, facts[def.metric] ?? 0);
    const pct = Math.min(100, Math.round((value / def.target) * 100));
    return { def, value, pct, done: value >= def.target };
  });
}

export function objectiveById(id: string): ObjectiveDef | undefined {
  return OBJECTIVES.find((o) => o.id === id);
}
