import type { Game, TeamSeason } from '../types';
import teamsJson from './teams.json';

// Base oficial de elencos (1.6 -> CS2), incluindo as edições de lineups
// brasileiras feitas no CRM. Fonte única: teams.json (editável e versionado).
export const BASE_TEAMS: TeamSeason[] = teamsJson as unknown as TeamSeason[];

export const GAME_ORDER: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
