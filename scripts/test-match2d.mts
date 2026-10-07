// APRESENTAÇÃO 2D DA PARTIDA (radar ao vivo) — `npm run test:sim`.
//
// Cobertura:
//   - o radar só LÊ: mesma seed → mesmo placar, roundLog e killFeed com e sem a
//     leitura/encenação de cada round (vale para o motor da flag MATCH_ENGINE)
//   - o roteiro encena a ordem do motor: vítima morre no instante do abate,
//     quem mata está vivo, plant antes dos abates pós-plant, ninguém se mexe
//     morto, tudo dentro do quadro 100×100
//   - todos os mapas do pool têm minimapa próprio e grafo conexo
//   - momentos-chave (ace, clutch, eco, virada) e assistente técnico

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSim } from '../src/engine/match.ts';
import { withFullRoster } from '../src/engine/matchShared.ts';
import { makeRng } from '../src/engine/rng.ts';
import { realTeams } from './calibrate-engine.mts';
import { buildRoundScript, posAt, clockAt } from '../src/components/match2d/choreo.ts';
import { map2dOf, pathBetween } from '../src/components/match2d/maps.ts';
import { detectMoments } from '../src/components/match2d/moments.ts';
import { assistantTips, type RoundRecord } from '../src/components/match2d/assistant.ts';
import { MAP_POOL, type KillEvent, type MapId, type TTeam } from '../src/types.ts';

const TEAMS = realTeams();

function playMap(seed: number, a: TTeam, b: TTeam, map: MapId, radar: boolean) {
  const sim = createMapSim(makeRng(seed), a, b, map, 0);
  const ids = [a, b].map((t) => withFullRoster(t).players.slice(0, 5).map((p) => p.id)) as [string[], string[]];
  const scripts: ReturnType<typeof buildRoundScript>[] = [];
  const history: RoundRecord[] = [];
  while (!sim.done()) {
    const pre = radar ? { sides: sim.side(), buys: sim.buys(), money: sim.money() } : null;
    if (radar) sim.peekWinProb(0);
    sim.step();
    if (radar && pre) {
      const log = sim.roundLog();
      const r = log.length - 1;
      const kills = sim.killFeed().filter((k) => k.round === r + 1);
      const play = sim.lastRoundPlay?.() ?? null;
      const sc = buildRoundScript({ map, round: r, teamIds: ids, tTeam: pre.sides[0] === 't' ? 0 : 1, kills, winner: log[r], tSite: sim.lastSite()?.tSite ?? null, play, buys: pre.buys });
      scripts.push(sc);
      detectMoments({ round: r, kills, winner: log[r], roundLog: log.slice(), buys: pre.buys });
      history.push({ round: r, sides: pre.sides, winner: log[r], tSite: sc.site, openingTeam: kills[0]?.killerTeam ?? -1, buys: pre.buys, planted: sc.planted });
      assistantTips({ history, userIdx: 0, money: sim.money(), nextSide: sim.side(), stance: 'default', timeoutsLeft: 2 });
      sim.stats(); sim.momentum(); sim.lastRollP(0);
    }
  }
  return { result: sim.result(), scripts, ids };
}

test('radar só lê: mesma seed → mesmo placar, roundLog e killFeed com e sem radar', () => {
  for (let i = 0; i < 12; i++) {
    const a = TEAMS[i % TEAMS.length], b = TEAMS[(i * 7 + 3) % TEAMS.length];
    if (a.id === b.id) continue;
    const map = MAP_POOL[i % MAP_POOL.length];
    const plain = playMap(1000 + i, a, b, map, false).result;
    const withRadar = playMap(1000 + i, a, b, map, true).result;
    assert.deepEqual(withRadar.score, plain.score, `placar mudou (seed ${1000 + i})`);
    assert.deepEqual(withRadar.roundLog, plain.roundLog);
    assert.equal(JSON.stringify(withRadar.killFeed), JSON.stringify(plain.killFeed));
    assert.equal(JSON.stringify(withRadar.stats), JSON.stringify(plain.stats));
  }
});

test('o roteiro encena exatamente o que o motor decidiu', () => {
  let rounds = 0, plants = 0;
  for (let i = 0; i < 8; i++) {
    const a = TEAMS[(i * 3) % TEAMS.length], b = TEAMS[(i * 5 + 1) % TEAMS.length];
    if (a.id === b.id) continue;
    const map = MAP_POOL[i % MAP_POOL.length];
    const { result, scripts } = playMap(2000 + i, a, b, map, true);
    assert.equal(scripts.length, result.roundLog.length);
    scripts.forEach((sc, r) => {
      rounds++;
      const all = result.killFeed.filter((k) => k.round === r + 1);
      // v1: o roteiro rearruma a ordem (o killFeed do v1 não tem cronologia)
      const kills = sc.inferred ? sc.events.flatMap((e) => (e.kind === 'kill' ? [all.find((k) => k.killerId === e.killer && k.victimId === e.victim)!] : [])) : all;
      assert.equal(kills.length, all.length);
      const kev = sc.events.filter((e) => e.kind === 'kill');
      assert.equal(kev.length, kills.length, 'um evento de abate por entrada do killFeed');
      kev.forEach((e, j) => {
        if (e.kind !== 'kill') return;
        assert.equal(e.killer, kills[j].killerId, 'ordem do killFeed preservada');
        assert.equal(e.victim, kills[j].victimId);
        const v = sc.tracks.find((t) => t.id === e.victim)!;
        const k = sc.tracks.find((t) => t.id === e.killer)!;
        assert.equal(v.deathT, e.t, 'vítima morre no instante do abate');
        if (!sc.inferred) assert.ok(k.deathT == null || k.deathT >= e.t, 'quem mata está vivo');
        if (j > 0) assert.ok(e.t > (kev[j - 1] as { t: number }).t, 'abates em ordem');
      });
      assert.equal(sc.winner, result.roundLog[r]);
      for (const tr of sc.tracks) {
        for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
          const p = posAt(tr, t);
          assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, `fora do quadro: ${tr.id} t=${t}`);
        }
        if (tr.deathT != null) {
          const d = posAt(tr, tr.deathT), later = posAt(tr, 1);
          assert.deepEqual(later, d, 'morto não anda');
        }
      }
      const deaths = sc.tracks.filter((t) => t.deathT != null).length;
      assert.equal(deaths, kills.length);
      if (sc.plantT != null) {
        plants++;
        const plant = sc.events.find((e) => e.kind === 'plant');
        assert.ok(plant, 'plantou → evento de plant');
        assert.ok(sc.events.every((e) => e.kind !== 'defuse' || e.t > sc.plantT!));
        assert.ok(clockAt(sc, sc.plantT + 0.01).bomb);
      }
      assert.ok(sc.events[sc.events.length - 1].kind === 'end' || sc.events.some((e) => e.kind === 'end'));
      // determinístico: o mesmo round gera o mesmo roteiro
    });
  }
  assert.ok(rounds > 100);
  assert.ok(plants > 10);
});

test('roteiro é determinístico (mesmo round → mesmo roteiro)', () => {
  const a = TEAMS[0], b = TEAMS[1];
  const x = playMap(77, a, b, 'inferno', true).scripts;
  const y = playMap(77, a, b, 'inferno', true).scripts;
  assert.equal(JSON.stringify(x.map((s) => s.tracks)), JSON.stringify(y.map((s) => s.tracks)));
});

test('todos os mapas do pool têm minimapa próprio, conexo', () => {
  for (const id of MAP_POOL) {
    const m = map2dOf(id);
    assert.equal(m.id, id);
    for (const k of ['tS', 'ctS', 'A', 'B', 'aT', 'bT', 'aCT', 'bCT', 'mid']) assert.ok(m.nodes[k], `${id}: nó ${k}`);
    for (const [u, v] of m.edges) assert.ok(m.nodes[u] && m.nodes[v], `${id}: aresta ${u}-${v}`);
    for (const n of Object.keys(m.nodes)) {
      const p = pathBetween(m, 'tS', n);
      assert.equal(p[0], 'tS');
      assert.equal(p[p.length - 1], n);
      for (let i = 1; i < p.length; i++) assert.ok(m.edges.some(([u, v]) => (u === p[i - 1] && v === p[i]) || (v === p[i - 1] && u === p[i])), `${id}: ${n} inalcançável`);
    }
  }
});

const K = (killer: string, kt: 0 | 1, victim: string): KillEvent => ({ round: 1, killerId: killer, victimId: victim, killerTeam: kt, victimTeam: kt === 0 ? 1 : 0, weapon: 'AK-47', headshot: false, opening: false, trade: false });

test('momentos: ace, clutch 1v3, eco vencido, virada', () => {
  const ace = detectMoments({ round: 3, kills: ['b1', 'b2', 'b3', 'b4', 'b5'].map((v) => K('a1', 0, v)), winner: 0, roundLog: [0, 0, 1, 0] });
  assert.equal(ace[0].kind, 'ace');
  const clutch = detectMoments({ round: 5, winner: 0, roundLog: [0], kills: [K('b1', 1, 'a1'), K('b2', 1, 'a2'), K('b1', 1, 'a3'), K('b3', 1, 'a4'), K('a5', 0, 'b1'), K('a5', 0, 'b2'), K('a5', 0, 'b3'), K('a5', 0, 'b4'), K('a5', 0, 'b5')] });
  const c = clutch.find((m) => m.kind === 'clutch');
  assert.ok(c);
  assert.equal(c!.vs, 5);
  assert.equal(c!.playerId, 'a5');
  const eco = detectMoments({ round: 2, kills: [K('a1', 0, 'b1')], winner: 0, roundLog: [1, 1, 0], buys: ['eco', 'full'] });
  assert.ok(eco.some((m) => m.kind === 'eco'));
  const log: (0 | 1)[] = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
  const cb = detectMoments({ round: 10, kills: [], winner: 0, roundLog: log });
  assert.ok(cb.some((m) => m.kind === 'comeback'), 'virada de 0:5 para 6:5');
  const notYet = detectMoments({ round: 9, kills: [], winner: 0, roundLog: log.slice(0, 10) });
  assert.ok(!notYet.some((m) => m.kind === 'comeback'), 'empate ainda não é virada');
});

test('assistente: aberturas perdidas no site, economia e sequência ruim viram ação', () => {
  const h: RoundRecord[] = [];
  for (let r = 0; r < 6; r++) h.push({ round: r, sides: ['t', 'ct'], winner: 1, tSite: 'B', openingTeam: r < 5 ? 1 : 0, buys: ['full', 'full'], planted: false });
  const tips = assistantTips({ history: h, userIdx: 0, money: [1500, 9000], nextSide: ['t', 'ct'], stance: 'default', timeoutsLeft: 1 });
  assert.ok(tips.length >= 2 && tips.length <= 3);
  assert.ok(tips.some((t) => t.id === 'open-B' && /83%/.test(t.text)), JSON.stringify(tips.map((t) => t.text)));
  assert.ok(tips.some((t) => t.action.kind === 'timeout'));
  assert.ok(tips.some((t) => t.action.kind === 'call' && t.action.call === 'save'));
  // sem tempo técnico sobrando não sugere timeout
  const t2 = assistantTips({ history: h, userIdx: 0, money: [1500, 9000], nextSide: ['t', 'ct'], stance: 'default', timeoutsLeft: 0 });
  assert.ok(!t2.some((t) => t.action.kind === 'timeout'));
  // a economia deles quebra
  const w: RoundRecord[] = [{ round: 0, sides: ['ct', 't'], winner: 0, tSite: 'A', openingTeam: 0, buys: ['pistol', 'pistol'], planted: false }];
  const t3 = assistantTips({ history: w, userIdx: 0, money: [4000, 1900], nextSide: ['ct', 't'], stance: 'default', timeoutsLeft: 2 });
  assert.ok(t3.some((t) => t.id === 'eco-opp'));
});
