// [U01] probabilidades efetivas do pack derivam da definição, não de texto fixo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK_DEFS, TOTW_PACK, ICON_PACK, PROMO_PACK } from '../src/engine/ultimate/packs.ts';
import { packOdds, packOddsLine } from '../src/engine/ultimate/packOdds.ts';
import { FRIENDLY_CREDITS, GAUNTLET_WIN_CREDITS } from '../src/engine/ultimate/state.ts';

test('cartas esperadas somam o tamanho do pack e P(≥1) fica em 0..1', () => {
  for (const pack of [...PACK_DEFS, TOTW_PACK, ICON_PACK, PROMO_PACK]) {
    const o = packOdds(pack);
    const sum = Object.values(o.expected).reduce((a, b) => a + (b ?? 0), 0);
    assert.ok(Math.abs(sum - pack.cards) < 1e-9, `${pack.id}: esperado ${sum} ≠ ${pack.cards}`);
    for (const p of Object.values(o.atLeastOne)) assert.ok((p ?? 0) >= 0 && (p ?? 0) <= 1);
  }
});

test('garantia vira certeza: special garantido tem P(≥1)=1 e o rótulo é a raridade', () => {
  const o = packOdds(TOTW_PACK);
  assert.equal(o.atLeastOne.totw, 1);
  assert.equal(o.guaranteed[0].label, '1 Time da Semana');
  const t = packOdds(PACK_DEFS.find((p) => p.id === 'tots')!);
  assert.equal(t.atLeastOne.tots, 1);
});

test('peso bruto ≠ probabilidade do pack: Ícone no Ouro é bem mais raro que 0,1%×7 sugere de forma ingênua', () => {
  const gold = PACK_DEFS.find((p) => p.id === 'gold')!;
  const o = packOdds(gold);
  // 5 cartas livres × 0,1% + 2 garantidas dentro do bucket ouro (icon é bucket gold)
  assert.ok((o.atLeastOne.icon ?? 0) > 0 && (o.atLeastOne.icon ?? 0) < 0.01);
  assert.match(packOddsLine(gold), /^Garantido: 2 Ouro ou melhor · Elite \d+% · Lendário .*% · Ícone .*%$/);
});

test('textos de recompensa derivam das constantes do motor', () => {
  assert.equal(FRIENDLY_CREDITS.win, 90);
  assert.equal(FRIENDLY_CREDITS.loss, 25);
  assert.equal(Math.min(...GAUNTLET_WIN_CREDITS), 800);
  assert.equal(Math.max(...GAUNTLET_WIN_CREDITS), 4500);
});
