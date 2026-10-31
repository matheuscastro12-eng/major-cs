import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeedSql, stage1Teams } from '../src/engine/pickemSeed';
import { toApiPick } from '../src/engine/pickemConvert';
import { emptyPicks } from '../src/engine/majorSingapore';
import { validatePick } from '../src/engine/majorPickem';

const D = JSON.parse(readFileSync(new URL('../src/data/major-singapore-2026.json', import.meta.url), 'utf8'));
const SQL = readFileSync(new URL('./migrations/2026-10-26-pickem-seed.sql', import.meta.url), 'utf8');

test('seed commitado = gerado a partir do JSON', () => assert.equal(SQL, buildSeedSql(D)));
test('Stage 1: 16 ids únicos, todos no JSON, nenhum id do bo3.gg', () => {
  const m = SQL.match(/VALUES \('s1', '(\[.*?\])'::jsonb/); assert.ok(m);
  const ids: string[] = JSON.parse(m[1]);
  const known = new Set(D.teams.map((t: { id: string }) => t.id));
  assert.equal(ids.length, 16); assert.equal(new Set(ids).size, 16);
  for (const i of ids) { assert.ok(known.has(i), i); assert.ok(!i.startsWith('bo3_'), i); }
  assert.deepEqual(ids, stage1Teams(D));
});
test('palpite convertido do #113 é aceito contra os times do seed', () => {
  const t = stage1Teams(D);
  const p = { ...emptyPicks(), s1: t.slice(0, 8), x30: [[t[0], t[1]], [], []], x03: [[t[14], t[15]], [], []] };
  const c = toApiPick(p, 's1'); assert.ok(c.ok);
  if (c.ok) assert.equal(validatePick('s1', c.pick, t).ok, true);
});
