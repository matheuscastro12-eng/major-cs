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
import type { Coach, Player, Role, TeamSeason } from '../../types';
import type { PlayerAttrs } from '../attrs/model';

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
  // [fase 4 · circuito] campos opcionais (o calendário gerado os preenche)
  qualifier?: 'open' | 'closed'; // qualificatório aberto (qualquer um) ou fechado (convite pelo VRS)
  venue?: string;            // sede ("Katowice 🇵🇱", "online 🌐")
  host?: string;             // país-sede (ISO, minúsculo) — visto e bootcamp
  etapa?: number;            // etapa do split (1..3) dos eventos de circuito
  slot?: string;             // vaga no calendário da etapa (t1, t1-alt, t2, …)
}

export interface WorldEventResult {
  eventId: string;
  split: number;
  placements: { teamId: string; place: number }[]; // 1 = campeão
  mvpPlayerId?: string;
  // [fase 4 · circuito] metadados opcionais (o resultado sobrevive à renovação
  // do calendário e o VRS precisa deles: idade, dinheiro real, LAN)
  name?: string;
  tier?: 1 | 2 | 3;
  kind?: EventKind;
  lan?: boolean;
  prizePool?: number;        // prize pool real (USD) — o "bounty" do VRS
  t?: number;                // tempo absoluto (etapas; ver etapaTime) — a idade no VRS
  field?: number;            // tamanho do field (placements pode estar podado)
  names?: Record<string, string>; // teamId → tag, pro histórico mostrar quem já saiu da base
}

export interface VrsEntry {
  teamId: string;
  points: number;
  history: { eventId: string; split: number; points: number }[]; // com decaimento aplicado pela frente
  // [fase 4 · circuito] opcionais: composição (0–1 por fator) e posição publicada
  factors?: { prize: number; network: number; lan: number };
  rank?: number;
  prev?: number;             // pontos da publicação anterior (seta de subida/queda)
}

// ─── Juventude ─────────────────────────────────────────────────────────────
export interface YouthIntakeLog {
  year: number;
  region: MacroRegion | 'global';
  playerIds: string[];
  /** [K] de onde saiu cada jovem: 'user' (sua base) ou id do clube com academia. Ausente = cena aberta. */
  origin?: Record<string, string>;
}

/** [K] Aposentado do mundo da IA (manchete + pool da comissão técnica). */
export interface WorldRetiree {
  id: string;
  nick: string;
  age: number;
  split: number;          // split em que parou
  ovr: number;
  role: Player['role'];
  country: string;
  teamId?: string;        // último clube
  staffRole?: 'headCoach' | 'assistant' | 'analyst' | null; // virou comissão (entra no mercado de staff)
}

// ─── Bloco gravado no save da Carreira (v30) ───────────────────────────────
export interface MundoState {
  v: 1;
  calendar: CalendarEvent[];              // temporada atual (a frente de circuito gera/renova)
  results: WorldEventResult[];            // resultados do mundo (inclusive os eventos que você não jogou)
  vrs: Record<string, VrsEntry>;          // teamId → VRS
  newgens: Record<string, Player>;        // jogadores gerados (não existem na base) — persistidos
  intake: YouthIntakeLog[];               // histórico das gerações anuais
  databaseId: string | null;              // base usada (null = oficial)
  // [K · juventude] campos opcionais (o `ensureYearIntake`/`tickJuventude` preenchem):
  seed?: string;                          // semente estável das levas desta Carreira
  newgenAttrs?: Record<string, string>;   // atributos empacotados de cada jovem (ver juventude.ts#packAttrs)
  retirees?: WorldRetiree[];              // aposentados recentes do mundo (últimos 60)
  // [frente EDITOR] cópia congelada da base customizada no momento em que a
  // Carreira foi criada (como o FM: a base é carregada no início e editar/apagar
  // a base depois não muda a Carreira). Ausente/ inválida → ver editor.ts.
  database?: CustomDatabase | null;
  // [fase 4 · circuito] opcionais
  vrsAt?: number;                         // tempo (etapaTime) da última publicação do VRS
  visa?: { eventId: string; denied: string[] } | null; // vistos negados do evento em curso
  qualifiers?: Record<string, 'won' | 'lost'>;        // qualificatórios que VOCÊ disputou (id do evento)
  bootcamp?: { eventId: string; cost: number } | null; // bootcamp feito pro evento em curso
}

// ─── Editor de base de dados (fora do save) ────────────────────────────────
// Edição de um jogador da base (oficial ou adicionado). Os 5 números legados
// nunca são editados direto: saem dos atributos (`attrs` completos, CA
// recalculado por caFromAttrs). `role2: null` remove a função secundária.
export interface CustomPlayerEdit {
  nick?: string;
  name?: string;
  country?: string;          // ISO-3166 alpha-2 minúsculo
  role?: Role;
  role2?: Role | null;
  age?: number;              // 15–45
  attrs?: PlayerAttrs;       // 28 visíveis + 8 ocultos (1–20), CA/PA (1–200)
}
// Edição de um time. `country` define a região (macroRegionOf). `roster` é o
// elenco por ids, na ordem (5 primeiros = titulares); ausente = o oficial.
export interface CustomTeamEdit {
  team?: string;
  tag?: string;
  country?: string;
  colors?: [string, string];
  teamwork?: number;         // entrosamento 40–95
  coach?: Coach;
  roster?: string[];
}
export interface CustomDatabase {
  v: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  basedOn: 'official';
  playerEdits: Record<string, CustomPlayerEdit>;  // por playerId (inclui `attrs` completos se editados)
  teamEdits: Record<string, CustomTeamEdit>;      // por teamId (nome, cores, elenco por ids, técnico…)
  addedPlayers: Player[];                          // ids `cdb_p_*`, sempre com `attrs`
  addedTeams: TeamSeason[];                        // ids `cdb_t_*`; `players` vazio: o elenco vive em teamEdits[id].roster
}
