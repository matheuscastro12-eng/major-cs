// FELICIDADE AGREGADA (#16) + VÍNCULO (#31). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHappiness, tickSatisfaction, satisfactionMoraleDrift, stabilizeBond,
  HAPPINESS_WEIGHTS, BOND_DEFAULT,
} from '../src/engine/career/happiness.ts';
import { resolvePlayerTalk } from '../src/engine/playerTalks.ts';

const base = { ratings: [1.0, 1.0, 1.0], results01: 0.5, contractSplitsLeft: 2, bond: 50, chemistry: 50 };

test('felicidade: pesos somam 1 e cada fator move o overall na direção certa', () => {
  const sum = Object.values(HAPPINESS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const mid = computeHappiness(base).overall;
  // cada eixo isolado: melhor input → overall maior; pior input → menor
  assert.ok(computeHappiness({ ...base, ratings: [1.4, 1.4, 1.4] }).overall > mid);
  assert.ok(computeHappiness({ ...base, ratings: [0.7, 0.7, 0.7] }).overall < mid);
  assert.ok(computeHappiness({ ...base, results01: 0.9 }).overall > mid);
  assert.ok(computeHappiness({ ...base, contractSplitsLeft: 0 }).overall < mid);
  assert.ok(computeHappiness({ ...base, bond: 90 }).overall > mid);
  assert.ok(computeHappiness({ ...base, chemistry: 90 }).overall > mid);
  // faixas: tudo 0-100; sem janela de ratings → neutro (não pune estreante)
  const b = computeHappiness({ ...base, ratings: undefined });
  assert.equal(b.factors.performance, 60);
  for (const v of Object.values(b.factors)) assert.ok(v >= 0 && v <= 100);
});

test('felicidade: satisfação suaviza (meio caminho) e moral deriva devagar', () => {
  assert.equal(tickSatisfaction(undefined, 80), 80);      // primeira leitura assenta
  assert.equal(tickSatisfaction(40, 80), 60);             // meio caminho
  assert.equal(tickSatisfaction(60, 80), 70);
  // drift limitado a ±3 — corrosão estrutural, não teleporte
  assert.equal(satisfactionMoraleDrift(70, 20), -3);
  assert.equal(satisfactionMoraleDrift(40, 90), 3);
  assert.equal(satisfactionMoraleDrift(50, 56), 1);
  assert.equal(satisfactionMoraleDrift(50, 50), 0);
});

test('vínculo: psicólogo puxa extremos rumo ao neutro; conversas movem bond', () => {
  assert.ok(stabilizeBond(10, 2) > 10);
  assert.ok(stabilizeBond(95, 2) < 95);
  assert.equal(stabilizeBond(55, 2), 55);
  assert.equal(stabilizeBond(10, 0), 10);                 // sem psicólogo, nada
  // conversa com tom IDEAL constrói vínculo forte (+8); praise ganha bônus (+2)
  const praise = resolvePlayerTalk({ split: 2, currentMorale: 50, currentBond: 50 }, 'praise', 'motivational');
  assert.ok(praise.outcome.bondDelta >= 10, `praise ideal: ${praise.outcome.bondDelta}`);
  // tom errado corrói o vínculo
  const wrong = resolvePlayerTalk({ split: 2, currentMorale: 50, currentBond: 50 }, 'behavior', 'friendly');
  assert.ok(wrong.outcome.bondDelta < 0, `tom errado: ${wrong.outcome.bondDelta}`);
  // tom firme SEM crédito (bond baixo) sai caro na moral E no vínculo
  const lowBond = resolvePlayerTalk({ split: 2, currentMorale: 50, currentBond: 20 }, 'playtime', 'firm');
  const highBond = resolvePlayerTalk({ split: 2, currentMorale: 50, currentBond: 80 }, 'playtime', 'firm');
  assert.ok(lowBond.outcome.moraleDelta <= highBond.outcome.moraleDelta);
  assert.ok(lowBond.outcome.bondDelta <= highBond.outcome.bondDelta);
  assert.equal(typeof BOND_DEFAULT, 'number');
});
