// LAN × ONLINE (fase 4 · circuito): evento LAN pesa o oculto bigMatch (pressão)
// no motor v2 com peso PEQUENO; online não pesa nada (motor bit a bit o de antes).
//
//   - online (pressure 0/ausente) = mesmo resultado, rodada a rodada;
//   - time "de LAN" (bigMatch alto) × "amarelão" (bigMatch baixo), mesmo elenco:
//     a LAN move a vitória de mapa alguns pontos (e menos que a final MD5);
//   - time médio da base: LAN × online não muda a vitória (a dificuldade da
//     Carreira fica igual pra quem não tem elenco de LAN).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { makeRng } from '../src/engine/rng.ts';
import { attrsOf, withAttrs as materialize, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { realTeams } from './calibrate-engine.mts';
import { LAN_PRESSURE, MAJOR_PRESSURE, pressureFor } from '../src/engine/mundo/circuito.ts';
import { MAP_POOL, type MapId, type TPlayer, type TTeam } from '../src/types.ts';

const TEAMS = realTeams().sort((a, b) => b.strength - a.strength);
const clone = (t: TTeam, tag: string, edit?: (p: TPlayer) => TPlayer): TTeam =>
  ({ ...t, id: `${t.id}-${tag}`, players: t.players.map((p) => { const q = { ...p, id: `${p.id}-${tag}` }; return edit ? edit(q) : q; }) });
const withHidden = (p: TPlayer, big: number): TPlayer => { const x: PlayerAttrs = structuredClone(attrsOf(p)); x.h.bigMatch = big; return materialize(p, x); };

function winRate(a: TTeam, b: TTeam, opts: { pressure?: number; bigMatch?: boolean }, n: number, seed0: number): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const sim = createMapSimV2(makeRng(seed0 + i), a, b, MAP_POOL[i % MAP_POOL.length] as MapId, -1, opts);
    while (!sim.step()) { /* */ }
    if (sim.result().winner === 0) w++;
  }
  return w / n;
}

test('LAN: online (pressure 0 ou ausente) é o motor de antes, bit a bit', () => {
  const a = TEAMS[10], b = TEAMS[14];
  for (let s = 1; s <= 25; s++) {
    const x = createMapSimV2(makeRng(s), a, b, 'mirage', -1, {});
    const y = createMapSimV2(makeRng(s), a, b, 'mirage', -1, { pressure: 0 });
    while (!x.step()) { /* */ }
    while (!y.step()) { /* */ }
    assert.deepEqual(x.result().score, y.result().score);
  }
  assert.equal(pressureFor({ lan: false }), 0);
  assert.equal(pressureFor({ lan: true, kind: 'gsl' }), LAN_PRESSURE);
  assert.equal(pressureFor({ lan: true, kind: 'major' }), MAJOR_PRESSURE);
  assert.ok(LAN_PRESSURE < MAJOR_PRESSURE && MAJOR_PRESSURE < 1, 'LAN < Major < final (jogo grande)');
});

test('LAN: time de LAN × amarelão — efeito pequeno e calibrado (menor que o da final)', () => {
  const base = TEAMS[30], opp = TEAMS[31];
  const big = clone(base, 'big', (p) => withHidden(p, 18));
  const choke = clone(base, 'choke', (p) => withHidden(p, 5));
  const N = 900;
  const edge = (opts: { pressure?: number; bigMatch?: boolean }) => winRate(big, opp, opts, N, 500) - winRate(choke, opp, opts, N, 500);
  const online = edge({});
  const lan = edge({ pressure: LAN_PRESSURE });
  const final = edge({ bigMatch: true });
  console.log(`  vitória de mapa (bigMatch 18 − 5): online ${(online * 100).toFixed(1)} pp · LAN ${(lan * 100).toFixed(1)} pp · final ${(final * 100).toFixed(1)} pp`);
  assert.ok(Math.abs(online) < 0.035, `online não pode pesar o oculto (${online})`);
  assert.ok(lan > online + 0.01, `LAN não pesou (${lan} × ${online})`);
  assert.ok(lan < 0.12, `LAN pesou demais (${lan})`);
  assert.ok(final > lan, `a final (jogo grande) pesa mais que LAN (${final} × ${lan})`);
});

test('LAN: time médio da base — LAN × online não muda a dificuldade (±2,5 pp)', () => {
  let dOn = 0, dLan = 0, n = 0;
  for (let k = 0; k < 8; k++) {
    const a = TEAMS[12 + k * 3], b = TEAMS[13 + k * 3];
    dOn += winRate(a, b, {}, 160, 7000 + k * 1000);
    dLan += winRate(a, b, { pressure: LAN_PRESSURE }, 160, 7000 + k * 1000);
    n++;
  }
  const diff = (dLan - dOn) / n;
  console.log(`  times reais (8 confrontos): LAN − online = ${(diff * 100).toFixed(2)} pp`);
  assert.ok(Math.abs(diff) < 0.025, `LAN mudou a vitória média (${diff})`);
});
