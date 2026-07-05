// Guarda de DRIFT do snapshot do catálogo: o snapshot materializado
// (ultimate-catalog.snapshot.ts) tem de ser IGUAL ao que o engine produz.
// Divergiu (odds/dataset/promos mudaram)? → npm run gen:ult-catalog e commit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CS2_REAL_2026 } from '../src/data/bo3.js';
import { estimateCardValue } from '../src/engine/ultimate/cards.js';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.js';
import { monthIndex } from '../src/engine/ultimate/promos.js';
import { isSpecial } from '../src/engine/ultimate/rarities.js';
import { ULT_CATALOG_MONTHS, ULT_SNAPSHOT_FIRST_MONTH, ULT_SNAPSHOT_LAST_MONTH } from './ultimate-catalog.snapshot.js';

test('snapshot cobre o mês corrente (senão: regenerar com faixa estendida)', () => {
  const mi = monthIndex(new Date());
  assert.ok(
    mi >= ULT_SNAPSHOT_FIRST_MONTH && mi <= ULT_SNAPSHOT_LAST_MONTH,
    `mês corrente ${mi} fora da faixa ${ULT_SNAPSHOT_FIRST_MONTH}..${ULT_SNAPSHOT_LAST_MONTH} — rode npm run gen:ult-catalog com a faixa estendida`,
  );
});

test('snapshot == engine em TODOS os meses cobertos (drift zero)', () => {
  for (let mi = ULT_SNAPSHOT_FIRST_MONTH; mi <= ULT_SNAPSHOT_LAST_MONTH; mi++) {
    const expected = buildFullCatalog(CS2_REAL_2026, mi).catalog.map((c) => ({
      ...c,
      value: estimateCardValue(c.ovr, c.rarity),
      special: isSpecial(c.rarity),
    }));
    assert.deepEqual(
      ULT_CATALOG_MONTHS[mi],
      expected,
      `snapshot divergiu do engine no mês ${mi} — rode npm run gen:ult-catalog e commite junto`,
    );
  }
});
