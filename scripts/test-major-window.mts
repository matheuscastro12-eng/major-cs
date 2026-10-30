// Vitrine do Modo Major (landing e Início): no ar até o fim do dia da final
// (13/12/2026, Brasília) e fora do ar depois, sem ninguém precisar lembrar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAJOR_SG_PROMO_ENDS_MS, majorPromoOn } from '../src/data/majorWindow.ts';

test('no ar antes e durante o Major', () => {
  assert.equal(majorPromoOn(Date.UTC(2026, 9, 29, 12)), true);   // 29/10, campanha
  assert.equal(majorPromoOn(Date.UTC(2026, 11, 13, 23)), true);  // final, 20h em Brasília
});

test('sai do ar à meia-noite de Brasília depois da final', () => {
  assert.equal(new Date(MAJOR_SG_PROMO_ENDS_MS).toISOString(), '2026-12-14T03:00:00.000Z');
  assert.equal(majorPromoOn(MAJOR_SG_PROMO_ENDS_MS - 1), true);
  assert.equal(majorPromoOn(MAJOR_SG_PROMO_ENDS_MS), false);
  assert.equal(majorPromoOn(Date.UTC(2027, 0, 1)), false);
});
