// [W1] PÓDIO SEMANAL DA SÉRIE DO DIA (engine/rtp/weeklyTitles.ts). Roda via
// `npm run test:sim`. Cobre a régua pura do pódio (espelho do SQL do claim),
// o campo mínimo, a aplicação dos selos no save e os textos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import { dailyWeekOf, dailyWeekRange } from '../src/engine/rtp/dailySeries.ts';
import { computeWeekPodium, applyWeeklyTitles, weeklyTitleLabel, weeklyTitleClaimText, WEEK_PRIZE_MIN_FIELD } from '../src/engine/rtp/weeklyTitles.ts';

const e = (id: string, pts: number, wins = 0, firstAt = 0) => ({ id, pts, wins, firstAt });

test('pódio semanal: pts manda, vitórias desempatam, depois quem chegou antes', () => {
  const podium = computeWeekPodium([
    e('d', 5.1, 3, 10), e('a', 7.2, 4, 50), e('b', 7.2, 5, 60), e('c', 7.2, 5, 20), e('e', 1.0),
  ]);
  assert.deepEqual(podium, [{ id: 'c', place: 1 }, { id: 'b', place: 2 }, { id: 'a', place: 3 }]);
});

test('pódio semanal: campo mínimo — pódio de 4 não premia ninguém', () => {
  const four = [e('a', 9), e('b', 8), e('c', 7), e('d', 6)];
  assert.deepEqual(computeWeekPodium(four), []);
  assert.equal(WEEK_PRIZE_MIN_FIELD, 5);
  assert.equal(computeWeekPodium([...four, e('e', 1)]).length, 3);
  assert.equal(computeWeekPodium(four, 4).length, 3);
});

test('selos: aplicam no save sem migração, 1 por semana (melhor lugar vence), ordenados', () => {
  const s = createRtpSave({
    nick: 'w', country: 'br', role: 'AWP', personality: 'leader', archetype: 'aimstar', age: 18,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 3,
  });
  assert.equal(s.weeklyTitles, undefined);   // save antigo/novo: campo ausente é ok
  assert.equal(applyWeeklyTitles(s, []), s);
  const a = applyWeeklyTitles(s, [{ week: 3, place: 2 }, { week: 1, place: 1 }]);
  assert.deepEqual(a.weeklyTitles, [{ week: 1, place: 1 }, { week: 3, place: 2 }]);
  // claim repetido/dup: não duplica; lugar melhor substitui
  const b = applyWeeklyTitles(a, [{ week: 3, place: 1 }, { week: 3, place: 3 }, { week: 0, place: 1 }, { week: 2, place: 9 as 1 }]);
  assert.deepEqual(b.weeklyTitles, [{ week: 1, place: 1 }, { week: 3, place: 1 }]);
  // o resto do save fica intacto
  assert.equal(b.player, s.player);
  assert.equal(b.world, s.world);
});

test('selos: textos no tom do jogo', () => {
  assert.equal(weeklyTitleLabel({ week: 4, place: 1 }), '🏆 CAMPEÃO DA SEMANA 4');
  assert.ok(weeklyTitleLabel({ week: 4, place: 2 }).includes('PÓDIO DA SEMANA 4'));
  assert.ok(weeklyTitleClaimText({ week: 4, place: 1 }).includes('CAMPEÃO da semana 4'));
  assert.ok(weeklyTitleClaimText({ week: 4, place: 3 }).includes('3º'));
});

test('semana do Diário e o SQL do claim contam a mesma semana', () => {
  // o servidor usa ((day-1)/7)+1 — igual ao dailyWeekOf do engine
  for (let d = 1; d <= 100; d++) assert.equal(dailyWeekOf(d), Math.floor((d - 1) / 7) + 1);
  assert.deepEqual(dailyWeekRange(5), [29, 35]);
});
