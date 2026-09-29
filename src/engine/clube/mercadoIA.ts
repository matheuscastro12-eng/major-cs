// [fase 3 · frente MERCADO] IA de mercado dos clubes — orçamento, estratégia,
// necessidades por função e a JANELA de transferências do mundo.
//
// Substitui o tickAIMarketActivity (1 movimento de "upgrade" por split) por um
// mercado com dinheiro e intenção:
//
//   ORÇAMENTO   por clube e por split: tier (teamwork), posição no ranking VRS,
//               premiação real do elenco (bo3-earnings.json) e patrocínio
//               (mercado do país + variação por split), pesado pela forma.
//   ESTRATÉGIA  coerente com o clube: academia = youth; sem caixa = survival;
//               tier 1 rico = starBuyer; line de um país só = national (org BR
//               busca BR); parte do tier 2/3 = moneyball; o resto = balanced.
//   NECESSIDADE por função: buraco de AWP/IGL entre os 5, veterano em queda,
//               titular em má fase, reposição de quem foi vendido.
//   JANELA      vários movimentos plausíveis: transferência com taxa (o
//               vendedor recebe e vai repor — CADEIA), contratação do mercado
//               livre e, na janela curta, stand-in emprestado até o fim do split.
//
// Equilíbrio (scripts/measure-mercado-equilibrio.mts): cada clube compra no
// máximo 1 vez e vende no máximo 1 vez por janela; nenhum clube compra acima do
// próprio melhor jogador (starBuyer: +2); estrela (88+) só pra tier 1; quem já
// tem elenco de elite (top-5 ≥ 85) só repõe, não empilha, e nenhum negócio leva
// um elenco ao patamar de elite (só a evolução dos jovens chega lá); o núcleo de um clube
// em alta não está à venda. Quem perde a vaga vai pro mercado livre, onde os
// clubes menores se reforçam — o talento circula nos dois sentidos.
//
// Puro e determinístico: só hashStr sobre (clube, jogador, split, janela) —
// salgado pela SEMENTE DO SAVE (`seed`, o mundo.seed da Carreira): cada Carreira
// tem o seu mercado; sem seed, as chaves de sempre (medições e testes antigos).

import type { Player, Role, TeamSeason } from '../../types';
import type { ClubStrategy, MarketLoan, NeedReason } from './model';
import { playerOvr, playerValue, playerWage } from '../ratings';
import { hashStr } from '../../state/hash';
import earningsData from '../../data/bo3-earnings.json';
import { aiContractSplitsLeft } from '../career/buyout';
import { FREE_TEAM_ID } from '../career/transferAI';

const EARNINGS = earningsData as Record<string, number>;

export type WindowKind = 'offseason' | 'mid';

// ─── básicos ────────────────────────────────────────────────────────────────
export const aiTierOf = (t: Pick<TeamSeason, 'teamwork'>): 1 | 2 | 3 => (t.teamwork >= 82 ? 1 : t.teamwork >= 77 ? 2 : 3);
const roleFits = (p: Player, role: Role) => p.role === role || p.role2 === role;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round10k = (v: number) => Math.round(v / 10_000) * 10_000;
/** Chave de hash salgada pela semente do save (sem semente = a chave de sempre). */
export const seeded = (seed: string | undefined, key: string): string => (seed ? `${seed}:${key}` : key);

export function starters(t: Pick<TeamSeason, 'players'>): Player[] {
  return t.players.slice(0, 5);
}
// média top-5 de OVR (força do elenco)
export function squadOvr(players: Player[]): number {
  const top = players.map(playerOvr).sort((a, b) => b - a).slice(0, 5);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
}
// país dominante da line (≥4 dos 5 titulares) — base da estratégia nacional
export function mainCountryOf(t: Pick<TeamSeason, 'players'>): string | null {
  const cc: Record<string, number> = {};
  for (const p of starters(t)) if (p.country) cc[p.country] = (cc[p.country] ?? 0) + 1;
  const top = Object.entries(cc).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return top && top[1] >= 4 ? top[0] : null;
}

// ─── orçamento ──────────────────────────────────────────────────────────────
// mercados de patrocínio mais ricos (ligas/empresas do país): multiplicador leve
const MARKET_MULT: Record<string, number> = {
  sa: 1.5, ae: 1.3, us: 1.15, cn: 1.1, br: 1.1, de: 1.1, gb: 1.1, fr: 1.05, dk: 1.05, se: 1.05, ru: 1.0,
};
export interface BudgetCtx { rank: number; form: number; split: number; seed?: string }
export function clubBudget(team: TeamSeason, ctx: BudgetCtx): number {
  const tier = aiTierOf(team);
  const base = tier === 1 ? 1_400_000 : tier === 2 ? 600_000 : 100_000 + Math.max(0, team.teamwork - 55) * 14_000;
  const r = ctx.rank;
  const rankBonus = r <= 5 ? 1_200_000 : r <= 10 ? 750_000 : r <= 20 ? 350_000 : r <= 40 ? 120_000 : 0;
  const prize = Math.min(600_000, 0.04 * team.players.reduce((a, p) => a + (EARNINGS[p.nick] ?? 0), 0));
  const market = MARKET_MULT[team.country] ?? 1;
  const sponsor = 0.85 + (hashStr(seeded(ctx.seed, `budget:${team.id}:${ctx.split}`)) % 31) / 100; // 0.85..1.15
  const formF = ctx.form < 40 ? 0.8 : ctx.form >= 55 ? 1.1 : 1;
  return round10k((base + rankBonus + prize) * market * sponsor * formF);
}

// ranking por VRS (ou teamwork, sem VRS) → posição 1-based de cada clube
export function rankClubs(teams: TeamSeason[], vrsOf?: (teamId: string) => number): Record<string, number> {
  const score = (t: TeamSeason) => (vrsOf ? vrsOf(t.id) : t.teamwork * 100 + squadOvr(t.players));
  const sorted = [...teams].sort((a, b) => score(b) - score(a) || byId(a, b));
  const out: Record<string, number> = {};
  sorted.forEach((t, i) => { out[t.id] = i + 1; });
  return out;
}

// ─── estratégia ─────────────────────────────────────────────────────────────
const ACADEMY_RX = /academy|junior|young|youngsters|\bfe\b|\.a$|\bbee\b/i;
export const SURVIVAL_BUDGET = 110_000;
export interface StrategyCtx { budget: number; form: number; avgAge: number; seed?: string }
export function clubStrategy(team: TeamSeason, ctx: StrategyCtx): ClubStrategy {
  const tier = aiTierOf(team);
  if (ACADEMY_RX.test(team.team) || ACADEMY_RX.test(team.tag) || ctx.avgAge <= 21.5) return 'youth';
  if (ctx.budget < SURVIVAL_BUDGET || ctx.form < 30) return 'survival';
  if (tier === 1 && ctx.budget >= 2_400_000) return 'starBuyer';
  if (mainCountryOf(team)) return 'national';
  if (tier >= 2 && hashStr(seeded(ctx.seed, `moneyball:${team.id}`)) % 3 === 0) return 'moneyball';
  return 'balanced';
}

// ─── necessidades por função ────────────────────────────────────────────────
export interface ClubNeed {
  teamId: string;
  role: Role;
  priority: number;       // 0-100
  reason: NeedReason;
  outPlayerId?: string;   // quem perde a vaga (hole/old/slump/upgrade)
  refOvr: number;         // régua: o OVR de quem sai/foi vendido
  depth?: number;         // profundidade na cadeia (0 = necessidade própria)
  soldPlayerId?: string;  // cadeia: o jogador vendido que abriu a vaga
}
export interface NeedCtx {
  split: number;
  form: number;
  strategy: ClubStrategy;
  ageOf: (p: Player) => number;
  baseOvrOf?: (playerId: string) => number | undefined;
  movable?: (p: Player) => boolean;
}
export function clubNeeds(team: TeamSeason, ctx: NeedCtx): ClubNeed[] {
  const xi = starters(team);
  if (xi.length < 5) return [];
  const movable = ctx.movable ?? (() => true);
  const ovr = new Map(xi.map((p) => [p.id, playerOvr(p)] as [string, number]));
  const mean = xi.reduce((a, p) => a + ovr.get(p.id)!, 0) / xi.length;
  const weakestBy = (ok: (p: Player) => boolean) => xi.filter((p) => ok(p) && movable(p))
    .sort((a, b) => ovr.get(a.id)! - ovr.get(b.id)! || byId(a, b))[0];
  const out: ClubNeed[] = [];
  // buraco de função entre os 5. No tier 1–2 o AWP é sempre rotulado: sem nenhum
  // titular que jogue de AWP (função ou awp ≥ 80) é URGENTE. IGL não: a base não
  // marca o IGL de metade das lines (ele joga como rifler), então falta de IGL
  // rotulado é necessidade comum, que entra no sorteio da janela. Quem já chama
  // (função/role2 IGL ou igl ≥ 70) cobre. No tier 3 a base quase nunca rotula o
  // IGL (95 das 97 lines "sem IGL" são tier 3): lá a falta do rótulo é dado, não
  // buraco — senão metade do mundo "precisa" de IGL toda janela e o mercado vira
  // uma dança de IGLs (≈ 80% dos movimentos eram AWP/IGL).
  const awpCover = xi.some((p) => roleFits(p, 'AWP') || p.awp >= 80);
  const iglCover = aiTierOf(team) === 3 || xi.some((p) => roleFits(p, 'IGL') || p.igl >= 70);
  if (!awpCover) {
    const out1 = weakestBy((p) => !roleFits(p, 'IGL'));
    // no tier 3 a base também não rotula o AWP de 32 lines: buraco comum (entra
    // no sorteio da janela), não urgente — senão ele come a janela inteira
    if (out1) out.push({ teamId: team.id, role: 'AWP', priority: aiTierOf(team) === 3 ? 60 : 90, reason: 'hole', outPlayerId: out1.id, refOvr: ovr.get(out1.id)! });
  }
  if (!iglCover) {
    const out1 = weakestBy((p) => !roleFits(p, 'AWP'));
    if (out1) out.push({ teamId: team.id, role: 'IGL', priority: 55, reason: 'hole', outPlayerId: out1.id, refOvr: ovr.get(out1.id)! });
  }
  // veterano em queda (idade + OVR abaixo do que já foi)
  for (const p of xi) {
    if (!movable(p)) continue;
    const age = ctx.ageOf(p);
    const base = ctx.baseOvrOf?.(p.id);
    const falling = base != null && ovr.get(p.id)! <= base - 2;
    if (age >= 33 || (age >= 30 && falling)) {
      out.push({ teamId: team.id, role: p.role, priority: clamp(50 + (age - 30) * 5, 50, 75), reason: 'old', outPlayerId: p.id, refOvr: ovr.get(p.id)! });
    }
  }
  // titular em má fase / elo fraco: bem abaixo da média do time
  const weakest = weakestBy(() => true);
  if (weakest) {
    const w = ovr.get(weakest.id)!;
    if (w <= mean - 5) {
      out.push({ teamId: team.id, role: weakest.role, priority: 45 + (ctx.form < 40 ? 20 : 0), reason: 'slump', outPlayerId: weakest.id, refOvr: w });
    } else if (ctx.form < 55 || ctx.strategy === 'starBuyer') {
      out.push({ teamId: team.id, role: weakest.role, priority: ctx.strategy === 'starBuyer' ? 40 : 25 + (ctx.form < 40 ? 15 : 0), reason: 'upgrade', outPlayerId: weakest.id, refOvr: w });
    }
  }
  // uma necessidade por jogador que sai, maior prioridade primeiro
  const seen = new Set<string>();
  return out.sort((a, b) => b.priority - a.priority || a.role.localeCompare(b.role))
    .filter((n) => (n.outPlayerId ? (seen.has(n.outPlayerId) ? false : (seen.add(n.outPlayerId), true)) : true));
}

// ─── preço de venda entre clubes da IA ──────────────────────────────────────
const SELL_MULT: Record<ClubStrategy, number> = {
  survival: 0.85, moneyball: 1.0, youth: 1.05, balanced: 1.1, national: 1.1, starBuyer: 1.25,
};
export const CORE_SELL_MULT = 1.7;
export function sellerAsk(p: Player, seller: { team: TeamSeason; strategy: ClubStrategy; form: number }, split: number): number {
  const value = playerValue(p);
  const best = [...starters(seller.team)].sort((a, b) => playerOvr(b) - playerOvr(a) || byId(a, b))[0];
  let mult = SELL_MULT[seller.strategy];
  if (best?.id === p.id) mult = Math.max(mult, CORE_SELL_MULT);
  const left = aiContractSplitsLeft(p.id, split);
  if (left >= 2) mult *= 1 + 0.1 * Math.min(left, 4);   // contrato longo: multa
  else if (left === 0) mult *= 0.85;                      // último split: sai barato
  if (seller.form < 40) mult *= 0.9;
  else if (seller.form >= 55) mult *= 1.1;
  return round10k(value * mult);
}

// orçamento e estratégia de TODOS os clubes num split (tela Transferências e a
// janela). `budgets` dado = sobra da janela anterior (janela curta).
export function clubsSnapshot(a: {
  teams: TeamSeason[]; split: number; formOf: (teamId: string) => number;
  vrsOf?: (teamId: string) => number; ageOf: (p: Player) => number; budgets?: Record<string, number>;
  seed?: string;
}): { budgets: Record<string, number>; strategies: Record<string, ClubStrategy>; ranks: Record<string, number> } {
  const ranks = rankClubs(a.teams, a.vrsOf);
  const budgets: Record<string, number> = {};
  const strategies: Record<string, ClubStrategy> = {};
  for (const t of a.teams) {
    const form = a.formOf(t.id);
    budgets[t.id] = a.budgets?.[t.id] ?? clubBudget(t, { rank: ranks[t.id], form, split: a.split, seed: a.seed });
    const xi = starters(t);
    const avgAge = xi.length ? xi.reduce((s, p) => s + a.ageOf(p), 0) / xi.length : 26;
    strategies[t.id] = clubStrategy(t, { budget: budgets[t.id], form, avgAge, seed: a.seed });
  }
  return { budgets, strategies, ranks };
}

// ─── a janela ───────────────────────────────────────────────────────────────
export interface WorldMove {
  kind: 'transfer' | 'free' | 'standin';
  playerId: string;
  nick: string;
  country: string;
  role: Role;
  ovr: number;
  age: number;
  fee: number;
  fromId: string; fromTag: string; fromName: string;
  toId: string; toTag: string; toName: string;
  outPlayerId?: string; outNick?: string;
  reason: NeedReason;
  strategy: ClubStrategy;
  chainOf?: string;       // playerId da venda que disparou esta reposição
  swap?: boolean;         // troca: o deslocado do comprador foi pro vendedor no negócio
}

export interface WorldTickArgs {
  teams: TeamSeason[];              // clubes da IA (mundo atual, sem o seu clube)
  freeAgents: Player[];             // mercado livre atual
  split: number;
  kind: WindowKind;
  formOf: (teamId: string) => number;
  vrsOf?: (teamId: string) => number;
  ageOf: (p: Player) => number;
  baseOvrOf?: (playerId: string) => number | undefined;
  movableIds: ReadonlySet<string>;  // só jogadores endereçáveis por save.moves
  protectedIds?: ReadonlySet<string>; // SEU elenco: só por proposta com consentimento
  budgets?: Record<string, number>; // janela curta: sobra da janela do split
  loans?: MarketLoan[];             // stand-ins da IA ativos (voltam no fim do split)
  arrivals?: Record<string, number>;// quem chegou na janela anterior (ou nesta) não é revendido
  maxMoves?: number;
  /** [fase 4 · juventude] preferência do comprador pelo jogador (ex.: jovem da
   *  própria academia); somada ao score da escolha. Ausente = neutro. */
  affinity?: (buyerId: string, p: Player) => number;
  /** Semente do save (mundo.seed): cada Carreira tem o seu mercado. Ausente =
   *  as chaves de hash de sempre (medições e testes antigos). */
  seed?: string;
}

export interface WorldTickResult {
  moves: Record<string, string>;      // patch pra save.moves
  log: WorldMove[];
  budgets: Record<string, number>;    // caixa DEPOIS da janela
  strategies: Record<string, ClubStrategy>;
  needs: ClubNeed[];                  // necessidades que ficaram abertas (rumores/propostas)
  loans: MarketLoan[];                // stand-ins da IA (ativos) após a janela
  arrivals: Record<string, number>;   // quem chegou (entra entre os 5)
  teams: TeamSeason[];                // elencos depois da janela
  chains: number;
  standIns: number;
  chainGaps: number;                  // vendedores que não acharam reposição (a base completa o elenco)
}

// elenco de elite (média top-5): só repõe, não empilha
export const ELITE_SQUAD = 85;
// teto do reforço (upgrade/má fase) acima da média dos 5 do comprador
export const UPGRADE_OVER_MEAN = 2;

export const WINDOW_MAX_MOVES: Record<WindowKind, number> = { offseason: 16, mid: 6 };

// chance (0-100) de o clube ir ao mercado atrás de uma necessidade não urgente
function actChance(form: number, strategy: ClubStrategy, kind: WindowKind): number {
  let c = form >= 55 ? 15 : form >= 40 ? 35 : 60;
  if (strategy === 'starBuyer') c += 20;
  if (strategy === 'survival') c -= 10;
  return kind === 'mid' ? Math.round(c / 2) : c;
}

export function tickMarketWindow(a: WorldTickArgs): WorldTickResult {
  const { split, kind } = a;
  const protectedIds = a.protectedIds ?? new Set<string>();
  // memo por jogador (OVR e idade não mudam durante a janela)
  const ovrMemo = new Map<string, number>();
  const ageMemo = new Map<string, number>();
  const ovrOf = (p: Player) => { let v = ovrMemo.get(p.id); if (v == null) { v = playerOvr(p); ovrMemo.set(p.id, v); } return v; };
  const ageOf = (p: Player) => { let v = ageMemo.get(p.id); if (v == null) { v = a.ageOf(p); ageMemo.set(p.id, v); } return v; };
  const maxMoves = a.maxMoves ?? WINDOW_MAX_MOVES[kind];

  // estado mutável da janela: elencos (cópia), mercado livre, caixa
  const rosters = new Map<string, Player[]>(a.teams.map((t) => [t.id, [...t.players]]));
  const teamById = new Map(a.teams.map((t) => [t.id, t]));
  let free = [...a.freeAgents];
  const moves: Record<string, string> = {};
  const arrivals: Record<string, number> = {};
  const loans: MarketLoan[] = [];
  const view = (id: string): TeamSeason => ({ ...teamById.get(id)!, players: rosters.get(id)! });
  const movePlayer = (p: Player, fromId: string, toId: string, front: boolean) => {
    if (fromId === FREE_TEAM_ID) free = free.filter((x) => x.id !== p.id);
    else rosters.set(fromId, rosters.get(fromId)!.filter((x) => x.id !== p.id));
    if (toId === FREE_TEAM_ID) free = [...free, p];
    else rosters.set(toId, front ? [p, ...rosters.get(toId)!] : [...rosters.get(toId)!, p]);
    moves[p.id] = toId;
  };

  // stand-ins da IA que vencem (janela de fim de split) voltam pro mercado livre
  for (const l of a.loans ?? []) {
    const back = kind === 'offseason' && l.untilSplit < split;
    const holder = rosters.get(l.toTeamId);
    const p = holder?.find((x) => x.id === l.playerId);
    if (back && p) movePlayer(p, l.toTeamId, l.fromTeamId && l.fromTeamId !== 'user' ? l.fromTeamId : FREE_TEAM_ID, false);
    else if (!back && p) loans.push(l);
  }

  const forms: Record<string, number> = {};
  for (const t of a.teams) forms[t.id] = a.formOf(t.id);
  const snap = clubsSnapshot({ teams: a.teams, split, formOf: (id) => forms[id], vrsOf: a.vrsOf, ageOf, budgets: a.budgets, seed: a.seed });
  const budgets = snap.budgets;
  const strategies = snap.strategies;
  const movable = (p: Player) => a.movableIds.has(p.id) && !protectedIds.has(p.id);
  const needCtx = (id: string): NeedCtx => ({
    split, form: forms[id], strategy: strategies[id], ageOf, baseOvrOf: a.baseOvrOf, movable,
  });

  // QUEM VAI AO MERCADO: necessidade urgente (buraco) sempre; o resto por
  // chance determinística pela forma e estratégia.
  const queue: ClubNeed[] = [];
  const openNeeds: ClubNeed[] = [];
  for (const t of a.teams) {
    const needs = clubNeeds(view(t.id), needCtx(t.id));
    let need = needs[0];
    if (!need) continue;
    const urgent = need.reason === 'hole' && need.priority >= 80;
    // VARIEDADE: sem buraco urgente, o clube sorteia entre as 2 necessidades de
    // maior prioridade (senão toda janela é "contrata AWP/IGL" e ninguém procura
    // rifler — o mercado livre enche de quem perdeu a vaga e não volta)
    if (!urgent && needs[1] && hashStr(seeded(a.seed, `need:${kind}:${split}:${t.id}`)) % 2 === 1) need = needs[1];
    const roll = hashStr(seeded(a.seed, `mkt:${kind}:${split}:${t.id}`)) % 100;
    if (urgent || roll < actChance(forms[t.id], strategies[t.id], kind)) queue.push({ ...need, depth: 0 });
    else openNeeds.push(need);
  }
  queue.sort((x, y) => y.priority - x.priority || forms[x.teamId] - forms[y.teamId] || (x.teamId < y.teamId ? -1 : 1));

  // reposição disponível no mercado livre (por função) — o vendedor precisa dela
  const canReplace = (sellerId: string, p: Player): boolean => {
    const xi = starters(view(sellerId));
    const mean = xi.reduce((acc, x) => acc + ovrOf(x), 0) / Math.max(1, xi.length);
    return free.some((f) => f.id !== p.id && !used.has(f.id) && movable(f) && roleFits(f, p.role) && ovrOf(f) >= mean - 6);
  };
  const bought = new Set<string>(); // clube já comprou nesta janela
  const sold = new Set<string>();   // clube já vendeu nesta janela
  const used = new Set<string>();   // jogador já se mexeu nesta janela
  const log: WorldMove[] = [];
  let chains = 0, standIns = 0, chainGaps = 0;

  // o teto de movimentos vale para os negócios que COMEÇAM uma cadeia; a
  // reposição de quem vendeu sempre é tentada (senão o vendedor fica sem 5 e o
  // mundo enche de jovens da base)
  let started = 0;
  while (queue.length) {
    const need = queue.shift()!;
    const buyerId = need.teamId;
    if (bought.has(buyerId)) continue;
    if ((need.depth ?? 0) === 0 && started >= maxMoves) { openNeeds.push(need); continue; }
    const buyer = view(buyerId);
    const strategy = strategies[buyerId];
    const budget = budgets[buyerId];
    const xi = starters(buyer);
    const xiOvr = xi.map(playerOvr);
    const best = Math.max(...xiOvr);
    const mean = xiOvr.reduce((s, v) => s + v, 0) / Math.max(1, xiOvr.length);
    const elite = squadOvr(buyer.players) >= ELITE_SQUAD;
    if (elite && (need.reason === 'upgrade' || need.reason === 'slump')) { openNeeds.push(need); continue; }
    // teto de plausibilidade: um reforço pode ser o novo melhor do time, mas não
    // um salto de patamar (starBuyer vai um pouco além)
    let cap = best + (strategy === 'starBuyer' ? 1 : 3);
    // elenco de elite só REPÕE o veterano (sem subir de patamar): o topo não empilha
    // (vale também para a reposição de quem ele vendeu: vender 84 e comprar 86 empilhava)
    if (elite && (need.reason === 'old' || need.reason === 'sold')) cap = Math.min(cap, need.refOvr + 1);
    // reforço/má fase traz alguém do nível do time, não uma estrela: com a
    // variedade (o clube também sai atrás de reforço) o topo inflava o top 20
    if (need.reason === 'upgrade' || need.reason === 'slump') cap = Math.min(cap, Math.round(mean) + UPGRADE_OVER_MEAN);
    // no fim da cadeia, o clube que vendeu repõe só no mercado livre (sem nova venda)
    const freeOnly = need.reason === 'sold' && (need.depth ?? 0) >= 2;
    const nat = strategy === 'national' ? mainCountryOf(buyer) : null;
    const ref = need.refOvr;
    const minOvr = need.reason === 'sold' ? Math.min(ref - 6, mean - 4)
      : need.reason === 'hole' ? ref - 3
      : need.reason === 'old' ? ref
      : ref + 2;
    const out = need.outPlayerId ? buyer.players.find((p) => p.id === need.outPlayerId) : undefined;
    // elite não se compra: nenhum negócio leva o elenco (média top-5) a
    // ELITE_SQUAD ou além (quem já é elite só repõe no mesmo nível ou abaixo)
    const squadNow = squadOvr(buyer.players);
    const squadAfter = (p: Player) => squadOvr([...buyer.players.filter((x) => x.id !== out?.id), p]);

    type Cand = { p: Player; fromId: string; fee: number; cost: number; score: number; swap: boolean };
    let pick: Cand | null = null;
    const consider = (p: Player, fromId: string) => {
      if (used.has(p.id) || !movable(p) || !roleFits(p, need.role)) return;
      const ovr = ovrOf(p);
      if (ovr < minOvr || ovr > cap) return;
      if (ovr >= 88 && aiTierOf(buyer) !== 1) return;
      const after = squadAfter(p);
      if (after >= ELITE_SQUAD && after > squadNow) return;
      const age = ageOf(p);
      if (need.reason === 'old' && out && age > ageOf(out) - 4) return;
      let fee = 0;
      let swap = false;
      if (fromId !== FREE_TEAM_ID) {
        if (sold.has(fromId)) return;
        if ((a.arrivals?.[p.id] ?? -99) >= split - 1) return; // chegou na janela passada ou nesta: não vira moeda de troca
        const seller = view(fromId);
        const sBest = [...starters(seller)].sort((x, y) => ovrOf(y) - ovrOf(x) || byId(x, y))[0];
        if (sBest?.id === p.id && forms[fromId] >= 55 && strategies[fromId] !== 'survival') return; // núcleo em alta não sai
        // clube só vende se consegue repor: tem banco, há no mercado livre um
        // jogador da mesma função no nível do elenco (a cadeia fecha) ou aceita
        // quem perde a vaga no comprador como parte do negócio (TROCA + dinheiro)
        fee = sellerAsk(p, { team: seller, strategy: strategies[fromId], form: forms[fromId] }, split);
        if (seller.players.length < 6 && !canReplace(fromId, p)) {
          const sXi = starters(seller);
          const sMean = sXi.reduce((acc, x) => acc + ovrOf(x), 0) / Math.max(1, sXi.length);
          // troca só entre pares (ou do menor pro maior): o grande não usa troca pra
          // arrancar a estrela de um clube menor — isso empilharia talento no topo
          if (!out || need.reason === 'sold' || !movable(out) || used.has(out.id) || ovrOf(out) < sMean - 6) return;
          if (aiTierOf(buyer) < aiTierOf(seller) || squadOvr(buyer.players) > squadOvr(seller.players) + 1) return;
          swap = true;
          fee = Math.max(0, round10k(fee - playerValue(out) * 0.6)); // o jogador que vai abate parte da taxa
        }
      }
      const cost = fee + playerWage(p); // taxa + luvas (1 split de salário)
      if (cost > budget) return;
      let score = (ovr - ref) * 10;
      if (age >= 32) score -= 15;
      const costF = cost / Math.max(1, budget);
      switch (strategy) {
        case 'starBuyer': score += ovr - 80 - costF * 5; break;
        case 'youth': score += (age <= 20 ? 30 : age <= 22 ? 15 : age >= 27 ? -25 : 0) - costF * 10; break;
        case 'national': score += (nat && p.country === nat ? 25 : nat ? -20 : 0) - costF * 15; break;
        case 'moneyball': score = ((ovr - ref) * 10) / (1 + cost / 250_000) + (fee === 0 ? 10 : 0) - (age >= 32 ? 15 : 0); break;
        case 'survival': score += fee === 0 ? 20 : -costF * 40; break;
        default: score -= costF * 15;
      }
      if (a.affinity) score += a.affinity(buyerId, p);
      score += (hashStr(seeded(a.seed, `pick:${buyerId}:${p.id}:${split}`)) % 7) / 10;
      if (!pick || score > pick.score) pick = { p, fromId, fee, cost, score, swap };
    };
    for (const p of free) consider(p, FREE_TEAM_ID);
    if (!freeOnly) {
      for (const t of a.teams) {
        if (t.id === buyerId) continue;
        for (const p of rosters.get(t.id)!) consider(p, t.id);
      }
    }
    const urgent = need.reason === 'hole' || need.reason === 'sold';
    const chosen = pick as Cand | null;
    if (!chosen || chosen.score <= (urgent ? -30 : 0)) {
      // janela curta: buraco/venda sem reposição vira STAND-IN do mercado livre
      if (kind === 'mid' && urgent) {
        const si = free.filter((p) => !used.has(p.id) && movable(p) && roleFits(p, need.role) && ovrOf(p) >= mean - 10 && ovrOf(p) <= cap)
          .sort((x, y) => ovrOf(y) - ovrOf(x) || byId(x, y))[0];
        if (si) {
          movePlayer(si, FREE_TEAM_ID, buyerId, true);
          if (out && movable(out) && !used.has(out.id) && need.reason === 'hole') { movePlayer(out, buyerId, FREE_TEAM_ID, false); used.add(out.id); }
          used.add(si.id); bought.add(buyerId); standIns++;
          if ((need.depth ?? 0) === 0) started++;
          arrivals[si.id] = split;
          loans.push({ playerId: si.id, toTeamId: buyerId, fromTeamId: FREE_TEAM_ID, untilSplit: split, nick: si.nick, state: 'active', kind: 'ai', startSplit: split });
          log.push({
            kind: 'standin', playerId: si.id, nick: si.nick, country: si.country, role: need.role, ovr: ovrOf(si), age: ageOf(si), fee: 0,
            fromId: FREE_TEAM_ID, fromTag: 'FA', fromName: '', toId: buyerId, toTag: buyer.tag, toName: buyer.team,
            outPlayerId: need.reason === 'hole' ? out?.id : undefined, outNick: need.reason === 'hole' ? out?.nick : undefined,
            reason: need.reason, strategy, chainOf: undefined,
          });
          continue;
        }
      }
      if (need.reason === 'sold') chainGaps++;
      openNeeds.push(need);
      continue;
    }
    // FECHA O NEGÓCIO
    const { p, fromId, fee, cost, swap } = chosen;
    if ((need.depth ?? 0) === 0) started++;
    const fromTeam = fromId === FREE_TEAM_ID ? null : teamById.get(fromId)!;
    movePlayer(p, fromId, buyerId, true);
    arrivals[p.id] = split;
    used.add(p.id);
    bought.add(buyerId);
    budgets[buyerId] = budget - cost;
    // quem perde a vaga vai pro mercado livre (reposição de vendido não desloca)
    let outMoved: Player | undefined;
    if (out && need.reason !== 'sold' && movable(out) && !used.has(out.id) && rosters.get(buyerId)!.some((x) => x.id === out.id)) {
      // troca: quem perde a vaga vai pro clube vendedor (entra no lugar de quem saiu)
      movePlayer(out, buyerId, swap && fromTeam ? fromId : FREE_TEAM_ID, swap);
      if (swap && fromTeam) arrivals[out.id] = split;
      used.add(out.id);
      outMoved = out;
    }
    if (fromTeam) {
      sold.add(fromId);
      budgets[fromId] = (budgets[fromId] ?? 0) + fee;
      // CADEIA: o vendedor vai atrás de um substituto (prioridade máxima) — na
      // troca ele já recebeu um jogador e não precisa repor
      if (!swap) {
        queue.unshift({ teamId: fromId, role: p.role, priority: 95, reason: 'sold', refOvr: ovrOf(p), depth: (need.depth ?? 0) + 1, soldPlayerId: p.id });
      }
    }
    if ((need.depth ?? 0) > 0) chains++;
    log.push({
      kind: fromTeam ? 'transfer' : 'free', playerId: p.id, nick: p.nick, country: p.country, role: need.role, ovr: ovrOf(p), age: ageOf(p),
      fee, fromId, fromTag: fromTeam?.tag ?? 'FA', fromName: fromTeam?.team ?? '', toId: buyerId, toTag: buyer.tag, toName: buyer.team,
      outPlayerId: outMoved?.id, outNick: outMoved?.nick, reason: need.reason, strategy,
      chainOf: need.soldPlayerId, swap: swap || undefined,
    });
  }
  // necessidades não atendidas (com os elencos finais) — rumores e propostas
  for (const n of queue) openNeeds.push(n);
  const teams = a.teams.map((t) => ({ ...t, players: rosters.get(t.id)! }));
  const needs = openNeeds.filter((n) => !bought.has(n.teamId));
  return { moves, log, budgets, strategies, needs, loans, arrivals, teams, chains, standIns, chainGaps };
}
