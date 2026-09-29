// VRS — MUNDO VIVO. [fase 4 · circuito] O rolante sorteado da IA e o rolante
// do jogador saíram: há UM ranking só, calculado dos resultados do mundo (os
// eventos que você joga e os que rodam em segundo plano). Estes testes fixam
// que o mundo continua se MEXENDO — e que mexer não quebrou a justiça da tabela
// (elite continua elite, azarão não vira #1 por sorte, o mesmo save mostra
// sempre o mesmo mundo). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWorld, aiPool, strengthMap } from './measure-circuito.mts';
import { computeVrs } from '../src/engine/mundo/vrs.ts';

const W = runWorld(12, aiPool(1));
const order = (): string[] => Object.values(W.mundo.vrs).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map((e) => e.teamId);

test('determinismo: o mesmo mundo, o mesmo ranking', () => {
  const again = runWorld(12, aiPool(1));
  assert.deepEqual(again.mundo.vrs, W.mundo.vrs);
  // e ninguém empata em massa (o ranking ordena de verdade)
  const pts = Object.values(W.mundo.vrs).map((e) => e.points);
  assert.ok(new Set(pts).size > pts.length * 0.8, 'pontuações distintas');
});

test('o mundo SE MEXE: o top 10 troca entre splits e a elite reveza o #1', () => {
  const changes = W.top10.slice(1).map((t, i) => t.filter((id) => !W.top10[i].includes(id)).length);
  assert.ok(changes.reduce((a, b) => a + b, 0) >= 12, `trocas no top 10: ${changes.join(',')}`);
  assert.ok(new Set(W.top10.map((t) => t[0])).size >= 2, 'ninguém fica #1 por inércia');
});

test('força enviesa, mas não garante: elite rende mais que o fraco NA MÉDIA', () => {
  const str = strengthMap(aiPool(1));
  const ranked = order().filter((id) => str.has(id));
  const top = ranked.slice(0, 20).reduce((a, id) => a + str.get(id)!, 0) / 20;
  const bottom = ranked.slice(-20).reduce((a, id) => a + str.get(id)!, 0) / 20;
  assert.ok(top > bottom + 5, `força média do top 20 (${top.toFixed(1)}) × fundo (${bottom.toFixed(1)})`);
  assert.ok(W.corr > 0.7, `Spearman força × ranking ${W.corr.toFixed(2)}`);
});

test('o azarão NÃO vira #1: time do fundo da força nunca lidera', () => {
  const str = strengthMap(aiPool(1));
  const weakest = [...str.entries()].sort((a, b) => a[1] - b[1]).slice(0, 60).map(([id]) => id);
  for (const t of W.top10) assert.ok(!weakest.includes(t[0]), `time fraco virou #1: ${t[0]}`);
});

test('recência: parar de jogar derruba — resultado velho perde peso até sumir', () => {
  const lead = order()[0];
  const now = W.mundo.vrsAt!;
  const later = computeVrs(W.mundo.results, now + 3).entries[lead]?.points ?? 0;
  const muchLater = computeVrs(W.mundo.results, now + 9).entries[lead]?.points ?? 0;
  assert.ok(later < W.mundo.vrs[lead].points, 'sem jogar, os pontos caem');
  assert.equal(muchLater, 0, 'fora da janela o resultado não conta');
});

test('nunca devolve lixo (NaN/negativo) — o ranking ordena por isto', () => {
  for (const e of Object.values(W.mundo.vrs)) assert.ok(Number.isFinite(e.points) && e.points >= 0, `valor inválido: ${e.points}`);
});
