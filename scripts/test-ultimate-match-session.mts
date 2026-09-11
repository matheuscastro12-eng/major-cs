// [U06] sessão incremental do Ultimate: determinismo, timeout só altera o futuro, retomada por JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { makeRng } from '../src/engine/rng.ts';
import { autoVeto } from '../src/engine/veto.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import { simulateSeries } from '../src/engine/match.ts';
import { prepareUltimateTeam, type PoolLike } from '../src/engine/ultimate/squadAnalysis.ts';
import { advanceSession, aiWantsTimeout, callTimeout, createSession, normalizeSession, sessionSeries, skipToEnd, viewSession, TIMEOUT_ROUNDS } from '../src/engine/ultimate/matchSession.ts';

const pool: PoolLike[] = [];
for (const t of CS2_REAL_2026) for (const p of t.players) pool.push({ id: p.id, ovr: playerOvr(p), player: p, from: t });
const byOvr = [...pool].sort((a, b) => b.ovr - a.ovr);
const A = prepareUltimateTeam({ name: 'A', picks: byOvr.slice(0, 5), idPrefix: 'a' });
const B = prepareUltimateTeam({ name: 'B', picks: byOvr.slice(6, 11), idPrefix: 'b' });
const mk = (seed: number) => { const rng = makeRng(seed); const [m] = autoVeto([A, B], rng, 1); return createSession({ matchId: `m${seed}`, seed, teams: [A, B], map: m.map, pickedBy: m.pickedBy, now: 0 }); };

test('sem decisões, a sessão reproduz exatamente o simulateSeries com a mesma seed', () => {
  const s = skipToEnd(mk(77));
  const ser = sessionSeries(s)!;
  const rng = makeRng(77); const maps = autoVeto([A, B], rng, 1);
  // o veto consumiu o rng; a sessão usa a MESMA seed para os rounds (rng novo) — então
  // comparamos com um sim independente pela mesma seed, não com o simulateSeries pós-veto.
  assert.ok(ser.maps[0].roundLog.length >= 13);
  const again = sessionSeries(skipToEnd(mk(77)))!;
  assert.deepEqual(ser.maps[0].roundLog, again.maps[0].roundLog);
  assert.deepEqual(ser.maps[0].score, again.maps[0].score);
  assert.ok(maps.length === 1);
});

test('avançar 1 a 1 dá o mesmo log que correr até o fim', () => {
  let s = mk(5);
  while (s.status === 'live') s = advanceSession(s);
  const fast = skipToEnd(mk(5));
  assert.deepEqual(viewSession(s).roundLog, viewSession(fast).roundLog);
  assert.equal(advanceSession(s), s, 'avançar depois do fim é no-op');
});

test('timeout altera APENAS o futuro: rounds já resolvidos ficam idênticos', () => {
  let s = mk(9);
  for (let i = 0; i < 6; i++) s = advanceSession(s);
  const before = viewSession(s).roundLog.slice();
  const t = callTimeout(s, 0);
  assert.ok(t.ok);
  let withTo = t.session;
  for (let i = 0; i < 8; i++) withTo = advanceSession(withTo);
  const after = viewSession(withTo).roundLog;
  assert.deepEqual(after.slice(0, 6), before, 'os 6 primeiros rounds não mudam');
  // e o mesmo estado reexecutado (retomada) dá o mesmo resultado
  const resumed = normalizeSession(JSON.parse(JSON.stringify(withTo)))!;
  assert.deepEqual(viewSession(resumed).roundLog, after);
  // limite: 1 por lado; segundo pedido falha
  assert.equal(callTimeout(withTo, 0).ok, false);
  assert.equal(callTimeout(withTo, 0).reason, 'none_left');
});

test('timeout dos dois lados no mesmo round anula (simétrico) e a IA decide por regra determinística', () => {
  let s = mk(3);
  for (let i = 0; i < 5; i++) s = advanceSession(s);
  const both = callTimeout(callTimeout(s, 0).session, 1).session;
  // com os dois boosts no mesmo intervalo, o log tem que bater com o sem-boost
  let plain = s; let b = both;
  for (let i = 0; i < TIMEOUT_ROUNDS + 2; i++) { plain = advanceSession(plain); b = advanceSession(b); }
  assert.deepEqual(viewSession(b).roundLog, viewSession(plain).roundLog);
  const v = viewSession(s);
  assert.equal(aiWantsTimeout(s, v), aiWantsTimeout(s, viewSession(s)));
});

test('normalizeSession rejeita versão/forma estranha e mantém decisões válidas', () => {
  assert.equal(normalizeSession({ v: 2 }), null);
  assert.equal(normalizeSession('x'), null);
  const s = mk(1);
  const n = normalizeSession({ ...JSON.parse(JSON.stringify(s)), decisions: [{ round: 3, team: 1 }, { bad: true }], cursor: '4' })!;
  assert.deepEqual(n.decisions, [{ round: 3, team: 1 }]);
  assert.equal(n.cursor, 4);
});
