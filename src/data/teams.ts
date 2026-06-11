import type { Game, TeamSeason } from '../types';
import teamsJson from './teams.json';

// Base de elencos do jogo (1.6 -> CS2) + edições do CRM. É o que alimenta os
// modos DRAFT / ALMANAQUE / ONLINE. Os times reais importados do bo3.gg NÃO
// entram aqui de propósito (ficam escondidos, só no modo carreira por ora);
// eles vivem em ./bo3 pra entrar só no chunk da carreira (ver CS2_REAL_2026).
export const BASE_TEAMS: TeamSeason[] = teamsJson as unknown as TeamSeason[];

export const GAME_ORDER: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
