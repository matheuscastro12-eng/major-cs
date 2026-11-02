// Lista oficial (02/11): o palpite local com times que saíram (magic, b8…) não
// some em silêncio — droppedPickIds diz quais, e a tela avisa.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import { droppedPickIds, type MajorData } from '../src/engine/majorSingapore.ts';

const D = data as unknown as MajorData;
const real = D.teams.slice(0, 3).map((t) => t.id);

test('acha os times que não estão mais na lista, em qualquer parte do palpite', () => {
  const raw = { s1: [real[0], 'magic', 'b8'], s2: [], s3: [], bracket: ['', 'magic', real[1]], x30: [['tyloo'], [], []], x03: [[], [real[2]], []] };
  assert.deepEqual(droppedPickIds(D, raw).sort(), ['b8', 'magic', 'tyloo']);
});

test('palpite só com times da lista, vazio ou lixo: nada a avisar', () => {
  assert.deepEqual(droppedPickIds(D, { s1: real, bracket: ['', ''] }), []);
  assert.deepEqual(droppedPickIds(D, null), []);
  assert.deepEqual(droppedPickIds(D, 'x'), []);
  assert.deepEqual(droppedPickIds(D, { s1: 3 }), []);
});
