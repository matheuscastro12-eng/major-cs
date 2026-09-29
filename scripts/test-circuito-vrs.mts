// VRS REAL (fase 4 · frente J): a fórmula tipo Valve, um ranking só pra IA e
// usuário, decaimento pela idade, composição dos pontos e a régua calibrada.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVrs, publishVrs, ageWeight, shareOf, pointsFromScore, rankIn, vrsOrder, VRS_WINDOW, VRS_FULL, PTS_SCALE,
} from '../src/engine/mundo/vrs.ts';
import { pruneResults, closeWorld, eventResult, USER_ID } from '../src/engine/mundo/mundoCarreira.ts';
import type { WorldEventResult, MundoState } from '../src/engine/mundo/model.ts';
import { runWorld, aiPool } from './measure-circuito.mts';

const ev = (id: string, t: number, order: string[], o: { pool?: number; lan?: boolean; tier?: 1 | 2 | 3 } = {}): WorldEventResult =>
  eventResult({ id, name: id, tier: o.tier ?? 1, kind: 'gsl', lan: o.lan ?? false, prize: o.pool ?? 500_000, split: 1, t },
    order.map((teamId, i) => ({ teamId, place: i + 1 })));
const field = (pre: string, n = 16) => Array.from({ length: n }, (_, i) => `${pre}${i}`);

test('VRS: decaimento pela idade — cheio até 1 etapa, zera na janela', () => {
  assert.equal(ageWeight(0), 1);
  assert.equal(ageWeight(VRS_FULL), 1);
  assert.ok(ageWeight(3) < 1 && ageWeight(3) > 0);
  assert.equal(ageWeight(VRS_WINDOW), 0);
  // mesmo resultado, mais velho, vale menos; fora da janela não conta
  const r = [ev('a', 0, field('x')), ev('b', 0, field('y'))];
  const t1 = computeVrs(r, 1), t4 = computeVrs(r, 4), t7 = computeVrs(r, 7);
  assert.ok(t1.entries.x0.points >= t4.entries.x0.points);
  assert.equal(Object.keys(t7.entries).length, 0, 'resultado de 7 etapas atrás não pontua');
});

test('VRS: premiação real, rede de adversários e LAN — cada fator pesa', () => {
  // colocação: campeão > vice > … (mesmo evento)
  const one = computeVrs([ev('e', 0, field('t'))], 0);
  const pts = field('t').map((id) => one.entries[id].points);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i - 1] >= pts[i], `colocação ${i}`);
  assert.equal(shareOf(1, 16), 0.4);
  assert.ok(shareOf(1, 32) > shareOf(2, 32) && shareOf(9, 32) < shareOf(5, 32));
  // PREMIAÇÃO: vencer um evento de 1M vale mais que um de 20k (mesmo field)
  const big = computeVrs([ev('big', 0, ['A', ...field('f', 15)], { pool: 1_000_000 }), ev('small', 0, ['B', ...field('g', 15)], { pool: 20_000 })], 0);
  assert.ok(big.entries.A.points > big.entries.B.points);
  // REDE: vencer um field de campeões (times com bounty) vale mais que vencer desconhecidos
  const elite = field('E', 15);
  const base = [ev('prev', 0, elite, { pool: 1_000_000 }), ev('prev2', 0, [...elite].reverse(), { pool: 1_000_000 })];
  const net = computeVrs([...base, ev('vsElite', 0, ['S', ...elite], { pool: 100_000 }), ev('vsNobody', 0, ['W', ...field('n', 15)], { pool: 100_000 })], 0);
  assert.ok(net.entries.S.factors!.network > net.entries.W.factors!.network, 'bater a elite pesa na rede');
  assert.ok(net.entries.S.points > net.entries.W.points);
  // LAN: o mesmo resultado em LAN vale mais que online
  const lan = computeVrs([ev('l', 0, ['L', ...field('a', 15)], { lan: true }), ev('o', 0, ['O', ...field('b', 15)], { lan: false })], 0);
  assert.ok(lan.entries.L.factors!.lan > 0 && lan.entries.O.factors!.lan === 0);
  assert.ok(lan.entries.L.points > lan.entries.O.points);
});

test('VRS: um ranking só — o usuário é um time como qualquer outro', () => {
  const t = computeVrs([ev('e', 0, [USER_ID, ...field('t', 15)])], 0);
  assert.equal(t.order[0], USER_ID);
  const pub = publishVrs(t);
  assert.equal(rankIn(pub, USER_ID), 1);
  assert.equal(vrsOrder(pub)[0].teamId, USER_ID);
  // trocar o id não muda os pontos (sem régua especial pro usuário)
  const u = computeVrs([ev('e', 0, ['zz', ...field('t', 15)])], 0);
  assert.equal(u.entries.zz.points, t.entries[USER_ID].points);
});

test('VRS: composição dos pontos soma o total e aponta os eventos que pesaram', () => {
  const rs = [ev('a', 0, field('t')), ev('b', 2, [...field('t')].reverse(), { lan: true }), ev('c', 3, field('t'), { pool: 50_000 })];
  const tab = computeVrs(rs, 3);
  for (const id of tab.order) {
    const e = tab.entries[id];
    const sum = e.rows.reduce((a, r) => a + r.contribution, 0);
    assert.ok(Math.abs(sum - e.points) <= e.rows.length, `${id}: composição ${sum} × ${e.points}`);
    assert.ok(e.factors!.prize >= 0 && e.factors!.prize <= 1 && e.factors!.network <= 1 && e.factors!.lan <= 1);
    assert.ok(e.history.length <= 2);
  }
  assert.equal(pointsFromScore(1), PTS_SCALE);
  assert.equal(pointsFromScore(0), 0);
  // publicação guarda a anterior (seta de subida/queda)
  const p1 = publishVrs(tab);
  const p2 = publishVrs(computeVrs(rs, 5), p1);
  assert.equal(p2.t0?.prev, p1.t0.points);
});

test('VRS: poda do save guarda a janela inteira e só o pódio (+ você) do que é mais velho', () => {
  const rs = [ev('old', 0, [...field('t', 15), USER_ID]), ev('new', 8, field('t'))];
  const pr = pruneResults(rs, 8);
  const old = pr.find((r) => r.eventId === 'old')!;
  assert.ok(old.placements.length === 3 && old.placements.some((p) => p.teamId === USER_ID));
  assert.equal(old.field, 16, 'o tamanho do field sobrevive à poda');
  assert.equal(pr.find((r) => r.eventId === 'new')!.placements.length, 16);
  assert.equal(pruneResults(rs, 40).length, 0, 'histórico muito velho sai');
  const m: MundoState = { v: 1, calendar: [], results: [], vrs: {}, newgens: {}, intake: [], databaseId: null };
  const c = closeWorld(m, rs, 8);
  assert.equal(c.mundo.vrsAt, 8);
  assert.ok(Object.keys(c.mundo.vrs).length > 0);
});

test('VRS calibrado: a régua por posição fica na de antes; o mundo se mexe e a elite segue elite', () => {
  const w = runWorld(12, aiPool(1));
  const pts = Object.values(w.mundo.vrs).sort((a, b) => b.points - a.points).map((e) => e.points);
  // régua antiga (vrsCore + rolante, medida em scripts/measure-circuito.mts): #1 ~2160, #8 ~970, #16 ~700, #32 ~540, #64 ~210
  const old: Record<number, number> = { 1: 2160, 8: 970, 16: 700, 32: 540, 64: 210 };
  for (const [r, v] of Object.entries(old)) {
    const got = pts[+r - 1];
    assert.ok(got > v * 0.6 && got < v * 1.45, `#${r}: ${got} (antes ~${v})`);
  }
  assert.ok(pts.length >= 80, `ranqueados: ${pts.length}`);
  assert.ok(w.corr > 0.7, `força × ranking (Spearman ${w.corr.toFixed(2)})`);
  const changes = w.top10.slice(1).map((t, i) => t.filter((id) => !w.top10[i].includes(id)).length);
  assert.ok(changes.reduce((a, b) => a + b, 0) >= 12, 'o top 10 muda entre splits');
  assert.ok(new Set(w.top10.map((t) => t[0])).size >= 2, 'ninguém é #1 por inércia');
  // determinístico: o mesmo mundo, o mesmo ranking
  const w2 = runWorld(4, aiPool(1));
  const w3 = runWorld(4, aiPool(1));
  assert.deepEqual(w2.mundo.vrs, w3.mundo.vrs);
});
