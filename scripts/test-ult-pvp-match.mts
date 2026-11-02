// [F2] Motor do duelo PvP do Ultimate (resolvido no servidor): determinismo,
// invariantes do placar vivo e nenhum estilo dominante (Monte Carlo curto).
// Roda `tsx --test scripts/test-ult-pvp-match.mts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPvpMatch, resolvePvpBeat, pvpBeats, pvpWinP, pvpOddsFor, pvpBeatView, clashOf, defaultStyle, forfeitPvp,
  PVP_STYLES, PVP_P_MAX, PVP_P_MIN, type PvpMatchState, type PvpStyle,
} from '../src/engine/ultimate/pvpMatch.ts';
import { isValidMapScore } from '../src/engine/rtp/roundModel.ts';
import { makeRng } from '../src/engine/rng.ts';

const sq = (ovr: number, chem = 1) => ({ name: `T${ovr}`, cards: Array.from({ length: 5 }, () => ({ ovr })), chem });

function playOut(seed: number, pick: (s: PvpMatchState, side: 0 | 1, r: () => number) => PvpStyle, ovr: [number, number] = [80, 80]): PvpMatchState {
  let s = createPvpMatch({ seed, squads: [sq(ovr[0]), sq(ovr[1])] });
  const r = makeRng(seed ^ 0xabc);
  let guard = 0;
  while (s.status === 'live' && guard++ < 50) s = resolvePvpBeat(s, pick(s, 0, r), pick(s, 1, r)).state;
  return s;
}

test('determinismo: mesma seed + mesmas decisões ⇒ mesma partida', () => {
  const p = (s: PvpMatchState, side: 0 | 1) => PVP_STYLES[(s.idx + side) % 3];
  assert.deepEqual(playOut(42, p), playOut(42, p));
  assert.notDeepEqual(playOut(42, p).history.map((h) => h.roll), playOut(43, p).history.map((h) => h.roll));
});

test('estado sobrevive a JSON (jsonb no servidor) sem mudar o resultado', () => {
  let a = createPvpMatch({ seed: 7, squads: [sq(82), sq(78)] });
  let b = JSON.parse(JSON.stringify(a)) as PvpMatchState;
  while (a.status === 'live') {
    a = resolvePvpBeat(a, 'aggro', 'smart').state;
    b = JSON.parse(JSON.stringify(resolvePvpBeat(b, 'aggro', 'smart').state));
  }
  assert.deepEqual(a, b);
});

test('invariantes do placar: um beat por decisão, placar só sobe, mapa fecha num placar válido do CS2', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = playOut(seed, (_s, _side, r) => PVP_STYLES[Math.floor(r() * 3)], [70 + (seed % 20), 80]);
    const beats = pvpBeats(s);
    assert.equal(s.status, 'done');
    assert.equal(s.history.length, beats.length, 'todo beat do plano é jogado');
    let prev: [number, number] = [0, 0];
    for (const h of s.history) {
      assert.ok(h.scoreAfter[0] >= prev[0] && h.scoreAfter[1] >= prev[1], 'placar nunca desce');
      assert.ok(h.pA >= PVP_P_MIN && h.pA <= PVP_P_MAX);
      prev = h.scoreAfter;
    }
    // nenhum beat antes do último fecha o mapa
    for (const h of s.history.slice(0, -1)) assert.ok(Math.max(...h.scoreAfter) <= 12, `seed ${seed}: beat ${h.idx} fechou cedo ${h.scoreAfter}`);
    assert.ok(s.finalScore && isValidMapScore(s.finalScore), `seed ${seed}: placar final inválido ${s.finalScore}`);
    assert.equal(s.winner, s.finalScore![0] > s.finalScore![1] ? 0 : 1, 'vencedor = placar');
    const last = s.history[s.history.length - 1];
    assert.ok(s.finalScore![0] >= last.scoreAfter[0] && s.finalScore![1] >= last.scoreAfter[1], 'fechamento só soma ao placar vivo');
  }
});

test('contra-jogo: pedra-papel-tesoura antissimétrico, odds espelhadas entre os lados', () => {
  for (const a of PVP_STYLES) for (const b of PVP_STYLES) assert.equal(clashOf(a, b), -clashOf(b, a) as number || 0);
  assert.equal(clashOf('aggro', 'safe'), 1);
  assert.equal(clashOf('safe', 'smart'), 1);
  assert.equal(clashOf('smart', 'aggro'), 1);
  const s = createPvpMatch({ seed: 9, squads: [sq(80), sq(80)] });
  assert.equal(pvpWinP(s, 'aggro', 'aggro'), 0.5);
  const o0 = pvpOddsFor(s, 0), o1 = pvpOddsFor(s, 1);
  for (const a of PVP_STYLES) for (const b of PVP_STYLES) assert.ok(Math.abs(o0[a][b] + o1[b][a] - 1) < 1e-9);
  // força conta, mas não decide sozinha
  const strong = createPvpMatch({ seed: 9, squads: [sq(95), sq(60)] });
  assert.ok(pvpWinP(strong, 'aggro', 'aggro') > 0.5 && pvpWinP(strong, 'aggro', 'aggro') <= 0.62 + 0.05);
  assert.ok(pvpWinP(strong, 'aggro', 'smart') < 0.5, 'ler o rival vence a diferença de força');
});

test('nenhum estilo domina: contra rival uniforme, cada estilo fixo vence ~50%', () => {
  const N = 600;
  for (const fixed of PVP_STYLES) {
    let wins = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = playOut(seed * 7919, (st, side, r) => (side === 0 ? fixed : PVP_STYLES[Math.floor(r() * 3)]));
      if (s.winner === 0) wins++;
    }
    const rate = wins / N;
    assert.ok(rate > 0.42 && rate < 0.58, `${fixed} venceu ${(rate * 100).toFixed(1)}%`);
  }
});

test('contra-jogo pesa: quem sempre contra-ataca a escolha do rival vence quase sempre', () => {
  const counter: Record<PvpStyle, PvpStyle> = { safe: 'aggro', smart: 'safe', aggro: 'smart' };
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = playOut(seed, (st, side) => (side === 1 ? 'safe' : counter.safe));
    if (s.winner === 0) wins++;
  }
  assert.ok(wins / 200 > 0.75, `contra-jogo venceu só ${wins}/200`);
});

test('escolha automática é determinística e cobre os 3 estilos; W.O. fixa vencedor', () => {
  const seen = new Set<PvpStyle>();
  for (let seed = 1; seed <= 60; seed++) {
    const s = createPvpMatch({ seed, squads: [sq(80), sq(80)] });
    assert.equal(defaultStyle(s, 0), defaultStyle(s, 0));
    seen.add(defaultStyle(s, 0)); seen.add(defaultStyle(s, 1));
  }
  assert.equal(seen.size, 3);
  const s = forfeitPvp(createPvpMatch({ seed: 3, squads: [sq(80), sq(80)] }), 1);
  assert.equal(s.status, 'done'); assert.equal(s.winner, 1);
  assert.equal(resolvePvpBeat(s, 'aggro', 'aggro').beat, null, 'partida encerrada não resolve beat');
});

test('visão do beat: perspectiva espelhada e 3 opções com odds', () => {
  let s = createPvpMatch({ seed: 11, squads: [sq(85), sq(75)] });
  s = resolvePvpBeat(s, 'aggro', 'safe').state;
  const v0 = pvpBeatView(s, 0)!, v1 = pvpBeatView(s, 1)!;
  assert.deepEqual(v0.score, [v1.score[1], v1.score[0]]);
  assert.equal(v0.options.length, 3);
  assert.notEqual(v0.side, v1.side);
  assert.ok(v0.title && v0.situation && v0.kicker);
});
