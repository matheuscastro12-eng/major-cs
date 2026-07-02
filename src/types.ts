export type Game = 'CS 1.6' | 'CS:Source' | 'CS:GO' | 'CS2';

export type Role = 'AWP' | 'IGL' | 'Rifler' | 'Entry' | 'Support' | 'Lurker';

// estilo de jogo: define com qual tática o jogador rende mais (e o risco que corre)
export type Playstyle = 'aggressive' | 'balanced' | 'passive';

export const PLAYSTYLE_LABELS: Record<Playstyle, string> = {
  aggressive: 'Agressivo',
  balanced: 'Equilibrado',
  passive: 'Passivo',
};

export const PLAYSTYLE_ICONS: Record<Playstyle, string> = {
  aggressive: '🔥',
  balanced: '⚖️',
  passive: '🛡️',
};

// estilo padrão derivado da função quando o jogador não tem um definido
export function derivePlaystyle(role: Role): Playstyle {
  if (role === 'Entry') return 'aggressive';
  if (role === 'Support' || role === 'Lurker') return 'passive';
  return 'balanced'; // AWP, IGL, Rifler
}

export interface Player {
  id: string;
  nick: string;
  name: string;
  country: string; // ISO-3166 alpha-2, lowercase
  role: Role;
  role2?: Role; // função secundária (ex.: AWP + IGL); opcional, conta nas duas
  age?: number; // idade explícita (override da tabela REAL_AGES, editável no CRM)
  playstyle?: Playstyle; // estilo de jogo (default derivado da role)
  aim: number;
  clutch: number;
  consistency: number;
  awp: number;
  igl: number;
}

export type CoachStyle = 'tactical' | 'aggressive' | 'discipline';

export interface Coach {
  nick: string;
  name: string;
  country: string;
  rating: number; // 50-99
  style: CoachStyle;
}

export const COACH_STYLE_LABELS: Record<CoachStyle, string> = {
  tactical: 'Tático',
  aggressive: 'Agressivo',
  discipline: 'Disciplinador',
};

export const COACH_STYLE_DESC: Record<CoachStyle, string> = {
  tactical: 'Potencializa os mapas escolhidos no veto e cobre a falta de IGL em parte',
  aggressive: 'Mais força no lado Terrorista e nas aberturas de round',
  discipline: 'O time reage melhor após perder rounds e segura a vantagem',
};

export interface TeamSeason {
  id: string;
  team: string;
  tag: string;
  era: string;
  game: Game;
  country: string;
  teamwork: number;
  honors: string;
  colors: [string, string];
  mapPrefs: Record<string, number>; // -3..+3
  coach: Coach;
  logoUrl?: string;
  liquipediaUrl?: string;
  // true = aguardando aprovação do admin no CRM; fica oculto para os jogadores
  // até ser liberado. Times sem o campo já são considerados aprovados.
  pending?: boolean;
  players: Player[];
}

export const MAP_POOL = ['mirage', 'inferno', 'nuke', 'ancient', 'anubis', 'dust2', 'train'] as const;
export type MapId = (typeof MAP_POOL)[number];

export const MAP_LABELS: Record<string, string> = {
  mirage: 'Mirage',
  inferno: 'Inferno',
  nuke: 'Nuke',
  ancient: 'Ancient',
  anubis: 'Anubis',
  dust2: 'Dust2',
  train: 'Train',
};

// ---- Tournament runtime types ----

export interface TPlayer {
  id: string; // runtime id, unique inside a tournament
  sourcePlayerId: string;
  nick: string;
  name: string;
  country: string;
  role: Role;
  role2?: Role; // função secundária (ex.: AWP + IGL)
  playstyle: Playstyle; // estilo de jogo (sempre definido no runtime)
  aim: number;
  clutch: number;
  consistency: number;
  awp: number;
  igl: number;
  skill: number; // derived overall
  ovr: number; // overall exibido (50-99)
  form?: number; // fase no torneio (0.9 frio … 1.1 em chamas), atualizada a cada série
  fromTeam?: string; // era label for drafted players
  originTeam?: string;
  originTeamId?: string;
  originEra?: string;
  originGame?: Game;
}

export interface TTeam {
  id: string;
  name: string;
  tag: string;
  country: string;
  isUser: boolean;
  game: Game | 'MIX';
  colors: [string, string];
  logoUrl?: string;
  liquipediaUrl?: string;
  strength: number;
  teamwork: number;
  mapPrefs: Record<string, number>;
  coach: Coach;
  players: TPlayer[];
  bench?: TPlayer[];
  wins: number;
  losses: number;
  roundDiff: number;
  status: 'alive' | 'advanced' | 'eliminated';
  playbook?: Playbook; // esquema tático treinado (modo carreira)
  playbookFam?: number; // entrosamento no esquema, 0..1 (quão bem treinado)
  noEdge?: boolean; // Road to Pro: dispensa o AI_EDGE de dificuldade do modo carreira
  onlinePlan?: {
    captainNick?: string;
    reserveNick?: string;
    timeoutMap?: number;
    pace?: 'aggressive' | 'default' | 'cautious';
    substituteAfterMap?: boolean;
    substitutePlayerId?: string;
  };
}

// Esquema tático do time (playbook). Cada um é forte em certas situações e fraco
// em outras — escolher e treinar o certo (e contra o adversário) é estratégia.
export type Playbook = 'aggressive' | 'tactical' | 'fast' | 'controlled';
export const PLAYBOOK_LABELS: Record<Playbook, string> = {
  aggressive: 'Pressão total',
  tactical: 'Tático / Default',
  fast: 'Execuções rápidas',
  controlled: 'Controle de mapa',
};
export const PLAYBOOK_DESC: Record<Playbook, string> = {
  aggressive: 'Duelos e agressão. Forte em pistol/force e no ataque; sofre quando atrás e no CT.',
  tactical: 'Rounds estudados. Forte no 2º half, no clutch e no seu mapa; lento em pistols.',
  fast: 'Velocidade no T. Forte no ataque e em viradas; frágil segurando como CT.',
  controlled: 'Paciência e espaço. Forte no CT e em rounds longos; fraco em pistols e ritmo alto.',
};

export interface PlayerLine {
  kills: number;
  deaths: number;
  assists: number;
  dmg: number;
  kastRounds: number;
  rounds: number;
  openKills: number;
  clutchWins: number;
  hsKills: number; // abates de headshot (coluna K(hs))
  mkRounds: number; // rounds com 2+ abates (multi-kills)
  tradedDeaths: number; // mortes que foram trocadas (coluna D(t))
}

export interface PlayerMapStats {
  both: PlayerLine;
  t: PlayerLine;
  ct: PlayerLine;
}

export interface KillEvent {
  round: number;
  killerId: string;
  victimId: string;
  killerTeam: 0 | 1;
  victimTeam: 0 | 1;
  weapon: string;
  headshot: boolean;
  opening: boolean;
  trade: boolean;
}

export interface MapResult {
  map: MapId;
  pickedBy: 0 | 1 | -1; // -1 decider
  score: [number, number];
  halves: string;
  ot: boolean;
  winner: 0 | 1;
  roundLog: (0 | 1)[];
  killFeed: KillEvent[];
  stats: Record<string, PlayerMapStats>;
}

export interface SeriesResult {
  teamIds: [string, string];
  maps: MapResult[];
  winner: 0 | 1;
  mapScore: [number, number];
}

export interface Pairing {
  a: string;
  b: string;
  label: string;
  bestOf?: 1 | 3 | 5; // formato Major: aberturas BO1, decisivos/playoffs BO3, final BO5
  result?: SeriesResult;
}

export type Phase = 'swiss' | 'quarters' | 'semis' | 'final' | 'done';

export interface Tournament {
  name: string;
  teams: TTeam[];
  phase: Phase;
  swissRound: number;
  pairings: Pairing[];
  history: { phase: string; pairing: Pairing }[];
  championId?: string;
  mvpId?: string;
  // Major em STAGES: um Swiss isolado que para ao definir os 8 classificados
  // (phase 'done', sem playoffs) — o stage seguinte carrega esses 8 + 8 seeds.
  stageOnly?: boolean;
}

export interface DraftRound {
  teamSeasonId: string;
  pickedPlayerId?: string;
}

export type TournamentPool = 'world' | 'br';

export type Difficulty = 'normal' | 'hard' | 'legend';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  normal: 'Normal',
  hard: 'Difícil',
  legend: 'Lendário',
};

export const DIFFICULTY_DESC: Record<Difficulty, string> = {
  normal: 'Campo equilibrado. Bom para aprender o jogo.',
  hard: 'Adversários afiados e campo mais forte. Cada veto conta.',
  legend: 'As maiores lendas em chamas. Vencer aqui é épico.',
};

// quanto os adversários ganham de força por dificuldade
export const DIFFICULTY_OPP_BOOST: Record<Difficulty, number> = {
  normal: 3.5,
  hard: 7,
  legend: 11,
};

// Eixo de GESTÃO da dificuldade (modo carreira): remodela a economia do SEU time
// — caixa inicial, folha salarial e frequência de patrocínios — sem tocar na
// força dos rivais (essa já existe via AI_EDGE no match). É o que faz hard/legend
// ser uma carreira mais difícil de ADMINISTRAR, não só de jogar.
export interface DifficultyEcon {
  startBudgetMul: number;   // caixa inicial ao começar a carreira
  salaryMul: number;        // peso da folha salarial (encargos por split)
  sponsorChanceMul: number; // frequência de ofertas de patrocínio
}
export const DIFFICULTY_ECON: Record<Difficulty, DifficultyEcon> = {
  normal: { startBudgetMul: 1, salaryMul: 1, sponsorChanceMul: 1 },
  hard: { startBudgetMul: 0.75, salaryMul: 1.18, sponsorChanceMul: 0.72 },
  legend: { startBudgetMul: 0.55, salaryMul: 1.32, sponsorChanceMul: 0.55 },
};

export interface DraftState {
  mode: 'classic' | 'almanac';
  pool: TournamentPool;
  difficulty: Difficulty;
  teamName: string;
  rounds: DraftRound[];
  current: number;
  rerollsLeft: number;
  // rodada final: escolha do coach (ids dos times de origem das opções)
  coachOptions: string[];
  pickedCoachTeamId?: string;
}
