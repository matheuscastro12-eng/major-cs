// CALIBRAÇÃO DO MOTOR v2 contra docs/calibration-targets.json. `npm run test:sim`.
//
// Roda o harness (scripts/calibrate-engine.mts) com seed fixa e amostra que cabe
// no CI e falha quando qualquer alvo sai da tolerância declarada no arquivo:
// CT% por mapa, conversão do pistol, eco/force × full, 5v4, clutch 1v1/1v2,
// rating/ADR/KAST por função, opening do Entry e share do AWPer. Também trava
// o desempenho (≤ 5 ms por mapa no Node) e a régua de balanceamento: trocar de
// motor não pode mudar a dificuldade dos modos (curva força→vitória do v1).
//
// Os alvos são PROVISÓRIOS até a frente de dados (motor/dados) trocar o arquivo
// por números medidos; o formato é o mesmo, então este teste não muda.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCalibration, compareTargets, loadTargets, strengthCurve, realTeams } from './calibrate-engine.mts';
import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type MapId } from '../src/types.ts';

test('calibração: todo alvo de docs/calibration-targets.json dentro da tolerância', () => {
  const tf = loadTargets();
  assert.ok(Object.keys(tf.targets).length >= 11, 'arquivo de alvos incompleto');
  const m = runCalibration(2500, 20260929);
  const checks = compareTargets(m, tf);
  // todo alvo do arquivo foi medido (nenhum ficou sem métrica)
  const measured = new Set(checks.map((c) => c.key.split('.')[0]));
  for (const k of Object.keys(tf.targets)) assert.ok(measured.has(k), `alvo sem métrica no harness: ${k}`);
  const out = checks.filter((c) => !c.ok);
  assert.equal(out.length, 0, `fora da tolerância:\n${out.map((c) => `  ${c.key}: alvo ${c.target} ± ${c.tol}, obtido ${c.got.toFixed(3)}`).join('\n')}`);
  // amostras mínimas pra o número significar algo
  for (const [k, n] of Object.entries(m.samples)) assert.ok(n >= 150, `amostra pequena de ${k}: ${n}`);
});

test('desempenho: ≤ 5 ms por mapa simulado no Node', () => {
  const teams = realTeams();
  // aquece o JIT
  for (let i = 0; i < 30; i++) { const s = createMapSimV2(makeRng(i + 1), teams[i], teams[i + 1], 'mirage', -1); while (!s.step()) { /* */ } }
  const times: number[] = [];
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    const s = createMapSimV2(makeRng(1000 + i), teams[i % teams.length], teams[(i * 5 + 3) % teams.length], MAP_POOL[i % MAP_POOL.length] as MapId, -1);
    while (!s.step()) { /* */ }
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(mean <= 5, `média ${mean.toFixed(2)} ms/mapa`);
  assert.ok(p95 <= 10, `p95 ${p95.toFixed(2)} ms/mapa`);
});

test('balanceamento: a curva força→vitória do v2 acompanha a do v1 (dificuldade dos modos)', () => {
  const gaps = [0, 4, 8, 14];
  const v1 = strengthCurve('v1', gaps, 300);
  const v2 = strengthCurve('v2', gaps, 300);
  for (const g of gaps) assert.ok(Math.abs(v1[g] - v2[g]) <= 0.1, `gap +${g}: v1 ${(v1[g] * 100).toFixed(0)}% × v2 ${(v2[g] * 100).toFixed(0)}%`);
  // monótona no v2
  for (let i = 1; i < gaps.length; i++) assert.ok(v2[gaps[i]] >= v2[gaps[i - 1]] - 0.03);
});
