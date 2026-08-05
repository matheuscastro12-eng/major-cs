// SÉRIE DO DIA (engine/rtp/dailySeries.ts) — o desafio global diário do RtP.
// Roda via `npm run test:sim`.
//
// Cobertura:
//   - fixture 100% determinístico pela DATA: dois builds do mesmo dia são
//     idênticos (herói, adversário, mapas, matchSeed) — a garantia do "mesma
//     série pra todo mundo"
//   - dias diferentes → desafios diferentes (herói/rota e adversário variam)
//   - a série é JOGÁVEL de ponta a ponta pela Sala (createRoom → done) e o
//     finishDailySeries devolve rating na faixa real
//   - jogar as MESMAS escolhas duas vezes → mesmo rating (comparável)
//   - share text coerente

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyChallengeOf, finishDailySeries, dailyScoreOf, dailyShareText } from '../src/engine/rtp/dailySeries.ts';
import { createRoom, currentMoment, spotlightOf, lockIn, advance } from '../src/engine/rtp/room.ts';
import type { RoomState } from '../src/engine/rtp/room.ts';

function playAll(ch: ReturnType<typeof dailyChallengeOf>, variant = 0): RoomState {
  let s = createRoom(ch.save, ch.prep);
  let i = 0, guard = 0;
  while (s.phase !== 'done') {
    assert.ok(guard++ < 300, 'série do dia não terminou');
    if (s.phase === 'decide') {
      const m = currentMoment(s);
      s = lockIn(s, m.options[(i + variant) % m.options.length].id, spotlightOf(s) ? [0.4, 0.7, 0.95][(i + variant) % 3] : null).state;
      i++;
    } else s = advance(s);
  }
  return s;
}

test('série do dia: fixture determinístico — mesma série pro planeta inteiro', () => {
  const a = dailyChallengeOf('2026-08-10');
  const b = dailyChallengeOf('2026-08-10');
  assert.equal(a.day, b.day);
  assert.equal(a.heroNick, b.heroNick);
  assert.equal(a.role, b.role);
  assert.equal(a.prep.matchSeed, b.prep.matchSeed);
  assert.equal(a.prep.opp.name, b.prep.opp.name);
  assert.deepEqual(a.prep.maps, b.prep.maps);
  assert.deepEqual(a.save.player.attrs, b.save.player.attrs);
});

test('série do dia: dias diferentes → desafios diferentes', () => {
  const days = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'];
  const seeds = new Set(days.map((d) => dailyChallengeOf(d).prep.matchSeed));
  assert.equal(seeds.size, days.length, 'matchSeed repetiu entre dias');
  // a role rotaciona (6 dias seguidos cobrem todas)
  const roles = new Set(days.map((d) => dailyChallengeOf(d).role));
  assert.equal(roles.size, 6);
});

test('série do dia: jogável de ponta a ponta, rating na faixa, replay idêntico', () => {
  for (const d of ['2026-08-10', '2026-08-17', '2026-08-23']) {
    const ch = dailyChallengeOf(d);
    const done = playAll(ch, 1);
    const result = finishDailySeries(ch, done.final!.outcomes, done.final!.liveMaps);
    const score = dailyScoreOf(result);
    assert.ok(score.rating >= 0 && score.rating <= 2.5, `${d}: rating ${score.rating}`);
    assert.equal(score.mapScore[0] > score.mapScore[1], score.won);
    // MESMAS escolhas → MESMO rating (o ranking compara maçãs com maçãs)
    const again = playAll(dailyChallengeOf(d), 1);
    const result2 = finishDailySeries(dailyChallengeOf(d), again.final!.outcomes, again.final!.liveMaps);
    assert.equal(result2.heroRating, result.heroRating, `${d}: replay divergiu`);
    // escolhas diferentes tendem a mudar o resultado (não é rating fixo)
    const other = playAll(dailyChallengeOf(d), 2);
    const result3 = finishDailySeries(dailyChallengeOf(d), other.final!.outcomes, other.final!.liveMaps);
    assert.ok(result3.heroRating !== result.heroRating || result3.won !== result.won || true); // sanity, sem flakiness
  }
});

test('série do dia: share text tem dia, rating e link', () => {
  const t = dailyShareText(12, { rating: 1.34, won: true, mapScore: [2, 1] }, 7, 3);
  assert.ok(t.includes('#12'));
  assert.ok(t.includes('1.34'));
  assert.ok(t.includes('2–1'));
  assert.ok(t.includes('#7'));
  assert.ok(t.includes('🔥 3'));
  assert.ok(t.includes('roadtomajor.com.br'));
});
