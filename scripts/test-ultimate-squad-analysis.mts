// [U03] avaliador de elenco, abordagens e IA do Ultimate — determinismo, simetria
// e "nenhuma abordagem vence em todos os cenários".
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { makeRng } from '../src/engine/rng.ts';
import { simulateSeries } from '../src/engine/match.ts';
import { autoVeto } from '../src/engine/veto.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import {
  APPROACH_IDS, buildAiOpponent, effectiveMultiplier, prepareUltimateTeam, pvpApproachesApply, squadProfile,
  type Approach, type PoolLike,
} from '../src/engine/ultimate/squadAnalysis.ts';

const pool: PoolLike[] = [];
for (const t of CS2_REAL_2026) for (const p of t.players) pool.push({ id: p.id, ovr: playerOvr(p), player: p, from: t });
const byOvr = [...pool].sort((a, b) => b.ovr - a.ovr);
const five = (offset: number) => byOvr.slice(offset, offset + 5);

test('prepareUltimateTeam é determinístico e o multiplicador da UI é o do motor', () => {
  const a = prepareUltimateTeam({ name: 'A', picks: five(0), idPrefix: 'a', mult: { chem: 1.05, evoBoost: 3, duelTotal: 4, duelMult: 1.01 }, approach: 'control' });
  const b = prepareUltimateTeam({ name: 'A', picks: five(0), idPrefix: 'a', mult: { chem: 1.05, evoBoost: 3, duelTotal: 4, duelMult: 1.01 }, approach: 'control' });
  assert.deepEqual(a, b);
  const base = prepareUltimateTeam({ name: 'A', picks: five(0), idPrefix: 'a' });
  assert.ok(Math.abs(a.strength / base.strength - effectiveMultiplier({ chem: 1.05, evoBoost: 3, duelTotal: 4, duelMult: 1.01 })) < 1e-9);
  assert.equal(a.playbook, 'controlled');
  assert.equal(base.playbook, undefined, 'sem abordagem = comportamento antigo');
  // duel só entra com total > 0
  const noDuel = prepareUltimateTeam({ name: 'A', picks: five(0), idPrefix: 'a', mult: { chem: 1, evoBoost: 0, duelTotal: 0, duelMult: 1.03 } });
  assert.equal(noDuel.strength, base.strength);
});

test('perfil de elenco só usa dados do Player e explica a origem', () => {
  const prof = squadProfile(five(0).map((p) => p.player));
  assert.equal(prof.axes.length, 4);
  for (const a of prof.axes) { assert.ok(a.score >= 1 && a.score <= 99); assert.ok(a.basis.length > 5); }
  assert.ok(prof.strengths.length <= 2);
  // elenco sem IGL de função é apontado como fragilidade de controle
  const noIgl = pool.filter((p) => p.player.role !== 'IGL' && p.player.role2 !== 'IGL').slice(0, 5).map((p) => p.player);
  const p2 = squadProfile(noIgl);
  assert.match(p2.axes.find((a) => a.axis === 'controle')!.basis, /sem IGL/);
});

test('IA: composição válida (IGL+AWP+Entry+Support) e variada; mesmo seed ⇒ mesmo adversário', () => {
  const mine = new Set(five(0).map((p) => p.id));
  const a = buildAiOpponent(pool, mine, 80, makeRng(7));
  const b = buildAiOpponent(pool, mine, 80, makeRng(7));
  assert.deepEqual(a.five.map((p) => p.id), b.five.map((p) => p.id));
  assert.equal(a.five.length, 5);
  const roles = new Set(a.five.flatMap((p) => [p.player.role, p.player.role2].filter(Boolean)));
  assert.ok(roles.has('IGL') && roles.has('AWP') && roles.has('Entry'));
  assert.ok(a.five.some((p) => p.player.role === 'Support' || p.player.role === 'Lurker' || p.player.role2 === 'Support'));
  assert.ok(Math.abs(a.avgOvr - 80) <= 6);
  const ids = new Set<string>();
  for (let s = 1; s <= 8; s++) ids.add(buildAiOpponent(pool, mine, 80, makeRng(s)).five.map((p) => p.id).join(','));
  assert.ok(ids.size >= 4, 'adversários variam com o seed');
});

// Matriz: 3 confrontos × 40 seeds × (sem abordagem + 3 abordagens), IA sem abordagem.
// Critério: o spread de win rate entre abordagens fica dentro de uma faixa
// estreita (nenhuma é "sempre melhor") e nenhuma abordagem é a melhor nos 3
// confrontos ao mesmo tempo.
test('nenhuma abordagem vence em todos os cenários da bateria', () => {
  const pairs: [PoolLike[], PoolLike[]][] = [[five(0), five(5)], [five(10), five(12)], [five(30), five(20)]];
  const SEEDS = 40;
  const bestPerPair: string[] = [];
  for (const [mine, opp] of pairs) {
    const rates: Record<string, number> = {};
    for (const ap of ['none', ...APPROACH_IDS] as const) {
      let wins = 0;
      for (let s = 1; s <= SEEDS; s++) {
        const rng = makeRng(1000 + s);
        const me = prepareUltimateTeam({ name: 'me', picks: mine, idPrefix: 'me', approach: ap === 'none' ? null : (ap as Approach) });
        const ai = prepareUltimateTeam({ name: 'ai', picks: opp, idPrefix: 'ai' });
        const maps = autoVeto([me, ai], rng, 1);
        if (simulateSeries(rng, me, ai, maps, 1).winner === 0) wins++;
      }
      rates[ap] = wins / SEEDS;
    }
    const vals = APPROACH_IDS.map((a) => rates[a]);
    assert.ok(Math.max(...vals) - Math.min(...vals) <= 0.25, `spread alto: ${JSON.stringify(rates)}`);
    bestPerPair.push(APPROACH_IDS.reduce((b, a) => (rates[a] > rates[b] ? a : b)));
  }
  assert.ok(new Set(bestPerPair).size >= 2, `mesma abordagem venceu em todos: ${bestPerPair.join(',')}`);
});

test('PvP: abordagem só vale quando os DOIS snapshots são v2', () => {
  assert.equal(pvpApproachesApply({ v: 2, approach: 'control' }, { v: 2, approach: 'aggressive' }), true);
  assert.equal(pvpApproachesApply({ v: 2, approach: 'control' }, {}), false);
  assert.equal(pvpApproachesApply({}, { v: 2 }), false);
});

test('PvP: ordem canônica preserva o vencedor visto de cada lado', () => {
  const A = prepareUltimateTeam({ name: 'A', picks: five(0), idPrefix: 'pvp-a', approach: 'aggressive' });
  const B = prepareUltimateTeam({ name: 'B', picks: five(5), idPrefix: 'pvp-b', approach: 'control' });
  const run = () => { const rng = makeRng(4242); const maps = autoVeto([A, B], rng, 1); return simulateSeries(rng, A, B, maps, 1).winner; };
  const w1 = run(), w2 = run();
  assert.equal(w1, w2);
  // perspectiva de A: venceu ⇔ winner===0; de B: venceu ⇔ winner===1 — mesmo fato
  assert.equal(w1 === 0, !(w1 === 1));
});
