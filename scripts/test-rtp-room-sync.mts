// Fast-follow — sincronia do PLACAR VIVO da Sala com o resultado do card.
// Replica a lógica de transição do RtpRoundRoom (fecha mapa por resolveMapFromPlay,
// early-stop quando decide, mapas virtuais do BO5) e prova que o placar vivo final
// == resolveRoomSeries(acc-truncada).mapWins (a fonte que o card usa). Roda:
//   tsx --test scripts/test-rtp-room-sync.mts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBeatPlan, resolveRoomSeries, resolveMapFromPlay, mapPlayOf,
} from '../src/engine/rtp/roundModel.ts';
import { makeRng } from '../src/engine/rng.ts';
import type { Role, MapId } from '../src/types.ts';
import type { MomentOutcome } from '../src/engine/rtp/moments.ts';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// outcomes sintéticos: cada beat com `value` ~ play + ruído determinístico.
function mkOutcomes(n: number, play: number, seed: number): MomentOutcome[] {
  const rng = makeRng((seed ^ 0xabcdef) >>> 0);
  return Array.from({ length: n }, () => ({
    result: 'partial', value: clamp(play + (rng() - 0.5) * 0.3, 0, 1),
    frags: 1, deaths: 1, openings: 0, clutches: 0, narrative: '',
  }) as MomentOutcome);
}

// REPLICA fiel da transição do RtpRoundRoom.next() (placar vivo + acc onComplete).
function playRoom(role: Role, maps: MapId[], matchSeed: number, bestOf: 1 | 3 | 5, edge: number, outcomes: MomentOutcome[]) {
  const beats = buildBeatPlan(role, maps, matchSeed);
  const need = Math.ceil(bestOf / 2);
  let series: [number, number] = [0, 0];
  const closeMap = (mi: number, play: number) => resolveMapFromPlay(play, edge, matchSeed, mi);
  for (let idx = 0; idx < beats.length; idx++) {
    const beat = beats[idx];
    const isLast = idx >= beats.length - 1;
    const acc = outcomes.slice(0, idx + 1);
    const allPlay = acc.length ? acc.reduce((s, o) => s + o.value, 0) / acc.length : 0.5;
    if (isLast) {
      let sy = series[0], st = series[1];
      const cm = closeMap(beat.mapIndex, mapPlayOf(acc, beats, beat.mapIndex, allPlay));
      if (cm.won) sy++; else st++;
      let mi = beat.mapIndex + 1;
      while (sy < need && st < need) { const r = closeMap(mi, allPlay); if (r.won) sy++; else st++; mi++; }
      return { series: [sy, st] as [number, number], acc };
    }
    const nb = beats[idx + 1];
    if (nb.mapIndex > beat.mapIndex) {
      const { won } = closeMap(beat.mapIndex, mapPlayOf(acc, beats, beat.mapIndex, allPlay));
      const newSeries: [number, number] = won ? [series[0] + 1, series[1]] : [series[0], series[1] + 1];
      if (newSeries[0] >= need || newSeries[1] >= need) return { series: newSeries, acc };
      series = newSeries;
    }
  }
  return { series, acc: outcomes };
}

const MAPS3: MapId[] = ['mirage', 'inferno', 'nuke'];
const MAPS5: MapId[] = ['mirage', 'inferno', 'nuke', 'ancient', 'anubis'];
const ROLES: Role[] = ['AWP', 'Entry', 'IGL', 'Support', 'Lurker'];

test('BO3: placar vivo da Sala == resolveRoomSeries(acc) — 100% coerente', () => {
  let checked = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (const play of [0.2, 0.35, 0.5, 0.65, 0.85]) {
      for (const edge of [-15, 0, 15]) {
        const role = ROLES[seed % ROLES.length];
        const beats = buildBeatPlan(role, MAPS3, seed);
        const outcomes = mkOutcomes(beats.length, play, seed);
        const room = playRoom(role, MAPS3, seed, 3, edge, outcomes);
        const card = resolveRoomSeries(role, room.acc, edge, seed, MAPS3, 3);
        assert.deepEqual(room.series, card.mapWins,
          `seed=${seed} play=${play} edge=${edge}: vivo ${room.series} != card ${card.mapWins}`);
        // placar natural válido: vencedor tem 2, ninguém passa de 2, soma 2..3.
        const [a, b] = room.series;
        assert.ok(Math.max(a, b) === 2 && Math.min(a, b) <= 1 && a + b >= 2 && a + b <= 3,
          `seed=${seed}: placar inválido ${room.series}`);
        checked++;
      }
    }
  }
  console.log(`  BO3 coerência: ${checked} cenários, 100% vivo==card`);
});

test('BO5: placar vivo (com mapas virtuais 4º/5º) == card; sem 2-2 fantasma', () => {
  let checked = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (const play of [0.25, 0.5, 0.75]) {
      for (const edge of [-12, 0, 12]) {
        const role = ROLES[seed % ROLES.length];
        const beats = buildBeatPlan(role, MAPS5, seed);
        const outcomes = mkOutcomes(beats.length, play, seed);
        const room = playRoom(role, MAPS5, seed, 5, edge, outcomes);
        const card = resolveRoomSeries(role, room.acc, edge, seed, MAPS5, 5);
        assert.deepEqual(room.series, card.mapWins,
          `seed=${seed} play=${play} edge=${edge}: vivo ${room.series} != card ${card.mapWins}`);
        const [a, b] = room.series;
        assert.ok(Math.max(a, b) === 3 && Math.min(a, b) <= 2 && a + b >= 3 && a + b <= 5,
          `seed=${seed}: placar BO5 inválido ${room.series}`);
        checked++;
      }
    }
  }
  console.log(`  BO5 coerência: ${checked} cenários, 100% vivo==card`);
});

test('balanceamento: jogar bem vence mais; distribuição de placares natural', () => {
  const bucket = (play: number) => {
    let wins = 0; const dist: Record<string, number> = {}; const N = 1500;
    for (let seed = 1; seed <= N; seed++) {
      const role = ROLES[seed % ROLES.length];
      const beats = buildBeatPlan(role, MAPS3, seed);
      const outcomes = mkOutcomes(beats.length, play, seed * 7 + 1);
      const room = playRoom(role, MAPS3, seed, 3, 0, outcomes);
      if (room.series[0] > room.series[1]) wins++;
      const key = `${room.series[0]}-${room.series[1]}`;
      dist[key] = (dist[key] ?? 0) + 1;
    }
    return { wr: wins / N, dist };
  };
  const lo = bucket(0.30), mid = bucket(0.50), hi = bucket(0.85);
  const pct = (d: Record<string, number>) => Object.entries(d).sort().map(([k, v]) => `${k}:${Math.round(v / 15)}%`).join(' ');
  console.log(`  play .30 → WR ${(lo.wr * 100).toFixed(0)}%  [${pct(lo.dist)}]`);
  console.log(`  play .50 → WR ${(mid.wr * 100).toFixed(0)}%  [${pct(mid.dist)}]`);
  console.log(`  play .85 → WR ${(hi.wr * 100).toFixed(0)}%  [${pct(hi.dist)}]`);
  assert.ok(lo.wr < mid.wr && mid.wr < hi.wr, 'jogar melhor deve vencer mais');
  assert.ok(hi.wr > 0.7, 'jogar muito bem deve vencer > 70%');
  assert.ok(lo.wr < 0.35, 'jogar mal deve vencer < 35%');
  // placares variados: 2-0 E 2-1 ambos existem com play alto (não é sempre decider).
  assert.ok((hi.dist['2-0'] ?? 0) > 100 && (hi.dist['2-1'] ?? 0) > 100, 'deve haver 2-0 E 2-1');
});
