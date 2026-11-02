// Selo com a sigla do time (TeamBadge): a cor do texto tem que ser legível
// sobre a cor do time. Os casos abaixo são os que o Lighthouse reprovou no
// /major-singapore em 30/10 (2,97 a 4,04 contra o mínimo de 4,5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_CONTRAST, contrastRatio, parseColor, readableInk } from '../src/state/contrast.ts';

test('lê #rgb, #rrggbb e rgb()', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('#471f51'), [71, 31, 81]);
  assert.deepEqual(parseColor('rgb(226, 90, 185)'), [226, 90, 185]);
  assert.equal(parseColor('var(--c-ink)'), null);
});

test('casos reprovados no Lighthouse passam a ter contraste ≥ 4,5', () => {
  const casos: [string, string][] = [
    ['rgb(71, 31, 81)', 'rgb(226, 90, 185)'],
    ['rgb(81, 31, 80)', 'rgb(226, 90, 154)'],
    ['rgb(81, 31, 54)', 'rgb(226, 97, 90)'],
    ['rgb(31, 76, 81)', 'rgb(90, 145, 226)'],
  ];
  for (const [bg, fg] of casos) {
    assert.ok(contrastRatio(parseColor(bg)!, parseColor(fg)!) < MIN_CONTRAST, `${fg} sobre ${bg} já passava`);
    const ink = readableInk(bg, fg);
    assert.ok(contrastRatio(parseColor(bg)!, parseColor(ink)!) >= MIN_CONTRAST, `${ink} sobre ${bg}`);
  }
});

test('cor que já é legível fica como está; var(--…) também', () => {
  assert.equal(readableInk('#000000', '#ffffff'), '#ffffff');
  assert.equal(readableInk('var(--c-surface-3)', 'var(--c-ink)'), 'var(--c-ink)');
});

test('fundo claro com texto claro vira texto escuro', () => {
  const ink = readableInk('#f0f0f0', '#ffe066');
  assert.ok(contrastRatio(parseColor('#f0f0f0')!, parseColor(ink)!) >= MIN_CONTRAST);
});
