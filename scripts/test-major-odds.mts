// Odds de título do Modo Major pré-calculadas (src/data/majorSgOdds.ts): a
// tabela tem de ser a mesma conta que a tela fazia no primeiro render
// (titleOdds(D, 1000), seed 1), time a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import { titleOdds, type MajorData } from '../src/engine/majorSingapore.ts';
import { MAJOR_SG_TITLE_ODDS, MAJOR_SG_TITLE_ODDS_RUNS } from '../src/data/majorSgOdds.ts';

const D = data as unknown as MajorData;

test('MAJOR_SG_TITLE_ODDS = titleOdds(D, 1000) para os 32 times do JSON', () => {
  const odds = titleOdds(D, MAJOR_SG_TITLE_ODDS_RUNS);
  const expected = Object.fromEntries(D.teams.map((t) => [t.id, odds.get(t.id)]));
  assert.deepEqual({ ...MAJOR_SG_TITLE_ODDS }, expected,
    `o JSON do Major mudou: troque MAJOR_SG_TITLE_ODDS em src/data/majorSgOdds.ts por\n${JSON.stringify(expected, null, 2)}`);
});

test('as chances somam 100% (um campeão por simulação)', () => {
  const total = Object.values(MAJOR_SG_TITLE_ODDS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `soma ${total}`);
});
