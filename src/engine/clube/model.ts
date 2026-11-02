// CONTRATO DA FASE 3 DO REALISMO FM — pessoas e mercado: vestiário (dinâmica,
// status no elenco, banco), contratos negociados em rodadas e IA de mercado com
// estratégia. Três frentes trabalham em paralelo em cima deste arquivo; as
// ASSINATURAS são o contrato (implementação interna pode mudar).
//
//   - vestiário (src/engine/clube/vestiario.ts): status no elenco estilo FM,
//     hierarquia, grupos sociais, felicidade ligada aos ocultos, conversas e
//     reuniões com peso, banco (6º/7º jogador) e escalação dos 5 titulares.
//   - contratos (src/engine/clube/contratos.ts): termos completos, negociação
//     em rodadas com jogador/agente, renovações, cláusulas.
//   - mercado   (src/engine/clube/mercado.ts): orçamento e estratégia por clube
//     da IA, necessidades por função, propostas pelos seus jogadores, janelas,
//     roster lock, empréstimo/stand-in, rumores.
//
// Save da Carreira: v29 grava `clube` (ver saveMigrations.ts) chamando os
// `default*` de cada frente. Nenhuma frente sobe a versão do save.

import type { Role } from '../../types';

// ─── Vestiário ─────────────────────────────────────────────────────────────
// Status no elenco (FM: Star Player … Hot Prospect). É PROMESSA: jogador cobra
// tempo de jogo compatível e fica infeliz se não recebe.
export type SquadStatus = 'star' | 'key' | 'starter' | 'rotation' | 'backup' | 'prospect';

export interface Lineup {
  starters: string[]; // exatamente 5 playerIds (o motor joga com estes)
  bench: string[];    // 0–2 reservas (6º/7º); entram por lesão/decisão e contam tempo de jogo
}

export type SocialGroupKey = string; // ex.: 'lang:pt', 'lang:ru', 'veterans', 'youngsters'

export interface DressingRoomState {
  v: 1;
  status: Record<string, SquadStatus>;          // playerId → status prometido/atribuído
  lineup: Lineup | null;                          // null = motor usa os 5 do elenco como hoje
  playTime: Record<string, { played: number; available: number }>; // mapas jogados × disponíveis no split
  meetings: { split: number; kind: 'praise' | 'demand' | 'calm'; outcome: number }[]; // reuniões de equipe
  conflicts: { a: string; b: string; since: number; severity: number; mediatedAt?: number }[]; // atritos entre jogadores
  // [frente VESTIÁRIO · mudança de contrato] campos opcionais (defaultDressingRoom preenche):
  unrest?: Record<string, { level: 0 | 1 | 2 | 3; since: number }>; // 1 incomodado · 2 pediu conversa · 3 pediu para sair
  lastPlayTime?: Record<string, number>; // fração de mapas jogados no ÚLTIMO split fechado (0–1)
}

// ─── Contratos ─────────────────────────────────────────────────────────────
export interface ContractTerms {
  wage: number;              // por split, moeda da Carreira
  until: number;             // split final (inclusive)
  signingBonus?: number;     // luvas (pagas na assinatura)
  releaseClause?: number | null; // multa rescisória: proposta ≥ cláusula não pode ser recusada pelo clube
  statusPromise?: SquadStatus | null; // status prometido no contrato
  loyaltyBonus?: number;     // pago ao fim do contrato se ficar até o fim
}

export type NegotiationParty = 'player' | 'club'; // com o jogador (contrato) ou com o clube dono (transferência)

export interface Negotiation {
  id: string;
  playerId: string;
  party: NegotiationParty;
  round: number;             // rodada atual (1..maxRounds)
  maxRounds: number;
  offer: Partial<ContractTerms> & { fee?: number };   // sua última proposta
  demand: Partial<ContractTerms> & { fee?: number };  // exigência atual do outro lado
  patience: number;          // 0–100: some a cada rodada ruim; 0 = encerra
  status: 'open' | 'accepted' | 'rejected' | 'expired';
  split: number;
}

// ─── Mercado da IA ─────────────────────────────────────────────────────────
export type ClubStrategy = 'starBuyer' | 'youth' | 'national' | 'balanced' | 'moneyball' | 'survival';

// [fase 3 · mercado] por que o clube foi ao mercado (necessidade por função)
export type NeedReason = 'hole' | 'sold' | 'old' | 'slump' | 'upgrade' | 'elite'; // elite = proposta de org de elite no fim do split

export interface IncomingOffer {
  id: string;
  playerId: string;          // jogador SEU
  fromTeamId: string;
  fee: number;
  wageOffered?: number;      // o que o clube oferece ao jogador (pesa na vontade dele)
  viaReleaseClause?: boolean;// bateu a cláusula: você não pode recusar
  split: number;
  expiresSplit: number;
  status: 'open' | 'accepted' | 'rejected' | 'countered' | 'expired';
  // [fase 3 · mercado] campos opcionais de exibição e da contraproposta
  nick?: string;
  ovr?: number;
  role?: Role;
  fromTag?: string;
  fromName?: string;
  reason?: NeedReason;       // a necessidade do clube que gerou a proposta
  strategy?: ClubStrategy;   // estratégia do clube comprador
  askedFee?: number;         // sua contraproposta (status 'countered' = o clube respondeu com `fee`)
  playerRefused?: boolean;   // cláusula paga, mas o jogador não quis ir (fica)
  outPlayerId?: string;      // quem perde a vaga no comprador (vai pro mercado livre na janela)
}

export interface TransferWindow { open: boolean; rosterLocked: boolean; label: string }

// [fase 3 · mercado] empréstimo / stand-in. `toTeamId` recebe o jogador até o
// fim de `untilSplit`; `fromTeamId` é o dono ('user' = seu clube, '__free__' =
// stand-in tirado do mercado livre pela IA). `state: 'agreed'` = acertado, entra
// na próxima janela; 'active' = valendo.
export interface MarketLoan {
  playerId: string;
  toTeamId: string;
  untilSplit: number;
  fromTeamId?: string;
  nick?: string;
  fee?: number;              // taxa do empréstimo (paga por quem recebe)
  splits?: number;           // duração em splits, contada a partir da ativação
  state?: 'agreed' | 'active';
  kind?: 'out' | 'in' | 'ai';// out = você empresta; in = stand-in que você trouxe; ai = stand-in da IA
  startSplit?: number;
  signing?: Record<string, unknown>; // snapshot da vaga (Signing) pra o jogador voltar ao seu elenco
}

// [fase 3 · mercado] resumo de uma janela (tela Transferências e medição)
export interface MarketWindowLog {
  split: number;
  kind: 'offseason' | 'mid' | 'boot';
  moves: number;             // movimentos de jogador entre clubes/mercado livre
  chains: number;            // movimentos disparados por uma venda (clube que vende repõe)
  standIns: number;
  offers: number;            // propostas geradas pelos seus jogadores
  items?: { nick: string; cc: string; from: string; to: string; fee: number; reason?: string; chain?: boolean }[];
}

export interface MarketState {
  v: 1;
  budgets: Record<string, number>;   // teamId → caixa de transferência da IA (recalculado por split)
  incoming: IncomingOffer[];         // propostas pelos seus jogadores
  rumors: { split: number; text: string; playerId?: string; teamId?: string }[];
  loans: MarketLoan[];
  // [fase 3 · mercado] opcionais
  strategies?: Record<string, ClubStrategy>; // teamId → estratégia no split
  arrivals?: Record<string, number>;         // playerId → split em que chegou ao clube da IA (entra entre os 5)
  windows?: MarketWindowLog[];               // janelas mais recentes primeiro (teto 12)
  lastWindow?: { split: number; event: number; kind: MarketWindowLog['kind'] } | null;
  // [fase 3 · mercado] status da janela no momento do calendário (atualizado a cada
  // virada de etapa/split; roster lock antes do Major). A frente G lê `rosterLocked`.
  window?: TransferWindow;
}

// ─── Bloco gravado no save da Carreira (v29) ───────────────────────────────
export interface ClubeState {
  v: 1;
  dressing: DressingRoomState;
  contracts: Record<string, ContractTerms>; // SEUS jogadores (substitui o `contracts` antigo: playerId → split final)
  negotiations: Negotiation[];
  market: MarketState;
}

export type { Role };
