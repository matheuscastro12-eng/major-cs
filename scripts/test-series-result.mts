// Topo do resultado da série (src/state/seriesResult.ts): o destaque da
// partida e a maior sequência saem do SeriesResult sem recalcular nada de outro
// jeito. O destaque tem que bater com a regra do Scoreboard (maior rating da
// série somando todos os mapas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDisplay, createMapSim, mergeLines } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import { realTeams } from './calibrate-engine.mts';
import { bestRunOf, seriesPotm } from '../src/state/seriesResult.ts';
import type { SeriesResult, TTeam } from '../src/types.ts';

const TEAMS = realTeams();

function series(seed: number, a: TTeam, b: TTeam): SeriesResult {
  const maps = (['mirage', 'inferno'] as const).map((map, i) => {
    const sim = createMapSim(makeRng(seed + i), a, b, map, 0);
    while (!sim.done()) sim.step();
    return sim.result();
  });
  const won: [number, number] = [0, 0];
  for (const m of maps) won[m.winner]++;
  return { maps, mapScore: won, winner: won[0] > won[1] ? 0 : 1 } as unknown as SeriesResult;
}

test('destaque da partida = maior rating da série (regra do Scoreboard)', () => {
  for (let s = 0; s < 4; s++) {
    const a = TEAMS[s % TEAMS.length], b = TEAMS[(s + 5) % TEAMS.length];
    const sr = series(300 + s * 10, a, b);
    const potm = seriesPotm(sr, [a, b]);
    assert.ok(potm, 'tem destaque');
    let best = -Infinity;
    for (const t of [a, b]) {
      for (const p of [...t.players, ...(t.bench ?? [])]) {
        const line = mergeLines(sr.maps.map((m) => m.stats[p.id]).filter(Boolean).map((x) => x.both));
        if (line.rounds) best = Math.max(best, computeDisplay(line).rating);
      }
    }
    assert.equal(potm!.rating, best);
    const mine = seriesPotm(sr, [a, b], 0);
    assert.equal(mine!.team, 0, 'filtro por time');
  }
});

test('maior sequência conta só os rounds seguidos do time do jogador', () => {
  const sr = { maps: [{ roundLog: [0, 0, 1, 0, 0, 0, 1] }, { roundLog: [1, 0, 0, 0, 0, 1] }] } as unknown as SeriesResult;
  assert.equal(bestRunOf(sr, 0), 4);
  assert.equal(bestRunOf(sr, 1), 1);
});
