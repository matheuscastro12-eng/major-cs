import type { Game, TeamSeason } from '../types';
import teamsJson from './teams.json';
import bo3Json from './bo3-2026.json';

// Base de elencos do jogo (1.6 -> CS2) + edições do CRM. É o que alimenta os
// modos DRAFT / ALMANAQUE / ONLINE. Os times reais importados do bo3.gg NÃO
// entram aqui de propósito (ficam escondidos, só no modo carreira por ora).
export const BASE_TEAMS: TeamSeason[] = teamsJson as unknown as TeamSeason[];

// Times/jogadores REAIS de CS2 (2026), ranking mundial, importados do bo3.gg.
// Usados EXCLUSIVAMENTE pelo modo carreira (ver CareerScreen).
export const CS2_REAL_2026: TeamSeason[] = bo3Json as unknown as TeamSeason[];

export const GAME_ORDER: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
