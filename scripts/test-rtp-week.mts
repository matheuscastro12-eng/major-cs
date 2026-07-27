// TURN WEEK (weekly.ts) — a virada de semana canônica, testada pela interface.
// Motivação: existiam DOIS caminhos de virada (advanceWeek morto + withWeekStart
// no circuit) que divergiam em silêncio; agora há UM (turnWeek) e este teste
// fixa o contrato dele. Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnWeek } from '../src/engine/rtp/weekly.ts';
import { investYield } from '../src/engine/rtp/lifestyle.ts';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';

function fixture(): RoadToProSave {
  const s = createRtpSave({
    nick: 'wk', country: 'br', role: 'Rifler',
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 11,
  });
  return {
    ...s,
    life: { ...s.life, money: 10_000 },
    lifestyle: { ...s.lifestyle, invested: 100_000 },
    sponsors: [
      { id: 'a', brand: 'Periférico Co.', perWeek: 500, weeksLeft: 3, fameBonus: 2 },
      { id: 'b', brand: 'Última semana', perWeek: 300, weeksLeft: 1, fameBonus: 1 },
    ],
  };
}

test('turnWeek: patrocínio paga e expira, cashHist anota, investimento compõe', () => {
  const s = fixture();
  const after = turnWeek(s);
  // as DUAS marcas pagam nesta virada; a de 1 semana expira depois de pagar.
  assert.equal(after.life.money, 10_000 + 500 + 300);
  assert.equal(after.sponsors.length, 1);
  assert.deepEqual(after.sponsors[0], { id: 'a', brand: 'Periférico Co.', perWeek: 500, weeksLeft: 2, fameBonus: 2 });
  // histórico de caixa anota o saldo pós-patrocínio (janela de 12).
  assert.equal(after.world.cashHist?.[after.world.cashHist.length - 1], 10_800);
  // investimento compôs pela taxa semeada da semana.
  assert.equal(after.lifestyle.invested, 100_000 + investYield(100_000, s.rng.seed, s.rng.tick));
  // determinístico e imutável.
  assert.deepEqual(turnWeek(s), after);
  assert.equal(s.life.money, 10_000);
});

test('turnWeek: semana no #1 alimenta o reinado (dinastia)', () => {
  const s = { ...fixture(), world: { ...fixture().world, worldRank: 1 } };
  const before = s.history.records?.totalWeeksAtOne ?? 0;
  const after = turnWeek(s);
  assert.equal(after.history.records!.totalWeeksAtOne, before + 1);
  // fora do #1 não conta.
  const s2 = { ...s, world: { ...s.world, worldRank: 5 } };
  assert.equal(turnWeek(s2).history.records!.totalWeeksAtOne, before);
});

test('turnWeek: evento de vida da semana (quando rola) entra no inbox', () => {
  // varre seeds: em ALGUMA semana um evento tem que aparecer, e o inbox nunca encolhe.
  let sawEvent = false;
  for (let k = 1; k <= 30; k++) {
    const s = { ...fixture(), rng: { seed: k * 7919, tick: k } };
    const after = turnWeek(s);
    assert.ok(after.inbox.length >= s.inbox.length);
    if (after.inbox.length > s.inbox.length) sawEvent = true;
  }
  assert.ok(sawEvent, 'nenhum evento de vida em 30 semanas');
});
