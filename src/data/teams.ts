import type { Game, TeamSeason } from '../types';
import teamsJson from './teams.json';
import { hashStr } from '../state/hash';

// Base de elencos do jogo (1.6 -> CS2) + edições do CRM. É o que alimenta os
// modos DRAFT / ALMANAQUE / ONLINE. Os times reais importados do bo3.gg NÃO
// entram aqui de propósito (ficam escondidos, só no modo carreira por ora);
// eles vivem em ./bo3 pra entrar só no chunk da carreira (ver CS2_REAL_2026).
export const BASE_TEAMS: TeamSeason[] = teamsJson as unknown as TeamSeason[];

// "Versão" do conteúdo do build, derivada AUTOMATICAMENTE do próprio dataset:
// muda sozinha sempre que qualquer elenco/atributo/nome é editado no teams.json.
// É o que permite que uma atualização (deploy) chegue a todos os jogadores sem
// que eles precisem limpar o localStorage, e que o build vença um banco antigo.
export const BASE_REV: string = hashStr(JSON.stringify(teamsJson)).toString(36);

export const GAME_ORDER: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
