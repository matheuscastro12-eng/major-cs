// Modo Major Singapore 2026: lista única válida, formato 3 Stages + playoffs,
// Monte Carlo reprodutível e probabilidades coerentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildField, monteCarlo, simulateMajor, validateConfig } from '../src/engine/majorSingapore/index.ts';
import { MAJOR_SG_CONFIG, MAJOR_SG_DATASET } from '../src/engine/majorSingapore/data.ts';
import { makeRng } from '../src/engine/rng.ts';

test('lista do Major é válida (32 times, 16/8/8, ids da base bo3.gg, elencos completos)', () => {
  assert.deepEqual(validateConfig(MAJOR_SG_CONFIG, MAJOR_SG_DATASET), []);
});

test('lista inválida é rejeitada', () => {
  const bad = { ...MAJOR_SG_CONFIG, teams: MAJOR_SG_CONFIG.teams.slice(0, 31) };
  assert.ok(validateConfig(bad, MAJOR_SG_DATASET).length > 0);
  assert.throws(() => buildField(bad, MAJOR_SG_DATASET));
});

test('um Major simulado respeita o formato', () => {
  const field = buildField(MAJOR_SG_CONFIG, MAJOR_SG_DATASET);
  const r = simulateMajor(field, makeRng(7));
  const s1 = new Set(field.s1.map((t) => t.id));
  const s2in = new Set([...field.s2.map((t) => t.id), ...r.passedS1]);
  const s3in = new Set([...field.s3.map((t) => t.id), ...r.passedS2]);
  assert.equal(r.passedS1.length, 8); assert.ok(r.passedS1.every((id) => s1.has(id)));
  assert.equal(r.passedS2.length, 8); assert.ok(r.passedS2.every((id) => s2in.has(id)));
  assert.equal(r.playoffs.length, 8); assert.ok(r.playoffs.every((id) => s3in.has(id)));
  assert.equal(new Set(r.playoffs).size, 8);
  assert.equal(r.semis.length, 4); assert.equal(r.finalists.length, 2);
  assert.ok(r.finalists.includes(r.championId));
  assert.equal(r.stages.length, 4);
});

test('Monte Carlo: reprodutível e probabilidades coerentes', () => {
  const a = monteCarlo(MAJOR_SG_CONFIG, MAJOR_SG_DATASET, 12, 99);
  const b = monteCarlo(MAJOR_SG_CONFIG, MAJOR_SG_DATASET, 12, 99);
  assert.deepEqual(a, b);
  const sum = (k: 'title' | 'playoffs' | 'final' | 'semis') => a.teams.reduce((s, t) => s + t[k], 0);
  assert.ok(Math.abs(sum('title') - 1) < 1e-9);
  assert.ok(Math.abs(sum('final') - 2) < 1e-9);
  assert.ok(Math.abs(sum('semis') - 4) < 1e-9);
  assert.ok(Math.abs(sum('playoffs') - 8) < 1e-9);
  for (const t of a.teams) {
    assert.ok(t.title <= t.final && t.final <= t.semis && t.semis <= t.playoffs);
    if (t.entryStage === 1) assert.ok(t.playoffs <= t.passStage2! && t.passStage2! <= t.passStage1!);
    if (t.entryStage === 3) { assert.equal(t.passStage1, null); assert.equal(t.passStage2, null); }
  }
});
