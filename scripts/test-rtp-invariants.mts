// INVARIANTES DO RTP + HARNESS DE BALANCEAMENTO (O1-28 / O1-44 — ENGI-06, ENGI-14).
// Roda via `npm run test:sim`.
//
// Cobertura:
//   - CONTRA-JOGO: cada estilo vence exatamente uma postura e perde pra outra
//     (pedra-papel-tesoura); sem leitura o confronto é o esperado pela tendência
//   - honestidade com a postura: o % mostrado (roomOdds) é o limiar do roll,
//     com e sem Leitura; a postura é determinística e a Leitura só a revela
//   - MONTE CARLO (200 Séries do Dia): nenhum estilo fixo domina outro em
//     vitória E rating (antes: seguro 37% / 1,008 contra agressivo 17% / 0,914)
//     e ler o jogo e contra-atacar rende mais que qualquer estilo fixo
// Os invariantes de placar (rounds crescentes por mapa em MD1/MD3/MD5, match
// point vencido fecha o mapa, faixa de prorrogação 8–20%) vivem em
// test-rtp-room.mts, junto da máquina de estados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, currentMoment, useRead, lockIn, advance, roomOdds, currentPosture, postureAt, counterFor,
} from '../src/engine/rtp/room.ts';
import { counterOf, counterDeltaOf, COUNTER_DELTA, type MomentStyle } from '../src/engine/rtp/moments.ts';
import { postureLeanOf } from '../src/engine/rtp/meta.ts';
import { dailyChallengeOf } from '../src/engine/rtp/dailySeries.ts';
import { runStyleMc, dominates, type StratStats } from './rtp-style-mc.mts';

const STYLES: MomentStyle[] = ['aggro', 'safe', 'smart'];

test('contra-jogo: cada estilo vence uma postura e perde pra outra', () => {
  for (const st of STYLES) {
    const deltas = STYLES.map((p) => counterDeltaOf(st, p));
    assert.equal(deltas.filter((d) => d > 0).length, 1, `${st}: uma vitória`);
    assert.equal(deltas.filter((d) => d < 0).length, 1, `${st}: uma derrota`);
    assert.equal(counterDeltaOf(counterOf(st), st), COUNTER_DELTA, `o contra de ${st} leva +${COUNTER_DELTA}`);
  }
  // cada postura tem um contra distinto (bijeção)
  assert.equal(new Set(STYLES.map(counterOf)).size, 3);
  // tendência equilibrada → o confronto esperado é neutro pra todo estilo
  for (const st of STYLES) assert.ok(Math.abs(counterDeltaOf(st, null)) < 1e-12);
  // time agressivo puxa o rush: quem segura o ângulo (seguro) ganha no esperado
  const lean = postureLeanOf(Array.from({ length: 5 }, () => ({ playstyle: 'aggressive' })));
  assert.ok(lean.aggro > lean.safe && lean.aggro > lean.smart);
  assert.ok(counterDeltaOf('safe', null, lean) > 0 && counterDeltaOf('smart', null, lean) < 0);
});

test('postura: determinística, a Leitura revela e o % mostrado é o limiar do roll', () => {
  let revealed = 0;
  for (let d = 0; d < 12; d++) {
    const ch = dailyChallengeOf(`2026-09-${String(d + 1).padStart(2, '0')}`);
    let s = createRoom(ch.save, ch.prep);
    let guard = 0, k = 0;
    while (s.phase !== 'done' && guard++ < 300) {
      if (s.phase !== 'decide') { s = advance(s); continue; }
      k++;
      assert.equal(currentPosture(s), null, 'sem leitura a postura fica oculta');
      const hidden = postureAt(s);
      assert.equal(postureAt(s), hidden, 'postura determinística');
      if (s.reads > 0 && k % 2 === 0) {
        s = useRead(s);
        assert.equal(currentPosture(s), hidden, 'a leitura revela a MESMA postura (o dado já estava lançado)');
        revealed++;
      }
      const m = currentMoment(s);
      const opt = m.options[k % m.options.length];
      const shown = roomOdds(s, opt);
      // o segmento do confronto soma no total (nada escondido)
      const c = counterFor(s, opt);
      if (Math.round(c.delta * 100) !== 0) assert.ok(shown.segments.some((g) => g.kind === 'read'), 'confronto sem segmento na barra');
      const r = lockIn(s, opt.id, null);
      assert.equal(r.beat.odds.total, shown.total, '% mostrado ≠ limiar');
      const res = r.beat.outcome.result;
      if (r.beat.roll < shown.total) assert.equal(res, 'success');
      else assert.notEqual(res, 'success');
      assert.equal(r.beat.posture, hidden, 'o resultado mostra a postura real');
      s = r.state;
    }
  }
  assert.ok(revealed > 10, `poucas leituras exercitadas (${revealed})`);
});

// Dominância "com folga": A domina B quando não perde em nada e ganha em algo
// por mais que o ruído do Monte Carlo (600 séries: ~±2pp de vitória). O bug
// antigo era de 20pp e 0,09 de rating — muito acima da folga.
const MARGIN = { win: 0.04, rating: 0.02 };

test('monte carlo: nenhum estilo domina outro; ler e contra-atacar rende mais', () => {
  // 600 séries: com 200 o sorteio dos adversários do Diário (que muda a cada
  // atualização de elenco) deixava o ruído do Monte Carlo no limite da folga
  const r = runStyleMc(600, 0.7);
  const fmt = (k: string, v: StratStats) => `${k} ${(v.win * 100).toFixed(1)}%/${v.rating.toFixed(3)}`;
  const table = Object.entries(r).map(([k, v]) => fmt(k, v)).join('  ');
  for (const a of STYLES) {
    for (const b of STYLES) {
      if (a === b) continue;
      assert.ok(!dominates(r[a], r[b], MARGIN), `${a} domina ${b}: ${table}`);
    }
  }
  // a informação tem valor: a Leitura + o contra certo vence qualquer estilo fixo
  for (const st of STYLES) {
    assert.ok(r.read.win >= r[st].win + 0.05, `ler não compensa contra ${st}: ${table}`);
    assert.ok(r.read.rating > r[st].rating, `ler não sobe o rating contra ${st}: ${table}`);
  }
  // jogar a Sala (qualquer estilo) não rende menos que pular
  for (const st of STYLES) assert.ok(r[st].win >= r.skip.win, `${st} perde pra pular: ${table}`);
});
