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
