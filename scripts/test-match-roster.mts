// MOTOR ROBUSTO A ELENCO INCOMPLETO E SÉRIE SEM MAPAS (engine/match.ts) —
// O1-48 (ENGI-09, ENGI-13) — e PRORROGAÇÃO DO CS2 (O1-49, ENGI-12).
//
// Cobertura:
//   - propriedade: createMapSim/simulateMap com N de 0 a 6 jogadores em cada
//     lado — completa com banco/reservas (5v5 sempre) ou lança RosterError
//   - simulateSeries com menos mapas que o formato completa pelo MAP_POOL
//     (sem vitória fantasma 0-0); insights não divide por zero
//   - prorrogação: cada half da OT começa com $12.500 e loss bonus zerado; o
//     1º half da OT segue no lado do 2º half, troca no intervalo da OT e a OT
//     seguinte não troca de novo

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSim, simulateMap, simulateSeries, withFullRoster, RosterError, OT_START_MONEY } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import type { TPlayer, TTeam } from '../src/types.ts';

function player(id: string, v: number): TPlayer {
  return {
    id, sourcePlayerId: id, nick: id, name: id, country: 'br', role: (['Entry', 'AWP', 'Rifler', 'Support', 'IGL'] as const)[v % 5],
    playstyle: 'balanced' as TPlayer['playstyle'], aim: 70 + v, clutch: 65 + v, consistency: 70, awp: 60 + v, igl: 55 + v, skill: 70 + v, ovr: 75 + v, form: 1,
  };
}
function team(id: string, n: number, bench = 0): TTeam {
  return {
    id, name: id, tag: id.toUpperCase().slice(0, 4), country: 'br', isUser: false, game: 'CS2', colors: ['#111', '#eee'],
    strength: 75, teamwork: 70, mapPrefs: {}, coach: { name: 'c', style: 'balanced' } as TTeam['coach'],
    players: Array.from({ length: n }, (_, i) => player(`${id}-p${i}`, i)),
    bench: Array.from({ length: bench }, (_, i) => player(`${id}-b${i}`, i)),
    wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  };
}

test('elenco: N de 0 a 6 em cada lado — joga 5v5 ou lança RosterError', () => {
  for (let na = 0; na <= 6; na++) {
    for (let nb = 0; nb <= 6; nb++) {
      const a = team('a', na), b = team('b', nb);
      if (na === 0 || nb === 0) {
        assert.throws(() => createMapSim(makeRng(1), a, b, 'mirage', -1), (e: unknown) => e instanceof RosterError && e.code === 'roster_incompleto');
        continue;
      }
      for (let seed = 1; seed <= 20; seed++) {
        const r = simulateMap(makeRng(seed * 13 + na * 7 + nb), a, b, 'mirage', -1);
        assert.ok(Math.max(...r.score) >= 13, `${na}v${nb}/${seed}: placar ${r.score}`);
        // todo jogador do elenco original tem stats (nunca undefined).
        for (const p of [...a.players, ...b.players]) assert.ok(r.stats[p.id], `sem stats pra ${p.id}`);
        // mortes por round nunca passam de 5 por time.
        const deathsA = r.killFeed.filter((e) => e.victimTeam === 0).length;
        assert.ok(deathsA <= 5 * r.roundLog.length);
      }
    }
  }
});

test('elenco: completa primeiro pelo banco, depois com reservas um degrau abaixo', () => {
  const t = withFullRoster(team('x', 3, 1));
  assert.equal(t.players.length, 5);
  assert.equal(t.players[3].id, 'x-b0');                       // banco antes do genérico
  assert.ok(t.players[4].id.startsWith('x-reserva-'));
  assert.ok(t.players[4].ovr < Math.max(...t.players.slice(0, 4).map((p) => p.ovr)));
  const full = team('y', 5);
  assert.equal(withFullRoster(full), full);                     // 5 = intocado (mesma referência)
  assert.equal(withFullRoster(team('z', 6)).players.length, 5);
});

test('série: menos mapas que o formato completa pelo MAP_POOL (sem vitória 0-0)', () => {
  for (const bestOf of [1, 3, 5] as const) {
    for (let seed = 1; seed <= 10; seed++) {
      const s = simulateSeries(makeRng(seed), team('a', 5), team('b', 5), [], bestOf);
      const need = Math.ceil(bestOf / 2);
      assert.ok(s.maps.length >= need, `bo${bestOf}: ${s.maps.length} mapas`);
      assert.equal(Math.max(...s.mapScore), need, `bo${bestOf}: série ${s.mapScore}`);
      assert.equal(s.winner, s.mapScore[0] > s.mapScore[1] ? 0 : 1);
      assert.equal(new Set(s.maps.map((m) => m.map)).size, s.maps.length, 'mapa repetido');
    }
  }
});

test('prorrogação: $12.500 por half da OT e lados do CS2', () => {
  // varre seeds até achar mapas que vão à prorrogação (12-12) e confere em cada
  // round de OT: caixa no início do half e lado.
  let otMaps = 0;
  for (let seed = 1; seed <= 400 && otMaps < 12; seed++) {
    const sim = createMapSim(makeRng(seed), team('a', 5), team('b', 5), 'inferno', -1);
    let side2: ['ct' | 't', 'ct' | 't'] | null = null;
    let sawOt = false;
    while (!sim.done()) {
      const r = sim.round();
      if (r === 12) side2 = sim.side();
      if (r >= 24) {
        sawOt = true;
        const h = Math.floor((r - 24) / 3);
        // OT: half 0 = lado do 2º half; troca no intervalo; a OT seguinte não troca.
        const expectSecond = Math.floor((h + 1) / 2) % 2 === 0;
        const exp = expectSecond ? side2! : ([side2![1], side2![0]] as ['ct' | 't', 'ct' | 't']);
        assert.deepEqual(sim.side(), exp, `seed ${seed} round ${r + 1}: lado ${sim.side()}`);
        if ((r - 24) % 3 === 0) assert.deepEqual(sim.money(), [OT_START_MONEY, OT_START_MONEY], `seed ${seed} round ${r + 1}: caixa ${sim.money()}`);
      }
      sim.step();
    }
    if (sawOt) otMaps++;
  }
  assert.ok(otMaps >= 5, `poucos mapas com prorrogação (${otMaps})`);
});

test('O1-47: a % mostrada inclui o timeout e o lastRollP devolve a % rolada', () => {
  let diverged = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const sim = createMapSim(makeRng(seed), team('a', 5), team('b', 5), 'nuke', -1);
    let guard = 0;
    assert.equal(sim.lastRollP(0), null);
    while (!sim.done() && guard++ < 60) {
      const boost = guard % 4 === 0 ? 0 : null;
      const shown = sim.peekWinProb(0, undefined, undefined, boost);
      if (boost === 0) assert.ok(shown > sim.peekWinProb(0), 'timeout não entrou na % mostrada');
      // call de site do T/CT do time 0 em metade dos rounds (informação oculta).
      const site = guard % 2 === 0 ? { team: 0 as const, site: 'A' as const } : undefined;
      sim.step(boost, undefined, undefined, site);
      const rolled = sim.lastRollP(0)!;
      assert.ok(rolled > 0 && rolled < 1);
      if (Math.round(rolled * 100) !== Math.round(shown * 100)) diverged++;
      else assert.ok(Math.abs(rolled - shown) < 0.01);
      assert.ok(Math.abs(sim.lastRollP(1)! - (1 - rolled)) < 1e-12);
    }
  }
  // a leitura de site (±14/−9pp) aparece como divergência em parte dos rounds.
  assert.ok(diverged > 10, `pRolled nunca divergiu do pShown (${diverged})`);
});
