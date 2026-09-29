// CONTRATO DA FASE 2 DO REALISMO FM — gestão do time: treino semanal, tática por
// mapa e comissão técnica. Três frentes trabalham em paralelo em cima deste
// arquivo; as ASSINATURAS são o contrato (implementação interna pode mudar).
//
//   - treino   (src/engine/gestao/treino.ts):  agenda da semana, foco individual,
//              intensidade × condição/lesão, scrims; alimenta a evolução por
//              atributo (engine/attrs/progression) e a CONDIÇÃO lida pelo motor.
//   - tática   (src/engine/gestao/tatica.ts):  playbook por mapa, papéis por
//              jogador por mapa, instruções de equipe, familiaridade, anti-strat;
//              o motor v2 (engine/match2) lê via `tacticDuelMods`.
//   - staff    (src/engine/gestao/staff.ts):   cargos com atributos 1–20,
//              contratação, efeitos em treino, familiaridade, olheiros, moral e
//              recuperação via `staffEffects` (sem staff = linha de base 1.0).
//
// Save da Carreira: v28 grava `gestao` (ver saveMigrations.ts) chamando os
// `default*` de cada frente. Nenhuma frente sobe a versão do save.

import type { AttrKey } from '../attrs/model';
import type { MapId, Role } from '../../types';

// ─── Treino ────────────────────────────────────────────────────────────────
export type TrainingSession =
  | 'aim'        // deathmatch, aim training (mecânica)
  | 'utility'    // granadas, execuções de utilitária
  | 'tactics'    // táticas do mapa (familiaridade)
  | 'vod'        // VOD review (leitura, decisões, anti-strat)
  | 'scrim'      // scrim contra outro time (familiaridade + forma; pode vazar estratégia)
  | 'physical'   // preparação física (stamina, prevenção de lesão)
  | 'mental'     // psicólogo, foco (composure, concentration)
  | 'rest';      // descanso (condição)

export type TrainingIntensity = 'low' | 'normal' | 'high';

// Foco individual: um atributo específico OU desenvolver uma função.
export type IndividualFocus = { kind: 'attr'; attr: AttrKey } | { kind: 'role'; role: Role };

export interface TrainingState {
  v: 1;
  week: TrainingSession[];          // 7 slots (um por dia); a UI mostra como agenda
  intensity: TrainingIntensity;
  focus: Record<string, IndividualFocus>; // playerId → foco
  mapFocus: MapId[];                // mapas priorizados nas sessões de tática/scrim (até 3)
  // [frente D · mudança de contrato] campos opcionais (o `defaultTrainingState` os preenche):
  progress?: Record<string, Partial<Record<AttrKey, number>>>; // playerId → pontos de treino por atributo no split
  weeks?: number;                   // semanas de treino contadas no split (zera na virada)
  weekNo?: number;                  // contador global de semanas (semente dos sorteios)
  leaks?: Record<string, number>;   // teamId → estratégia vazada em scrim (0–1, decai por semana)
  lastWeek?: TrainingWeekReport | null; // relatório da última semana (tela e caixa de entrada)
}

export type InjuryKind = 'wrist' | 'tendon' | 'back' | 'burnout' | 'illness';

// Relatório de uma semana de treino (o que a tela e a caixa de entrada mostram).
export interface TrainingWeekReport {
  weekNo: number;
  split: number;
  injuries: { playerId: string; nick: string; kind: InjuryKind; weeks: number }[];
  recovered: { playerId: string; nick: string }[];
  leak?: { teamId: string; level: number } | null;
  familiarity: { map: MapId; points: number }[];
}

// Condição física/mental por jogador (0–100). O motor lê `fitness` e `sharpness`.
export interface PlayerCondition {
  fitness: number;     // cansaço físico/mental acumulado (100 = descansado)
  sharpness: number;   // ritmo de jogo (cai sem jogar/treinar tática)
  injury?: { kind: InjuryKind; weeksLeft: number } | null;
}

// ─── Tática ────────────────────────────────────────────────────────────────
export type MapRole = 'entry' | 'second' | 'lurker' | 'support' | 'awp' | 'igl' | 'anchor' | 'rotator';
export type CtSetup = 'standard' | 'stackA' | 'stackB' | 'aggressive' | 'retake';
export type TExecute = 'fastA' | 'fastB' | 'splitA' | 'splitB' | 'default' | 'midControl' | 'fake';

export interface TeamInstructions {
  tempo: 'slow' | 'balanced' | 'fast';
  utility: 'save' | 'balanced' | 'heavy';
  ecoPolicy: 'fullSave' | 'forceAfterPistol' | 'alwaysForce';
  aggression: 'passive' | 'balanced' | 'aggressive';
  timeoutPolicy: 'early' | 'normal' | 'late';
}

export interface MapTactic {
  map: MapId;
  roles: Record<string, MapRole>;   // playerId → papel neste mapa
  ct: CtSetup;
  t: TExecute[];                    // repertório de execuções (1–4)
  instr?: Partial<TeamInstructions>; // sobrescreve as instruções gerais neste mapa
  familiarity: number;              // 0–100: cresce com treino/partida no mapa
}

export interface TacticsState {
  v: 1;
  instr: TeamInstructions;
  maps: Partial<Record<MapId, MapTactic>>;
  antiStrat?: { opponentTeamId: string; readiness: number } | null; // preparação contra o próximo adversário
}

// Modificadores que a tática entrega ao motor v2 por situação do round.
export interface TacticDuelMods {
  teamLogit: number;                         // viés do time neste round (logit de duelo)
  engageWeight?: Record<string, number>;     // playerId → peso de engajamento (quem duela)
  roleFit?: Record<string, number>;          // playerId → ajuste por jogar dentro/fora do papel (atributo equivalente)
}

// ─── Comissão técnica ──────────────────────────────────────────────────────
export type StaffRole = 'headCoach' | 'assistant' | 'analyst' | 'psychologist' | 'performance' | 'scout';

export type StaffAttrKey =
  | 'tactics'          // conhecimento tático (familiaridade, playbook)
  | 'mapKnowledge'     // leitura de mapa (setups, anti-strat)
  | 'aimCoaching'      // treino mecânico
  | 'mentalCoaching'   // composure, tilt, confiança
  | 'fitness'          // preparação física, prevenção de lesão/burnout
  | 'analysis'         // VOD, dados, relatórios do adversário
  | 'judgingAbility'   // olheiro: avaliar CA
  | 'judgingPotential' // olheiro: avaliar PA
  | 'motivating'       // moral
  | 'discipline'       // rotina, profissionalismo do elenco
  | 'manManagement'    // gestão de pessoas, conflitos
  | 'youthDevelopment';// evolução dos jovens

export interface StaffMember {
  id: string;
  name: string;
  nick?: string;
  country: string;
  age: number;
  role: StaffRole;
  attrs: Record<StaffAttrKey, number>; // 1–20
  wage: number;                        // por split, na moeda da Carreira
  contractUntil: number;               // split
  sourceCoachId?: string;              // se veio de um técnico real da base
}

export interface StaffState { v: 1; members: StaffMember[] }

// Efeitos agregados da comissão (1.0 = linha de base sem comissão).
export interface StaffEffects {
  training: Record<TrainingSession, number>; // multiplicador de ganho por sessão
  familiarityGain: number;
  antiStratRead: number;                     // quanto da tendência do adversário é revelada (0–1)
  scoutAccuracy: number;                     // estreita a faixa de CA/PA do olheiro (0–1)
  moraleRecovery: number;
  injuryRisk: number;                        // multiplicador de risco
  injuryRecovery: number;                    // multiplicador de velocidade de recuperação
  youthGrowth: number;
}

// ─── Bloco gravado no save da Carreira (v28) ───────────────────────────────
export interface GestaoState {
  v: 1;
  training: TrainingState;
  tactics: TacticsState;
  staff: StaffState;
  condition: Record<string, PlayerCondition>; // playerId → condição
}
