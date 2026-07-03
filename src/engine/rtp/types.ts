// ROAD TO PRO — tipos do modo "viva a vida de um jogador de CS".
//
// Plano completo: .claude/plans/road-to-pro.md
//
// O RTP é uma CAMADA DE PROTAGONISTA por cima do engine de time existente, num
// save SEPARADO (família `rtm-rtp-v1`). Nada aqui mexe no save da Carreira.
//
// Princípio de modelo: os 28 atributos FM-style (engine/attributes.ts) são a
// VERDADE mutável do jogador (treináveis rumo a um `potential` oculto). Os 5
// stats legados (aim/clutch/consistency/awp/igl) que o engine de match consome
// são DERIVADOS dos 28 sob demanda — ver engine/rtp/coreStats.ts.

import type { Role, Playstyle, TPlayer, Tournament } from '../../types';
import type { League as CareerLeagueGSL } from '../league';
import type { AttrKey } from '../attributes';
import type { PlayerPersonality } from '../career/personality';
import type { MacroRegion } from '../../data/regions';
import type { RtpIconName } from './icons';

// ─────────────────────────────────────────────────────────────────────────────
// Jogador protagonista

export interface ProPlayer {
  id: string;
  nick: string;
  name: string;
  country: string;            // ISO-3166 alpha-2, lowercase
  role: Role;
  role2?: Role;
  playstyle: Playstyle;
  personality: PlayerPersonality;
  archetype: ArchetypeKind;   // semente do perfil inicial dos atributos
  age: number;                // começa 16-18
  attrs: Record<AttrKey, number>;     // 1-20 MUTÁVEL (treinado)
  trainingXp: Record<AttrKey, number>; // 0..1 progresso fracionário até o próximo ponto (RTP2)
  potential: Record<AttrKey, number>; // teto oculto por atributo (o "PA")
  potentialRevealed: number;          // 0-100 quão visível é o potencial (scouting/coach)
  form: number;               // 0.85..1.15 — fase recente
  ovr: number;                // cache derivado de attrs+role
  progression: PlayerProgression; // RTP v8 — nível/XP, perks e traits (identidade RPG)
}

// ─────────────────────────────────────────────────────────────────────────────
// Progressão RPG (RTP v8): nível/XP ganho jogando, PERKS gastáveis (árvore por
// função) e TRAITS emergentes (identidade conquistada pelo estilo de jogo). Os
// ids concretos (união) e os efeitos vivem em engine/rtp/perks.ts — aqui ficam
// só como string[] pra evitar ciclo de import com a camada de tipos.
export interface PlayerProgression {
  level: number;              // 1..50
  xp: number;                 // XP acumulado dentro do nível atual
  perkPoints: number;         // pontos de perk não gastos
  perks: string[];            // PerkId[] desbloqueados
  traits: string[];           // TraitId[] conquistados
  tally: ProgressTally;       // contadores vitalícios pra detecção de traits/marcos
}

// Contadores vitalícios que alimentam traits e marcos de carreira.
export interface ProgressTally {
  wins: number;
  openings: number;           // aberturas (first kills) somadas
  clutches: number;           // clutches vencidos
  hs: number;                 // abates de headshot
  multiKills: number;         // rounds de multi-kill (3k+)
  bigWins: number;            // vitórias sobre adversário mais forte
  peakStreak: number;         // maior sequência de vitórias
}

// Arquétipos de criação: viesam o perfil inicial dos 28 atributos. Puramente
// um ponto de partida — tudo evolui com treino depois.
export type ArchetypeKind = 'aimstar' | 'tactician' | 'clutchgod' | 'allrounder';

export interface ArchetypeDef {
  kind: ArchetypeKind;
  label: string;
  desc: string;
  icon: RtpIconName;
  // peso por categoria no seed inicial (mechanical/mental/physical) — soma livre
  bias: { mechanical: number; mental: number; physical: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vida off-game (escopo "focado" — ver decisões travadas no plano)

export interface LifeState {
  energy: number;   // 0-100 — moeda principal do loop semanal
  fitness: number;  // 0-100 — saúde física; baixo = risco de RSI/lesão
  morale: number;   // 0-100 — mental; derrota/término derruba
  focus: number;    // 0-100 — concentração; festa/distração derruba
  fame: number;     // 0-100 — fãs/mídia
  money: number;    // R$
  rel: PersonRelations;
  flags: LifeFlags;
}

export interface PersonRelations {
  team: number;     // entrosamento social com o elenco (≠ chemistry tática)
  coach: number;
  fans: number;
  family: number;
  partner: number;  // 0 = sem relacionamento
}

export interface LifeFlags {
  injured?: { kind: InjuryKind; weeksLeft: number };
  streak?: number;          // série de boas (+) / más (−) partidas
  contractAnxiety?: boolean;
}

export type InjuryKind = 'wrist' | 'back' | 'burnout';

// Medidores de vida — metadados pra UI (ordem, label, cor, ícone).
export type LifeMeterKey = 'energy' | 'fitness' | 'morale' | 'focus' | 'fame';

// ─────────────────────────────────────────────────────────────────────────────
// Setup do jogador (RTP v6): periféricos + psicólogo. Você começa todo sucateado
// e vai melhorando conforme ganha dinheiro/carreira — o gear impacta treino e
// desempenho em partida (ver engine/rtp/setup.ts).

export type PeripheralSlot =
  | 'mouse' | 'keyboard' | 'monitor' | 'headset'
  | 'mousepad' | 'chair' | 'pc' | 'internet';

export type GearTier = 0 | 1 | 2 | 3 | 4;   // 0 = sucata inicial

export interface SetupState {
  gear: Record<PeripheralSlot, GearTier>;
  psychTier: GearTier;        // 0 = sem psicólogo
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de navegação da UI (aba ativa) — RTP v6 (persistido só pra retomar).
export type RtpTabId = 'overview' | 'training' | 'league' | 'market' | 'profile';
export interface RtpUiState { tab: RtpTabId; attrsOpen?: boolean; }

// ─────────────────────────────────────────────────────────────────────────────
// Mídia & Rivalidades (RTP v9) — a camada de narrativa: um RIVAL persistente
// (adotado de um adversário forte que você enfrenta/perde), manchetes da imprensa
// que reagem à sua fase, e sua audiência (seguidores). Puro drama entre partidas.

export interface Rival {
  orgId: string;                  // realTeamId da org rival
  orgName: string;
  tag: string;
  colors: [string, string];
  logoUrl?: string;
  playerNick: string;             // o astro rival (adversário específico)
  playerRole: Role;
  playerOvr: number;
  intensity: number;              // 0..100 — sobe a cada duelo/derrota; esfria com o tempo
  h2h: { w: number; l: number };  // seu retrospecto contra o rival
  originSeason: number;
  lastSeason: number;             // última temporada em que se cruzaram
  taunt: string;                  // provocação atual (mostrada no card do rival)
}

export type HeadlineTone = 'good' | 'bad' | 'hype' | 'neutral';
export interface Headline {
  id: string;
  text: string;
  tone: HeadlineTone;
  season: number;
  week: number;
}

export interface MediaState {
  followers: number;              // audiência (cresce com fama/vitórias/viral)
  headlines: Headline[];          // manchetes recentes (cap ~10, mais novas primeiro)
  rival: Rival | null;            // seu arqui-rival atual (pode ser null)
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto de time / contrato

// Escada do RTP alinhada à carreira: academy (juniores) → access (T3) →
// challenger (T2) → elite (T1). Major fica acima (qualificação, não é divisão).
export type Tier = 'academy' | 'access' | 'challenger' | 'elite';
export type SquadRole = 'star' | 'starter' | 'rotation' | 'bench';

export interface Contract {
  wage: number;       // R$ por semana
  weeksLeft: number;
  buyout: number;     // multa rescisória
}

export interface TeamContext {
  teamId: string;
  realTeamId: string;             // id no dataset real (bo3/academia) do time atual
  teamName: string;
  tag: string;
  colors: [string, string];
  logo?: string;
  tier: Tier;
  squadRole: SquadRole;
  contract: Contract;
  teammates: TPlayer[];           // 4 colegas no formato runtime do engine de match
  chem: Record<string, number>;   // você ↔ cada colega (sourcePlayerId → 0..100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Mundo / calendário

export interface ScheduledMatch {
  id: string;
  week: number;
  oppId: string;
  oppName: string;
  oppTag: string;
  oppColors: [string, string];
  oppStrength: number;            // OVR médio aproximado do adversário
  competition: string;            // ex.: "Liga Academy — Split 1"
  played?: boolean;
  result?: { won: boolean; mapsWon: number; mapsLost: number; rating: number };
}

// Meta da diretoria pro campeonato (RTP v12). Escalada pela força do seu time no
// field: favorito → cobram título; azarão → só não passar vergonha. Bater/furar a
// meta mexe na confiança da diretoria (emprego em jogo).
export interface SeasonObjective {
  targetPlace: number;   // colocação-alvo (1=título, 2=final, 3=playoffs, 5=grupos, 7=sobreviver)
  label: string;         // ex.: "Chegar aos playoffs"
}

export interface WorldState {
  season: number;
  week: number;                   // semana dentro da temporada (== rodada da liga)
  actionsLeft: number;            // ações restantes na semana (RTP2)
  region: MacroRegion;            // macro-região do jogador (define a divisão)
  division: string;               // id da liga/circuito atual
  schedule: ScheduledMatch[];     // legado (RTP1) — substituído por league (RTP4)
  league?: CircuitState;          // RTP v6 P7 — circuito (GSL + playoff) da temporada
  transferWindowOpen: boolean;
  objective?: SeasonObjective;     // RTP v12 — meta da diretoria pro campeonato atual
  boardConfidence?: number;        // RTP v12 — confiança da diretoria em você (0-100)
  worldRank?: number;              // RTP v13 — ranking mundial do herói (1 = topo; recalcula ao fechar campeonato)
  peakRank?: number;               // RTP v13 — melhor (menor) ranking mundial já alcançado
  eventRatingSum?: number;         // RTP v13 — soma do rating por série no campeonato atual (pra MVP/EVP)
  eventSeries?: number;            // RTP v13 — nº de séries contadas no acumulador acima
  cashHist?: number[];             // RTP v14 — saldo semanal (últimas ~12 semanas, pro gráfico real)
  seasonEvent?: number;            // RTP v11 — etapa da temporada (1..EVENTS_PER_SEASON); sobrevive a transferências (o ano fecha na última etapa, não importa por quantos times você passou)
  pendingOffers?: TransferOffer[]; // RTP6 — propostas na janela de transferências
  loanReturn?: LoanReturn;         // RTP v10 — clube-mãe pra voltar ao fim do empréstimo
  major?: MajorState | null;      // RTP v6 P5 — Major em andamento (ausente entre Majors)
}

// ─────────────────────────────────────────────────────────────────────────────
// Major (RTP v6 P5) — importa o motor de campeonato da carreira (engine/swiss):
// fase Suíça de 16 → 8 classificados → Champions Stage (QF/SF/Final MD5). O time
// do herói DENTRO do Tournament usa id 'user' (contrato do swiss.ts).

export type MajorPlacementCode = 'champion' | 'runnerup' | 'semi' | 'quarters' | 'top8' | 'swiss';

export interface MajorState {
  name: string;
  edition: number;
  tier: Tier;
  tournament: Tournament;          // estado do motor da carreira (src/types)
  phaseStage: 'swiss' | 'playoffs';
  userTeamId: string;              // sempre 'user' (ver R-CHAMP-1 no plano)
  deferredOffers?: TransferOffer[]; // ofertas da janela, adiadas até o Major resolver
  resolved?: {
    placement: MajorPlacementCode;
    prize: number;
    fameDelta: number;
    trophy?: string;
    award?: 'mvp' | 'evp' | null;   // RTP v13 — prêmio individual do Major
  };
}

// Proposta de outro time (RTP6). RTP v10: pode ser um EMPRÉSTIMO (kind='loan') —
// um clube maior te leva por uma temporada pra te desenvolver; você volta ao fim
// (ou fica de vez se brilhar). Ou um GATILHO DE CLÁUSULA (clause=true) — pagaram
// sua multa rescisória: proposta premium difícil de recusar.
export interface TransferOffer {
  id: string;
  orgId: string;
  realTeamId: string;             // id no dataset real do time que ofertou
  orgName: string;
  tag: string;
  colors: [string, string];
  tier: Tier;
  wage: number;                   // R$/semana
  weeks: number;                  // duração do contrato
  buyout: number;
  squadRole: SquadRole;
  signingBonus: number;
  note: string;                   // por que o time te quer
  kind?: 'transfer' | 'loan';     // default 'transfer'
  clause?: boolean;               // gatilho de cláusula (multa paga)
  negotiated?: boolean;           // já negociou salário nesta oferta (1 por oferta)
}

// Snapshot do clube-mãe pra retornar ao fim de um empréstimo (RTP v10).
export interface LoanReturn {
  realTeamId: string;
  teamName: string;
  tag: string;
  colors: [string, string];
  logo?: string;
  tier: Tier;
  contract: Contract;
}

// ─────────────────────────────────────────────────────────────────────────────
// Liga / divisão (RTP4)

export interface LeagueTeam {
  id: string;
  name: string;
  tag: string;
  colors: [string, string];
  logoUrl?: string;               // logo real (pro scoreboard/badges)
  country?: string;
  strength: number;               // OVR médio aprox.
  players: TPlayer[];             // roster real (usado quando enfrenta você)
  isUser: boolean;
}

export interface Standing {
  teamId: string;
  w: number;
  l: number;
  rd: number;                     // saldo de mapas (round/map diff)
  pts: number;                    // 3 por vitória
}

export interface Fixture {
  round: number;
  aId: string;
  bId: string;
  result?: { aMaps: number; bMaps: number };
}

// Legado (pontos corridos, RTP4). Mantido só pra migração ler saves antigos.
export interface LeagueState {
  tier: Tier;
  teams: LeagueTeam[];
  standings: Standing[];
  schedule: Fixture[];            // double round-robin
  round: number;                  // rodada atual (1-based; == world.week)
  totalRounds: number;
}

// RTP v6 P7 — CIRCUITO: a temporada é um bracket de campeonato (igual aos
// campeonatos reais). Fase de grupos GSL (dupla-eliminação, upper/lower) → 4
// classificados → playoff (SF + Final). Reusa o motor da carreira (gsl.ts +
// swiss.ts). O time do herói usa id 'user' (contrato dos helpers).
export interface CircuitState {
  tier: Tier;
  name: string;                   // nome REAL do campeonato (ex.: "CCT South America")
  event?: number;                 // RTP v11 — etapa da temporada (1..EVENTS_PER_SEASON)
  phase: 'gsl' | 'playoffs' | 'done';
  gsl: CareerLeagueGSL;           // fase de grupos (engine/league.ts + gsl.ts)
  playoff?: Tournament;           // mata-mata dos 4 classificados (engine/swiss.ts)
  champion?: string;              // id do campeão do circuito (quando resolvido)
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventos de vida (inbox) — clonam o padrão de teamEvents (escolha → outcome)

export type LifeEventCategory =
  | 'career' | 'health' | 'personal' | 'media' | 'team' | 'money';

// Deltas que uma escolha aplica. Toca life.*, relações, contrato, patrocínio
// pessoal e lesões — tudo que o roleplay off-game precisa.
export interface LifeDelta {
  energy?: number;
  fitness?: number;
  morale?: number;
  focus?: number;
  fame?: number;
  money?: number;
  rel?: Partial<PersonRelations>;
  injury?: { kind: InjuryKind; weeks: number };
  contractWeeks?: number;         // soma em team.contract.weeksLeft
  wageMult?: number;              // multiplica team.contract.wage
  boardConf?: number;             // soma em world.boardConfidence (RTP v12 — reunião com a diretoria)
  addSponsor?: { brand: string; perWeek: number; weeks: number; fameBonus: number };
}

export interface LifeEventOption {
  id: string;
  label: string;
  outcome: string;                // narrativa após escolher
  deltas: LifeDelta;
}

export interface LifeEvent {
  id: string;                     // id da instância (único)
  templateId: string;
  category: LifeEventCategory;
  title: string;
  body: string;
  week: number;                   // semana em que apareceu
  options: LifeEventOption[];
  resolved?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Patrocínio pessoal (sponsors.ts adaptado pro indivíduo)

export interface PersonalSponsor {
  id: string;
  brand: string;
  perWeek: number;                // R$/semana enquanto ativo
  weeksLeft: number;
  fameBonus: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico de carreira (stats acumulados + troféus)

export interface CareerLog {
  matchesPlayed: number;
  mapsPlayed: number;
  kills: number;
  deaths: number;
  ratingSum: number;              // soma de rating 2.0, UMA nota por SÉRIE (média = ratingSum/matchesPlayed)
  mvps: number;
  trophies: string[];             // labels dos títulos conquistados
  awards: string[];               // prêmios individuais (labels legados; Major placement)
  accolades: Accolade[];          // RTP v13 — prêmios individuais estruturados (MVP/EVP por campeonato)
  timeline: TimelineEntry[];      // RTP v14 — linha do tempo: um registro por campeonato fechado
  records?: CareerRecords;        // RTP v15 — recordes vivos (dinastia; migração backfilla)
  peakOvr: number;
}

// Recordes vivos da carreira (RTP v15 — Dinastia & Lendas). Sequências EM CURSO
// + melhores marcas de sempre. `broken` guarda os ids de LEGEND_MARKS (legends.ts)
// já superados — garante manchete única e alimenta a pontuação de legado.
export interface CareerRecords {
  titleStreak: number;        // títulos de ELITE consecutivos (em curso; qualquer etapa fora do elite reseta)
  bestTitleStreak: number;
  majorStreak: number;        // Majors (elite) consecutivos vencidos (em curso)
  bestMajorStreak: number;
  weeksAtOne: number;         // semanas SEGUIDAS no #1 do ranking mundial (em curso)
  bestWeeksAtOne: number;
  totalWeeksAtOne: number;    // total de semanas no #1 (métrica do placar de lendas)
  seasonSeries: number;       // séries jogadas na temporada corrente
  seasonLosses: number;       // séries perdidas na temporada corrente (0 ao fechar = invicta)
  perfectSeasons: number;     // temporadas de ELITE fechadas sem perder uma série
  broken: string[];           // ids de marcos de lenda já quebrados
}

// Registro de um campeonato na linha do tempo da carreira (RTP v14). A história
// que o legado conta: temporada a temporada, onde você jogou e o que fez.
export interface TimelineEntry {
  season: number;
  event: number;                  // etapa 1..3 (0 = Major)
  eventName: string;
  tier: Tier;
  teamTag: string;
  place: number;                  // 1=campeão, 2=vice, 3=semi, 5=3º grupo, 7=4º
  rating: number;                 // rating médio do herói no campeonato
  award?: 'mvp' | 'evp';
  major?: boolean;
}

// Prêmio individual de campeonato (RTP v13). MVP = melhor do torneio que venceu;
// EVP = destaque individual sem levar o título. Alimenta vitrine + legado + ranking.
export interface Accolade {
  id: string;
  kind: 'mvp' | 'evp';
  eventName: string;
  season: number;
  rating: number;                 // rating médio do herói no campeonato
  tier: Tier;
}

// ─────────────────────────────────────────────────────────────────────────────
// Save raiz

export interface RoadToProSave {
  _v: number;                     // versão do schema (RTP_SAVE_VERSION)
  createdAt: number;
  player: ProPlayer;
  life: LifeState;
  team: TeamContext;
  world: WorldState;
  setup: SetupState;              // RTP v6 — periféricos + psicólogo
  media?: MediaState;             // RTP v9 — mídia, manchetes e rival (opcional; migração backfilla)
  ui?: RtpUiState;               // RTP v6 — aba ativa (opcional; default na UI)
  inbox: LifeEvent[];
  history: CareerLog;
  sponsors: PersonalSponsor[];
  retired?: boolean;              // RTP v10 — carreira encerrada (aposentadoria) → tela de legado
  rng: { seed: number; tick: number };   // determinismo (engine/rng.ts)
}

// Resumo leve pra listagem de slots (espelha SlotSummary da carreira).
export interface RtpSlotSummary {
  slot: number;
  exists: boolean;
  fromCloud?: boolean;
  nick?: string;
  teamName?: string;
  tier?: Tier;
  ovr?: number;
  season?: number;
}
