import { hashStr } from '../../state/hash';

export type PlayerPersonality = 'leader' | 'mercenary' | 'prodigy' | 'hothead' | 'resilient';

const PERSONALITIES: PlayerPersonality[] = ['leader', 'mercenary', 'prodigy', 'hothead', 'resilient'];

export function playerPersonality(playerId: string): PlayerPersonality {
  return PERSONALITIES[hashStr(`personality:${playerId}`) % PERSONALITIES.length];
}

export function personalityDevelopmentBonus(playerId: string, split: number, age: number): number {
  if (playerPersonality(playerId) !== 'prodigy' || age > 23) return 0;
  return hashStr(`prodigy:${playerId}:${split}`) % 2 === 0 ? 1 : 0;
}

export function personalityMoraleDelta(
  playerId: string,
  context: { champion: boolean; objectiveMet: boolean; expiring: boolean },
): number {
  const personality = playerPersonality(playerId);
  if (personality === 'leader') return context.champion ? 2 : context.objectiveMet ? 1 : 2;
  if (personality === 'mercenary') return context.expiring ? -5 : 0;
  if (personality === 'hothead') return context.champion ? 4 : context.objectiveMet ? 1 : -4;
  if (personality === 'resilient') return context.objectiveMet ? 1 : 3;
  return context.champion ? 2 : 0;
}

export function personalityOfferBonus(playerId: string, morale: number): number {
  const personality = playerPersonality(playerId);
  if (personality === 'mercenary') return 25;
  if (personality === 'hothead' && morale < 45) return 15;
  if (personality === 'leader') return -10;
  return 0;
}

export function personalityFatigueDelta(playerId: string): number {
  const personality = playerPersonality(playerId);
  if (personality === 'resilient') return -2;
  if (personality === 'hothead') return 1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// T3.2 — Expansão das personalities (sem novo schema; tudo derivado da
// personality já calculada via hash). Integra com PlayerTalks (T3.7) e
// Chemistry (T3.4) pra que cada personality tenha comportamento mensurável
// em sistemas diferentes.

/**
 * Modula o delta de morale de um PlayerTalk baseado na personality.
 * Recebe o delta CALCULADO pelo engine de talks (ideal+modificadores) e
 * devolve o delta AJUSTADO pra essa personality.
 *
 * Idéia: cada personality reage diferente a tom/tópico.
 *   - leader: aceita firme bem, valoriza conversas francas
 *   - mercenary: praise/amigável tem efeito reduzido (só $$ importa)
 *   - prodigy: motivacional rende mais; firme dói mais
 *   - hothead: firme/behavior amplifica (pra cima ou pra baixo)
 *   - resilient: tudo é absorvido (efeitos atenuados, pra cima e pra baixo)
 */
export function personalityTalkResponse(
  playerId: string,
  topic: 'playtime' | 'effort' | 'defend' | 'behavior' | 'extension' | 'praise',
  tone: 'firm' | 'friendly' | 'motivational',
  baseDelta: number,
): number {
  const personality = playerPersonality(playerId);
  let delta = baseDelta;

  if (personality === 'leader') {
    // Líder valoriza firmeza e franqueza
    if (tone === 'firm') delta += 1;
    if (topic === 'defend') delta += 2;
    if (tone === 'motivational' && delta > 0) delta -= 1; // discurso bonito é desconfiado
  } else if (personality === 'mercenary') {
    // Mercenário é frio: praise e amigável rendem pouco
    if (topic === 'praise') delta = Math.round(delta * 0.4);
    if (tone === 'friendly') delta = Math.round(delta * 0.6);
    if (topic === 'extension') delta = Math.round(delta * 0.7);
  } else if (personality === 'prodigy') {
    // Jovem talento responde a motivacional, mas dói firme
    if (tone === 'motivational') delta = Math.round(delta * 1.5);
    if (tone === 'firm' && topic !== 'effort') delta = Math.round(delta * 0.6);
  } else if (personality === 'hothead') {
    // Reage explosivamente: positivo dobra, negativo dobra também
    if (topic === 'behavior' || topic === 'effort') {
      delta = Math.round(delta * 1.8);
    }
  } else if (personality === 'resilient') {
    // Resistente: atenua tudo
    delta = Math.round(delta * 0.7);
  }

  return delta;
}

/**
 * Bônus de chemistry que ESTE player adiciona aos pares dele. Líderes
 * "puxam" o time pra cima (química sobe mais rápido com qualquer um);
 * hothead arrasta pra baixo levemente.
 *
 * Retorna multiplicador aplicado ao gain por partida. Default 1.0.
 */
export function personalityChemBonus(playerId: string): number {
  const personality = playerPersonality(playerId);
  if (personality === 'leader') return 1.4;       // líder sobe química com qualquer um
  if (personality === 'resilient') return 1.15;   // resiliente é fácil de conviver
  if (personality === 'mercenary') return 0.8;    // mercenário é frio com o time
  if (personality === 'hothead') return 0.7;      // hothead irrita os outros
  return 1.0;                                      // prodigy, neutral
}

// Label humanizado pra UI (chip no profile do player).
export const PERSONALITY_LABEL: Record<PlayerPersonality, string> = {
  leader: 'Líder',
  mercenary: 'Mercenário',
  prodigy: 'Promessa',
  hothead: 'Esquentado',
  resilient: 'Resiliente',
};

// Descrição curta dos efeitos (tooltip).
export const PERSONALITY_DESC: Record<PlayerPersonality, string> = {
  leader: 'Aceita cobranças firmes e levanta a química do elenco.',
  mercenary: 'Só importa $. Praise e amizade rendem pouco.',
  prodigy: 'Talento jovem. Responde a motivação; sofre com firmeza.',
  hothead: 'Volátil. Reações dobradas — pra cima e pra baixo.',
  resilient: 'Absorve adversidade. Tudo afeta menos.',
};

