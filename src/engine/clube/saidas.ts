// SAÍDAS DO SEU ELENCO — puro, sem React.
//
// Bug relatado ("vendi/dispensei e ele voltou pro time de origem, cobrando
// taxa"): contratar nunca grava `save.moves` — o jogador continua no time da
// base, só escondido enquanto está no seu elenco (skip/oppEra). Quando ele sai
// sem um move, `applyMoves` o devolve ao clube de origem. Toda saída precisa,
// então, dizer PRA ONDE ele vai:
//   - venda (inclusive o "vender a 85%" da janela) → clube comprador;
//   - fim de contrato sem renovar → mercado livre (FREE_TEAM_ID), sem receita.
// Aqui ficam o registro da saída (moves + passagens + limpeza de compromissos),
// a escolha plausível do comprador da venda rápida e o reparo único dos saves
// já afetados.
import type { Player, TeamSeason } from '../../types';
import type { ClubStrategy, IncomingOffer, MarketLoan } from './model';
import { clubNeeds, starters, aiTierOf, mainCountryOf } from './mercadoIA';
import { playerOvr, playerValue, playerWage } from '../ratings';
import { hashStr } from '../../state/hash';
import { FREE_TEAM_ID } from '../career/transferAI';
import { closeStint, type StintsMap } from '../career/stints';

/** Venda rápida na janela: o clube interessado paga 85% do valor de mercado. */
export const QUICK_SALE_RATE = 0.85;

export interface PendingSaleLike { playerId: string; nick: string; fee: number; toTag: string; toId: string; outPlayerId?: string }

/**
 * Quanto a venda rápida rende: venda JÁ acertada (proposta aceita esperando a
 * janela) é honrada pelo valor dela; senão, 85% do valor de mercado.
 */
export function quickSaleFee(playerId: string, player: Player, pendingSales?: readonly PendingSaleLike[]): number {
  const pending = pendingSales?.find((s) => s.playerId === playerId);
  if (pending && Number.isFinite(pending.fee)) return pending.fee;
  return Math.round(playerValue(player) * QUICK_SALE_RATE);
}

// ─── registro da saída ─────────────────────────────────────────────────────
export interface ExitBooks<D extends { outPlayerIds: string[] } = { outPlayerIds: string[] }> {
  moves: Record<string, string>;
  stints?: StintsMap;
  pendingSales?: PendingSaleLike[];
  pendingDeals?: D[];
  incoming?: IncomingOffer[];
}
export interface ExitArgs {
  playerId: string;
  /** clube comprador ou FREE_TEAM_ID */
  toId: string;
  split: number;
  endOvr?: number;
  /** o id é endereçável por save.moves (jogador da base ou jovem do mundo) */
  movable: boolean;
}

/**
 * Grava a saída de um jogador SEU pra `toId`: move (se endereçável), fecha a
 * passagem, tira de vendas pendentes, derruba trocas que o incluíam e encerra
 * propostas ainda em aberto por ele. Idempotente.
 */
export function recordExit<D extends { outPlayerIds: string[] }>(b: ExitBooks<D>, a: ExitArgs): ExitBooks<D> {
  const moves = { ...b.moves };
  if (a.movable) moves[a.playerId] = a.toId;
  const out: ExitBooks<D> = { ...b, moves };
  if (b.stints) out.stints = closeStint(b.stints, a.playerId, a.split, a.endOvr);
  if (b.pendingSales) out.pendingSales = b.pendingSales.filter((s) => s.playerId !== a.playerId);
  if (b.pendingDeals) out.pendingDeals = b.pendingDeals.filter((d) => !d.outPlayerIds.includes(a.playerId));
  if (b.incoming) {
    out.incoming = b.incoming.map((o) => (o.playerId === a.playerId && (o.status === 'open' || o.status === 'countered') ? { ...o, status: 'expired' as const } : o));
  }
  return out;
}

/** Fim de contrato / dispensa sem venda: vai pro mercado livre. */
export function releaseToFree<D extends { outPlayerIds: string[] }>(b: ExitBooks<D>, a: Omit<ExitArgs, 'toId'>): ExitBooks<D> {
  return recordExit(b, { ...a, toId: FREE_TEAM_ID });
}

/** Venda: vai pro clube comprador. */
export function sellToBuyer<D extends { outPlayerIds: string[] }>(b: ExitBooks<D>, a: Omit<ExitArgs, 'toId'> & { buyerId: string }): ExitBooks<D> {
  return recordExit(b, { playerId: a.playerId, toId: a.buyerId, split: a.split, endOvr: a.endOvr, movable: a.movable });
}

/**
 * Fim do empréstimo de saída: ele volta pro SEU elenco, então o move do
 * empréstimo deixa de valer (senão uma saída futura sem destino o mandaria
 * pro clube que o recebeu). Muta e devolve o mesmo mapa (uso no laço da janela).
 */
export function endLoanOutMove(moves: Record<string, string>, playerId: string): Record<string, string> {
  delete moves[playerId];
  return moves;
}

// ─── comprador da venda rápida ─────────────────────────────────────────────
export interface BuyerCtx {
  teams: TeamSeason[];                        // clubes da IA (sem o seu)
  split: number;
  budgets: Record<string, number>;
  strategies: Record<string, ClubStrategy>;
  formOf: (teamId: string) => number;
  ageOf: (p: Player) => number;
  baseOvrOf?: (playerId: string) => number | undefined;
  /** clubes que já levaram alguém nesta mesma confirmação (um por clube, se der) */
  taken?: ReadonlySet<string>;
}
export interface BuyerPick { team: TeamSeason; via: 'need' | 'fallback'; /** quem perde a vaga no comprador */ outPlayerId?: string }

/**
 * Quem compra o jogador na venda rápida. Mesma régua do mercado da IA e das
 * propostas: o clube precisa da FUNÇÃO dele (clubNeeds), o jogador não pode ser
 * um salto de patamar pro elenco, e a taxa + luvas cabem no caixa; a estratégia
 * (starBuyer, national) e o tier pesam no score. Sem ninguém com necessidade,
 * cai num clube plausível por hash estável (como a venda listada).
 */
export function pickQuickSaleBuyer(player: Player, fee: number, c: BuyerCtx): BuyerPick | null {
  const pool = c.teams.filter((t) => t.id !== FREE_TEAM_ID && !t.defunct && starters(t).length >= 5);
  if (pool.length === 0) return null;
  const ovr = playerOvr(player);
  const cost = fee + playerWage(player);
  const fits = (t: TeamSeason) => {
    const best = Math.max(...starters(t).map(playerOvr));
    if (ovr > best + 4) return false;                      // salto de patamar
    if (ovr >= 88 && aiTierOf(t) !== 1) return false;
    return true;
  };
  let best: { t: TeamSeason; score: number; out?: string } | null = null;
  for (const t of pool) {
    if (!fits(t)) continue;
    if (cost > (c.budgets[t.id] ?? 0)) continue;
    const strategy = c.strategies[t.id] ?? 'balanced';
    const need = clubNeeds(t, { split: c.split, form: c.formOf(t.id), strategy, ageOf: c.ageOf, baseOvrOf: c.baseOvrOf })
      .find((n) => n.role === player.role || n.role === player.role2);
    if (!need || ovr < need.refOvr) continue;             // não resolve a vaga dele
    const nat = strategy === 'national' ? mainCountryOf(t) : null;
    let score = need.priority + (4 - aiTierOf(t)) * 5 + (hashStr(`qsale:${c.split}:${t.id}:${player.id}`) % 10);
    if (strategy === 'starBuyer') score += 10;
    if (nat) score += nat === player.country ? 15 : -15;
    if (c.taken?.has(t.id)) score -= 40;
    if (!best || score > best.score || (score === best.score && t.id < best.t.id)) best = { t, score, out: need.outPlayerId };
  }
  if (best) return { team: best.t, via: 'need', outPlayerId: best.out ?? displacedBy(best.t, player) };
  // fallback: clube plausível (sem salto de patamar), por hash estável
  const plausible = pool.filter(fits).filter((t) => !c.taken?.has(t.id));
  const list = (plausible.length ? plausible : pool).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const team = list[hashStr(`qsale:buyer:${player.id}:${c.split}`) % list.length];
  return { team, via: 'fallback', outPlayerId: displacedBy(team, player) };
}

/**
 * Quem perde a vaga no comprador quando ele chega sem uma necessidade que diga
 * isso (venda listada, fallback): o titular MAIS FRACO da mesma função, se o
 * que chega for melhor. Sem ninguém assim, ninguém sai.
 */
export function displacedBy(buyer: TeamSeason, player: Player): string | undefined {
  const ovr = playerOvr(player);
  const same = starters(buyer).filter((p) => p.id !== player.id && (p.role === player.role || p.role2 === player.role) && playerOvr(p) < ovr)
    .sort((a, b) => playerOvr(a) - playerOvr(b) || (a.id < b.id ? -1 : 1));
  return same[0]?.id;
}

/**
 * A venda chegou no comprador (espelha a compra da IA em mercadoIA): o vendido
 * entra como CHEGADA do split (joga entre os 5) e quem perdeu a vaga — se é
 * endereçável e ainda está lá — vai pro mercado livre. Idempotente.
 */
export function settleSaleAtBuyer(a: {
  moves: Record<string, string>;
  arrivals?: Record<string, number>;
  playerId: string;
  buyerId: string;
  split: number;
  outPlayerId?: string;
  movable: (playerId: string) => boolean;
  /** o jogador está hoje no comprador (base + moves) */
  isAtBuyer: (playerId: string) => boolean;
}): { moves: Record<string, string>; arrivals: Record<string, number>; released?: string } {
  const moves = { ...a.moves };
  const arrivals = { ...(a.arrivals ?? {}), [a.playerId]: a.split };
  const out = a.outPlayerId;
  if (!out || out === a.playerId || a.buyerId === FREE_TEAM_ID || !a.movable(out)) return { moves, arrivals };
  const here = moves[out] != null ? moves[out] === a.buyerId : a.isAtBuyer(out);
  if (!here) return { moves, arrivals };
  moves[out] = FREE_TEAM_ID;
  return { moves, arrivals, released: out };
}

// ─── reparo dos saves afetados (migração única) ────────────────────────────
export const FA_RELEASE_FIX = 'faRelease202609';

export interface FaRepairArgs {
  moves?: Record<string, string>;
  squadIds: ReadonlySet<string>;
  pendingSales?: readonly { playerId: string }[];
  pendingDeals?: readonly { inPlayerId: string; outPlayerIds: string[] }[];
  loans?: readonly MarketLoan[];
  /** rastros que só o SEU elenco deixa no save */
  traces: {
    pairChem?: Record<string, number>;
    coachBond?: Record<string, number>;
    attrEvo?: Record<string, unknown>;
    evo?: Record<string, number>;
    stints?: StintsMap;
  };
  movable: (playerId: string) => boolean;
  /** clube atual do jogador no mundo (base + moves); undefined = não está no mundo */
  clubOf: (playerId: string) => string | undefined;
}

/** Ids que já passaram pelo seu elenco, pelos rastros do save. */
export function formerSquadIds(t: FaRepairArgs['traces']): Set<string> {
  const ids = new Set<string>();
  for (const k of Object.keys(t.pairChem ?? {})) for (const id of k.split('|')) if (id) ids.add(id);
  for (const k of Object.keys(t.coachBond ?? {})) ids.add(k);
  for (const k of Object.keys(t.attrEvo ?? {})) ids.add(k);
  for (const [k, v] of Object.entries(t.evo ?? {})) if (typeof v === 'number' && v < 0) ids.add(k);
  for (const k of Object.keys(t.stints ?? {})) ids.add(k);
  return ids;
}

/**
 * Quem saiu do seu elenco SEM destino gravado (dispensa/fim de contrato antes
 * da correção) e hoje aparece de volta num clube da base vai pro mercado livre.
 * Não toca: elenco atual, quem já tem move, vendas/trocas pendentes, qualquer
 * empréstimo registrado (stand-in ativo inclusive), quem não é endereçável.
 * Idempotente: quem é reparado ganha um move e sai dos candidatos.
 */
export function faReleaseRepair(a: FaRepairArgs): { moves: Record<string, string>; repaired: string[] } {
  const moves = { ...(a.moves ?? {}) };
  const busy = new Set<string>([
    ...(a.pendingSales ?? []).map((s) => s.playerId),
    ...(a.pendingDeals ?? []).flatMap((d) => [d.inPlayerId, ...d.outPlayerIds]),
    ...(a.loans ?? []).map((l) => l.playerId),
  ]);
  const repaired: string[] = [];
  for (const id of [...formerSquadIds(a.traces)].sort()) {
    if (a.squadIds.has(id) || moves[id] != null || busy.has(id) || !a.movable(id)) continue;
    const club = a.clubOf(id);
    if (!club || club === FREE_TEAM_ID) continue;
    moves[id] = FREE_TEAM_ID;
    repaired.push(id);
  }
  return { moves, repaired };
}
