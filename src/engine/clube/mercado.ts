// [fase 3 · frente MERCADO] Estado do mercado no save (clube.market) e as regras
// do lado do USUÁRIO: calendário de janelas e roster lock, propostas que chegam
// pelos seus jogadores (aceitar, recusar, contrapropor, cláusula), empréstimo e
// stand-in, rumores e manchetes. A IA dos clubes mora em mercadoIA.ts.
//
// Calendário (3 etapas por split, Major a cada 4 splits):
//   · janela de PRÉ-TEMPORADA no fechamento do split (a grande, com cadeias);
//   · janela CURTA depois da etapa 1 (poucos movimentos, stand-ins);
//   · ROSTER LOCK no split de Major a partir da etapa 3 até o fim do Major:
//     nada se executa, a IA não mexe e não chegam propostas.
// Acordos fechados fora do lock entram na próxima janela (curta ou pré-temporada).
//
// Neutralidade: sem você aceitar nada, o seu elenco e o seu caixa não mudam. A
// única exceção é a cláusula de rescisão (frente H): proposta que a paga não
// pode ser recusada pelo clube — e mesmo assim o jogador pode não querer ir.

import type { Player, Role, TeamSeason } from '../../types';
import type { ClubStrategy, IncomingOffer, MarketLoan, MarketState, MarketWindowLog, NeedReason, TransferWindow } from './model';
import { playerOvr, playerValue, playerWage, formatMoney } from '../ratings';
import { hashStr } from '../../state/hash';
import { ct } from '../../state/career-i18n';
import { aiTierOf, clubNeeds, starters, type ClubNeed, type WindowKind, type WorldMove, type WorldTickResult } from './mercadoIA';

export function defaultMarket(_save?: Record<string, unknown>): MarketState {
  return { v: 1, budgets: {}, incoming: [], rumors: [], loans: [], strategies: {}, arrivals: {}, windows: [], lastWindow: null };
}

// mercado do save (saves sem o bloco `clube` — carreira nova antes da migração — caem no padrão)
export function marketOf(save: { clube?: { market?: MarketState } | null }): MarketState {
  const m = save.clube?.market;
  return m && m.v === 1 ? m : defaultMarket();
}

const round10k = (v: number) => Math.round(v / 10_000) * 10_000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── rótulos ────────────────────────────────────────────────────────────────
export const STRATEGY_LABEL: Record<ClubStrategy, string> = {
  starBuyer: 'Compra estrelas', youth: 'Aposta na base', national: 'Line nacional',
  balanced: 'Equilibrado', moneyball: 'Moneyball', survival: 'Sobrevivência',
};
export const STRATEGY_HINT: Record<ClubStrategy, string> = {
  starBuyer: 'Tier 1 com caixa alto: paga caro pelo melhor da função e vende o núcleo só por ágio.',
  youth: 'Academia ou elenco jovem: prefere jogadores de até 22 anos, vende os prontos.',
  national: 'Line de um país só: procura jogadores da mesma nacionalidade.',
  balanced: 'Busca o melhor reforço que cabe no caixa, sem loucura.',
  moneyball: 'Valor por custo: prefere mercado livre e jogador barato que resolve.',
  survival: 'Sem caixa: só contrata de graça e vende fácil.',
};
export const NEED_LABEL: Record<NeedReason, string> = {
  hole: 'Falta a função', sold: 'Repor quem saiu', old: 'Veterano em queda', slump: 'Titular em má fase', upgrade: 'Subir o nível',
};

// ─── janela e roster lock ───────────────────────────────────────────────────
export interface WindowStatus extends TransferWindow {
  /** quando o próximo acordo fechado entra em vigor */
  next: 'mid' | 'offseason' | 'afterMajor';
  kind: 'mid' | 'closed' | 'locked';
  detail: string;
}
export function transferWindowOf(a: { split: number; eventInSplit: number; inMajor: boolean; majorSplit: boolean }): WindowStatus {
  const ev = a.eventInSplit || 1;
  if (a.majorSplit && (ev >= 3 || a.inMajor)) {
    return {
      open: false, rosterLocked: true, kind: 'locked', next: 'afterMajor',
      label: ct('Roster lock do Major'),
      detail: ct('Elencos travados até o fim do Major. Nada entra nem sai; acordos fechados agora valem na janela de pré-temporada.'),
    };
  }
  if (ev === 1) {
    return {
      open: true, rosterLocked: false, kind: 'mid', next: 'mid',
      label: ct('Janela aberta'),
      detail: a.majorSplit
        ? ct('A janela curta fecha depois da etapa 1. Depois dela vem o roster lock do Major.')
        : ct('A janela curta fecha depois da etapa 1. Acordos fechados até lá entram nela.'),
    };
  }
  return {
    open: true, rosterLocked: false, kind: 'closed', next: 'offseason',
    label: a.majorSplit ? ct('Última chance antes do roster lock') : ct('Negociações abertas'),
    detail: a.majorSplit
      ? ct('Na próxima etapa começa o roster lock. Acordos fechados agora só valem depois do Major.')
      : ct('A janela curta já passou. Acordos fechados agora entram na janela de pré-temporada, no fim do split.'),
  };
}

// ─── propostas pelos seus jogadores ─────────────────────────────────────────
export interface SquadEntry {
  player: Player;       // id do jogador = playerId do seu elenco
  wage: number;         // salário atual por split
  clause: number | null;// cláusula de rescisão (frente H)
  wantsLeave: boolean;  // quer sair (frente G)
  committed: boolean;   // já está saindo (venda/troca/empréstimo acertados)
}
export type Willingness = 'eager' | 'open' | 'reluctant';
export const WILLING_LABEL: Record<Willingness, string> = { eager: 'Quer ir', open: 'Aberto a ouvir', reluctant: 'Quer ficar' };

export function playerWillingness(a: { wage: number; wageOffered?: number; buyerTier: number; userTier: number; wantsLeave: boolean }): Willingness {
  const ratio = (a.wageOffered ?? a.wage) / Math.max(1, a.wage);
  let score = (ratio - 1) * 50 + (a.userTier - a.buyerTier) * 15;
  if (a.wantsLeave) score += 30;
  return score >= 25 ? 'eager' : score >= 0 ? 'open' : 'reluctant';
}

// teto que o clube comprador aceita pagar (contraproposta)
export function buyerMaxFee(o: Pick<IncomingOffer, 'reason' | 'strategy'>, value: number, budget: number): number {
  const urgent = o.reason === 'hole' || o.reason === 'sold';
  const mult = 1.3 + (urgent ? 0.15 : 0) + (o.strategy === 'starBuyer' ? 0.2 : o.strategy === 'survival' ? -0.2 : 0);
  return round10k(Math.min(budget, value * mult));
}

export interface OffersArgs {
  split: number;
  kind: WindowKind | 'boot';
  squad: SquadEntry[];
  teams: TeamSeason[];                       // clubes da IA (depois da janela)
  budgets: Record<string, number>;
  strategies: Record<string, ClubStrategy>;
  formOf: (teamId: string) => number;
  ageOf: (p: Player) => number;
  userTier: number;
  existing: IncomingOffer[];
  max?: number;
}
export type MarketRumor = MarketState['rumors'][number];
export type SaleEntry = { playerId: string; nick: string; fee: number; toTag: string; toId: string };
export interface OffersResult {
  offers: IncomingOffer[];  // novas (abertas, aceitas por cláusula ou recusadas pelo jogador)
  sales: SaleEntry[];       // cláusula paga + jogador topou: vira venda na janela
  rumors: MarketRumor[];
}

export function generateIncomingOffers(a: OffersArgs): OffersResult {
  const max = a.max ?? (a.kind === 'mid' ? 2 : 3);
  const openFor = new Set(a.existing.filter((o) => o.status === 'open' || o.status === 'countered').map((o) => o.playerId));
  type Cand = { e: SquadEntry; team: TeamSeason; need: ClubNeed; fee: number; score: number };
  const cands: Cand[] = [];
  const rumors: MarketRumor[] = [];
  const needCache = new Map<string, ClubNeed[]>();
  const needsOf = (t: TeamSeason) => {
    let n = needCache.get(t.id);
    if (!n) {
      n = clubNeeds(t, { split: a.split, form: a.formOf(t.id), strategy: a.strategies[t.id] ?? 'balanced', ageOf: a.ageOf });
      needCache.set(t.id, n);
    }
    return n;
  };
  for (const e of a.squad) {
    if (e.committed || openFor.has(e.player.id)) continue;
    const ovr = playerOvr(e.player);
    if (ovr < 72) continue; // só quem joga bem atrai proposta
    const h = hashStr(`inc:${a.split}:${a.kind}:${e.player.id}`);
    let chance = clamp(12 + (ovr - 72) * 4, 0, 65);
    if (e.wantsLeave) chance += 15;
    if (a.kind === 'mid') chance = Math.round(chance / 2);
    const value = playerValue(e.player);
    let best: Cand | null = null;
    let dreamer: TeamSeason | null = null;
    for (const t of a.teams) {
      const xi = starters(t);
      if (xi.length < 5) continue;
      const tBest = Math.max(...xi.map(playerOvr));
      if (ovr > tBest + 4) continue;                      // salto de patamar demais pro clube
      const need = needsOf(t).find((n) => n.role === e.player.role || n.role === e.player.role2);
      if (!need || ovr < need.refOvr + 2) continue;       // não resolve a necessidade dele
      if (ovr >= 88 && aiTierOf(t) !== 1) continue;
      const strategy = a.strategies[t.id] ?? 'balanced';
      const bump = (hashStr(`incfee:${a.split}:${t.id}:${e.player.id}`) % 36) / 100;
      const fee = round10k(value * (1 + bump + (strategy === 'starBuyer' ? 0.1 : 0) + (need.priority >= 80 ? 0.1 : 0)));
      const budget = a.budgets[t.id] ?? 0;
      if (fee + playerWage(e.player) > budget) { if (!dreamer || aiTierOf(t) < aiTierOf(dreamer)) dreamer = t; continue; }
      const score = need.priority + (strategy === 'starBuyer' ? 20 : 0) + (4 - aiTierOf(t)) * 5 + (h % 10);
      if (!best || score > best.score) best = { e, team: t, need, fee, score };
    }
    const roll = h % 100;
    if (best && roll < chance) cands.push(best);
    else if (best && roll < chance + 20) {
      rumors.push({ split: a.split, playerId: e.player.id, teamId: best.team.id, text: `${best.team.team} ${ct('monitora')} ${e.player.nick} ${ct('para a função de')} ${e.player.role}.` });
    } else if (dreamer && h % 7 === 0) {
      rumors.push({ split: a.split, playerId: e.player.id, teamId: dreamer.id, text: `${dreamer.team} ${ct('sonha com')} ${e.player.nick}, ${ct('mas o caixa não fecha a conta.')}` });
    }
  }
  cands.sort((x, y) => y.score - x.score || (x.e.player.id < y.e.player.id ? -1 : 1));
  const offers: IncomingOffer[] = [];
  const sales: SaleEntry[] = [];
  const usedTeams = new Set<string>();
  for (const c of cands) {
    if (offers.length >= max) break;
    if (usedTeams.has(c.team.id)) continue;
    usedTeams.add(c.team.id);
    const p = c.e.player;
    const strategy = a.strategies[c.team.id] ?? 'balanced';
    const budget = a.budgets[c.team.id] ?? 0;
    const buyerTier = aiTierOf(c.team);
    const bumpW = (hashStr(`incwage:${a.split}:${c.team.id}:${p.id}`) % 30) / 100;
    const wageOffered = Math.round((c.e.wage * (1.1 + bumpW + (buyerTier < a.userTier ? 0.25 : 0))) / 5000) * 5000;
    let fee = c.fee;
    let viaReleaseClause = false;
    const clause = c.e.clause;
    // CLÁUSULA: clube que quer muito (necessidade urgente ou starBuyer) e tem o
    // caixa paga a multa — aí o SEU clube não pode recusar
    if (clause != null && clause + playerWage(p) <= budget && (c.need.priority >= 80 || strategy === 'starBuyer') && clause <= fee * 1.6) {
      fee = clause;
      viaReleaseClause = true;
    }
    const o: IncomingOffer = {
      id: `inc:${a.split}:${a.kind}:${p.id}`,
      playerId: p.id, fromTeamId: c.team.id, fee, wageOffered, viaReleaseClause,
      split: a.split, expiresSplit: a.split, status: 'open',
      nick: p.nick, ovr: playerOvr(p), role: p.role, fromTag: c.team.tag, fromName: c.team.team,
      reason: c.need.reason, strategy,
    };
    if (viaReleaseClause) {
      // a multa foi paga: o clube não decide mais, o JOGADOR decide
      const will = playerWillingness({ wage: c.e.wage, wageOffered, buyerTier, userTier: a.userTier, wantsLeave: c.e.wantsLeave });
      if (will === 'reluctant') {
        o.status = 'rejected';
        o.playerRefused = true;
      } else {
        o.status = 'accepted';
        sales.push({ playerId: p.id, nick: p.nick, fee, toTag: c.team.tag, toId: c.team.id });
      }
    }
    offers.push(o);
  }
  return { offers, sales, rumors: rumors.slice(0, 3) };
}

export function expireOffers(m: MarketState, split: number): MarketState {
  let dirty = false;
  const incoming = m.incoming.map((o) => {
    if ((o.status === 'open' || o.status === 'countered') && o.expiresSplit < split) { dirty = true; return { ...o, status: 'expired' as const }; }
    return o;
  });
  return dirty ? { ...m, incoming } : m;
}

// histórico enxuto: abertas + as 20 respondidas mais recentes
export function withOffers(m: MarketState, fresh: IncomingOffer[]): MarketState {
  const list = [...fresh, ...m.incoming];
  const live = list.filter((o) => o.status === 'open' || o.status === 'countered');
  const done = list.filter((o) => !(o.status === 'open' || o.status === 'countered')).slice(0, 20);
  return { ...m, incoming: [...live, ...done] };
}

export function acceptOffer(m: MarketState, offerId: string): { market: MarketState; sale: SaleEntry | null } {
  const o = m.incoming.find((x) => x.id === offerId);
  if (!o || !(o.status === 'open' || o.status === 'countered')) return { market: m, sale: null };
  const incoming = m.incoming.map((x) => (x.id === offerId ? { ...x, status: 'accepted' as const } : x));
  return {
    market: { ...m, incoming },
    sale: { playerId: o.playerId, nick: o.nick ?? o.playerId, fee: o.fee, toTag: o.fromTag ?? '', toId: o.fromTeamId },
  };
}

// recusar: proposta por cláusula não pode ser recusada. Recusar quem quer sair
// (ou quem adorou a proposta) custa moral — o vestiário (frente G) sente.
export const REJECT_MORALE_WANTS_LEAVE = -15;
export const REJECT_MORALE_EAGER = -8;
export function rejectOffer(m: MarketState, offerId: string, ctx: { wantsLeave: boolean; willingness: Willingness }): { market: MarketState; moraleDelta: number; ok: boolean } {
  const o = m.incoming.find((x) => x.id === offerId);
  if (!o || !(o.status === 'open' || o.status === 'countered') || o.viaReleaseClause) return { market: m, moraleDelta: 0, ok: false };
  const incoming = m.incoming.map((x) => (x.id === offerId ? { ...x, status: 'rejected' as const } : x));
  const moraleDelta = ctx.wantsLeave ? REJECT_MORALE_WANTS_LEAVE : ctx.willingness === 'eager' ? REJECT_MORALE_EAGER : 0;
  return { market: { ...m, incoming }, moraleDelta, ok: true };
}

// contraproposta: você pede `ask`. O clube aceita até o teto dele; um pouco
// acima responde UMA vez com o teto (status 'countered'); acima disso desiste.
export type CounterOutcome = 'accepted' | 'countered' | 'rejected';
export function counterOffer(m: MarketState, offerId: string, ask: number, ctx: { value: number; budget: number }): { market: MarketState; outcome: CounterOutcome; fee: number; sale: SaleEntry | null } {
  const o = m.incoming.find((x) => x.id === offerId);
  if (!o || o.status !== 'open' || o.viaReleaseClause) return { market: m, outcome: 'rejected', fee: 0, sale: null };
  const max = Math.max(o.fee, buyerMaxFee(o, ctx.value, ctx.budget));
  const put = (patch: Partial<IncomingOffer>) => m.incoming.map((x) => (x.id === offerId ? { ...x, ...patch } : x));
  if (ask <= max) {
    const fee = Math.max(o.fee, round10k(ask));
    const market = { ...m, incoming: put({ status: 'accepted', fee, askedFee: ask }) };
    return { market, outcome: 'accepted', fee, sale: { playerId: o.playerId, nick: o.nick ?? o.playerId, fee, toTag: o.fromTag ?? '', toId: o.fromTeamId } };
  }
  if (ask <= max * 1.2) {
    return { market: { ...m, incoming: put({ status: 'countered', fee: max, askedFee: ask }) }, outcome: 'countered', fee: max, sale: null };
  }
  return { market: { ...m, incoming: put({ status: 'rejected', askedFee: ask }) }, outcome: 'rejected', fee: o.fee, sale: null };
}

// ─── empréstimo e stand-in ──────────────────────────────────────────────────
export const LOAN_FEE_RATE = 0.1;      // você empresta: o clube paga 10% do valor
export const STANDIN_FEE_RATE = 0.15;  // stand-in: você paga 15% do valor ao dono
export function loanFee(p: Player, kind: 'out' | 'in'): number {
  return Math.max(10_000, round10k(playerValue(p) * (kind === 'out' ? LOAN_FEE_RATE : STANDIN_FEE_RATE)));
}

export function agreeLoan(m: MarketState, l: { playerId: string; nick: string; kind: 'out' | 'in'; fromTeamId: string; toTeamId: string; splits: number; fee: number; split: number }): MarketState {
  if (m.loans.some((x) => x.playerId === l.playerId)) return m;
  const splits = clamp(Math.round(l.splits), 1, 2);
  const loan: MarketLoan = {
    playerId: l.playerId, nick: l.nick, kind: l.kind, fromTeamId: l.fromTeamId, toTeamId: l.toTeamId,
    splits, fee: l.fee, state: 'agreed', untilSplit: l.split + splits - 1,
  };
  return { ...m, loans: [...m.loans, loan] };
}
export function cancelLoan(m: MarketState, playerId: string): MarketState {
  return { ...m, loans: m.loans.filter((x) => !(x.playerId === playerId && x.state === 'agreed' && x.kind !== 'ai')) };
}
export const userLoans = (m: MarketState) => m.loans.filter((l) => l.kind === 'out' || l.kind === 'in');

// candidatos a stand-in: reserva (6º/7º) de clube da IA, jogador de clube em
// sobrevivência ou mercado livre — ninguém tira titular de um time pra emprestar
export function standInCandidates(a: { teams: TeamSeason[]; freeAgents: Player[]; strategies: Record<string, ClubStrategy>; exclude: Set<string>; movable: (p: Player) => boolean }): { player: Player; team: TeamSeason | null }[] {
  const out: { player: Player; team: TeamSeason | null }[] = [];
  for (const t of a.teams) {
    const survival = a.strategies[t.id] === 'survival';
    for (const p of survival ? t.players : t.players.slice(5)) if (!a.exclude.has(p.id) && a.movable(p)) out.push({ player: p, team: t });
  }
  for (const p of a.freeAgents) if (!a.exclude.has(p.id) && a.movable(p)) out.push({ player: p, team: null });
  return out.sort((x, y) => playerOvr(y.player) - playerOvr(x.player) || (x.player.id < y.player.id ? -1 : 1));
}

// ─── manchetes e rumores da janela ──────────────────────────────────────────
export interface MarketNews { id: string; split: number; icon: string; tone: 'good' | 'bad' | 'info'; cat: 'transfer'; title: string; body: string }
export const ROLE_LABEL: Record<Role, string> = { AWP: 'AWPer', IGL: 'IGL', Rifler: 'rifler', Entry: 'entry', Support: 'suporte', Lurker: 'lurker' };

export function moveHeadline(mv: WorldMove, split: number, soldBy?: (playerId: string) => WorldMove | undefined): MarketNews {
  const role = ct(ROLE_LABEL[mv.role] ?? mv.role);
  const id = `${split}:mkt:${mv.kind}:${mv.playerId}`;
  if (mv.kind === 'standin') {
    return {
      id, split, icon: '🩹', tone: 'info', cat: 'transfer',
      title: `${mv.toName} ${ct('acerta stand-in:')} ${mv.nick}`,
      body: `${ct('Sem reposição na janela curta, a')} ${mv.toName} ${ct('trouxe o')} ${role} ${mv.nick} (OVR ${mv.ovr}) ${ct('do mercado livre até o fim do split.')}`,
    };
  }
  if (mv.kind === 'free') {
    return {
      id, split, icon: '🖊️', tone: 'info', cat: 'transfer',
      title: `${mv.toName} ${ct('contrata')} ${mv.nick} ${ct('do mercado livre')}`,
      body: `${ct('O')} ${role} ${mv.nick} (OVR ${mv.ovr}) ${ct('chega sem custo de transferência.')}${mv.outNick ? ` ${mv.outNick} ${ct('perde a vaga e fica livre.')}` : ''}`,
    };
  }
  const chain = mv.chainOf ? soldBy?.(mv.chainOf) : undefined;
  return {
    id, split, icon: '🔁', tone: 'info', cat: 'transfer',
    title: `${mv.toName} ${ct('compra')} ${mv.nick} ${ct('da')} ${mv.fromName}`,
    body: `${ct('Negócio de')} ${formatMoney(mv.fee)} ${ct('pelo')} ${role} (OVR ${mv.ovr}, ${mv.age} ${ct('anos')}).`
      + (mv.outNick ? ` ${mv.outNick} ${ct('perde a vaga.')}` : '')
      + (chain ? ` ${ct('A')} ${mv.toName} ${ct('tinha acabado de vender')} ${chain.nick} ${ct('pra')} ${chain.toName} ${ct('e foi repor na hora.')}` : ''),
  };
}

export function windowNews(tick: Pick<WorldTickResult, 'log' | 'chains' | 'standIns'>, split: number, kind: WindowKind, offersCount: number): MarketNews[] {
  const byPlayer = new Map(tick.log.map((m) => [m.playerId, m] as [string, WorldMove]));
  const top = [...tick.log].sort((a, b) => b.ovr - a.ovr || (a.playerId < b.playerId ? -1 : 1)).slice(0, kind === 'mid' ? 2 : 3);
  const out = top.map((mv) => moveHeadline(mv, split, (pid) => byPlayer.get(pid)));
  if (tick.log.length > 0 || offersCount > 0) {
    const fees = tick.log.reduce((a, m) => a + m.fee, 0);
    out.push({
      id: `${split}:mkt:${kind}:resumo`, split, icon: '📰', tone: 'info', cat: 'transfer',
      title: kind === 'mid' ? `${ct('Janela curta fechada:')} ${tick.log.length} ${ct('movimentos')}` : `${ct('Janela de pré-temporada:')} ${tick.log.length} ${ct('movimentos')}`,
      body: `${formatMoney(fees)} ${ct('em taxas')} · ${tick.chains} ${ct('em cadeia (quem vendeu foi repor)')} · ${tick.standIns} ${ct('stand-in(s)')}.`
        + (offersCount > 0 ? ` ${offersCount} ${ct('proposta(s) pelos seus jogadores em Mercado › Transferências.')}` : ''),
    });
  }
  return out;
}

export function needRumors(needs: ClubNeed[], teams: TeamSeason[], split: number, max = 4): MarketRumor[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return needs
    .filter((n) => byId.has(n.teamId) && aiTierOf(byId.get(n.teamId)!) <= 2)
    .sort((a, b) => b.priority - a.priority || (a.teamId < b.teamId ? -1 : 1))
    .slice(0, max)
    .map((n) => ({
      split, teamId: n.teamId,
      text: `${byId.get(n.teamId)!.team} ${ct('procura um')} ${ct(ROLE_LABEL[n.role] ?? n.role)} (${ct(NEED_LABEL[n.reason]).toLowerCase()}).`,
    }));
}

export function chainRumors(log: WorldMove[], split: number, max = 3): MarketRumor[] {
  const byPlayer = new Map(log.map((m) => [m.playerId, m] as [string, WorldMove]));
  return log.filter((m) => m.chainOf && byPlayer.has(m.chainOf)).slice(0, max).map((m) => {
    const sold = byPlayer.get(m.chainOf!)!;
    return {
      split, teamId: m.toId, playerId: m.playerId,
      text: `${m.toName} ${ct('vendeu')} ${sold.nick} ${ct('e fechou com')} ${m.nick} ${ct('pra vaga — efeito cascata no mercado.')}`,
    };
  });
}

export function pushRumors(m: MarketState, rumors: MarketRumor[]): MarketState {
  if (!rumors.length) return m;
  return { ...m, rumors: [...rumors, ...m.rumors].slice(0, 30) };
}

export function logWindow(m: MarketState, entry: MarketWindowLog): MarketState {
  return { ...m, windows: [entry, ...(m.windows ?? [])].slice(0, 12) };
}

export function windowItems(log: WorldMove[]): NonNullable<MarketWindowLog['items']> {
  return log.slice(0, 40).map((mv) => ({
    nick: mv.nick, cc: mv.country, from: mv.fromTag, to: mv.toTag, fee: mv.fee,
    reason: NEED_LABEL[mv.reason], chain: !!mv.chainOf,
  }));
}

// aplica o resultado de uma janela da IA no estado do mercado
export function applyWorldTick(m: MarketState, tick: WorldTickResult, split: number, eventInSplit: number, kind: WindowKind): MarketState {
  const userSide = m.loans.filter((l) => l.kind !== 'ai');
  return {
    ...m,
    budgets: tick.budgets,
    strategies: tick.strategies,
    arrivals: { ...(m.arrivals ?? {}), ...tick.arrivals },
    loans: [...userSide, ...tick.loans],
    lastWindow: { split, event: eventInSplit, kind },
  };
}
