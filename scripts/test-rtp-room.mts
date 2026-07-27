// SALA (engine/rtp/room.ts) — a máquina de estados da série, testada pela
// INTERFACE REAL (createRoom → useRead/lockIn/advance/skipRest), não por
// réplica. Roda via `npm run test:sim`.
//
// Cobertura:
//   - determinismo: mesmo save/prep + mesmas escolhas → série idêntica
//   - PARIDADE COM O PLACAR NATURAL: mapas fechados na jogada batem 1:1 em
//     vencedor/ordem/contagem com resolveRoomSeries sobre os MESMOS outcomes
//     (a régua do card) — a garantia que matava os bugs de "placar contradiz"
//   - invariantes de placar: teto 12/13 ao vivo; fechamento 13-x (x≤11) ou 16-14
//   - honestidade das odds: result do outcome consistente com roll vs total
//   - clutch multi-step: alive/hot/step evoluem; outcomes só agregam no fim
//   - skipRest: resolve os restantes, determinístico, sem liveMaps
//   - useRead: consome leitura e move o atributo efetivo em +2 (pré-momentum)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, currentMoment, spotlightOf, useRead, lockIn, advance, skipRest,
  effFor, winProbOf, liveRatingOf,
  type RoomState,
} from '../src/engine/rtp/room.ts';
import { resolveRoomSeries } from '../src/engine/rtp/roundModel.ts';
import { generateMoments } from '../src/engine/rtp/moments.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import type { MatchPrep } from '../src/engine/rtp/matchSim.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';
import type { MapId, Role } from '../src/types.ts';

const ROLES: Role[] = ['Entry', 'AWP', 'Rifler', 'Support', 'Lurker', 'IGL'];
const MAPS3: MapId[] = ['mirage', 'inferno', 'nuke'];

function fixtureSave(role: Role): RoadToProSave {
  return createRtpSave({
    nick: 'sala', country: 'br', role,
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 7,
  });
}

function fixturePrep(role: Role, matchSeed: number, over: Partial<MatchPrep> = {}): MatchPrep {
  const effAttrs = Object.fromEntries(ALL_ATTRS.map((k, i) => [k, 8 + ((matchSeed + i) % 9)])) as MatchPrep['effAttrs'];
  return {
    matchSeed,
    opp: { name: 'Rival', tag: 'RVL', colors: ['#111', '#eee'], strength: 55 + (matchSeed % 20), players: [] },
    maps: MAPS3.map((m, i) => ({ map: m, pickedBy: (i === 2 ? -1 : i % 2) as 0 | 1 | -1 })),
    bestOf: 3,
    conditionMod: 1,
    factors: [],
    effAttrs,
    moments: generateMoments(role),
    confidence: ((matchSeed % 7) - 3) / 5,
    grudge: matchSeed % 3 === 0 ? 2 : 0,
    ...over,
  };
}

// Joga a série inteira pela interface real, com escolhas determinísticas pelo
// seed (varia estilo, execuções boas/ruins/instinto e uso de leitura).
function playSeries(save: RoadToProSave, prep: MatchPrep, variant = 0): RoomState {
  let s = createRoom(save, prep);
  let step = 0;
  let guard = 0;
  while (s.phase !== 'done') {
    assert.ok(guard++ < 300, 'série não terminou em 300 transições');
    if (s.phase === 'decide') {
      if ((step + variant) % 4 === 1) s = useRead(s);
      const m = currentMoment(s);
      const opt = m.options[(step + variant) % m.options.length];
      const perf = spotlightOf(s) ? [0.3, 0.55, 0.9, 1.0][(step + variant) % 4] : null;
      s = lockIn(s, opt.id, perf).state;
      step++;
    } else {
      s = advance(s);
    }
    // invariante ao vivo: nenhum lado passa de 13 e 12-12 não existe DURANTE o
    // jogo; no done o mapScore vira o placar FECHADO (13-x ou 16-14 na prorrogação).
    const [a, b] = s.live.mapScore;
    if (s.phase !== 'done') {
      assert.ok(a <= 13 && b <= 13, `placar vivo estourou: ${a}-${b}`);
      assert.ok(!(a === 12 && b === 12), 'match point duplo fantasma');
    } else {
      assert.ok(Math.max(a, b) === 13 || (Math.max(a, b) === 16 && Math.min(a, b) === 14), `fechamento inválido: ${a}-${b}`);
    }
  }
  return s;
}

test('sala: determinismo — mesmas escolhas, série idêntica', () => {
  const save = fixtureSave('Rifler');
  const prep = fixturePrep('Rifler', 1234);
  const a = playSeries(save, prep, 2);
  const b = playSeries(save, prep, 2);
  assert.deepEqual(a.final, b.final);
  assert.deepEqual(a.live, b.live);
  assert.equal(a.momentum, b.momentum);
});

test('sala: PARIDADE — mapas fechados batem com o placar natural (resolveRoomSeries)', () => {
  for (const role of ROLES) {
    const save = fixtureSave(role);
    for (let v = 0; v < 3; v++) {
      for (let k = 1; k <= 25; k++) {
        const prep = fixturePrep(role, k * 7919 + v);
        const s = playSeries(save, prep, v);
        assert.ok(s.final?.liveMaps?.length, `${role}/${k}: sem liveMaps`);
        const edge = save.player.ovr - prep.opp.strength;
        const rs = resolveRoomSeries(role, s.final!.outcomes, edge, prep.matchSeed, MAPS3, 3);
        const played = s.final!.liveMaps!;
        // mesmo nº de mapas, mesma ordem, MESMO VENCEDOR mapa a mapa e na série.
        assert.equal(played.length, rs.maps.length, `${role}/${k}/${v}: nº de mapas`);
        for (let i = 0; i < played.length; i++) {
          assert.equal(played[i].won, rs.maps[i].won, `${role}/${k}/${v}: vencedor do mapa ${i}`);
          assert.equal(played[i].map, rs.maps[i].map, `${role}/${k}/${v}: id do mapa ${i}`);
        }
        const mapWins: [number, number] = [played.filter((m) => m.won).length, played.filter((m) => !m.won).length];
        assert.deepEqual(mapWins, rs.mapWins, `${role}/${k}/${v}: série`);
        assert.equal(mapWins[0] > mapWins[1], rs.seriesWon);
        // fechamento honesto: vencedor 13 (ou 16 na prorrogação), perdedor ≤11 (ou 14).
        for (const m of played) {
          const [w, l] = m.won ? [m.score[0], m.score[1]] : [m.score[1], m.score[0]];
          assert.ok((w === 13 && l <= 11) || (w === 16 && l === 14), `${role}/${k}/${v}: placar ${m.score[0]}-${m.score[1]}`);
        }
        // a série fecha em quem chegou a 2 primeiro (BO3): 2-0 ou 2-1.
        assert.ok(Math.max(mapWins[0], mapWins[1]) === 2 && played.length === mapWins[0] + mapWins[1]);
      }
    }
  }
});

test('sala: odds honestas — o resultado do roll respeita o total mostrado', () => {
  const save = fixtureSave('AWP');
  let s = createRoom(save, fixturePrep('AWP', 555));
  let checked = 0;
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 300) {
    if (s.phase === 'decide') {
      const m = currentMoment(s);
      const opt = m.options[checked % m.options.length];
      const perf = spotlightOf(s) ? 0.8 : null;
      const { state, beat } = lockIn(s, opt.id, perf);
      // mesma banda do resolveMoment: [thr, thr+banda) = PARCIAL.
      const band = Math.min(0.18, (1 - beat.odds.total) * 0.7);
      const expected = beat.roll < beat.odds.total ? 'success' : beat.roll < beat.odds.total + band ? 'partial' : 'fail';
      assert.equal(beat.outcome.result, expected, `beat ${checked}: roll ${beat.roll} vs ${beat.odds.total}`);
      // execução move o threshold a partir do base (needle anima base→final).
      if (perf != null) assert.notEqual(beat.baseTotal, undefined);
      s = state;
      checked++;
    } else s = advance(s);
  }
  assert.ok(checked >= 7, 'poucos beats verificados');
});

test('sala: clutch multi-step — alive cai, hot sobe, outcome agrega só no fim', () => {
  // varre seeds até uma série passar por um clutch multi-step (alive ≥ 2).
  const save = fixtureSave('Lurker');
  let found = false;
  for (let k = 1; k <= 60 && !found; k++) {
    const prep = fixturePrep('Lurker', k * 131);
    let s = createRoom(save, prep);
    let guard = 0;
    while (s.phase !== 'done' && guard++ < 300) {
      if (s.phase === 'decide') {
        if (s.clutch && s.clutch.alive >= 2) {
          found = true;
          const beforeOutcomes = s.outcomes.length;
          const aliveBefore = s.clutch.alive;
          // joga o passo com a opção 'safe' (menor chance de morrer não garantida,
          // mas o contrato vale nos dois desfechos).
          const m = currentMoment(s);
          const { state, beat } = lockIn(s, m.options[1].id, spotlightOf(s) ? 0.9 : null);
          s = advance(state);
          if (!beat.clutchFinal) {
            // sobreviveu com inimigos restando: clutch continua, nada agregado.
            assert.equal(s.outcomes.length, beforeOutcomes);
            assert.equal(s.clutch?.alive, aliveBefore - 1);
            assert.ok((s.clutch?.hot ?? 0) > 0, 'hot-hand não subiu');
            assert.ok((s.clutch?.step ?? 0) >= 1);
          } else {
            // fechou (ou caiu): o beat agregado entrou nos outcomes.
            assert.equal(s.outcomes.length, beforeOutcomes + 1);
            const agg = s.outcomes[s.outcomes.length - 1];
            assert.ok(agg.result === 'success' ? agg.clutches === 1 : agg.deaths === 1);
          }
          continue;
        }
        const m = currentMoment(s);
        s = lockIn(s, m.options[0].id, spotlightOf(s) ? 0.55 : null).state;
      } else s = advance(s);
    }
  }
  assert.ok(found, 'nenhum clutch multi-step em 60 seeds');
});

test('sala: skipRest resolve os restantes, sem liveMaps, determinístico', () => {
  const save = fixtureSave('Entry');
  const prep = fixturePrep('Entry', 42);
  const a = skipRest(createRoom(save, prep));
  const b = skipRest(createRoom(save, prep));
  assert.equal(a.phase, 'done');
  assert.equal(a.final?.outcomes.length, a.beats.length);
  assert.equal(a.final?.liveMaps, undefined);          // skip = fechamento natural no finish
  assert.deepEqual(a.final, b.final);
  // pular no MEIO preserva os beats já jogados.
  let s = createRoom(save, prep);
  s = lockIn(s, currentMoment(s).options[0].id, spotlightOf(s) ? 0.7 : null).state;
  s = advance(s);
  const played = s.outcomes.length;
  const skipped = skipRest(s);
  assert.equal(skipped.final?.outcomes.length, skipped.beats.length);
  assert.deepEqual(skipped.final?.outcomes.slice(0, played), s.outcomes);
});

test('sala: leitura tática consome o recurso e vale +2 de atributo', () => {
  const save = fixtureSave('IGL');
  const s0 = createRoom(save, fixturePrep('IGL', 99, { confidence: 0 }));
  const opt = currentMoment(s0).options[0];
  const s1 = useRead(s0);
  assert.equal(s1.reads, s0.reads - 1);
  assert.equal(s1.readUsed, true);
  // +2 pré-momentum; com confidence 0 e momentum inicial 0.5, momMult = 1.
  assert.ok(Math.abs(effFor(s1, opt) - (effFor(s0, opt) + 2)) < 1e-9);
  // sem leituras restantes, useRead é no-op.
  let s = s1;
  for (let i = 0; i < 10; i++) s = useRead({ ...s, readUsed: false });
  assert.equal(useRead(s), s);
});

test('sala: derivações não explodem e ficam nas faixas', () => {
  const save = fixtureSave('Support');
  let s = createRoom(save, fixturePrep('Support', 2026));
  let guard = 0;
  while (s.phase !== 'done' && guard++ < 300) {
    assert.ok(winProbOf(s) >= 5 && winProbOf(s) <= 95);
    assert.ok(liveRatingOf(s) >= 0 && liveRatingOf(s) <= 3);
    assert.ok(s.momentum >= 0 && s.momentum <= 1);
    if (s.phase === 'decide') s = lockIn(s, currentMoment(s).options[2 % currentMoment(s).options.length].id, spotlightOf(s) ? 0.4 : null).state;
    else s = advance(s);
  }
  assert.equal(s.phase, 'done');
});
