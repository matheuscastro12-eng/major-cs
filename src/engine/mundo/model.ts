// CONTRATO DA FASE 4 DO REALISMO FM — o mundo: circuito real (calendário,
// qualifiers, ciclo de Majors, VRS, LAN × online, cenas simuladas em segundo
// plano), juventude (jovens gerados todo ano por região + curva de
// envelhecimento calibrada) e editor de base de dados estilo FM.
//
//   - circuito (src/engine/mundo/circuito.ts)
//   - juventude (src/engine/mundo/juventude.ts)
//   - editor   (src/engine/mundo/editor.ts)
//
// Save da Carreira: v30 grava `mundo` (ver saveMigrations.ts) chamando os
// `default*` de cada frente. Nenhuma frente sobe a versão do save.
// A base customizada do editor vive FORA do save (storage próprio) e a
// Carreira só guarda qual base usou (`mundo.databaseId`).

import type { MacroRegion } from '../../data/regions';
import type { Player, TeamSeason } from '../../types';

// ─── Circuito ──────────────────────────────────────────────────────────────
export type EventKind = 'league' | 'swiss' | 'gsl' | 'playoffs' | 'qualifier' | 'rmr' | 'major';

export interface CalendarEvent {
  id: string;
  name: string;              // nome real do evento (data/tournaments.ts)
  tier: 1 | 2 | 3;
  kind: EventKind;
  lan: boolean;              // LAN pesa o oculto bigMatch/pressão; online não
  region: MacroRegion | 'global';
  split: number;
  week: number;              // semana dentro do split (agenda)
  slots: number;             // times participantes
  prize: number;             // premiação total (moeda da Carreira)
  vrsWeight: number;         // peso do evento no VRS
  qualifiesTo?: string | null; // id do evento para o qual os primeiros se classificam
  invitedTeamIds?: string[]; // convites diretos (pelo VRS)
}

export interface WorldEventResult {
  eventId: string;
  split: number;
  placements: { teamId: string; place: number }[]; // 1 = campeão
  mvpPlayerId?: string;
}

export interface VrsEntry {
  teamId: string;
  points: number;
  history: { eventId: string; split: number; points: number }[]; // com decaimento aplicado pela frente
}

// ─── Juventude ─────────────────────────────────────────────────────────────
export interface YouthIntakeLog { year: number; region: MacroRegion | 'global'; playerIds: string[] }

// ─── Bloco gravado no save da Carreira (v30) ───────────────────────────────
export interface MundoState {
  v: 1;
  calendar: CalendarEvent[];              // temporada atual (a frente de circuito gera/renova)
  results: WorldEventResult[];            // resultados do mundo (inclusive os eventos que você não jogou)
  vrs: Record<string, VrsEntry>;          // teamId → VRS
  newgens: Record<string, Player>;        // jogadores gerados (não existem na base) — persistidos
  intake: YouthIntakeLog[];               // histórico das gerações anuais
  databaseId: string | null;              // base usada (null = oficial)
}

// ─── Editor de base de dados (fora do save) ────────────────────────────────
export interface CustomDatabase {
  v: 1;
  id: string;
  name: string;
  createdAt: string;
  basedOn: 'official';
  playerEdits: Record<string, Partial<Player>>;  // por playerId (inclui `attrs` completos se editados)
  teamEdits: Record<string, Partial<TeamSeason>>; // por teamId (nome, cores, elenco por ids, técnico…)
  addedPlayers: Player[];
  addedTeams: TeamSeason[];
}
