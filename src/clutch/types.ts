// Contrato público do Clutch Mode (fase 1). Quem integrar a simulação da
// partida depois só precisa destes tipos + <ClutchCanvas config onEnd />.
import type { PlayerAttrs } from '../engine/attrs/model';
import type { Role } from '../types';

export interface ClutchOpponent { id: string; name: string; role: Role; attrs: PlayerAttrs }

export interface ClutchConfig {
  map: 'nuke';                 // só nuke na fase 1
  scenario: 'postplant-B-1v3';
  opponents: ClutchOpponent[]; // 1..5
  hp: number;                  // 1..100
  armor: number;               // 0 | 100
  weapons: { primary: 'rifle' | null; secondary: 'pistol' };
  bombTimeLeft?: number;       // default 40
  seed?: number;
  /** eliminar todos vence mesmo com a bomba armada (default true) */
  eliminationWins?: boolean;
  /** multiplicador global de dificuldade dos bots, 0.8..1.2 (fora do contrato) */
  difficulty?: number;
}

export type ClutchEndReason = 'eliminated_all' | 'defused' | 'exploded' | 'died' | 'quit';

export interface ClutchResult {
  won: boolean;
  kills: number;
  headshots: number;
  timeMs: number;
  reason: ClutchEndReason;
  damageDealt: number;
  killFeed: { victimId: string; headshot: boolean; tMs: number }[];
}

export type ClutchEnd = (r: ClutchResult) => void;

/** snapshot leve para o HUD em DOM (~10 Hz) */
export interface ClutchHud {
  hp: number; armor: number;
  weapon: 'rifle' | 'pistol'; ammo: number; magSize: number; reloading: boolean;
  bombLeft: number; defuseProgress: number; canDefuse: boolean;
  botsAlive: number; botsTotal: number;
  killFeed: { victim: string; headshot: boolean; byPlayer: boolean }[];
  hurtFlash: number; // 0..1
  hitMarker: number; // 0..1
  locked: boolean;
  fps?: { fps: number; ms: number; p95: number; calls: number; tris: number; ratio: number };
}

export interface ClutchGameHandle { dispose(): void }
