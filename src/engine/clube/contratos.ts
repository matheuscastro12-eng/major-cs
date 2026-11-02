// [fase 3 · frente CONTRATOS] Contratos completos e negociação em rodadas.
//
// Puro e determinístico (sem React, sem Math.random): o ruído vem de hashStr.
//
// ── O que mora aqui ─────────────────────────────────────────────────────────
//   1. Termos completos (`ContractTerms`) dos SEUS jogadores em `clube.contracts`
//      — substitui o `contracts` antigo (playerId → split final). Leitores:
//      `contractOf`, `contractUntilOf`, `contractUntilMap`, `releaseClauseOf`,
//      `contractWageOf`, `contractPayroll`.
//   2. Folha REAL: o salário vem do contrato. Na migração o salário fica 0
//      ("a materializar") e `materializeContracts` grava o `playerWage` do
//      jogador ATUAL — a folha do save migrado é idêntica à de antes. Até
//      materializar, o leitor cai no mesmo `playerWage` (nunca diverge).
//   3. Exigência do jogador (`demandFor`): CA (pelo salário de mercado),
//      idade, status esperado no elenco, ambição e lealdade (ocultos), o que
//      outros clubes pagam, o tier do seu clube e, na renovação, o salário e a
//      moral atuais. Calibrada para a média bater com o `playerWage` de hoje.
//   4. Negociação em rodadas com o jogador/agente (`openPlayerNegotiation` +
//      `playerNegotiationStep`): cada rodada ruim gasta paciência; aceitar,
//      contraproposta, recusa (rompe) ou fim das rodadas (expira). O agente
//      complica: quer luvas, cláusula baixa, tem menos paciência e cede menos.
//   5. Negociação com o CLUBE dono em rodadas (`openClubNegotiation` +
//      `clubNegotiationStep`), por cima do `decideOffer` (que continua sendo a
//      IA do vendedor). Depois do acordo com o clube vem a do jogador.
//
// ── Neutralidade ────────────────────────────────────────────────────────────
//   · migração: mesma folha (salário = playerWage do jogador atual);
//   · renovação: a exigência padrão de luvas é 1 salário — exatamente o custo
//     da renovação antiga ("renova e paga 1 salário");
//   · contratação: a exigência média fica poucos % acima do playerWage e a
//     barganha típica fecha perto dele (scripts/measure-folha-contratos.mts);
//   · cláusula, status prometido e bônus de lealdade nascem vazios (0/null).

import type { ClubeState, ContractTerms, Negotiation, SquadStatus } from './model';
import type { Player } from '../../types';
import { hashStr } from '../../state/hash';
import { ct } from '../../state/career-i18n';
import { playerOvr, playerValue, playerWage } from '../ratings';
import { attrsOf } from '../attrs/model';

// ─── Constantes ────────────────────────────────────────────────────────────
export const CONTRACT_TERM_DEFAULT = 3; // splits (igual ao CONTRACT_TERM antigo)
export const CONTRACT_TERM_MIN = 1;
export const CONTRACT_TERM_MAX = 5;
/** Salário 0 = contrato migrado que ainda não gravou o salário real. */
export const WAGE_PENDING = 0;
/** Até quantos splits antes do fim (contando o atual) o jogador aceita discutir renovação. */
export const RENEWAL_WINDOW = 2;
export const PLAYER_MAX_ROUNDS = 5;
export const CLUB_MAX_ROUNDS = 5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round5k = (v: number) => Math.round(v / 5000) * 5000;
const round10k = (v: number) => Math.round(v / 10000) * 10000;
const unit = (seed: string) => (hashStr(seed) % 10_000) / 10_000;

// ─── Status no elenco ──────────────────────────────────────────────────────
export const SQUAD_STATUSES: SquadStatus[] = ['star', 'key', 'starter', 'rotation', 'backup', 'prospect'];
export const STATUS_RANK: Record<SquadStatus, number> = { star: 5, key: 4, starter: 3, rotation: 2, prospect: 1, backup: 1 };
export const STATUS_LABEL: Record<SquadStatus, string> = {
  star: 'Estrela', key: 'Importante', starter: 'Titular', rotation: 'Rotação', backup: 'Reserva', prospect: 'Promessa',
};

// Expectativa de tempo de jogo (fração dos mapas) por status: a régua é da
// frente G (vestiário) — `expectedPlayTime` — usada aqui sem cópia local.
export { expectedPlayTime } from './vestiario';

/** Status que o jogador espera pelo lugar dele no elenco (0 = o melhor). */
export function expectedStatus(p: { ovr: number; age: number; squadRank: number }): SquadStatus {
  const r = Math.max(0, p.squadRank);
  if (p.age <= 20 && r >= 3) return 'prospect';
  if (r === 0) return p.ovr >= 78 ? 'star' : 'key';
  if (r <= 2) return p.ovr >= 80 ? 'key' : 'starter';
  if (r <= 4) return 'starter';
  if (r === 5) return 'rotation';
  return 'backup';
}

// ─── Leitores do save ──────────────────────────────────────────────────────
type WithClube = { clube?: ClubeState | null };

export function contractsOf(save: WithClube): Record<string, ContractTerms> {
  return save.clube?.contracts ?? {};
}
export function contractOf(save: WithClube, playerId: string): ContractTerms | undefined {
  return save.clube?.contracts?.[playerId];
}
/** Split final (inclusive) do contrato — o mesmo número do `contracts` antigo. */
export function contractUntilOf(save: WithClube, playerId: string): number | undefined {
  return save.clube?.contracts?.[playerId]?.until;
}
/** Mapa playerId → split final, para as telas que mostram "faltam N splits". */
export function contractUntilMap(save: WithClube): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, c] of Object.entries(contractsOf(save))) out[id] = c.until;
  return out;
}
/**
 * Multa rescisória do contrato de um jogador SEU (null = sem cláusula).
 * Frente I (mercado): proposta da IA ≥ cláusula não pode ser recusada.
 */
export function releaseClauseOf(save: WithClube, playerId: string): number | null {
  const c = contractOf(save, playerId);
  return c?.releaseClause != null && c.releaseClause > 0 ? c.releaseClause : null;
}
/** Salário por split do contrato; sem contrato (ou salário a materializar) cai no de mercado. */
export function contractWageOf(save: WithClube, playerId: string, marketWage: () => number): number {
  const w = contractOf(save, playerId)?.wage ?? 0;
  return w > WAGE_PENDING ? w : marketWage();
}
/** Folha base (sem encargos de dificuldade) dos jogadores listados. */
export function contractPayroll(save: WithClube, squad: { id: string; marketWage: number }[]): number {
  return squad.reduce((acc, p) => acc + contractWageOf(save, p.id, () => p.marketWage), 0);
}
/** Splits restantes contando o atual (o mesmo `until − split + 1` das telas antigas). */
export function contractSplitsLeft(c: Pick<ContractTerms, 'until'> | undefined, split: number): number | null {
  return c ? c.until - split + 1 : null;
}

// ─── Escrita ───────────────────────────────────────────────────────────────
function baseClube(save: WithClube): ClubeState {
  return save.clube ?? {
    v: 1,
    dressing: { v: 1, status: {}, lineup: null, playTime: {}, meetings: [], conflicts: [] },
    contracts: {},
    negotiations: [],
    market: { v: 1, budgets: {}, incoming: [], rumors: [], loans: [] },
  };
}
export function withContract(save: WithClube, playerId: string, terms: ContractTerms): ClubeState {
  const c = baseClube(save);
  return { ...c, contracts: { ...c.contracts, [playerId]: normalizeTerms(terms) } };
}
export function withoutContracts(save: WithClube, playerIds: Iterable<string>): ClubeState {
  const c = baseClube(save);
  const contracts = { ...c.contracts };
  for (const id of playerIds) delete contracts[id];
  return { ...c, contracts };
}
/** Mantém só os contratos de quem está no elenco (poda de quem saiu). */
export function keepContracts(save: WithClube, ids: Set<string>): ClubeState {
  const c = baseClube(save);
  const contracts: Record<string, ContractTerms> = {};
  for (const [id, t] of Object.entries(c.contracts)) if (ids.has(id)) contracts[id] = t;
  return { ...c, contracts };
}
/** Assinatura com status prometido: grava também o status no vestiário (frente G lê). */
export function signContract(save: WithClube, playerId: string, terms: ContractTerms): ClubeState {
  const c = withContract(save, playerId, terms);
  if (!terms.statusPromise) return c;
  return { ...c, dressing: { ...c.dressing, status: { ...c.dressing.status, [playerId]: terms.statusPromise } } };
}

export function normalizeTerms(t: ContractTerms): ContractTerms {
  return {
    wage: Math.max(0, Math.round(t.wage)),
    until: Math.round(t.until),
    signingBonus: Math.max(0, Math.round(t.signingBonus ?? 0)),
    releaseClause: t.releaseClause != null && t.releaseClause > 0 ? Math.round(t.releaseClause) : null,
    statusPromise: t.statusPromise ?? null,
    loyaltyBonus: Math.max(0, Math.round(t.loyaltyBonus ?? 0)),
  };
}

/** Contrato padrão sem negociação (base promovida, acordo sem termos): salário de mercado, 3 splits. */
export function defaultTerms(marketWage: number, split: number, term = CONTRACT_TERM_DEFAULT): ContractTerms {
  return normalizeTerms({ wage: marketWage, until: split + term - 1, signingBonus: 0, releaseClause: null, statusPromise: null, loyaltyBonus: 0 });
}

// ─── Migração (v29) ────────────────────────────────────────────────────────
// Converte o `contracts` antigo (playerId → split final) em termos completos.
// O salário não pode ser resolvido aqui (a migração não conhece a base de
// jogadores nem a evolução): fica WAGE_PENDING e a Carreira materializa com
// `materializeContracts` no primeiro render — mesma folha de antes.
export function defaultContracts(save?: Record<string, unknown>): Record<string, ContractTerms> {
  const old = (save?.contracts ?? {}) as Record<string, unknown>;
  const out: Record<string, ContractTerms> = {};
  for (const [id, until] of Object.entries(old)) {
    if (typeof until === 'number' && Number.isFinite(until)) {
      out[id] = { wage: WAGE_PENDING, until, signingBonus: 0, releaseClause: null, statusPromise: null, loyaltyBonus: 0 };
    }
  }
  return out;
}

/**
 * Grava o salário real nos contratos migrados (salário pendente) a partir do
 * salário de mercado do jogador ATUAL e dobra no bloco novo qualquer entrada
 * do `contracts` antigo que ainda não esteja lá (save de cliente antigo).
 * Devolve null quando não há nada a mudar (idempotente).
 */
export function materializeContracts(
  save: WithClube & { contracts?: Record<string, number> | null },
  squad: { id: string; marketWage: number }[],
): ClubeState | null {
  const c = baseClube(save);
  const contracts = { ...c.contracts };
  let changed = !save.clube;
  for (const [id, until] of Object.entries(save.contracts ?? {})) {
    if (!(id in contracts) && typeof until === 'number' && Number.isFinite(until)) {
      contracts[id] = { wage: WAGE_PENDING, until, signingBonus: 0, releaseClause: null, statusPromise: null, loyaltyBonus: 0 };
      changed = true;
    }
  }
  for (const p of squad) {
    const cur = contracts[p.id];
    if (cur && !(cur.wage > WAGE_PENDING)) {
      contracts[p.id] = { ...cur, wage: Math.max(1, Math.round(p.marketWage)) };
      changed = true;
    }
  }
  return changed ? { ...c, contracts } : null;
}

/**
 * [integração] Rede de segurança: todo jogador do elenco tem contrato. Quem não
 * tiver entrada em `clube.contracts` (save que pulou o mercado da fundação, ou
 * qualquer caminho que esqueça de gravar) ganha o contrato PADRÃO — o mesmo da
 * fundação (`defaultTerms`: 3 splits a partir do split atual, sem luvas,
 * cláusula nem status). O salário é o de mercado (`wageOf`); sem ele fica
 * WAGE_PENDING e `materializeContracts` grava o `playerWage` no primeiro render,
 * igual à migração. Stand-in emprestado (`exclude`) não assina. Idempotente:
 * devolve null quando todos já têm contrato.
 */
export function ensureSquadContracts(
  save: WithClube,
  squadIds: string[],
  split: number,
  opts: { wageOf?: (playerId: string) => number | undefined; exclude?: ReadonlySet<string> } = {},
): ClubeState | null {
  const c = baseClube(save);
  let contracts: Record<string, ContractTerms> | null = null;
  for (const id of squadIds) {
    if (opts.exclude?.has(id) || c.contracts[id]) continue;
    contracts ??= { ...c.contracts };
    const w = opts.wageOf?.(id);
    contracts[id] = w != null && w > WAGE_PENDING
      ? defaultTerms(w, split)
      : { wage: WAGE_PENDING, until: split + CONTRACT_TERM_DEFAULT - 1, signingBonus: 0, releaseClause: null, statusPromise: null, loyaltyBonus: 0 };
  }
  return contracts ? { ...c, contracts } : null;
}

/** Bônus de lealdade devidos a quem cumpre o contrato até o fim no split que fecha. */
export function loyaltyPayouts(save: WithClube, closingSplit: number, squadIds: Iterable<string>): { playerId: string; amount: number }[] {
  const out: { playerId: string; amount: number }[] = [];
  for (const id of squadIds) {
    const c = contractOf(save, id);
    if (c && c.until === closingSplit && (c.loyaltyBonus ?? 0) > 0) out.push({ playerId: id, amount: c.loyaltyBonus! });
  }
  return out;
}

// ─── Perfil do jogador na negociação ──────────────────────────────────────
export interface HiddenForContract { ambition: number; loyalty: number; professionalism: number; temperament: number }

export interface NegoProfile {
  playerId: string;
  ovr: number;
  age: number;
  /** playerWage: o que o mercado paga pelo CA dele (a régua calibrada da folha). */
  marketWage: number;
  /** playerValue: valor de mercado (régua da cláusula). */
  marketValue: number;
  hidden: HiddenForContract;
  /** tier do SEU clube (1 = elite … 3). */
  clubTier: number;
  /** quantos jogadores do seu elenco (sem ele) têm OVR maior — define o status esperado. */
  squadRank: number;
  kind: 'signing' | 'renewal';
  split: number;
  /** contrato atual (renovação). */
  current?: ContractTerms | null;
  /** status atual no vestiário (frente G). */
  currentStatus?: SquadStatus | null;
  /** moral 0–100 (renovação). */
  morale?: number;
  /** [equilíbrio] contratação de free agent (sem taxa de transferência). */
  freeAgent?: boolean;
}

/**
 * Perfil a partir do jogador: CA/idade/ocultos da fonte da verdade (attrsOf),
 * salário e valor de mercado das réguas de hoje (playerWage/playerValue) e o
 * lugar dele no seu elenco (OVR dos outros, sem ele).
 */
export function negoProfileFor(player: Player, ctx: {
  age: number;
  clubTier: number;
  /** OVR dos jogadores do seu elenco SEM ele. */
  squadOvrs: number[];
  kind: NegoProfile['kind'];
  split: number;
  current?: ContractTerms | null;
  currentStatus?: SquadStatus | null;
  morale?: number;
}): NegoProfile {
  const ovr = playerOvr(player);
  const h = attrsOf(player).h;
  return {
    playerId: player.id, ovr, age: ctx.age,
    marketWage: playerWage(player), marketValue: playerValue(player),
    hidden: { ambition: h.ambition, loyalty: h.loyalty, professionalism: h.professionalism, temperament: h.temperament },
    clubTier: ctx.clubTier,
    squadRank: ctx.squadOvrs.filter((o) => o > ovr).length,
    kind: ctx.kind, split: ctx.split, current: ctx.current ?? null, currentStatus: ctx.currentStatus ?? null, morale: ctx.morale,
  };
}

export type AgentStyle = 'hard' | 'fair';
export interface AgentInfo { has: boolean; style: AgentStyle }

/** Agente do jogador: estrelas quase sempre têm; o estilo é do agente (estável por jogador). */
export function agentOf(playerId: string, ovr: number): AgentInfo {
  const has = hashStr(`agent:${playerId}`) % 100 < (ovr >= 84 ? 80 : ovr >= 78 ? 55 : 30);
  return { has, style: has && hashStr(`agentStyle:${playerId}`) % 3 === 0 ? 'hard' : 'fair' };
}

/** Nível de clube que o jogador acha que merece (1 = elite). */
export function caliberTier(ovr: number): number {
  return ovr >= 85 ? 1 : ovr >= 78 ? 2 : 3;
}

/** Prêmio máximo sobre o salário de mercado quando muitos clubes querem o jogador. */
export const RIVAL_PREMIUM = 0.08;

/** Interesse de outros clubes (0–1): craques têm mais portas abertas; varia por split. */
export function rivalInterest(p: Pick<NegoProfile, 'playerId' | 'ovr' | 'split'>): number {
  const base = clamp((p.ovr - 72) / 20, 0, 1);
  return Math.round(base * (0.6 + 0.4 * unit(`rival:${p.playerId}:${p.split}`)) * 100) / 100;
}
/** O que outros clubes pagariam por split (referência mostrada na negociação). */
export function rivalWage(p: Pick<NegoProfile, 'playerId' | 'ovr' | 'split' | 'marketWage'>): number {
  return round5k(p.marketWage * (1 + RIVAL_PREMIUM * rivalInterest(p)));
}

export interface DemandFactor { key: string; label: string; pct: number }
export interface Demand {
  terms: ContractTerms;
  /** duração preferida em splits. */
  term: number;
  wantedStatus: SquadStatus;
  /** teto de cláusula que o jogador exige (null = não exige cláusula). */
  maxClause: number | null;
  factors: DemandFactor[];
  agent: AgentInfo;
}

function preferredTerm(p: NegoProfile): number {
  if (p.age <= 21) return p.hidden.ambition >= 13 ? 2 : 3;
  if (p.age <= 27) return 3;
  if (p.age <= 31) return 4;
  return 3; // veterano: mais que 3 splits nem ele acha que aguenta
}

/**
 * Exigência de abertura do jogador. Salário = salário de mercado × fatores:
 * ambição, gap entre o nível dele e o tier do seu clube, lealdade (só na
 * renovação), concorrência (outros clubes), idade e moral. Na renovação nunca
 * aceita corte forte do que já ganha.
 */
export function demandFor(p: NegoProfile): Demand {
  const agent = agentOf(p.playerId, p.ovr);
  const { ambition: amb, loyalty: loy } = p.hidden;
  const factors: DemandFactor[] = [];
  const add = (key: string, label: string, f: number) => {
    if (Math.abs(f - 1) >= 0.005) factors.push({ key, label, pct: Math.round((f - 1) * 100) });
    return f;
  };

  let mult = 1;
  mult *= add('ambition', amb >= 13 ? 'Ambicioso: quer ganhar mais' : amb <= 9 ? 'Pouco ambicioso: pede menos' : 'Ambição', 1 + (amb - 12) * 0.01);
  const gap = p.clubTier - caliberTier(p.ovr);
  const tierF = gap > 0 ? 1 + gap * (0.04 + Math.max(0, amb - 10) * 0.006) : 1 + gap * 0.04;
  mult *= add('tier', gap > 0 ? 'Seu clube está abaixo do nível dele' : 'A vitrine do seu clube ajuda', tierF);
  if (p.kind === 'renewal') mult *= add('loyalty', loy >= 13 ? 'Leal ao clube: aceita menos' : loy <= 7 ? 'Sem apego ao clube' : 'Lealdade', 1 - (loy - 10) * 0.008);
  mult *= add('rivals', 'Outros clubes pagariam mais', 1 + RIVAL_PREMIUM * rivalInterest(p));
  if (p.age >= 31) mult *= add('age', 'Veterano: menos portas abertas', 0.97);
  if (p.kind === 'renewal' && (p.morale ?? 60) < 40) mult *= add('morale', 'Insatisfeito: só fica se pagar mais', 1 + (40 - (p.morale ?? 60)) / 200);

  // pacote por split que ele quer (salário + luvas diluídas na duração)
  let target = p.marketWage * mult;
  if (p.kind === 'renewal' && p.current && p.current.wage > 0) {
    // ninguém aceita corte grande: no máximo −5% (muito leal: até −10%)
    const floor = p.current.wage * (loy >= 14 ? 0.9 : 0.95);
    if (floor > target) {
      factors.push({ key: 'current', label: 'Não aceita ganhar bem menos do que ganha hoje', pct: Math.round((floor / target - 1) * 100) });
      target = floor;
    }
  }

  const term = preferredTerm(p);
  // Luvas (em salários pagos na assinatura). Contratação: o agente (e o muito
  // ambicioso) troca parte do salário por luvas — o PACOTE por split continua
  // o mesmo. Renovação: 1 salário por cima (o custo da renovação antiga); o
  // agente pede um pouco mais de luvas e um pouco menos de salário.
  const extra = p.kind === 'renewal' ? (agent.has ? 0.3 : 0) : (agent.has ? 0.5 : 0) + (amb >= 15 ? 0.25 : 0);
  const wage = Math.max(20000, round5k(target / (1 + extra / term)));
  // o que falta do pacote vira luvas (no piso salarial, pode não sobrar nada)
  const extraBonus = Math.max(0, round5k((target - wage) * term));
  // [equilíbrio] free agent de calibre não sai de graça: sem taxa pro clube,
  // ele cobra luvas de assinatura (80+: 15% do valor de mercado; 85+: 30%)
  const faBonus = p.kind === 'signing' && p.freeAgent && p.ovr >= FA_BONUS_OVR ? round5k(p.marketValue * (p.ovr >= FA_STAR_OVR ? 0.3 : 0.15)) : 0;
  if (faBonus > 0) factors.push({ key: 'freeAgent', label: 'Livre no mercado: pede luvas pelo calibre', pct: Math.round((faBonus / Math.max(1, target * term)) * 100) });
  const bonus = (p.kind === 'renewal' ? round5k(wage) : 0) + extraBonus + faBonus;

  // cláusula baixa: ambicioso em clube abaixo do nível dele (ou agente de ambicioso)
  const wantsClause = (gap >= 1 && amb >= 13) || (agent.has && amb >= 15);
  const maxClause = wantsClause ? round10k(p.marketValue * (agent.has ? 1.3 : 1.6)) : null;

  const wantedStatus = expectedStatus(p);
  return {
    terms: { wage, until: p.split + term - 1, signingBonus: bonus, releaseClause: maxClause, statusPromise: wantedStatus, loyaltyBonus: 0 },
    term, wantedStatus, maxClause, factors, agent,
  };
}

// ─── Disposição: ele aceita sequer conversar? ────────────────────────────
/** [equilíbrio] free agent a partir deste OVR pede luvas pelo calibre. */
export const FA_BONUS_OVR = 80;
/** [equilíbrio] free agent a partir deste OVR não assina com clube de tier 3. */
export const FA_STAR_OVR = 85;

export function willingToNegotiate(p: NegoProfile): { ok: true } | { ok: false; reason: string } {
  const amb = p.hidden.ambition, loy = p.hidden.loyalty;
  if (p.kind === 'signing') {
    if (p.freeAgent && p.ovr >= FA_STAR_OVR && p.clubTier >= 3) {
      return { ok: false, reason: ct('Livre no mercado e de nível de elite: não assina com um clube de tier 3.') };
    }
    if (p.clubTier - caliberTier(p.ovr) >= 2 && amb >= 16) {
      return { ok: false, reason: ct('Ambicioso demais para descer dois níveis: não quer jogar no seu tier.') };
    }
    return { ok: true };
  }
  const promised = p.current?.statusPromise;
  if (promised && p.currentStatus && STATUS_RANK[p.currentStatus] < STATUS_RANK[promised]) {
    return { ok: false, reason: ct('Foi rebaixado no elenco em relação ao status prometido: não renova.') };
  }
  if ((p.morale ?? 60) < 25 && loy < 15) {
    return { ok: false, reason: ct('Está insatisfeito demais e quer sair no fim do contrato.') };
  }
  return { ok: true };
}

// ─── Valor de uma proposta para o jogador ─────────────────────────────────
export type Issue = 'wage' | 'term' | 'bonus' | 'clause' | 'status' | 'loyalty';

export interface Offer {
  wage: number;
  /** duração em splits a partir do split atual. */
  term: number;
  signingBonus: number;
  releaseClause: number | null;
  statusPromise: SquadStatus | null;
  loyaltyBonus: number;
}

export function offerFromTerms(t: Partial<ContractTerms>, split: number): Offer {
  return {
    wage: Math.max(0, t.wage ?? 0),
    term: clamp((t.until ?? split + CONTRACT_TERM_DEFAULT - 1) - split + 1, CONTRACT_TERM_MIN, CONTRACT_TERM_MAX),
    signingBonus: Math.max(0, t.signingBonus ?? 0),
    releaseClause: t.releaseClause != null && t.releaseClause > 0 ? t.releaseClause : null,
    statusPromise: t.statusPromise ?? null,
    loyaltyBonus: Math.max(0, t.loyaltyBonus ?? 0),
  };
}
export function termsFromOffer(o: Offer, split: number): ContractTerms {
  return normalizeTerms({
    wage: o.wage, until: split + clamp(Math.round(o.term), CONTRACT_TERM_MIN, CONTRACT_TERM_MAX) - 1,
    signingBonus: o.signingBonus, releaseClause: o.releaseClause, statusPromise: o.statusPromise, loyaltyBonus: o.loyaltyBonus,
  });
}

/** Status oferecido × esperado (sem promessa = o status que ele teria de qualquer jeito). */
function statusGap(o: Offer, wanted: SquadStatus): number {
  const offered = o.statusPromise ?? wanted;
  return STATUS_RANK[offered] - STATUS_RANK[wanted];
}

/**
 * Valor da proposta em "salário equivalente por split" para ESTE jogador:
 * salário + luvas e bônus de lealdade diluídos na duração (agente valoriza
 * luvas; leal valoriza lealdade) + crédito de cláusula baixa (ambicioso) +
 * crédito/débito de status − penalidade por duração fora da preferida.
 */
export function offerValue(p: NegoProfile, d: Demand, o: Offer): number {
  const amb = p.hidden.ambition, loy = p.hidden.loyalty;
  const ref = d.terms.wage;
  const term = clamp(o.term, CONTRACT_TERM_MIN, CONTRACT_TERM_MAX);
  let v = o.wage;
  v += (o.signingBonus / term) * (d.agent.has ? 1.25 : 1);
  v += (o.loyaltyBonus / term) * (0.5 + (loy / 20) * 0.7);
  if (o.releaseClause != null) v += ref * (amb / 20) * 0.3 * Math.max(0, 1 - o.releaseClause / (3 * Math.max(1, p.marketValue)));
  const sg = statusGap(o, d.wantedStatus);
  v += sg > 0 ? ref * 0.04 * sg : ref * 0.08 * sg * (0.5 + amb / 20);
  v -= ref * Math.abs(term - d.term) * (d.agent.has ? 0.05 : 0.04);
  return v;
}

/** Proposta que ESPELHA a exigência (o que "Aceitar exigência" manda). */
export function offerFromDemand(d: Demand, split: number): Offer {
  return offerFromTerms(d.terms, split);
}

/** Paciência inicial (0–100): temperamento e profissionalismo ajudam; agente atrapalha. */
export function initialPatience(p: NegoProfile): number {
  const a = agentOf(p.playerId, p.ovr);
  let v = 62 + (p.hidden.temperament - 10) * 2 + (p.hidden.professionalism - 10);
  if (a.has) v -= a.style === 'hard' ? 16 : 8;
  if (p.kind === 'renewal') v += (p.hidden.loyalty - 10) * 2;
  return Math.round(clamp(v, 30, 95));
}

/** Fração mínima da exigência de ABERTURA que ele aceita na rodada (cai um pouco a cada rodada, até 90%). */
export function reservation(p: NegoProfile, round: number): number {
  const a = agentOf(p.playerId, p.ovr);
  let base = 0.97 + (a.has ? (a.style === 'hard' ? 0.03 : 0.015) : 0) + (p.hidden.ambition - 10) * 0.002;
  if (p.kind === 'renewal') base -= (p.hidden.loyalty - 10) * 0.004;
  return clamp(base - 0.02 * (Math.max(1, round) - 1), 0.9, 1.02);
}

// ─── Negociação com o jogador (rodadas) ───────────────────────────────────
export interface PlayerReply {
  kind: 'accept' | 'counter' | 'walkout' | 'expired';
  msg: string;
  /** termos que ficaram abaixo do que ele quer nesta rodada. */
  issues: Issue[];
  /** paciência gasta nesta rodada. */
  patienceLost: number;
}

export function openPlayerNegotiation(p: NegoProfile): { nego: Negotiation; demand: Demand; refused?: string } {
  const demand = demandFor(p);
  const will = willingToNegotiate(p);
  const nego: Negotiation = {
    id: `p:${p.playerId}:${p.split}:${p.kind}`,
    playerId: p.playerId,
    party: 'player',
    round: 1,
    maxRounds: demand.agent.has ? PLAYER_MAX_ROUNDS - 1 : PLAYER_MAX_ROUNDS,
    offer: {},
    demand: { ...demand.terms },
    patience: will.ok ? initialPatience(p) : 0,
    status: will.ok ? 'open' : 'rejected',
    split: p.split,
  };
  return { nego, demand, refused: will.ok ? undefined : will.reason };
}

/** Exigência ATUAL (a de abertura com salário e luvas já cedidos nas rodadas). */
export function currentDemand(p: NegoProfile, nego: Negotiation): Demand {
  const d = demandFor(p);
  return {
    ...d,
    terms: { ...d.terms, wage: nego.demand.wage ?? d.terms.wage, signingBonus: nego.demand.signingBonus ?? d.terms.signingBonus },
  };
}

/** Termos abaixo do que ele quer (para a tela marcar ✕ em cada linha). */
export function offerIssues(d: Demand, o: Offer): Issue[] {
  const out: Issue[] = [];
  if (o.wage < d.terms.wage * 0.98) out.push('wage');
  if (o.term !== d.term) out.push('term');
  if (o.signingBonus < (d.terms.signingBonus ?? 0) * 0.98) out.push('bonus');
  if (d.maxClause != null && (o.releaseClause == null || o.releaseClause > d.maxClause)) out.push('clause');
  if (statusGap(o, d.wantedStatus) < 0) out.push('status');
  return out;
}

const ISSUE_TEXT: Record<Issue, string> = {
  wage: 'O salário está abaixo do que ele pede.',
  term: 'Ele quer outra duração de contrato.',
  bonus: 'As luvas estão abaixo do pedido.',
  clause: 'Sem uma cláusula de rescisão baixa ele não assina.',
  status: 'Ele espera um status maior no elenco.',
  loyalty: 'Ele valorizaria um bônus de lealdade.',
};
export function issueText(i: Issue): string { return ct(ISSUE_TEXT[i]); }

/**
 * Uma rodada: avalia a proposta, responde e atualiza paciência/exigência.
 * Regras duras (dinheiro não compensa): cláusula exigida ausente ou acima do
 * teto, e status 2+ níveis abaixo do esperado para quem é ambicioso. Fora
 * delas, aceita se o valor da proposta ≥ reserva da rodada × valor exigido.
 */
export function playerNegotiationStep(p: NegoProfile, nego: Negotiation, offerIn: Offer): { nego: Negotiation; reply: PlayerReply } {
  if (nego.status !== 'open') {
    const kind = nego.status === 'accepted' ? 'accept' : nego.status === 'expired' ? 'expired' : 'walkout';
    return { nego, reply: { kind, msg: ct('A negociação já terminou.'), issues: [], patienceLost: 0 } };
  }
  const o: Offer = { ...offerIn, term: clamp(Math.round(offerIn.term), CONTRACT_TERM_MIN, CONTRACT_TERM_MAX) };
  const d = currentDemand(p, nego);
  const agent = d.agent;
  const issues = offerIssues(d, o);
  const offerTerms = termsFromOffer(o, p.split);
  const clauseBlock = d.maxClause != null && (o.releaseClause == null || o.releaseClause > d.maxClause);
  const statusBlock = statusGap(o, d.wantedStatus) <= -2 && p.hidden.ambition >= 12;
  // Aceita se a proposta vale ao menos o MENOR entre a exigência atual (o que
  // a tela mostra — igualar sempre fecha) e a reserva da rodada aplicada à
  // exigência de ABERTURA (a reserva cai a cada rodada, até ~90%).
  const opening = demandFor(p);
  const v = offerValue(p, d, o);
  const vCur = Math.max(1, offerValue(p, d, offerFromDemand(d, p.split)));
  const vOpen = Math.max(1, offerValue(p, opening, offerFromDemand(opening, p.split)));
  const resv = reservation(p, nego.round);
  const need = Math.min(vCur, resv * vOpen);
  const r = v / vCur; // distância da exigência mostrada (mede o quanto a rodada irrita)

  if (!clauseBlock && !statusBlock && v >= need - 1) {
    const msg = agent.has ? ct('O agente aceitou os termos. Contrato pronto para assinar.') : ct('Ele aceitou os termos. Contrato pronto para assinar.');
    return { nego: { ...nego, offer: offerTerms, status: 'accepted' }, reply: { kind: 'accept', msg, issues: [], patienceLost: 0 } };
  }

  // rodada ruim: gasta paciência (proposta ofensiva gasta mais)
  let lost = Math.max(6, Math.round((1 - Math.min(r, 1)) * 100));
  if (r < 0.7) lost += 12; // proposta ofensiva
  if (clauseBlock || statusBlock) lost = Math.max(lost, 18);
  if (agent.has && agent.style === 'hard') lost = Math.round(lost * 1.15);
  // primeira rodada: ele reclama, mas só rompe na hora com proposta abaixo da metade
  if (nego.round === 1 && r >= 0.5) lost = Math.min(lost, Math.max(10, nego.patience - 10));
  const patience = Math.max(0, nego.patience - lost);
  const nextRound = nego.round + 1;
  if (patience <= 0) {
    const msg = agent.has ? ct('O agente rompeu as negociações. Nada feito neste split.') : ct('Ele cansou e rompeu as negociações. Nada feito neste split.');
    return { nego: { ...nego, offer: offerTerms, patience: 0, status: 'rejected' }, reply: { kind: 'walkout', msg, issues, patienceLost: lost } };
  }
  if (nextRound > nego.maxRounds) {
    return { nego: { ...nego, offer: offerTerms, patience, status: 'expired' }, reply: { kind: 'expired', msg: ct('Acabaram as rodadas: ele vai ouvir outras propostas.'), issues, patienceLost: lost } };
  }
  // contraproposta: cede parte da distância no salário e nas luvas, até um piso
  const conc = agent.has ? (agent.style === 'hard' ? 0.15 : 0.22) : 0.3;
  const round1k = (v: number) => Math.round(v / 1000) * 1000; // concessão em passos finos (salário baixo também cede)
  const wageFloor = round1k(opening.terms.wage * (agent.has ? 0.95 : 0.92));
  const bonusFloor = round1k((opening.terms.signingBonus ?? 0) * (agent.has ? 0.85 : 0.6));
  const curW = d.terms.wage, curB = d.terms.signingBonus ?? 0;
  const wage = Math.min(curW, Math.max(wageFloor, round1k(curW - Math.max(0, curW - o.wage) * conc)));
  const signingBonus = Math.min(curB, Math.max(bonusFloor, round1k(curB - Math.max(0, curB - o.signingBonus) * conc)));
  const main = clauseBlock ? 'clause' : statusBlock ? 'status' : issues[0];
  const msg = main ? issueText(main) : ct('Está perto, mas ainda não chega lá.');
  return {
    nego: { ...nego, offer: offerTerms, demand: { ...nego.demand, wage, signingBonus }, patience, round: nextRound },
    reply: { kind: 'counter', msg, issues, patienceLost: lost },
  };
}

// ─── Negociação com o clube dono (rodadas sobre o decideOffer) ───────────
export type ClubReply =
  | { kind: 'accept'; reason?: string }
  | { kind: 'counter'; value: number; reason?: string }
  | { kind: 'reject'; firm: boolean; msg: string };

export function openClubNegotiation(args: { playerId: string; split: number; asking: number }): Negotiation {
  return {
    id: `c:${args.playerId}:${args.split}`,
    playerId: args.playerId,
    party: 'club',
    round: 1,
    maxRounds: CLUB_MAX_ROUNDS,
    offer: {},
    demand: { fee: args.asking },
    patience: 100,
    status: 'open',
    split: args.split,
  };
}

/** Rodada 0-based que o decideOffer espera. */
export function decideRound(nego: Negotiation): number {
  return Math.max(0, nego.round - 1);
}

/**
 * Aplica a resposta do decideOffer à negociação: contraproposta gasta
 * paciência pela distância; recusa gasta muito; recusa firme encerra; acabar
 * as rodadas expira (o clube encerra a conversa até o próximo split).
 */
export function clubNegotiationStep(nego: Negotiation, offerFee: number, reply: ClubReply): Negotiation {
  if (nego.status !== 'open') return nego;
  const offer = { fee: Math.round(offerFee) };
  if (reply.kind === 'accept') return { ...nego, offer, status: 'accepted' };
  if (reply.kind === 'reject' && reply.firm) return { ...nego, offer, patience: 0, status: 'rejected' };
  const ask = reply.kind === 'counter' ? reply.value : (nego.demand.fee ?? offerFee);
  const gap = clamp(1 - offerFee / Math.max(1, ask), 0, 1);
  const lost = reply.kind === 'counter' ? Math.round(10 + gap * 45) : 35;
  const patience = Math.max(0, nego.patience - lost);
  const round = nego.round + 1;
  const demand = reply.kind === 'counter' ? { fee: reply.value } : nego.demand;
  if (patience <= 0) return { ...nego, offer, demand, patience: 0, status: 'rejected' };
  if (round > nego.maxRounds) return { ...nego, offer, demand, patience, status: 'expired' };
  return { ...nego, offer, demand, patience, round };
}

// ─── Histórico de negociações no save ────────────────────────────────────
/** Grava o resultado (substitui a mesma conversa; poda splits antigos). */
export function recordNegotiation(save: WithClube, nego: Negotiation): ClubeState {
  const c = baseClube(save);
  const keep = c.negotiations.filter((n) => n.split >= nego.split && !(n.playerId === nego.playerId && n.party === nego.party && n.split === nego.split));
  return { ...c, negotiations: [...keep, nego].slice(-40) };
}
/** Conversa rompida/expirada neste split: não reabre até o próximo. */
export function negotiationBlock(save: WithClube, playerId: string, party: Negotiation['party'], split: number): Negotiation | null {
  return save.clube?.negotiations?.find((n) => n.playerId === playerId && n.party === party && n.split === split && (n.status === 'rejected' || n.status === 'expired')) ?? null;
}

// ─── Aba Contratos ────────────────────────────────────────────────────────
export interface ContractRow {
  playerId: string;
  terms: ContractTerms | null;
  wage: number;
  marketWage: number;
  /** salário do contrato ÷ mercado − 1 (positivo = paga acima do mercado). */
  vsMarket: number;
  left: number | null;
  canRenew: boolean;
  expiring: boolean;
}
export function contractRows(save: WithClube, split: number, squad: { id: string; marketWage: number }[]): ContractRow[] {
  return squad.map((p) => {
    const terms = contractOf(save, p.id) ?? null;
    const wage = contractWageOf(save, p.id, () => p.marketWage);
    const left = contractSplitsLeft(terms ?? undefined, split);
    return {
      playerId: p.id, terms, wage, marketWage: p.marketWage,
      vsMarket: p.marketWage > 0 ? wage / p.marketWage - 1 : 0,
      left, canRenew: left != null && left <= RENEWAL_WINDOW, expiring: left != null && left <= 1,
    };
  });
}
/** Vencimentos agrupados por split final (para a linha do tempo da aba). */
export function expiryTimeline(rows: ContractRow[]): { until: number; ids: string[]; wage: number }[] {
  const by = new Map<number, { until: number; ids: string[]; wage: number }>();
  for (const r of rows) {
    if (!r.terms) continue;
    const g = by.get(r.terms.until) ?? { until: r.terms.until, ids: [], wage: 0 };
    g.ids.push(r.playerId);
    g.wage += r.wage;
    by.set(r.terms.until, g);
  }
  return [...by.values()].sort((a, b) => a.until - b.until);
}
