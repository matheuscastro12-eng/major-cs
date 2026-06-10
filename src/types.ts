export type Game = 'CS 1.6' | 'CS:Source' | 'CS:GO' | 'CS2';

export type Role = 'AWP' | 'IGL' | 'Rifler' | 'Entry' | 'Support' | 'Lurker';

export interface Player {
  id: string;
  nick: string;
  name: string;
  country: string; // ISO-3166 alpha-2, lowercase
  role: Role;
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
  wins: number;
  losses: number;
  roundDiff: number;
  status: 'alive' | 'advanced' | 'eliminated';
}

export interface PlayerLine {
  kills: number;
  deaths: number;
  assists: number;
  dmg: number;
  kastRounds: number;
  rounds: number;
  openKills: number;
  clutchWins: number;
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
  bestOf?: 1 | 3; // formato Major: aberturas BO1, decisivos/playoffs BO3
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
  normal: 1.5,
  hard: 4,
  legend: 7,
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
