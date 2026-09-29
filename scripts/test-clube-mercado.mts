// FASE 3 · IA DE MERCADO (engine/clube/mercadoIA.ts + mercado.ts).
// Uma regra por teste: orçamento, estratégia, necessidades por função, a janela
// (vários movimentos, cadeia, stand-in, travas contra superequipe), propostas
// pelos seus jogadores (cláusula, vontade, recusa, contraproposta), janelas e
// roster lock, empréstimos, rumores e o equilíbrio do mundo em 10 splits.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player, TeamSeason } from '../src/types.ts';
import { playerOvr, playerValue } from '../src/engine/ratings.ts';
import { buildAiWorld, agedFreeAgents, aiAgeOf, baseOvrOf, BASE_PLAYER_IDS, applyAiAging, applyMoves } from '../src/engine/career/aiWorld.ts';
import { FREE_TEAM_ID } from '../src/engine/career/transferAI.ts';
import {
  clubBudget, clubStrategy, clubNeeds, tickMarketWindow, clubsSnapshot, sellerAsk, squadOvr, aiTierOf, starters, CORE_SELL_MULT,
  type WorldTickArgs,
} from '../src/engine/clube/mercadoIA.ts';
import {
  defaultMarket, generateIncomingOffers, acceptOffer, rejectOffer, counterOffer, expireOffers, transferWindowOf, playerWillingness,
  buyerMaxFee, agreeLoan, cancelLoan, standInCandidates, pushRumors, withOffers, withWindowStatus, windowNews,
  REJECT_MORALE_WANTS_LEAVE, REJECT_MORALE_EAGER, type SquadEntry,
} from '../src/engine/clube/mercado.ts';
import { releaseClauseOf, wantsToLeave, benchValueFactor, leaveRequests, SQUAD_MAX } from '../src/engine/clube/mercadoPontes.ts';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';
import type { IncomingOffer, MarketState } from '../src/engine/clube/model.ts';
import { simulateWorld } from './measure-mercado-equilibrio.mts';

const NS = new Set<string>();
const WORLD = buildAiWorld({ base: CS2_REAL_2026, split: 2, skip: NS });
const byTag = (tag: string) => WORLD.find((t) => t.tag === tag)!;
const argsFor = (split: number, kind: 'offseason' | 'mid', extra: Partial<WorldTickArgs> = {}): WorldTickArgs => ({
  teams: WORLD, freeAgents: agedFreeAgents(CS2_REAL_2026, {}, split, NS), split, kind,
  formOf: () => 50, ageOf: (p) => aiAgeOf(p, split), baseOvrOf, movableIds: BASE_PLAYER_IDS, ...extra,
});
const mkPlayer = (id: string, role: Player['role'], v: number, country = 'br', extra: Partial<Player> = {}): Player => ({
  id, nick: id, name: id, country, role, aim: v, consistency: v, clutch: v, awp: role === 'AWP' ? v : 55, igl: role === 'IGL' ? v : 50, ...extra,
});
const mkTeam = (id: string, tw: number, players: Player[], extra: Partial<TeamSeason> = {}): TeamSeason => ({
  id, team: id, tag: id.toUpperCase(), era: '2026', game: 'CS2', country: 'br', teamwork: tw, honors: '', colors: ['#000000', '#ffffff'],
  mapPrefs: {}, coach: { nick: 'c', name: 'c', country: 'br', rating: 70, style: 'tactical' }, players, ...extra,
});

// ─── orçamento ──────────────────────────────────────────────────────────────
test('orçamento: tier, ranking e premiação mandam; é determinístico por split', () => {
  const t1 = byTag('VIT'), t3 = WORLD.find((t) => aiTierOf(t) === 3)!;
  const b1 = clubBudget(t1, { rank: 1, form: 50, split: 3 });
  const b3 = clubBudget(t3, { rank: 150, form: 50, split: 3 });
  assert.ok(b1 > 2_000_000, `tier 1 no topo do ranking tem caixa de elite (${b1})`);
  assert.ok(b3 < 600_000, `tier 3 tem caixa pequeno (${b3})`);
  assert.equal(clubBudget(t1, { rank: 1, form: 50, split: 3 }), b1, 'mesmo split, mesmo caixa');
  assert.ok(clubBudget(t1, { rank: 30, form: 50, split: 3 }) < b1, 'cair no ranking tira dinheiro');
  assert.ok(clubBudget(t1, { rank: 1, form: 30, split: 3 }) < b1, 'crise tira patrocínio');
});

// ─── estratégia ─────────────────────────────────────────────────────────────
test('estratégia coerente: academia = youth, sem caixa = survival, tier 1 rico = starBuyer, line de um país = national', () => {
  const br = [0, 1, 2, 3, 4].map((i) => mkPlayer(`br${i}`, i === 0 ? 'AWP' : i === 1 ? 'IGL' : 'Rifler', 76));
  assert.equal(clubStrategy(mkTeam('pain.a', 70, br, { team: 'paiN Academy' }), { budget: 400_000, form: 50, avgAge: 24 }), 'youth');
  assert.equal(clubStrategy(mkTeam('x', 60, br), { budget: 80_000, form: 50, avgAge: 25 }), 'survival');
  assert.equal(clubStrategy(mkTeam('x', 88, br.map((p, i) => ({ ...p, country: ['fr', 'dk', 'se', 'de', 'pl'][i] }))), { budget: 3_000_000, form: 50, avgAge: 25 }), 'starBuyer');
  assert.equal(clubStrategy(mkTeam('x', 78, br), { budget: 700_000, form: 50, avgAge: 25 }), 'national');
  const snap = clubsSnapshot({ teams: WORLD, split: 2, formOf: () => 50, ageOf: (p) => aiAgeOf(p, 2) });
  const kinds = new Set(Object.values(snap.strategies));
  for (const k of ['starBuyer', 'youth', 'national', 'balanced', 'moneyball', 'survival']) assert.ok(kinds.has(k as never), `o mundo real tem clubes ${k}`);
});

// ─── necessidades por função ────────────────────────────────────────────────
test('necessidades: sem AWP é urgente; veterano em queda e titular fraco também viram alvo', () => {
  const noAwp = mkTeam('noawp', 80, [mkPlayer('a', 'IGL', 80), mkPlayer('b', 'Rifler', 80), mkPlayer('c', 'Entry', 80), mkPlayer('d', 'Support', 79), mkPlayer('e', 'Lurker', 78)]);
  const n1 = clubNeeds(noAwp, { split: 2, form: 50, strategy: 'balanced', ageOf: () => 25 })[0];
  assert.equal(n1.reason, 'hole'); assert.equal(n1.role, 'AWP'); assert.ok(n1.priority >= 80);
  assert.notEqual(n1.outPlayerId, 'a', 'o IGL não perde a vaga pro AWP');
  const vet = mkTeam('vet', 80, [mkPlayer('a', 'AWP', 82), mkPlayer('b', 'IGL', 80), mkPlayer('c', 'Entry', 81), mkPlayer('d', 'Support', 80), mkPlayer('e', 'Lurker', 80)]);
  const n2 = clubNeeds(vet, { split: 2, form: 50, strategy: 'balanced', ageOf: (p) => (p.id === 'e' ? 34 : 24) });
  assert.ok(n2.some((n) => n.reason === 'old' && n.outPlayerId === 'e'), 'veterano de 34 vira necessidade');
  const weak = mkTeam('weak', 80, [mkPlayer('a', 'AWP', 84), mkPlayer('b', 'IGL', 83), mkPlayer('c', 'Entry', 84), mkPlayer('d', 'Support', 83), mkPlayer('e', 'Lurker', 72)]);
  assert.ok(clubNeeds(weak, { split: 2, form: 50, strategy: 'balanced', ageOf: () => 25 }).some((n) => n.reason === 'slump' && n.outPlayerId === 'e'));
});

// ─── preço de venda ─────────────────────────────────────────────────────────
test('venda entre clubes: núcleo custa ágio, clube em sobrevivência vende mais barato', () => {
  const t = byTag('MOUZ');
  const best = [...starters(t)].sort((a, b) => playerOvr(b) - playerOvr(a))[0];
  const other = starters(t).find((p) => p.id !== best.id)!;
  assert.ok(sellerAsk(best, { team: t, strategy: 'balanced', form: 50 }, 2) >= playerValue(best) * CORE_SELL_MULT * 0.85);
  assert.ok(sellerAsk(other, { team: t, strategy: 'survival', form: 50 }, 2) < sellerAsk(other, { team: t, strategy: 'starBuyer', form: 50 }, 2));
});

// ─── a janela ───────────────────────────────────────────────────────────────
test('janela de pré-temporada: vários movimentos, determinística, sem tocar no seu elenco', () => {
  const mine = new Set(starters(byTag('FURIA')).map((p) => p.id));
  const a = tickMarketWindow(argsFor(3, 'offseason', { protectedIds: mine }));
  const b = tickMarketWindow(argsFor(3, 'offseason', { protectedIds: mine }));
  assert.ok(a.log.length >= 8, `mundo vivo: ${a.log.length} movimentos na janela (o antigo fazia no máximo 5 por split)`);
  assert.deepEqual(a.moves, b.moves, 'mesmo save + mesma janela ⇒ mesmos movimentos');
  for (const id of mine) assert.equal(a.moves[id], undefined, 'jogador seu só sai por proposta');
  const mid = tickMarketWindow(argsFor(3, 'mid', { protectedIds: mine }));
  assert.ok(mid.log.length < a.log.length, 'a janela curta mexe menos');
});

test('janela: cada clube compra e vende no máximo 1 vez; ninguém passa do teto; 88+ só no tier 1; elenco não incha', () => {
  for (const split of [2, 3, 4]) {
    const r = tickMarketWindow(argsFor(split, 'offseason'));
    const buys = new Map<string, number>(); const sells = new Map<string, number>();
    const before = new Map(WORLD.map((t) => [t.id, t]));
    for (const m of r.log) {
      buys.set(m.toId, (buys.get(m.toId) ?? 0) + 1);
      if (m.fromId !== FREE_TEAM_ID) sells.set(m.fromId, (sells.get(m.fromId) ?? 0) + 1);
      const buyer = before.get(m.toId)!;
      const best = Math.max(...starters(buyer).map(playerOvr));
      assert.ok(m.ovr <= best + 3, `${m.toTag} não compra acima do próprio patamar (${m.nick} ${m.ovr} × melhor ${best})`);
      if (m.ovr >= 88) assert.equal(aiTierOf(buyer), 1, 'estrela 88+ só no tier 1');
    }
    for (const [id, n] of buys) assert.equal(n, 1, `${id} comprou ${n}x`);
    for (const [id, n] of sells) assert.equal(n, 1, `${id} vendeu ${n}x`);
    for (const t of r.teams) assert.ok(t.players.length <= before.get(t.id)!.players.length, `${t.tag} não passa do tamanho do elenco`);
  }
});

test('cadeia: o clube que vende vai repor (e a manchete conta a história)', () => {
  let found = null as null | { chain: string; split: number };
  for (let split = 2; split <= 6 && !found; split++) {
    const r = tickMarketWindow(argsFor(split, 'offseason'));
    const chain = r.log.find((m) => m.chainOf);
    if (chain) {
      const sold = r.log.find((m) => m.playerId === chain.chainOf)!;
      assert.equal(sold.fromId, chain.toId, 'quem repõe é o clube que vendeu');
      assert.ok(r.chains >= 1);
      found = { chain: chain.nick, split };
    }
  }
  assert.ok(found, 'em 5 janelas o mercado tem pelo menos uma cadeia');
});

test('stand-in na janela curta: buraco sem reposição vira empréstimo do mercado livre até o fim do split, e volta', () => {
  // clube sem AWP e sem caixa: ninguém vende pra ele, mas o mercado livre tem um AWPer
  const poor = mkTeam('poor', 60, [mkPlayer('p1', 'IGL', 70), mkPlayer('p2', 'Rifler', 70), mkPlayer('p3', 'Entry', 70), mkPlayer('p4', 'Support', 69), mkPlayer('p5', 'Lurker', 68)]);
  const fa = mkPlayer('fa-awp', 'AWP', 73, 'br');
  const movable = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'fa-awp']);
  const base = { teams: [poor], freeAgents: [fa], formOf: () => 50, ageOf: () => 25, movableIds: movable };
  const mid = tickMarketWindow({ ...base, split: 5, kind: 'mid', budgets: { poor: 0 } });
  const si = mid.log.find((m) => m.kind === 'standin');
  assert.ok(si, 'sem caixa na janela curta: stand-in');
  assert.equal(si!.playerId, 'fa-awp');
  assert.equal(mid.loans[0]?.untilSplit, 5, 'fica até o fim do split');
  // na pré-temporada seguinte ele volta ao mercado livre
  const off = tickMarketWindow({ ...base, teams: mid.teams, freeAgents: [], split: 6, kind: 'offseason', loans: mid.loans, maxMoves: 0 });
  assert.equal(off.moves['fa-awp'], FREE_TEAM_ID, 'stand-in volta ao mercado livre');
  assert.equal(off.loans.length, 0);
});

test('troca: sem banco nem reposição livre, o vendedor aceita quem perde a vaga — só entre pares', () => {
  // comprador sem AWP (buraco urgente); vendedor par com AWP e sem banco; mercado livre vazio
  const buyer = mkTeam('buy', 78, [mkPlayer('b1', 'Lurker', 80), mkPlayer('b2', 'IGL', 79), mkPlayer('b3', 'Entry', 80), mkPlayer('b4', 'Support', 79), mkPlayer('b5', 'Rifler', 76)]);
  const seller = mkTeam('sel', 78, [mkPlayer('s1', 'AWP', 79), mkPlayer('s2', 'IGL', 79), mkPlayer('s3', 'Entry', 81), mkPlayer('s4', 'Support', 80), mkPlayer('s5', 'Rifler', 78)]);
  const ids = new Set([...buyer.players, ...seller.players].map((p) => p.id));
  const r = tickMarketWindow({ teams: [buyer, seller], freeAgents: [], split: 3, kind: 'offseason', formOf: (id) => (id === 'buy' ? 30 : 50), ageOf: () => 25, movableIds: ids, budgets: { buy: 5_000_000, sel: 0 } });
  const mv = r.log.find((m) => m.toId === 'buy');
  assert.ok(mv, 'o clube fraco comprou');
  assert.ok(mv!.swap, 'foi troca');
  assert.equal(r.moves[mv!.outPlayerId!], 'sel', 'quem perdeu a vaga foi pro vendedor');
  assert.equal(r.teams.find((t) => t.id === 'sel')!.players.length, 5, 'vendedor segue com 5');
  // o grande não usa troca pra arrancar jogador de clube menor
  const big = mkTeam('big', 84, [mkPlayer('g1', 'Lurker', 84), mkPlayer('g2', 'IGL', 83), mkPlayer('g3', 'Entry', 84), mkPlayer('g4', 'Support', 83), mkPlayer('g5', 'Rifler', 80)]);
  const small = mkTeam('small', 76, [mkPlayer('m1', 'AWP', 82), mkPlayer('m2', 'IGL', 76), mkPlayer('m3', 'Entry', 77), mkPlayer('m4', 'Support', 76), mkPlayer('m5', 'Rifler', 78)]);
  const ids2 = new Set([...big.players, ...small.players].map((p) => p.id));
  const r2 = tickMarketWindow({ teams: [big, small], freeAgents: [], split: 3, kind: 'offseason', formOf: (id) => (id === 'big' ? 30 : 50), ageOf: () => 25, movableIds: ids2, budgets: { big: 9_000_000, small: 0 } });
  assert.ok(!r2.log.some((m) => m.swap), 'sem troca de cima pra baixo');
});

test('quem acabou de chegar não é revendido na mesma janela do split', () => {
  const buyer = mkTeam('buy', 78, [mkPlayer('b1', 'Lurker', 80), mkPlayer('b2', 'IGL', 79), mkPlayer('b3', 'Entry', 80), mkPlayer('b4', 'Support', 79), mkPlayer('b5', 'Rifler', 76)]);
  const seller = mkTeam('sel', 78, [mkPlayer('s5', 'AWP', 79), mkPlayer('s2', 'IGL', 79), mkPlayer('s3', 'Entry', 81), mkPlayer('s4', 'Support', 80), mkPlayer('s1', 'Rifler', 78), mkPlayer('s6', 'Lurker', 70)]);
  const ids = new Set([...buyer.players, ...seller.players].map((p) => p.id));
  const base = { teams: [buyer, seller], freeAgents: [], split: 3, kind: 'mid' as const, formOf: (id: string) => (id === 'buy' ? 30 : 50), ageOf: () => 25, movableIds: ids, budgets: { buy: 5_000_000, sel: 0 } };
  assert.ok(tickMarketWindow(base).log.some((m) => m.playerId === 's5'), 'sem a trava, o AWP seria vendido');
  assert.ok(!tickMarketWindow({ ...base, arrivals: { s5: 3 } }).log.some((m) => m.playerId === 's5'), 'chegou neste split: fica');
});

test('elenco de elite (top-5 ≥ 85) não empilha: só repõe', () => {
  const elite = mkTeam('elite', 90, [mkPlayer('e1', 'AWP', 88), mkPlayer('e2', 'IGL', 86), mkPlayer('e3', 'Entry', 87), mkPlayer('e4', 'Support', 85), mkPlayer('e5', 'Lurker', 80)]);
  const star = mkPlayer('star', 'Lurker', 88);
  const r = tickMarketWindow({ teams: [elite], freeAgents: [star], split: 3, kind: 'offseason', formOf: () => 30, ageOf: () => 25, movableIds: new Set(['e1', 'e2', 'e3', 'e4', 'e5', 'star']) });
  assert.equal(r.log.length, 0, 'superequipe não contrata upgrade');
});

// ─── propostas pelos seus jogadores ─────────────────────────────────────────
const entry = (p: Player, e: Partial<SquadEntry> = {}): SquadEntry => ({ player: p, wage: 60_000, clause: null, wantsLeave: false, committed: false, ...e });
const offersArgs = (squad: SquadEntry[], extra: Record<string, unknown> = {}) => {
  const snap = clubsSnapshot({ teams: WORLD, split: 3, formOf: () => 50, ageOf: (p) => aiAgeOf(p, 3) });
  return { split: 3, kind: 'offseason' as const, squad, teams: WORLD, budgets: snap.budgets, strategies: snap.strategies, formOf: () => 50, ageOf: (p: Player) => aiAgeOf(p, 3), userTier: 2, existing: [] as IncomingOffer[], ...extra };
};
// elenco de teste: bons jogadores de várias funções (ids próprios)
const MY = ['AWP', 'IGL', 'Entry', 'Rifler', 'Support', 'Lurker', 'Rifler'].map((r, i) => mkPlayer(`me${i}`, r as Player['role'], 80 + (i % 4), 'br'));

test('propostas: nascem das necessidades dos clubes, cabem no caixa e respeitam o teto por janela', () => {
  const r = generateIncomingOffers(offersArgs(MY.map((p) => entry(p))));
  assert.ok(r.offers.length > 0 && r.offers.length <= 3, `1 a 3 propostas (${r.offers.length})`);
  const snap = offersArgs([]).budgets;
  for (const o of r.offers) {
    assert.ok(o.fee <= snap[o.fromTeamId], 'proposta cabe no caixa do clube');
    const team = WORLD.find((t) => t.id === o.fromTeamId)!;
    const need = clubNeeds(team, { split: 3, form: 50, strategy: o.strategy!, ageOf: (p) => aiAgeOf(p, 3) }).find((n) => n.role === o.role);
    assert.ok(need, `${o.fromTag} precisa de ${o.role}`);
    assert.ok((o.wageOffered ?? 0) > 60_000, 'salário oferecido acima do atual');
  }
  assert.deepEqual(generateIncomingOffers(offersArgs(MY.map((p) => entry(p)))).offers, r.offers, 'determinístico');
});

test('propostas: quem quer sair atrai mais; banco (frente G) baixa o preço', () => {
  const calm = generateIncomingOffers(offersArgs(MY.map((p) => entry(p)), { max: 7 }));
  const leaving = generateIncomingOffers(offersArgs(MY.map((p) => entry(p, { wantsLeave: true })), { max: 7 }));
  assert.ok(leaving.offers.length >= calm.offers.length, 'pedido de saída aumenta o assédio');
  const one = [entry(MY[0], { wantsLeave: true })];
  const full = generateIncomingOffers(offersArgs(one)).offers[0];
  const bench = generateIncomingOffers(offersArgs([entry(MY[0], { wantsLeave: true, valueFactor: 0.85 })])).offers[0];
  if (full && bench) assert.ok(bench.fee < full.fee, 'jogador no banco sai mais barato');
});

test('cláusula: clube que paga a multa não pode ser recusado — o jogador decide', () => {
  const offerBase = generateIncomingOffers(offersArgs(MY.map((p) => entry(p, { wantsLeave: true })), { max: 7 })).offers;
  assert.ok(offerBase.length > 0);
  const target = MY.find((p) => p.id === offerBase[0].playerId)!;
  const clause = Math.round(offerBase[0].fee * 1.05);
  const willing = generateIncomingOffers(offersArgs([entry(target, { clause, wantsLeave: true })], { strategies: Object.fromEntries(WORLD.map((t) => [t.id, 'starBuyer'])) }));
  const o = willing.offers[0];
  assert.ok(o?.viaReleaseClause, 'pagou a cláusula');
  assert.equal(o.fee, clause);
  assert.equal(o.status, 'accepted', 'o jogador topou: vira venda');
  assert.equal(willing.sales[0].playerId, target.id);
  // jogador que não quer ir (salário igual, clube menor, feliz) recusa mesmo com a multa paga
  const t2 = WORLD.filter((t) => aiTierOf(t) === 3);
  const unwilling = generateIncomingOffers(offersArgs([entry(target, { clause })], {
    teams: t2, userTier: 1, budgets: Object.fromEntries(t2.map((t) => [t.id, 50_000_000])), strategies: Object.fromEntries(t2.map((t) => [t.id, 'starBuyer'])),
  }));
  const u = unwilling.offers[0];
  assert.ok(u, 'um clube tier 3 paga a cláusula');
  assert.equal(u.status, 'rejected', 'jogador de clube tier 1, feliz, não desce dois tiers');
  assert.ok(u.playerRefused);
  assert.equal(unwilling.sales.length, 0);
  // e o clube não consegue "recusar" uma proposta por cláusula
  const m = withOffers(defaultMarket(), [{ ...o, status: 'open' }]);
  assert.equal(rejectOffer(m, o.id, { wantsLeave: false, willingness: 'open' }).ok, false);
});

const OFFER: IncomingOffer = { id: 'o1', playerId: 'me0', fromTeamId: 't', fee: 1_000_000, wageOffered: 90_000, split: 3, expiresSplit: 3, status: 'open', nick: 'me0', fromTag: 'T', reason: 'upgrade', strategy: 'balanced' };

test('aceitar vira venda na próxima janela; recusar quem quer ir custa moral', () => {
  const m = withOffers(defaultMarket(), [OFFER]);
  const a = acceptOffer(m, 'o1');
  assert.equal(a.sale?.fee, 1_000_000); assert.equal(a.sale?.toId, 't');
  assert.equal(a.market.incoming[0].status, 'accepted');
  assert.equal(rejectOffer(m, 'o1', { wantsLeave: true, willingness: 'eager' }).moraleDelta, REJECT_MORALE_WANTS_LEAVE);
  assert.equal(rejectOffer(m, 'o1', { wantsLeave: false, willingness: 'eager' }).moraleDelta, REJECT_MORALE_EAGER);
  assert.equal(rejectOffer(m, 'o1', { wantsLeave: false, willingness: 'reluctant' }).moraleDelta, 0);
});

test('vontade do jogador: salário maior e clube maior puxam; quer sair empurra', () => {
  assert.equal(playerWillingness({ wage: 100, wageOffered: 160, buyerTier: 1, userTier: 2, wantsLeave: false }), 'eager');
  assert.equal(playerWillingness({ wage: 100, wageOffered: 100, buyerTier: 3, userTier: 1, wantsLeave: false }), 'reluctant');
  assert.equal(playerWillingness({ wage: 100, wageOffered: 100, buyerTier: 3, userTier: 1, wantsLeave: true }), 'open');
});

test('contraproposta: até o teto fecha; um pouco acima o clube responde com a final; muito acima ele desiste', () => {
  const m = withOffers(defaultMarket(), [OFFER]);
  const value = 900_000, budget = 5_000_000;
  const max = buyerMaxFee(OFFER, value, budget);
  const ok = counterOffer(m, 'o1', max, { value, budget });
  assert.equal(ok.outcome, 'accepted'); assert.equal(ok.sale?.fee, max);
  const back = counterOffer(m, 'o1', Math.round(max * 1.1), { value, budget });
  assert.equal(back.outcome, 'countered'); assert.equal(back.fee, max);
  assert.equal(back.market.incoming[0].status, 'countered');
  assert.equal(counterOffer(back.market, 'o1', max * 2, { value, budget }).outcome, 'rejected', 'depois da final não tem nova rodada');
  assert.equal(counterOffer(m, 'o1', max * 2, { value, budget }).outcome, 'rejected');
  assert.ok(buyerMaxFee(OFFER, value, 500_000) <= 500_000, 'o teto respeita o caixa do clube');
});

test('propostas vencem no fim do split em que chegaram', () => {
  const m = withOffers(defaultMarket(), [OFFER]);
  assert.equal(expireOffers(m, 3).incoming[0].status, 'open');
  assert.equal(expireOffers(m, 4).incoming[0].status, 'expired');
});

// ─── janelas e roster lock ─────────────────────────────────────────────────
test('calendário: janela curta na etapa 1, negociações na 2-3, roster lock no split de Major da etapa 3 ao fim do Major', () => {
  assert.equal(transferWindowOf({ split: 2, eventInSplit: 1, inMajor: false, majorSplit: false }).kind, 'mid');
  const e3 = transferWindowOf({ split: 2, eventInSplit: 3, inMajor: false, majorSplit: false });
  assert.equal(e3.rosterLocked, false); assert.equal(e3.next, 'offseason');
  assert.equal(transferWindowOf({ split: 4, eventInSplit: 2, inMajor: false, majorSplit: true }).rosterLocked, false);
  assert.equal(transferWindowOf({ split: 4, eventInSplit: 3, inMajor: false, majorSplit: true }).rosterLocked, true);
  assert.equal(transferWindowOf({ split: 4, eventInSplit: 1, inMajor: true, majorSplit: true }).rosterLocked, true);
  const m = withWindowStatus(defaultMarket(), { split: 4, eventInSplit: 3, inMajor: false, majorSplit: true });
  assert.equal(m.window?.rosterLocked, true, 'o status fica gravado pra frente G ler');
});

// ─── empréstimos ────────────────────────────────────────────────────────────
test('empréstimo e stand-in: acertar, não duplicar, cancelar; stand-in só de reserva, clube em sobrevivência ou livre', () => {
  let m: MarketState = defaultMarket();
  m = agreeLoan(m, { playerId: 'me6', nick: 'me6', kind: 'out', fromTeamId: 'user', toTeamId: 't', splits: 2, fee: 50_000, split: 3 });
  assert.equal(m.loans[0].untilSplit, 4); assert.equal(m.loans[0].state, 'agreed');
  assert.equal(agreeLoan(m, { playerId: 'me6', nick: 'me6', kind: 'out', fromTeamId: 'user', toTeamId: 'u', splits: 1, fee: 1, split: 3 }).loans.length, 1);
  assert.equal(cancelLoan(m, 'me6').loans.length, 0);
  const snap = clubsSnapshot({ teams: WORLD, split: 3, formOf: () => 50, ageOf: (p) => aiAgeOf(p, 3) });
  const cands = standInCandidates({ teams: WORLD, freeAgents: agedFreeAgents(CS2_REAL_2026, {}, 3, NS), strategies: snap.strategies, exclude: new Set(), movable: (p) => BASE_PLAYER_IDS.has(p.id) });
  assert.ok(cands.length > 0);
  for (const c of cands.slice(0, 50)) {
    if (!c.team) continue;
    const idx = c.team.players.indexOf(c.player);
    assert.ok(idx >= 5 || snap.strategies[c.team.id] === 'survival', `${c.player.nick} não é titular de clube que não vende`);
  }
});

// ─── pontes com as frentes G/H (stubs) ─────────────────────────────────────
test('pontes (stubs das frentes G e H) leem o que já existe no save', () => {
  const s = migrateClube({ contracts: { a: 5 }, morale: { a: 20, b: 80 } }) as Record<string, unknown> & { clube: { contracts: Record<string, { releaseClause?: number | null; wage: number; until: number }> } };
  assert.equal(releaseClauseOf(s, 'a'), null, 'sem cláusula no contrato, nada é forçado');
  s.clube.contracts.a.releaseClause = 2_000_000;
  assert.equal(releaseClauseOf(s, 'a'), 2_000_000);
  assert.equal(wantsToLeave(s, 'a'), true); assert.equal(wantsToLeave(s, 'b'), false);
  assert.deepEqual(leaveRequests(s, ['a', 'b']), ['a']);
  assert.equal(benchValueFactor({ v: 1, status: {}, lineup: { starters: [], bench: ['x'] }, playTime: {}, meetings: [], conflicts: [] }, 'x'), 0.85);
  assert.equal(benchValueFactor(null, 'x'), 1);
  assert.equal(SQUAD_MAX, 7);
});

// ─── rumores e manchetes ────────────────────────────────────────────────────
test('rumores não repetem; manchete da janela resume movimentos e cadeias', () => {
  const r = { split: 3, text: 'X procura um AWPer.' };
  const m = pushRumors(pushRumors(defaultMarket(), [r]), [r, { split: 3, text: 'Y monitora Z.' }]);
  assert.equal(m.rumors.length, 2);
  const tick = tickMarketWindow(argsFor(3, 'offseason'));
  const news = windowNews(tick, 3, 'offseason', 2);
  assert.ok(news.some((n) => /pré-temporada/.test(n.title)), 'resumo da janela');
  assert.ok(news.length <= 4, 'no máximo 3 manchetes + o resumo (a caixa não inunda)');
});

// ─── mundo: pipeline e equilíbrio ──────────────────────────────────────────
test('mundo da IA: buildAiWorld = pipeline antigo do currentEra quando não há chegadas', () => {
  const moves = { [starters(byTag('VIT'))[4].id]: byTag('MOUZ').id };
  const legacy = applyAiAging(applyMoves(CS2_REAL_2026, moves), 5, NS).filter((t) => t.id !== FREE_TEAM_ID && !t.defunct);
  const now = buildAiWorld({ base: CS2_REAL_2026, moves, split: 5, skip: NS });
  const pick = (w: TeamSeason[], id: string) => w.find((t) => t.id === id)!.players.map((p) => p.id);
  assert.deepEqual(pick(now, byTag('MOUZ').id), pick(legacy, byTag('MOUZ').id));
  // com chegada registrada, quem chegou joga entre os 5
  const arrived = buildAiWorld({ base: CS2_REAL_2026, moves, split: 5, skip: NS, arrivals: { [Object.keys(moves)[0]]: 5 } });
  assert.equal(arrived.find((t) => t.id === byTag('MOUZ').id)!.players[0].id, Object.keys(moves)[0]);
});

test('equilíbrio do mundo em 10 splits: sem inflação, sem colapso, sem superequipe (antes × depois)', () => {
  const before = simulateWorld('before', 10);
  const after = simulateWorld('after', 10);
  const b = before[before.length - 1], a = after[after.length - 1];
  assert.ok(Math.abs(a.top20 - b.top20) <= 1.0, `top 20: ${a.top20.toFixed(1)} × ${b.top20.toFixed(1)}`);
  assert.ok(a.best <= b.best + 1.0, `melhor elenco: ${a.best.toFixed(1)} × ${b.best.toFixed(1)}`);
  assert.ok(a.top5 - a.mid <= b.top5 - b.mid + 1.0, 'o fosso entre o topo e o meio não abre');
  assert.ok(a.superteams <= b.superteams + 2, `superequipes: ${a.superteams} × ${b.superteams}`);
  assert.ok(a.tier[3].ovr >= b.tier[3].ovr - 1.0, 'o tier 3 não colapsa');
  assert.ok(after.slice(0, -1).every((m) => m.moves >= 8), 'mundo vivo: pelo menos 8 movimentos por split');
});
