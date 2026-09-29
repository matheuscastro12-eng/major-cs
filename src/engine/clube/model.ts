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
  conflicts: { a: string; b: string; since: number; severity: number }[]; // atritos entre jogadores
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
}

export interface TransferWindow { open: boolean; rosterLocked: boolean; label: string }

export interface MarketState {
  v: 1;
  budgets: Record<string, number>;   // teamId → caixa de transferência da IA (recalculado por split)
  incoming: IncomingOffer[];         // propostas pelos seus jogadores
  rumors: { split: number; text: string; playerId?: string; teamId?: string }[];
  loans: { playerId: string; toTeamId: string; untilSplit: number }[];
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
