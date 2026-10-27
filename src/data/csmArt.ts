// Arte das cartas do Ultimate: CS Manager (cedida ao projeto pelo autor).
// Ver docs/csmanager/arte-licenca.md. Mapeamento gerado por
// scripts/gen-csm-art.mts (csm-art.json); aqui só a tabela de molduras e os
// lookups. Sem foto mapeada → a carta usa o visual próprio (fallback).
import type { UltRarity } from '../engine/ultimate/rarities';
import art from './csm-art.json';

export type CsmFrame = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'versus1' | 'versus2' | 'tactical';

// Molduras deles sem marca de terceiro (BLAST/ESL ficaram de fora; s12025 tem
// stats e logo do CS Manager impressos no fundo, também fora).
export const CSM_FRAMES_USED: CsmFrame[] = ['bronze', 'prata', 'ouro', 'diamante', 'versus1', 'versus2', 'tactical'];

// Nossos 7 tiers + 5 specials → moldura deles (+ filtro CSS opcional para
// separar tiers que dividem a mesma moldura). Bronze/Prata/Ouro/Diamante
// cobrem os tiers base; Evento (versus/tactical) cobre os specials.
export const CSM_FRAME_BY_RARITY: Record<UltRarity, { frame: CsmFrame; filter?: string }> = {
  bronze:    { frame: 'bronze' },
  silver:    { frame: 'prata' },
  gold:      { frame: 'ouro' },
  rareGold:  { frame: 'ouro', filter: 'saturate(1.35) brightness(1.06)' },
  elite:     { frame: 'diamante' },
  legendary: { frame: 'diamante', filter: 'hue-rotate(232deg) saturate(1.4)' },
  icon:      { frame: 'tactical', filter: 'hue-rotate(15deg) saturate(1.3) brightness(1.15)' },
  tots:      { frame: 'versus1' },
  totw:      { frame: 'versus2', filter: 'hue-rotate(95deg)' },
  promo:     { frame: 'versus2', filter: 'hue-rotate(250deg) saturate(1.3)' },
  major:     { frame: 'tactical', filter: 'hue-rotate(330deg) saturate(1.4)' },
  histIcon:  { frame: 'ouro', filter: 'saturate(1.5) brightness(1.1) contrast(1.05)' },
  evento:    { frame: 'versus1', filter: 'hue-rotate(160deg) saturate(1.3)' }, // versão de evento do fim de semana
};

const BASE = '/cards/csm';
const players = (art as { players: Record<string, string> }).players;
const teams = (art as { teams: Record<string, string> }).teams;

export interface CsmCardArt { frame: string; frameFilter?: string; photo: string; logo: string | null }

// Só devolve arte quando há FOTO: moldura sem foto (avatar procedural por cima)
// destoa mais que o visual próprio, então o fallback é a carta atual inteira.
export function csmArtFor(card: { playerId: string; rarity: UltRarity; teamOrigin: string }): CsmCardArt | null {
  const photo = players[card.playerId];
  if (!photo) return null;
  const f = CSM_FRAME_BY_RARITY[card.rarity] ?? CSM_FRAME_BY_RARITY.bronze;
  const logo = teams[card.teamOrigin];
  return { frame: `${BASE}/frames/${f.frame}.webp`, frameFilter: f.filter, photo: `${BASE}/players/${photo}.webp`, logo: logo ? `${BASE}/teams/${logo}.webp` : null };
}

export const CSM_PHOTO_COUNT = Object.keys(players).length;
