// RTP — PENEIRA de entrada. Ao criar a carreira, o novato passa por 3 estações de
// minigame (mira, reflexo, leitura). A média do desempenho (com um leve peso do
// preparo/OVR do build) define em QUE TIER um time o contrata: mandou bem → time
// grande (elite/challenger); vacilou → começa na base (academia). Puro, sem React.

import type { Tier } from './types';
import type { MiniGameId } from './minigames';

// As 3 estações da peneira: mira (mecânica), reflexo (físico), leitura (mental).
export const TRYOUT_STATIONS: MiniGameId[] = ['flick', 'reaction', 'memory'];

// Combina os RAW (0..1) das estações — SEM o floor de treino, pra usar a faixa
// inteira (jogar mal precisa PODER cair na academia) — com um leve empurrão do OVR
// do build (85% desempenho na hora, 15% preparo). Resultado 0..1.
export function tryoutScore(rawScores: number[], ovr: number): number {
  const avg = rawScores.length ? rawScores.reduce((a, b) => a + b, 0) / rawScores.length : 0;
  const ovrNorm = Math.max(0, Math.min(1, (ovr - 52) / 20)); // ~52 → 0, ~72 → 1
  return Math.max(0, Math.min(1, avg * 0.85 + ovrNorm * 0.15));
}

// Faixas de nota → tier de contratação.
export function tryoutTier(score: number): Tier {
  if (score >= 0.80) return 'elite';
  if (score >= 0.60) return 'challenger';
  if (score >= 0.38) return 'access';
  return 'academy';
}

// A peneira "forte" (topo do pool do tier) começa a valer no challenger; abaixo
// disso o novato pega o time mais fraco do tier (entra por baixo).
export function tryoutStrong(score: number): boolean {
  return score >= 0.60;
}

export interface TierFlavor { label: string; blurb: string; tone: 'gold' | 'blue' | 'green' | 'dim'; }

// Copy do reveal por tier (o componente traduz com ct()).
export const TIER_FLAVOR: Record<Tier, TierFlavor> = {
  elite: { label: 'ELITE', tone: 'gold', blurb: 'Peneira impecável. Uma potência da elite bateu o martelo e te contratou.' },
  challenger: { label: 'CHALLENGER', tone: 'blue', blurb: 'Você impressionou. Um time challenger apostou no seu talento.' },
  access: { label: 'ACESSO', tone: 'green', blurb: 'Foi bem o suficiente. Um time de acesso (T3) te deu a primeira vaga.' },
  academy: { label: 'ACADEMIA', tone: 'dim', blurb: 'Dia difícil na peneira. Você começa na base — hora de provar seu valor.' },
};
