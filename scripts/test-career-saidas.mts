// SAÍDAS DO SEU ELENCO (engine/clube/saidas.ts + aiWorld.applyMoves).
// Bug: vendido/dispensado voltava pro time da base e recontratar cobrava taxa
// (relato do Techno na MGZ). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player, TeamSeason } from '../src/types.ts';
import { applyMoves, buildAiWorld, currentFreeAgents } from '../src/engine/career/aiWorld.ts';
import { FREE_TEAM_ID } from '../src/engine/career/transferAI.ts';
import { RETIRED_TEAM_ID } from '../src/engine/mundo/editor.ts';
import { playerOvr, playerValue } from '../src/engine/ratings.ts';
import { clubsSnapshot, starters } from '../src/engine/clube/mercadoIA.ts';
import type { IncomingOffer, MarketLoan } from '../src/engine/clube/model.ts';
import {
  QUICK_SALE_RATE, quickSaleFee, recordExit, releaseToFree, sellToBuyer, pickQuickSaleBuyer, settleSaleAtBuyer,
  displacedBy, endLoanOutMove, faReleaseRepair, formerSquadIds,
} from '../src/engine/clube/saidas.ts';

const BASE = CS2_REAL_2026;
const TECHNO = 'bo3_29449';
const MGZ = 'bo3_team_736';
const SPLIT = 2;
const techno = BASE.find((t) => t.id === MGZ)!.players.find((p) => p.id === TECHNO)!;
const clubOf = (world: TeamSeason[], pid: string) => world.find((t) => t.players.some((p) => p.id === pid))?.id;
// preço no mercado da Carreira: time → valor; mercado livre → 0 (mesma conta do useMemo `market`)
function marketPrice(moves: Record<string, string>, skip: Set<string>, pid: string): { from: string; price: number } | null {
  if (currentFreeAgents(BASE, moves).some((p) => p.id === pid)) return { from: FREE_TEAM_ID, price: 0 };
  const world = buildAiWorld({ base: BASE, moves, split: SPLIT, skip });
  for (const t of world) for (const p of t.players) if (p.id === pid) return { from: t.id, price: playerValue(p) };
  return null;
}

test('base: Techno4K é da MGZ (o relato)', () => {
  assert.ok(techno, 'Techno4K precisa existir na base');
  // sem destino gravado ele volta pra MGZ com taxa — o bug
  const bug = marketPrice({}, new Set(), TECHNO)!;
  assert.equal(bug.from, MGZ);
  assert.ok(bug.price > 0);
});

test('caso 1 · applyMoves: clube extinto → mercado livre; aposentados seguem na origem', () => {
  const defunct = BASE.find((t) => t.defunct && t.id !== RETIRED_TEAM_ID)!;
  assert.ok(defunct, 'a base precisa ter um clube extinto');
  const w = applyMoves(BASE, { [TECHNO]: defunct.id });
  assert.equal(clubOf(w, TECHNO), FREE_TEAM_ID);
  assert.equal(marketPrice({ [TECHNO]: defunct.id }, new Set(), TECHNO)!.price, 0);
  if (BASE.some((t) => t.id === RETIRED_TEAM_ID)) {
    assert.equal(clubOf(applyMoves(BASE, { [TECHNO]: RETIRED_TEAM_ID }), TECHNO), MGZ);
  }
  // time válido segue valendo
  assert.equal(clubOf(applyMoves(BASE, { [TECHNO]: 'bo3_team_765' }), TECHNO), 'bo3_team_765');
});

test('caso 2 · releaseToFree: Techno no mercado livre, fora da MGZ, preço 0', () => {
  const b = releaseToFree({ moves: {} }, { playerId: TECHNO, split: SPLIT, movable: true });
  assert.equal(b.moves[TECHNO], FREE_TEAM_ID);
  assert.ok(currentFreeAgents(BASE, b.moves).some((p) => p.id === TECHNO));
  const world = buildAiWorld({ base: BASE, moves: b.moves, split: SPLIT, skip: new Set() });
  assert.ok(!world.find((t) => t.id === MGZ)!.players.some((p) => p.id === TECHNO), 'não pode voltar pra MGZ');
  assert.deepEqual(marketPrice(b.moves, new Set(), TECHNO), { from: FREE_TEAM_ID, price: 0 });
});

test('caso 3 · fim de contrato sem renovar: F/A, passagem fechada, compromissos limpos', () => {
  const stints = { [TECHNO]: [{ team: 'Org', from: 1, to: null, startOvr: 78 }] };
  const b = releaseToFree({ moves: {}, stints }, { playerId: TECHNO, split: 3, endOvr: 77, movable: true });
  assert.equal(b.moves[TECHNO], FREE_TEAM_ID);
  assert.equal(b.stints![TECHNO][0].to, 3);
  assert.equal(b.stints![TECHNO][0].endOvr, 77);
  // não endereçável (academia/youth): não inventa move
  const nb = releaseToFree({ moves: {} }, { playerId: 'prospect__x', split: 3, movable: false });
  assert.equal(nb.moves.prospect__x, undefined);
  // idempotente
  assert.deepEqual(releaseToFree(b, { playerId: TECHNO, split: 3, endOvr: 77, movable: true }), b);
});

test('caso 4 · fim do empréstimo de saída: o move do empréstimo some', () => {
  const moves = { [TECHNO]: 'bo3_team_765', other: 'x' };
  endLoanOutMove(moves, TECHNO);
  assert.deepEqual(moves, { other: 'x' });
});

test('caso 5 · reparo único: ex-jogador sem destino vira F/A; idempotente; stand-in ativo intocado', () => {
  const sold = BASE.find((t) => t.id === 'bo3_team_765')!.players[0].id; // vendido de verdade (tem move)
  const standIn = BASE.find((t) => t.id === 'bo3_team_765')!.players[1].id; // stand-in ativo
  const squadMate = BASE.find((t) => t.id === 'bo3_team_765')!.players[2].id; // ainda no elenco
  const freeGuy = BASE.find((t) => t.id === FREE_TEAM_ID)!.players[0].id; // já é F/A na base
  const loans: MarketLoan[] = [{ playerId: standIn, kind: 'in', state: 'active', toTeamId: 'user', fromTeamId: 'bo3_team_765', untilSplit: 3 }];
  const world = applyMoves(BASE, { [sold]: MGZ });
  const args = {
    moves: { [sold]: MGZ },
    squadIds: new Set([squadMate]),
    loans,
    traces: {
      pairChem: { [`${TECHNO}|${squadMate}`]: 40, [`${standIn}|${squadMate}`]: 35, [`${freeGuy}|${squadMate}`]: 30 },
      coachBond: { [sold]: 60 },
      evo: { [TECHNO]: -2 },
    },
    movable: (id: string) => id !== 'prospect__x',
    clubOf: (id: string) => clubOf(world, id),
  };
  assert.ok(formerSquadIds(args.traces).has(TECHNO));
  const r = faReleaseRepair(args);
  assert.deepEqual(r.repaired, [TECHNO]);
  assert.equal(r.moves[TECHNO], FREE_TEAM_ID);
  assert.equal(r.moves[sold], MGZ, 'venda de verdade não muda');
  assert.equal(r.moves[standIn], undefined, 'stand-in com empréstimo ativo não é tocado');
  assert.equal(r.moves[squadMate], undefined, 'elenco atual não é tocado');
  assert.equal(r.moves[freeGuy], undefined, 'F/A da base não precisa de move');
  // idempotente
  const again = faReleaseRepair({ ...args, moves: r.moves });
  assert.deepEqual(again.repaired, []);
  assert.deepEqual(again.moves, r.moves);
});

// mundo da IA sem o seu elenco (oppEra) para a escolha do comprador
const world0 = buildAiWorld({ base: BASE, moves: {}, split: SPLIT, skip: new Set([TECHNO]) })
  .map((t) => ({ ...t, players: t.players.filter((p) => p.id !== TECHNO) }));
const snap = clubsSnapshot({ teams: world0, split: SPLIT, formOf: () => 50, ageOf: () => 25 });
const ctx = { teams: world0, split: SPLIT, budgets: snap.budgets, strategies: snap.strategies, formOf: () => 50, ageOf: () => 25 };

test('caso 6 · venda rápida (85%): comprador plausível, move pro comprador, compromissos limpos', () => {
  const fee = quickSaleFee(TECHNO, techno, []);
  assert.equal(fee, Math.round(playerValue(techno) * QUICK_SALE_RATE));
  const pick = pickQuickSaleBuyer(techno, fee, ctx);
  assert.ok(pick, 'tem que achar comprador');
  assert.notEqual(pick!.team.id, MGZ, 'o comprador não é o time de origem');
  // plausível: sem salto de patamar
  assert.ok(playerOvr(techno) <= Math.max(...starters(pick!.team).map(playerOvr)) + 4);
  // determinístico
  assert.equal(pickQuickSaleBuyer(techno, fee, ctx)!.team.id, pick!.team.id);
  const incoming: IncomingOffer[] = [
    { id: 'o1', playerId: TECHNO, fromTeamId: 'bo3_team_765', fee: 1, split: SPLIT, expiresSplit: SPLIT, status: 'open' },
    { id: 'o2', playerId: 'other', fromTeamId: 'bo3_team_765', fee: 1, split: SPLIT, expiresSplit: SPLIT, status: 'open' },
  ];
  const b = sellToBuyer(
    { moves: {}, pendingDeals: [{ outPlayerIds: [TECHNO] }, { outPlayerIds: ['z'] }], incoming, pendingSales: [] },
    { playerId: TECHNO, buyerId: pick!.team.id, split: SPLIT, movable: true },
  );
  assert.equal(b.moves[TECHNO], pick!.team.id);
  assert.equal(b.pendingDeals!.length, 1, 'troca que o incluía cai');
  assert.equal(b.incoming!.find((o) => o.id === 'o1')!.status, 'expired');
  assert.equal(b.incoming!.find((o) => o.id === 'o2')!.status, 'open');
  const at = marketPrice(b.moves, new Set(), TECHNO)!;
  assert.equal(at.from, pick!.team.id);
  // venda já acertada é honrada: valor e clube dela
  const pending = [{ playerId: TECHNO, nick: 'Techno4K', fee: 999_000, toTag: 'MOUZ', toId: 'bo3_team_765' }];
  assert.equal(quickSaleFee(TECHNO, techno, pending), 999_000);
  const pb = recordExit({ moves: {}, pendingSales: pending }, { playerId: TECHNO, toId: pending[0].toId, split: SPLIT, movable: true });
  assert.equal(pb.pendingSales!.length, 0, 'não consuma a venda de novo na janela');
  assert.equal(pb.moves[TECHNO], 'bo3_team_765');
});

test('caso 7 · venda com outPlayerId: comprador fica com 5, deslocado no mercado livre, chegada gravada', () => {
  // comprador com EXATAMENTE 5 na base
  const buyer = BASE.find((t) => t.id !== MGZ && !t.defunct && t.id !== FREE_TEAM_ID && t.players.length === 5
    && displacedBy(t, techno) != null)!;
  assert.ok(buyer, 'precisa de um comprador com 5 e alguém da função mais fraco que o Techno');
  const out = displacedBy(buyer, techno)!;
  const moves0 = sellToBuyer({ moves: {} }, { playerId: TECHNO, buyerId: buyer.id, split: SPLIT, movable: true }).moves;
  const r = settleSaleAtBuyer({
    moves: moves0, arrivals: {}, playerId: TECHNO, buyerId: buyer.id, split: SPLIT, outPlayerId: out,
    movable: () => true, isAtBuyer: (id) => buyer.players.some((p) => p.id === id),
  });
  assert.equal(r.released, out);
  assert.equal(r.moves[out], FREE_TEAM_ID);
  assert.equal(r.arrivals[TECHNO], SPLIT);
  const world = buildAiWorld({ base: BASE, moves: r.moves, split: SPLIT, skip: new Set(), arrivals: r.arrivals });
  const bt = world.find((t) => t.id === buyer.id)!;
  assert.equal(bt.players.length, 5);
  assert.equal(bt.players[0].id, TECHNO, 'o reforço joga (vai pra frente do elenco)');
  assert.ok(currentFreeAgents(BASE, r.moves).some((p: Player) => p.id === out));
  // idempotente e não desloca quem já saiu do comprador
  const again = settleSaleAtBuyer({ ...r, playerId: TECHNO, buyerId: buyer.id, split: SPLIT, outPlayerId: out, movable: () => true, isAtBuyer: () => false });
  assert.deepEqual(again.moves, r.moves);
  const gone = settleSaleAtBuyer({ moves: { ...moves0, [out]: 'bo3_team_765' }, playerId: TECHNO, buyerId: buyer.id, split: SPLIT, outPlayerId: out, movable: () => true, isAtBuyer: () => true });
  assert.equal(gone.moves[out], 'bo3_team_765');
  assert.equal(gone.released, undefined);
});
