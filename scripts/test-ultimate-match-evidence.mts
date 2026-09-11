// [U04] relatório pós-jogo do Ultimate: só evidência do motor, determinístico, ≤3 insights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { makeRng } from '../src/engine/rng.ts';
import { simulateSeries } from '../src/engine/match.ts';
import { autoVeto } from '../src/engine/veto.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import { prepareUltimateTeam, type PoolLike } from '../src/engine/ultimate/squadAnalysis.ts';
import { buildMatchEvidence } from '../src/engine/ultimate/matchEvidence.ts';

const pool: PoolLike[] = [];
for (const t of CS2_REAL_2026) for (const p of t.players) pool.push({ id: p.id, ovr: playerOvr(p), player: p, from: t });
const byOvr = [...pool].sort((a, b) => b.ovr - a.ovr);
const A = prepareUltimateTeam({ name: 'A', picks: byOvr.slice(0, 5), idPrefix: 'a', approach: 'aggressive' });
const B = prepareUltimateTeam({ name: 'B', picks: byOvr.slice(8, 13), idPrefix: 'b' });
const play = (seed: number) => { const rng = makeRng(seed); const maps = autoVeto([A, B], rng, 1); return simulateSeries(rng, A, B, maps, 1); };

test('relatório é idêntico para a mesma série e separa observado de modelado', () => {
  const s = play(11);
  const mods = { chem: 1.04, chemTotal: 10, evoBoost: 2, duelTotal: 3, duelMult: 1.007, approach: 'aggressive' as const, oppApproach: null };
  const r1 = buildMatchEvidence(s, [A, B], 0, mods);
  const r2 = buildMatchEvidence(s, [A, B], 0, mods);
  assert.deepEqual(r1, r2);
  assert.ok(r1.insights.length >= 1 && r1.insights.length <= 3);
  assert.ok(r1.observed.find((f) => f.label === 'Placar'));
  assert.deepEqual(r1.modeled.map((f) => f.label), ['Química', 'Evolução', 'Estilos/traits', 'Sua abordagem']);
  for (const i of r1.insights) assert.ok(i.evidence.length > 0, 'todo insight cita evidência');
});

test('os números do relatório batem com o MapResult (placar, pistols, aberturas)', () => {
  const s = play(23); const m = s.maps[0];
  const r = buildMatchEvidence(s, [A, B], 0);
  assert.equal(r.observed.find((f) => f.label === 'Placar')!.value.startsWith(`${m.score[0]}–${m.score[1]}`), true);
  const pistols = [m.roundLog[0], m.roundLog[12]].filter((w) => w === 0 || w === 1);
  const pw = pistols.filter((w) => w === 0).length;
  assert.equal(r.observed.find((f) => f.label === 'Pistols')!.value, `${pw} de ${pistols.length}`);
  const opens = m.killFeed.filter((k) => k.opening); const mine = opens.filter((k) => k.killerTeam === 0).length;
  assert.equal(r.observed.find((f) => f.label === 'Aberturas')!.value, `${mine} de ${opens.length}`);
  // perspectiva do outro lado inverte o placar, não o fato
  const r2 = buildMatchEvidence(s, [A, B], 1);
  assert.equal(r2.observed.find((f) => f.label === 'Placar')!.value.startsWith(`${m.score[1]}–${m.score[0]}`), true);
});

test('fallback honesto: sem killFeed não há insight de aberturas/trocas; sem modificadores diz "nenhum"', () => {
  const s = play(5);
  const bare = { ...s, maps: [{ ...s.maps[0], killFeed: [] }] };
  const r = buildMatchEvidence(bare, [A, B], 0);
  assert.equal(r.hasKillFeed, false);
  assert.ok(!r.observed.some((f) => f.label === 'Aberturas'));
  assert.ok(!r.insights.some((i) => i.icon === '🚪' || i.icon === '🔁'));
  assert.deepEqual(r.modeled, [{ label: 'Modificadores', value: 'nenhum aplicado' }]);
  assert.ok(r.insights.length >= 1);
});
