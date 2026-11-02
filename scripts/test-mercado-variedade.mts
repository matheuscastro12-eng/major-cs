// MERCADO DA IA · variedade e vendidos (fix/mercado).
//   - SEMENTE DO SAVE: cada Carreira tem o seu mercado (mundo.seed salga os
//     hashes da janela, do orçamento, da estratégia, do drift e das propostas);
//     sem semente, as chaves de sempre.
//   - VARIEDADE: IGL coberto por quem já chama (igl ≥ 70 / role2) e sorteio entre
//     as 2 maiores necessidades — o mercado deixa de ser só "contrata AWP/IGL".
//   - VENDIDOS (extraOnTeam): entram na frente do elenco (jogam), o backfill só
//     completa o que eles não completam e quem fica preso no banco volta ao
//     mercado livre como jovem do mundo.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player } from '../src/types.ts';
import { buildAiWorld, agedFreeAgents, aiAgeOf, baseOvrOf, BASE_PLAYER_IDS, nextAiDrift } from '../src/engine/career/aiWorld.ts';
import { FREE_TEAM_ID } from '../src/engine/career/transferAI.ts';
import { tickMarketWindow, clubBudget, clubNeeds, seeded, squadOvr, ELITE_SQUAD, type WorldTickArgs, type WorldMove } from '../src/engine/clube/mercadoIA.ts';
import { EMPTY_MUNDO, releaseBenchedExtras, EXTRA_BENCH_SPLITS } from '../src/engine/mundo/juventudeMundo.ts';
import { isNewgenId, newgenList } from '../src/engine/mundo/juventude.ts';
import { simulateMundo, moveMix } from './measure-mundo-10-splits.mts';

const NS = new Set<string>();
const W1 = buildAiWorld({ base: CS2_REAL_2026, split: 1, skip: NS });
const argsFor = (split: number, kind: 'offseason' | 'mid', extra: Partial<WorldTickArgs> = {}): WorldTickArgs => ({
  teams: W1, freeAgents: agedFreeAgents(CS2_REAL_2026, {}, split, NS), split, kind,
  formOf: () => 50, ageOf: (p) => aiAgeOf(p, split), baseOvrOf, movableIds: BASE_PLAYER_IDS, ...extra,
});
const key = (m: WorldMove) => `${m.kind}|${m.playerId}|${m.fromId}>${m.toId}`;
const jaccard = (a: WorldMove[], b: WorldMove[]) => {
  const A = new Set(a.map(key)), B = new Set(b.map(key));
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / Math.max(1, A.size + B.size - i);
};
// 1ª janela da Carreira: a curta do split 1 + a pré-temporada do split 2
const firstWindows = (seed?: string) => [
  ...tickMarketWindow(argsFor(1, 'mid', { seed })).log,
  ...tickMarketWindow(argsFor(2, 'offseason', { seed })).log,
];

// ─── semente do save ─────────────────────────────────────────────────────────
test('semente: mesma semente ⇒ mesmo mercado', () => {
  const a = tickMarketWindow(argsFor(2, 'offseason', { seed: 'save-a' }));
  const b = tickMarketWindow(argsFor(2, 'offseason', { seed: 'save-a' }));
  assert.deepEqual(a.moves, b.moves);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.budgets, b.budgets);
});

test('semente: Carreiras diferentes repetem menos da metade da 1ª janela', () => {
  const runs = ['save-a', 'save-b', 'save-c'].map(firstWindows);
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    const jac = jaccard(runs[i], runs[j]);
    assert.ok(jac < 0.5, `saves ${i}×${j}: ${(jac * 100).toFixed(0)}% dos movimentos iguais`);
  }
});

test('semente: sem semente, as chaves de hash de sempre (medições e testes antigos não mudam)', () => {
  assert.equal(seeded(undefined, 'mkt:mid:2:x'), 'mkt:mid:2:x');
  assert.equal(seeded('', 'mkt:mid:2:x'), 'mkt:mid:2:x');
  assert.equal(seeded('s', 'mkt:mid:2:x'), 's:mkt:mid:2:x');
  const plain = tickMarketWindow(argsFor(2, 'offseason'));
  assert.deepEqual(tickMarketWindow(argsFor(2, 'offseason', { seed: undefined })).log, plain.log);
  const t = W1[0];
  assert.equal(clubBudget(t, { rank: 3, form: 50, split: 4 }), clubBudget(t, { rank: 3, form: 50, split: 4, seed: undefined }));
  const ids = W1.map((x) => x.id);
  assert.deepEqual(nextAiDrift(ids, {}, 3, {}), nextAiDrift(ids, {}, 3, {}, undefined));
  assert.notDeepEqual(nextAiDrift(ids, {}, 3, {}, 'save-a'), nextAiDrift(ids, {}, 3, {}), 'com semente o drift muda');
});

// ─── variedade ───────────────────────────────────────────────────────────────
test('necessidades: quem já chama (igl ≥ 70 ou role2 IGL) cobre o IGL; no tier 3 falta de rótulo não é buraco', () => {
  const mk = (id: string, role: Player['role'], v: number, extra: Partial<Player> = {}): Player => ({
    id, nick: id, name: id, country: 'br', role, aim: v, consistency: v, clutch: v, awp: role === 'AWP' ? v : 55, igl: 50, ...extra,
  });
  const five = [mk('a', 'AWP', 80), mk('b', 'Rifler', 78), mk('c', 'Rifler', 77), mk('d', 'Entry', 76), mk('e', 'Support', 75)];
  const ctx = { split: 2, form: 50, strategy: 'balanced' as const, ageOf: () => 25 };
  const team = (players: Player[], teamwork = 80) => ({ ...W1[0], id: 'x', teamwork, players });
  const iglHole = (players: Player[], tw?: number) => clubNeeds(team(players, tw), ctx).some((n) => n.role === 'IGL' && n.reason === 'hole');
  assert.ok(iglHole(five), 'tier 2 sem ninguém que chame: buraco');
  assert.ok(!iglHole(five.map((p) => (p.id === 'e' ? { ...p, igl: 70 } : p))), 'igl 70 cobre');
  assert.ok(!iglHole(five.map((p) => (p.id === 'e' ? { ...p, role2: 'IGL' as const } : p))), 'role2 IGL cobre');
  assert.ok(!iglHole(five, 70), 'tier 3: a base não rotula o IGL — não é buraco');
  // AWP no tier 3 continua buraco, mas não urgente (entra no sorteio da janela)
  const noAwp = five.map((p) => (p.id === 'a' ? { ...p, role: 'Rifler' as const, awp: 60 } : p));
  assert.equal(clubNeeds(team(noAwp, 80), ctx).find((n) => n.role === 'AWP')?.priority, 90);
  assert.equal(clubNeeds(team(noAwp, 70), ctx).find((n) => n.role === 'AWP')?.priority, 60);
});

test('variedade em 10 splits (com semente): AWP/IGL < 60%, mercado livre devolve gente, top 20 ±1', () => {
  const { moveLog, rows } = simulateMundo(10, { seed: 'save-a' });
  const mix = moveMix(moveLog);
  assert.ok(moveLog.length >= 150, `mundo vivo (${moveLog.length} movimentos)`);
  assert.ok(mix.awpIgl < 0.6, `AWP/IGL ${(mix.awpIgl * 100).toFixed(0)}%`);
  assert.ok(mix.resigned >= 0.15, `só ${(mix.resigned * 100).toFixed(0)}% dos que perderam a vaga voltaram (antes ≈ 10%)`);
  for (const r of rows) assert.ok(Math.abs(r.top20 - rows[0].top20) <= 1, `split ${r.split}: top 20 ${r.top20.toFixed(2)}`);
});

test('elite não se compra: nenhum negócio leva o elenco a ELITE_SQUAD (nem buraco urgente)', () => {
  const mk = (id: string, role: Player['role'], v: number, awp = 60): Player => ({ id, nick: id, name: id, country: 'br', role, aim: v, consistency: v, clutch: v, awp, igl: 50 });
  // ≈ 84 de média, tier 1, sem AWP: buraco urgente
  const players = [mk('s1', 'Rifler', 90), mk('s2', 'Entry', 86), mk('s3', 'Rifler', 84), mk('s4', 'Support', 82), mk('s5', 'Rifler', 78)];
  const t = { ...W1[0], id: 'top', tag: 'TOP', teamwork: 84, players };
  const fa = [mk('awp93', 'AWP', 93, 95), mk('awp84', 'AWP', 84, 86), mk('awp79', 'AWP', 79, 82)];
  const ids = new Set([...players, ...fa].map((p) => p.id));
  const tick = (free: Player[]) => tickMarketWindow({ teams: [t], freeAgents: free, split: 3, kind: 'offseason', formOf: () => 50, ageOf: () => 25, movableIds: ids });
  assert.ok(squadOvr(players) < ELITE_SQUAD);
  const r = tick(fa);
  const buy = r.log.find((m) => m.toId === 'top');
  assert.equal(buy?.playerId, 'awp79', `o buraco é preenchido sem virar elite (comprou ${buy?.nick})`);
  assert.ok(squadOvr(r.teams[0].players) < ELITE_SQUAD, `elenco ${squadOvr(r.teams[0].players).toFixed(1)}`);
  // sem opção abaixo da elite, o buraco fica aberto (antes levava o 93)
  assert.equal(tick(fa.filter((p) => p.id !== 'awp79')).log.find((m) => m.toId === 'top'), undefined);
});

// ─── vendidos (extraOnTeam) ──────────────────────────────────────────────────
const TEAM = W1.find((t) => t.players.length === 5)!;
const PROSPECT: Player = { id: 'aca_user_1', nick: 'prospect', name: 'Prospect', country: TEAM.country, role: 'AWP', age: 18, aim: 76, consistency: 74, clutch: 73, awp: 78, igl: 60 };

test('vendido joga: entra na frente do elenco (índice < 5) e não muda a identidade dos regens', () => {
  const late = 40; // envelhecimento com várias gerações de regens
  const plain = buildAiWorld({ base: CS2_REAL_2026, split: late, skip: NS }).find((t) => t.id === TEAM.id)!;
  const withExtra = buildAiWorld({ base: CS2_REAL_2026, split: late, skip: NS, extraOnTeam: { [TEAM.id]: [{ player: PROSPECT, arrival: 3 }] } }).find((t) => t.id === TEAM.id)!;
  const idx = withExtra.players.findIndex((p) => p.id === PROSPECT.id);
  assert.ok(idx >= 0 && idx < 5, `vendido no índice ${idx}`);
  assert.deepEqual(withExtra.players.filter((p) => p.id !== PROSPECT.id).map((p) => p.id), plain.players.map((p) => p.id), 'mesmos regens, mesma ordem');
});

test('vendido: ordem por chegada com as contratações do mercado (mais recente na frente)', () => {
  const buyIn = TEAM.players[0].id === W1[1].players[0].id ? W1[2].players[0] : W1[1].players[0];
  const moves = { [buyIn.id]: TEAM.id };
  const world = (arrivalExtra: number) => buildAiWorld({
    base: CS2_REAL_2026, split: 5, skip: NS, moves, arrivals: { [buyIn.id]: 3 },
    extraOnTeam: { [TEAM.id]: [{ player: PROSPECT, arrival: arrivalExtra }] },
  }).find((t) => t.id === TEAM.id)!.players.map((p) => p.id);
  assert.deepEqual(world(4).slice(0, 2), [PROSPECT.id, buyIn.id], 'vendido mais recente na frente');
  assert.deepEqual(world(2).slice(0, 2), [buyIn.id, PROSPECT.id], 'contratação mais recente na frente');
});

test('backfill: não entra jovem sintético se o vendido completa os 5', () => {
  const out = TEAM.players[4].id;
  const t = buildAiWorld({
    base: CS2_REAL_2026, split: 2, skip: NS, moves: { [out]: FREE_TEAM_ID },
    extraOnTeam: { [TEAM.id]: [{ player: PROSPECT, arrival: 2 }] },
  }).find((x) => x.id === TEAM.id)!;
  assert.equal(t.players.length, 5);
  assert.ok(!t.players.some((p) => p.id.includes('__aca')), 'sem backfill');
  assert.equal(t.players[0].id, PROSPECT.id);
  // com 2 buracos e 1 vendido, o backfill completa só 1
  const t2 = buildAiWorld({
    base: CS2_REAL_2026, split: 2, skip: NS, moves: { [out]: FREE_TEAM_ID, [TEAM.players[3].id]: FREE_TEAM_ID },
    extraOnTeam: { [TEAM.id]: [{ player: PROSPECT, arrival: 2 }] },
  }).find((x) => x.id === TEAM.id)!;
  assert.equal(t2.players.length, 5);
  assert.equal(t2.players.filter((p) => p.id.includes('__aca')).length, 1);
});

test('vendido preso no banco há ≥ 2 splits volta ao mercado livre como jovem do mundo', () => {
  // 6 vendidos no mesmo clube: o mais antigo fica fora dos 5
  const extras = Array.from({ length: 6 }, (_, i) => ({ player: { ...PROSPECT, id: `aca_user_${i}`, nick: `p${i}` }, arrival: 2 + i }));
  const extraOnTeam = { [TEAM.id]: extras };
  const at = (split: number) => buildAiWorld({ base: CS2_REAL_2026, split, skip: NS, extraOnTeam });
  const w8 = at(8);
  const benched = w8.find((t) => t.id === TEAM.id)!.players.slice(5).map((p) => p.id);
  assert.ok(benched.includes('aca_user_0'), 'o mais antigo está no banco');
  const r = releaseBenchedExtras({ mundo: EMPTY_MUNDO, extraOnTeam, world: w8, split: 8 });
  assert.equal(r.released.length, benched.filter((id) => id.startsWith('aca_user_')).length);
  assert.ok(r.released.some((x) => x.from === 'aca_user_0'));
  assert.ok(!r.extraOnTeam![TEAM.id].some((e) => e.player.id === 'aca_user_0'), 'saiu do comprador');
  const ng = newgenList(r.mundo);
  assert.equal(ng.length, r.released.length);
  for (const p of ng) {
    assert.ok(isNewgenId(p.id), p.id);
    assert.equal(p.nick.startsWith('p'), true, 'mesma identidade (nick)');
    assert.equal(aiAgeOf(p, 9), aiAgeOf(extras[0].player, 9), 'mesma idade');
  }
  // recém-chegado no banco ainda não sai; titular nunca sai
  const fresh = releaseBenchedExtras({ mundo: EMPTY_MUNDO, extraOnTeam, world: w8, split: extras[0].arrival + EXTRA_BENCH_SPLITS - 2 });
  assert.equal(fresh.released.length, 0);
  const one = { [TEAM.id]: [extras[0]] };
  assert.equal(releaseBenchedExtras({ mundo: EMPTY_MUNDO, extraOnTeam: one, world: buildAiWorld({ base: CS2_REAL_2026, split: 8, skip: NS, extraOnTeam: one }), split: 8 }).released.length, 0);
});
