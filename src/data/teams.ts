import type { Game, TeamSeason } from '../types';
import teamsJson from './teams.json';
import bo3Json from './bo3-2026.json';

// Base de elencos. Fontes:
// - teams.json: histórico (1.6 -> CS:GO) + edições do CRM.
// - bo3-2026.json: times/jogadores REAIS de CS2 (2026), ranking mundial,
//   importados da API pública do bo3.gg (com fotos reais).
// Os times reais de CS2 do bo3 substituem os antigos CS2 (mesmo nome) para
// evitar duplicatas; as lendas de outras eras seguem intactas.
const base = teamsJson as unknown as TeamSeason[];
const bo3 = bo3Json as unknown as TeamSeason[];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const bo3Names = new Set(bo3.map((t) => norm(t.team)));

const kept = base.filter((t) => t.game !== 'CS2' || !bo3Names.has(norm(t.team)));

export const BASE_TEAMS: TeamSeason[] = [...kept, ...bo3];

export const GAME_ORDER: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
