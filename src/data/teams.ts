import type { Game, TeamSeason } from '../types';
import teamsJson from './teams.json';
import { hashStr } from '../state/hash';
import { PLAYER_ATTRS_DB, materializeTeams } from './playerAttrs';

// Base de elencos do jogo (1.6 -> CS2) + edições do CRM. É o que alimenta os
// modos DRAFT / ALMANAQUE / ONLINE. Os times reais importados do bo3.gg NÃO
// entram aqui de propósito (ficam escondidos, só no modo carreira por ora);
// eles vivem em ./bo3 pra entrar só no chunk da carreira (ver CS2_REAL_2026).
// [realismo FM] jogadores históricos presentes na base real de atributos recebem
// esses atributos (e os 5 números saem deles); os demais derivam sob demanda em
// attrsOf(), que reproduz exatamente os números do JSON.
export const BASE_TEAMS: TeamSeason[] = Object.keys(PLAYER_ATTRS_DB).length
  ? materializeTeams(teamsJson as unknown as TeamSeason[], PLAYER_ATTRS_DB, undefined, false)
  : teamsJson as unknown as TeamSeason[];

// "Versão" do conteúdo do build, derivada AUTOMATICAMENTE do próprio dataset:
// muda sozinha sempre que qualquer elenco/atributo/nome é editado no teams.json.
// É o que permite que uma atualização (deploy) chegue a todos os jogadores sem
// que eles precisem limpar o localStorage, e que o build vença um banco antigo.
export const BASE_REV: string = hashStr(JSON.stringify(teamsJson)).toString(36);

export const GAME_ORDER: Game[] = ['CS 1.6', 'CS:Source', 'CS:GO', 'CS2'];
