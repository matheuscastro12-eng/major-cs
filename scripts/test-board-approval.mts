// #8 (gap Brasval) — Board approval contínuo com log. Roda via `npm run test:sim`.
//
// Cobertura:
//   - applyBoardDelta: soma/subtrai com clamp em [0, 100]
//   - delta engolido pelo clamp NÃO gera entrada no log (log limpo)
//   - log é ring (BOARD_LOG_CAP): mais recente primeiro, corta o rabo
//   - delta logado é o EFETIVO (pós-clamp), não o nominal
//   - boardFiredDetail: junta só motivos negativos, respeita o max
//   - boardTone: bandas ok/warn/danger coerentes com a régua do fired

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVAL_DELTAS,
  BOARD_LOG_CAP,
  applyBoardDelta,
  boardFiredDetail,
  boardTone,
  type BoardLogEntry,
} from '../src/engine/career/boardApproval.ts';

test('applyBoardDelta soma e registra no log (mais recente primeiro)', () => {
  const r1 = applyBoardDelta(60, [], 3, APPROVAL_DELTAS.matchWin, 'Vitória 2-0 vs NAVI');
  assert.equal(r1.board, 62);
  assert.equal(r1.boardLog.length, 1);
  assert.deepEqual(r1.boardLog[0], { split: 3, delta: 2, reason: 'Vitória 2-0 vs NAVI' });

  const r2 = applyBoardDelta(r1.board, r1.boardLog, 3, APPROVAL_DELTAS.matchLoss, 'Derrota 0-2 vs FaZe');
  assert.equal(r2.board, 59);
  assert.equal(r2.boardLog[0].reason, 'Derrota 0-2 vs FaZe'); // unshift
  assert.equal(r2.boardLog[1].reason, 'Vitória 2-0 vs NAVI');
});

test('clamp em [0, 100] e delta efetivo no log', () => {
  // estoura o teto: 95 + 18 → 100, delta logado = +5 (efetivo)
  const top = applyBoardDelta(95, [], 1, APPROVAL_DELTAS.majorChampion, 'CAMPEÃO do Major');
  assert.equal(top.board, 100);
  assert.equal(top.boardLog[0].delta, 5);
  // fundo do poço: 2 - 18 → 0, delta logado = -2
  const bottom = applyBoardDelta(2, [], 1, APPROVAL_DELTAS.objectiveMissed, 'Objetivo falhou');
  assert.equal(bottom.board, 0);
  assert.equal(bottom.boardLog[0].delta, -2);
});

test('delta totalmente engolido pelo clamp não polui o log', () => {
  const atMax = applyBoardDelta(100, [], 1, APPROVAL_DELTAS.matchWin, 'Vitória');
  assert.equal(atMax.board, 100);
  assert.equal(atMax.boardLog.length, 0);
  const atMin = applyBoardDelta(0, [], 1, APPROVAL_DELTAS.matchLoss, 'Derrota');
  assert.equal(atMin.board, 0);
  assert.equal(atMin.boardLog.length, 0);
});

test('log é ring de BOARD_LOG_CAP (corta o mais antigo)', () => {
  let board = 50;
  let log: BoardLogEntry[] = [];
  for (let i = 0; i < BOARD_LOG_CAP + 5; i++) {
    // alterna W/L pra nunca bater no clamp (todo delta entra no log)
    const win = i % 2 === 0;
    const r = applyBoardDelta(board, log, i + 1, win ? APPROVAL_DELTAS.matchWin : APPROVAL_DELTAS.matchLoss, `evento ${i}`);
    board = r.board;
    log = r.boardLog;
  }
  assert.equal(log.length, BOARD_LOG_CAP);
  assert.equal(log[0].reason, `evento ${BOARD_LOG_CAP + 4}`); // mais recente primeiro
});

test('boardFiredDetail junta só os motivos negativos, no máximo N', () => {
  const log: BoardLogEntry[] = [
    { split: 5, delta: 2, reason: 'Vitória vs MOUZ' },
    { split: 5, delta: -3, reason: 'Derrota 0-2 vs NAVI' },
    { split: 5, delta: -18, reason: 'Objetivo falhou: top 4' },
    { split: 4, delta: -4, reason: 'Caixa zerado' },
    { split: 4, delta: -3, reason: 'Derrota 1-2 vs G2' },
    { split: 4, delta: -3, reason: 'Derrota 0-2 vs Spirit' },
  ];
  const detail = boardFiredDetail(log);
  assert.equal(detail, 'Derrota 0-2 vs NAVI; Objetivo falhou: top 4; Caixa zerado; Derrota 1-2 vs G2');
  assert.equal(boardFiredDetail([]), '');
  assert.equal(boardFiredDetail(undefined), '');
});

test('boardTone segue a régua do fired', () => {
  assert.equal(boardTone(80), 'ok');
  assert.equal(boardTone(55), 'ok');
  assert.equal(boardTone(40), 'warn');
  assert.equal(boardTone(29), 'danger');
  assert.equal(boardTone(0), 'danger');
});
