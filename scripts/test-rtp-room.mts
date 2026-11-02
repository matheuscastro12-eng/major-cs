// SALA (engine/rtp/room.ts) — a máquina de estados da série, testada pela
// INTERFACE REAL (createRoom → useRead/lockIn/advance/skipRest), não por
// réplica. Roda via `npm run test:sim`.
//
// Cobertura:
//   - determinismo: mesmo save/prep + mesmas escolhas → série idêntica
//   - fechamento da série: para em quem chega a `need`, todo placar válido no
//     CS2 (13-x com x≤11, ou prorrogação 16-12..16-14, 19-15..19-17…)
//   - O PLACAR VIVO MANDA (O0-30): vencer o último beat em 12-x fecha o mapa;
//     perder com eles em 12 perde; salvar em 11-12 abre 12-12 → prorrogação
//     jogada. (Antes a suíte TRAVAVA o bug: exigia paridade com um roll cego por
//     mapa e aceitava 16-14 como único fechamento de prorrogação — ENGI-14.)
//   - prorrogação distribuída entre 8% e 20% dos mapas (Série do Dia)
//   - roteiro por formato (O1-43): rounds crescentes por mapa em MD1/MD3/MD5,
//     fim do half no 12, lado pelo half, bomba só plantada pelo T
//   - a ponte não entrega rounds a quem perdeu o beat quando o outro está no teto
//   - honestidade das odds: result do outcome consistente com roll vs total
//   - clutch multi-step: alive/hot/step evoluem; outcomes só agregam no fim
//   - skipRest: resolve os restantes, determinístico, sem liveMaps
//   - useRead: consome leitura e move o atributo efetivo em +2 (pré-momentum)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, currentMoment, spotlightOf, useRead, lockIn, advance, skipRest,
  effFor, winProbOf, liveRatingOf, finishSeries, currentCtx, isLastOfMap,
  type RoomState,
} from '../src/engine/rtp/room.ts';
import {
  resolveRoomSeries, buildBeatPlan, bridgeToBeat, sideAtRound, isValidMapScore, playOutMap,
  mapWinPFrom, roundPOf, mapWinPOf, HALF_ROUNDS,
} from '../src/engine/rtp/roundModel.ts';
import { dailyChallengeOf } from '../src/engine/rtp/dailySeries.ts';
import { makeRng } from '../src/engine/rng.ts';
import { generateMoments } from '../src/engine/rtp/moments.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import { buildUserTeam } from '../src/engine/rtp/matchSim.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import type { MatchPrep } from '../src/engine/rtp/matchSim.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';
import type { MapId, Role } from '../src/types.ts';

const ROLES: Role[] = ['Entry', 'AWP', 'Rifler', 'Support', 'Lurker', 'IGL'];
const MAPS1: MapId[] = ['mirage'];
const MAPS3: MapId[] = ['mirage', 'inferno', 'nuke'];
const MAPS5: MapId[] = ['mirage', 'inferno', 'nuke', 'ancient', 'anubis'];

function fixtureSave(role: Role): RoadToProSave {
  return createRtpSave({
    nick: 'sala', country: 'br', role,
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 7,
  });
}

function fixturePrep(role: Role, matchSeed: number, over: Partial<MatchPrep> = {}, mapsIds: MapId[] = MAPS3, bestOf: 1 | 3 | 5 = 3): MatchPrep {
  const effAttrs = Object.fromEntries(ALL_ATTRS.map((k, i) => [k, 8 + ((matchSeed + i) % 9)])) as MatchPrep['effAttrs'];
  return {
    matchSeed,
    opp: { name: 'Rival', tag: 'RVL', colors: ['#111', '#eee'], strength: 55 + (matchSeed % 20), players: [] },
    maps: mapsIds.map((m, i) => ({ map: m, pickedBy: (i === mapsIds.length - 1 ? -1 : i % 2) as 0 | 1 | -1 })),
    bestOf,
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
    // invariante ao vivo: na DECISÃO ninguém passa de 12 e 12-12 não existe
    // (a ponte nunca abre a prorrogação sozinha); na resolução do último beat do
    // mapa pode aparecer 13-x (fechou) ou 12-12 (a jogada abriu a OT). No done o
    // mapScore vira o placar FECHADO — válido no CS2.
    const [a, b] = s.live.mapScore;
    if (s.phase === 'decide') {
      assert.ok(a <= 12 && b <= 12, `placar vivo estourou na decisão: ${a}-${b}`);
      assert.ok(!(a === 12 && b === 12), 'match point duplo fantasma');
    } else if (s.phase === 'resolved') {
      assert.ok(a <= 13 && b <= 13, `placar vivo estourou: ${a}-${b}`);
      if (a === 13 || b === 13 || (a === 12 && b === 12)) assert.ok(isLastOfMap(s), `mapa decidido fora do último beat: ${a}-${b}`);
    } else {
      assert.ok(isValidMapScore([a, b]), `fechamento inválido: ${a}-${b}`);
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

// Fechamento da série: para em quem chegou a `need` primeiro, sem mapa
// sobrando, na ordem do veto, e todo placar é um placar possível no CS2.
function assertSeriesClose(prep: MatchPrep, s: RoomState, tag: string) {
  const mapsIds = prep.maps.map((m) => m.map);
  const need = Math.ceil(prep.bestOf / 2);
  assert.ok(s.final?.liveMaps?.length, `${tag}: sem liveMaps`);
  const played = s.final!.liveMaps!;
  for (let i = 0; i < played.length; i++) {
    assert.equal(played[i].map, mapsIds[Math.min(i, mapsIds.length - 1)], `${tag}: id do mapa ${i}`);
    assert.ok(isValidMapScore(played[i].score), `${tag}: placar ${played[i].score[0]}-${played[i].score[1]}`);
    assert.equal(played[i].won, played[i].score[0] > played[i].score[1], `${tag}: vencedor do mapa ${i}`);
  }
  const mapWins: [number, number] = [played.filter((m) => m.won).length, played.filter((m) => !m.won).length];
  assert.ok(Math.max(mapWins[0], mapWins[1]) === need && played.length === mapWins[0] + mapWins[1], `${tag}: série ${mapWins}`);
}

test('sala: MD1/MD3/MD5 — série fecha no need com placares válidos do CS2', () => {
  for (const role of ROLES) {
    const save = fixtureSave(role);
    for (let v = 0; v < 3; v++) {
      for (let k = 1; k <= 15; k++) {
        const bo1 = fixturePrep(role, k * 6007 + v, {}, MAPS1, 1);
        assertSeriesClose(bo1, playSeries(save, bo1, v), `bo1:${role}/${k}/${v}`);
        const bo3 = fixturePrep(role, k * 7919 + v);
        assertSeriesClose(bo3, playSeries(save, bo3, v), `bo3:${role}/${k}/${v}`);
        if (k <= 6) {
          const bo5 = fixturePrep(role, k * 104729 + v, {}, MAPS5, 5);
          assertSeriesClose(bo5, playSeries(save, bo5, v), `bo5:${role}/${k}/${v}`);
        }
      }
    }
  }
});

// Joga a série registrando, em cada ÚLTIMO beat de mapa, o placar de entrada,
// quem venceu a rodada e como o mapa fechou.
type LastBeat = { before: [number, number]; youWon: boolean; closed: { won: boolean; score: [number, number] } };
function playTracking(save: RoadToProSave, prep: MatchPrep, pickOpt: (s: RoomState, step: number) => string, perf: number): { s: RoomState; lasts: LastBeat[] } {
  let s = createRoom(save, prep);
  const lasts: LastBeat[] = [];
  let step = 0, guard = 0;
  while (s.phase !== 'done') {
    assert.ok(guard++ < 400);
    if (s.phase === 'decide') {
      const last = isLastOfMap(s);
      const before: [number, number] = [...s.live.mapScore];
      const r = lockIn(s, pickOpt(s, step++), spotlightOf(s) ? perf : null);
      s = r.state;
      if (last && r.beat.scored) {
        const nClosed = s.closedMaps.length;
        s = advance(s);
        const closed = s.closedMaps[nClosed];
        assert.ok(closed, 'último beat do mapa não fechou o mapa');
        lasts.push({ before, youWon: r.beat.youWonRound, closed });
      }
    } else s = advance(s);
  }
  return { s, lasts };
}

test('O0-30: o placar vivo decide o mapa — 12-x vencido fecha, 11-12 salvo vai à prorrogação', () => {
  let closedAt12 = 0, lostAt12 = 0, savedToOT = 0;
  const styles = ['safe', 'smart', 'aggro'] as const;
  for (const role of ROLES) {
    const save = fixtureSave(role);
    for (let k = 1; k <= 40; k++) {
      const prep = fixturePrep(role, k * 4099, {}, k % 2 ? MAPS1 : MAPS3, k % 2 ? 1 : 3);
      const { lasts } = playTracking(save, prep, (s, step) => {
        const m = currentMoment(s);
        return (m.options.find((o) => o.style === styles[(k + step) % 3]) ?? m.options[0]).id;
      }, 0.7);
      for (const l of lasts) {
        const [you, them] = l.before;
        if (l.youWon && you === 12) {
          closedAt12++;
          assert.ok(l.closed.won, `venceu o match point em ${you}-${them} e perdeu ${l.closed.score}`);
          assert.deepEqual(l.closed.score, [13, them]);
        }
        if (!l.youWon && them === 12) {
          lostAt12++;
          assert.ok(!l.closed.won, `perdeu o match point deles em ${you}-${them} e venceu ${l.closed.score}`);
          assert.deepEqual(l.closed.score, [you, 13]);
        }
        if (l.youWon && you === 11 && them === 12) {
          savedToOT++;
          assert.ok(Math.min(...l.closed.score) >= HALF_ROUNDS, `salvou em 11-12 e o mapa fechou ${l.closed.score} sem prorrogação`);
        }
        // e nunca encolhe o que a Sala mostrou.
        assert.ok(l.closed.score[0] >= you && l.closed.score[1] >= them, `fechamento encolheu ${l.before} → ${l.closed.score}`);
      }
    }
  }
  assert.ok(closedAt12 > 10 && lostAt12 > 10 && savedToOT > 3, `cobertura: ${closedAt12}/${lostAt12}/${savedToOT}`);
});

test('O0-30: prorrogação distribuída (8%–20% dos mapas, vários placares) na Série do Dia', () => {
  const styles = ['safe', 'smart', 'aggro'] as const;
  let maps = 0, ot = 0;
  const scores = new Set<string>();
  for (let d = 0; d < 60; d++) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
    const ch = dailyChallengeOf(date);
    for (const st of styles) {
      const { s } = playTracking(ch.save, ch.prep, (r) => {
        const m = currentMoment(r);
        return (m.options.find((o) => o.style === st) ?? m.options[0]).id;
      }, 0.7);
      for (const m of s.final!.liveMaps!) {
        maps++;
        if (Math.max(...m.score) > 13) { ot++; scores.add(`${Math.max(...m.score)}-${Math.min(...m.score)}`); }
      }
    }
  }
  const pct = ot / maps;
  assert.ok(pct >= 0.08 && pct <= 0.2, `prorrogação em ${(pct * 100).toFixed(1)}% dos mapas`);
  assert.ok(scores.size >= 3, `prorrogação sempre com o mesmo placar: ${[...scores]}`);
});

test('fechamento: playOutMap nunca encolhe o vivo e a régua por round reproduz a do mapa', () => {
  for (let k = 0; k < 400; k++) {
    const rng = makeRng(k * 97 + 1);
    const from: [number, number] = [Math.floor(rng() * 13), Math.floor(rng() * 13)];
    if (from[0] === 12 && from[1] === 12 && k % 2) from[1] = 11;
    const r = playOutMap(from, 0.35 + rng() * 0.3, makeRng(k));
    assert.ok(isValidMapScore(r.score), `playOut ${from} → ${r.score}`);
    assert.ok(r.score[0] >= from[0] && r.score[1] >= from[1]);
    assert.equal(r.won, r.score[0] > r.score[1]);
  }
  // roundPOf é o inverso de mapWinPFrom em 0-0: P(mapa) bate com a régua histórica.
  for (const [play, edge] of [[0.5, 0], [0.8, 5], [0.2, -8], [0.65, -3]] as const) {
    assert.ok(Math.abs(mapWinPFrom([0, 0], roundPOf(play, edge)) - mapWinPOf(play, edge)) < 1e-4);
  }
  // e vale na prática: 4000 mapas simulados de 0-0 batem a P do mapa (±3pp).
  const q = roundPOf(0.7, 0);
  let wins = 0;
  for (let k = 0; k < 4000; k++) if (playOutMap([0, 0], q, makeRng(k * 31 + 7)).won) wins++;
  assert.ok(Math.abs(wins / 4000 - mapWinPOf(0.7, 0)) < 0.03, `P simulada ${wins / 4000} vs ${mapWinPOf(0.7, 0)}`);
});

test('O1-43: roteiro por formato — rounds crescentes por mapa, fim do half no 12, lado pelo half', () => {
  for (const role of ROLES) {
    for (const maps of [MAPS1, MAPS3, MAPS5, ['mirage', 'inferno'] as MapId[]]) {
      for (let seed = 1; seed <= 60; seed++) {
        const plan = buildBeatPlan(role, maps, seed * 7919);
        assert.equal(plan.length, 7);
        for (let i = 1; i < plan.length; i++) {
          assert.ok(plan[i].mapIndex >= plan[i - 1].mapIndex, `${role}/${maps.length}/${seed}: mapa voltou`);
          if (plan[i].mapIndex === plan[i - 1].mapIndex) {
            assert.ok(plan[i].round > plan[i - 1].round, `${role}/${maps.length}/${seed}: round ${plan[i - 1].round}→${plan[i].round}`);
          }
        }
        if (maps.length === 1) assert.ok(plan.every((b) => b.mapIndex === 0));
        assert.equal(plan[plan.length - 1].kind, 'mapPoint');
        for (const b of plan) {
          assert.equal(b.side, sideAtRound(b.startSide, b.round));
          if (b.kind === 'lastHalf') assert.equal(b.round, 12);
          if (b.kind === 'retake') assert.equal(b.side, 'CT', 'retake é do CT');
          if (b.kind === 'postPlant') assert.equal(b.side, 'T', 'pós-plant é do T');
          if (b.bomb) assert.equal(b.bomb.plantedBy, 'T', 'só o T planta');
        }
      }
    }
  }
  // lado do CS2: troca no 13; OT começa no lado do 2º half e troca a cada 3.
  assert.equal(sideAtRound('T', 12), 'T');
  assert.equal(sideAtRound('T', 13), 'CT');
  assert.equal(sideAtRound('T', 24), 'CT');
  assert.deepEqual([25, 27, 28, 30, 31, 33, 34, 36].map((r) => sideAtRound('T', r)), ['CT', 'CT', 'T', 'T', 'T', 'T', 'CT', 'CT']);
});

test('O1-43: na Sala o round exibido sobe, o lado segue o half e o fim do half cai no 12', () => {
  let lastHalfSeen = 0;
  for (const role of ROLES) {
    const save = fixtureSave(role);
    for (let k = 1; k <= 30; k++) {
      const prep = fixturePrep(role, k * 1543, {}, k % 2 ? MAPS1 : MAPS3, k % 2 ? 1 : 3);
      let s = createRoom(save, prep);
      let prev: { mi: number; round: number; idx: number } | null = null;
      let guard = 0;
      while (s.phase !== 'done' && guard++ < 400) {
        if (s.phase === 'decide') {
          const ctx = currentCtx(s);
          const b = s.beats[s.idx];
          assert.equal(ctx.side, sideAtRound(b.startSide, ctx.round));
          if (b.kind === 'lastHalf') { lastHalfSeen++; assert.equal(ctx.round, 12, `fim do half no round ${ctx.round}`); }
          if (prev && prev.mi === ctx.mapIndex && prev.idx !== s.idx) assert.ok(ctx.round > prev.round, `round voltou ${prev.round}→${ctx.round}`);
          prev = { mi: ctx.mapIndex, round: ctx.round, idx: s.idx };
          const m = currentMoment(s);
          s = lockIn(s, m.options[(k + s.idx) % m.options.length].id, spotlightOf(s) ? 0.6 : null).state;
        } else s = advance(s);
      }
    }
  }
  assert.ok(lastHalfSeen > 5, 'nenhum fim de half jogado');
});

test('O1-43: a ponte não entrega rounds a quem perdeu o beat quando o outro está no teto', () => {
  // eles travados no teto (11, com 2 beats restantes), você acabou de perder o
  // beat e está sem momentum: antes o canInc mandava TODO round sorteado pra
  // eles para o SEU lado ("perdi o clutch e emendei 3 rounds").
  const plan = buildBeatPlan('Rifler', MAPS1, 99);
  const to = { ...plan[5], round: 22 };
  let heroRounds = 0;
  const N = 200;
  for (let seed = 1; seed <= N; seed++) {
    const { live } = bridgeToBeat({ mapScore: [4, 11], seriesScore: [0, 0], mapIndex: 0 }, to, false, 0.1, -10, seed * 131, MAPS1, 2);
    assert.equal(live.mapScore[1], 11);
    heroRounds += live.mapScore[0] - 4;
  }
  assert.ok(heroRounds / N < 1, `ponte deu ${heroRounds / N} rounds por série a quem perdeu`);
  // e o map point nasce do placar: a ponte do último beat para em 12-x.
  const { live } = bridgeToBeat({ mapScore: [3, 3], seriesScore: [0, 0], mapIndex: 0 }, plan[6], true, 0.5, 0, 5, MAPS1, 1);
  assert.equal(Math.max(...live.mapScore), 12);
  assert.ok(Math.min(...live.mapScore) <= 11);
});

test('finishSeries: o card exibe EXATAMENTE os mapas que a Sala fechou', () => {
  const save = fixtureSave('Rifler');
  const opp = { ...buildUserTeam(fixtureSave('AWP'), fixtureSave('AWP').player.attrs, 0, 'opp'), strength: 62 };
  for (let k = 1; k <= 8; k++) {
    const prep = fixturePrep('Rifler', k * 331, { opp: { ...fixturePrep('Rifler', k * 331).opp, players: opp.players } });
    const s = playSeries(save, prep, k % 3);
    const { result, series } = finishSeries(save, prep, s.final!, opp);
    // display = liveMaps da Sala, 1:1 (mapa, placar, vencedor).
    assert.deepEqual(result.maps, s.final!.liveMaps);
    const wins: [number, number] = [s.final!.liveMaps!.filter((m) => m.won).length, s.final!.liveMaps!.filter((m) => !m.won).length];
    assert.deepEqual(result.mapScore, wins);
    assert.equal(result.won, wins[0] > wins[1]);
    // o sim interno foi forçado ao MESMO placar de mapas (scoreboard coerente).
    assert.deepEqual(series.mapScore, wins);
    // determinístico.
    const again = finishSeries(save, prep, s.final!, opp);
    assert.deepEqual(again.result.maps, result.maps);
    assert.equal(again.result.heroRating, result.heroRating);
  }
});

test('finishSeries: série PULADA cai no placar natural (resolveRoomSeries)', () => {
  const save = fixtureSave('Entry');
  const opp = { ...buildUserTeam(fixtureSave('IGL'), fixtureSave('IGL').player.attrs, 0, 'opp'), strength: 58 };
  const prep = fixturePrep('Entry', 777);
  const s = skipRest(createRoom(save, prep));
  assert.equal(s.final!.liveMaps, undefined);
  const { result } = finishSeries(save, prep, s.final!, opp);
  const rs = resolveRoomSeries('Entry', s.final!.outcomes, save.player.ovr - prep.opp.strength, prep.matchSeed, MAPS3, 3);
  assert.deepEqual(result.maps, rs.maps);
  assert.equal(result.won, rs.seriesWon);
});

test('balanceamento: jogar bem (attrs+execução) vence mais que jogar mal', () => {
  const save = fixtureSave('Rifler');
  // edge NEUTRO (rival da sua força): o que varia é só a QUALIDADE da jogada —
  // sem isso o OVR do herói domina o fechamento e mascara a diferença.
  const wr = (attr: number, perf: number): number => {
    let wins = 0;
    const N = 120;
    for (let k = 1; k <= N; k++) {
      const effAttrs = Object.fromEntries(ALL_ATTRS.map((a) => [a, attr])) as MatchPrep['effAttrs'];
      const prep = fixturePrep('Rifler', k * 613, { effAttrs, opp: { ...fixturePrep('Rifler', k * 613).opp, strength: save.player.ovr } });
      let s = createRoom(save, prep);
      let guard = 0;
      while (s.phase !== 'done' && guard++ < 300) {
        if (s.phase === 'decide') {
          const m = currentMoment(s);
          const opt = m.options.find((o) => o.style === 'smart') ?? m.options[0];
          s = lockIn(s, opt.id, spotlightOf(s) ? perf : null).state;
        } else s = advance(s);
      }
      const maps = s.final!.liveMaps!;
      if (maps.filter((m) => m.won).length > maps.filter((m) => !m.won).length) wins++;
    }
    return wins / N;
  };
  const lo = wr(4, 0.15), hi = wr(17, 0.95);
  assert.ok(hi > lo + 0.2, `jogar bem tem que pesar: lo=${lo} hi=${hi}`);
  assert.ok(hi > 0.6, `attrs altos + execução perfeita devem vencer >60% (deu ${hi})`);
  assert.ok(lo < 0.55, `attrs baixos + execução ruim não podem vencer mais que a moeda (deu ${lo})`);
});

test('sala: odds honestas — o resultado do roll respeita o total mostrado', () => {
  const save = fixtureSave('AWP');
  let checked = 0;
  for (const seed of [555, 556, 557]) {
  let s = createRoom(save, fixturePrep('AWP', seed));
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
