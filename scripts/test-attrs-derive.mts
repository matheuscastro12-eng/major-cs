// [realismo FM · frente B] Derivação calibrada, ponte legada e carregador da base
// de atributos. Roda: `tsx --test scripts/test-attrs-derive.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import bo3 from '../src/data/bo3-2026.json' with { type: 'json' };
import teams from '../src/data/teams.json' with { type: 'json' };
import {
  attrsOf, deriveAttrs, legacyFromAttrs, legacyOf, refitAttrs, registerAttrs, withAttrs,
  caFromOvr, ovrFromAttrs, ovrFromLegacy, HIDDEN_KEYS, ALL_ATTRS, LEGACY_GROUP_OF,
  type AttrsSource, type LegacyStats,
} from '../src/engine/attrs/model.ts';
import { playerOvr, playerValue, playerWage } from '../src/engine/ratings.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { PLAYER_ATTRS_DB, materializeTeams, normalizeAttrsDb, readAttrsFile } from '../src/data/playerAttrs.ts';
import type { Role, TeamSeason } from '../src/types.ts';

type Raw = { players: (AttrsSource & { nick: string })[] }[];
const ALL = [...(bo3 as unknown as Raw), ...(teams as unknown as Raw)].flatMap((t) => t.players);
const KEYS = ['aim', 'awp', 'igl', 'clutch', 'consistency'] as const;
const ROLES: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];

test('volta exata: legacyFromAttrs(deriveAttrs(p)) devolve os 5 números de TODA a base', () => {
  assert.ok(ALL.length > 1000);
  for (const p of ALL) {
    const l = legacyFromAttrs(deriveAttrs(p));
    for (const k of KEYS) assert.equal(l[k], p[k], `${p.nick}.${k}`);
  }
});

test('volta exata em qualquer combinação 5–99 (fuzz determinístico, todas as funções)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 3000; i++) {
    const n = () => 5 + Math.floor(rnd() * 95);
    const p = { id: `fuzz${i}`, role: ROLES[i % 6], aim: n(), awp: n(), igl: n(), clutch: n(), consistency: n(), age: 16 + (i % 22) };
    const x = deriveAttrs(p);
    const l = legacyFromAttrs(x);
    for (const k of KEYS) assert.equal(l[k], p[k], `${p.id}.${k}`);
    for (const k of ALL_ATTRS) assert.ok(Number.isInteger(x.a[k]) && x.a[k] >= 1 && x.a[k] <= 20);
    for (const k of HIDDEN_KEYS) assert.ok(x.h[k] >= 1 && x.h[k] <= 20);
    assert.ok(x.ca >= 1 && x.ca <= x.pa && x.pa <= 200);
  }
});

test('OVR, valor e salário idênticos aos de antes para toda a base', () => {
  const oldOvr = (p: LegacyStats) => {
    const spec = Math.max(p.awp, p.igl, p.aim);
    return Math.round(p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25);
  };
  for (const p of ALL) {
    const w = withAttrs(p);
    assert.equal(playerOvr(w), oldOvr(p), p.nick);
    assert.equal(playerValue(w), playerValue({ nick: p.nick, aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency }), p.nick);
    assert.equal(playerWage(w), playerWage({ nick: p.nick, aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency } as Parameters<typeof playerWage>[0]), p.nick);
  }
});

test('CA é o OVR na escala FM; PA usa a idade (jovem tem mais espaço, veterano nenhum)', () => {
  const base = { id: 'pa_test', role: 'Rifler' as Role, aim: 80, awp: 55, igl: 55, clutch: 78, consistency: 79 };
  const young = deriveAttrs({ ...base, age: 17 });
  const prime = deriveAttrs({ ...base, age: 24 });
  const vet = deriveAttrs({ ...base, age: 31 });
  assert.equal(young.ca, caFromOvr(ovrFromAttrs(young)));
  assert.ok(young.pa - young.ca >= 25, `jovem com espaço: ${young.pa - young.ca}`);
  assert.ok(prime.pa - prime.ca < young.pa - young.ca);
  assert.equal(vet.pa, vet.ca, 'veterano já no teto');
});

test('perfil por função e idade: mesma "mira" legada, ênfases diferentes', () => {
  const nums = { aim: 85, awp: 60, igl: 60, clutch: 82, consistency: 83 };
  const avg = (r: Role, k: 'aimMovement' | 'preAim' | 'leadership' | 'teamwork') => {
    let s = 0;
    for (let i = 0; i < 60; i++) s += deriveAttrs({ id: `pf${r}${i}`, role: r, ...nums, age: 25 }).a[k];
    return s / 60;
  };
  assert.ok(avg('Entry', 'aimMovement') > avg('AWP', 'aimMovement'));
  assert.ok(avg('AWP', 'preAim') > avg('Entry', 'preAim'));
  assert.ok(avg('Support', 'teamwork') > avg('Lurker', 'teamwork'));
  const young = deriveAttrs({ id: 'ag', role: 'Rifler', ...nums, age: 18 });
  const old = deriveAttrs({ id: 'ag', role: 'Rifler', ...nums, age: 33 });
  assert.ok(young.a.reflexes > old.a.reflexes, 'reflexos caem com a idade');
});

test('ocultos plausíveis: bigMatch acompanha o clutch; ninguém fica fora de 1–20', () => {
  const lo = deriveAttrs({ id: 'hid', role: 'Rifler', aim: 70, awp: 50, igl: 50, clutch: 50, consistency: 70 });
  const hi = deriveAttrs({ id: 'hid', role: 'Rifler', aim: 70, awp: 50, igl: 50, clutch: 97, consistency: 70 });
  assert.ok(hi.h.bigMatch > lo.h.bigMatch);
});

test('attrsOf reajusta atributos quando um código antigo mexe só nos números (menor movimento)', () => {
  const p = { id: 'sync', role: 'Entry' as Role, aim: 84, awp: 50, igl: 52, clutch: 80, consistency: 81 };
  const x = deriveAttrs(p);
  const drifted = { ...p, aim: 86, attrs: x }; // drift da IA: só a mira
  const y = attrsOf(drifted);
  assert.equal(legacyFromAttrs(y).aim, 86);
  for (const k of ALL_ATTRS) if (LEGACY_GROUP_OF[k] !== 'aim') assert.equal(y.a[k], x.a[k], `${k} não deveria mexer`);
  assert.equal(attrsOf(drifted), y, 'memoizado');
  assert.deepEqual(legacyOf(drifted), { aim: 86, awp: 50, igl: 52, clutch: 80, consistency: 81 });
  assert.equal(playerOvr(drifted), ovrFromLegacy({ aim: 86, awp: 50, igl: 52, clutch: 80, consistency: 81 }));
  const back = refitAttrs(y, { aim: 84, awp: 50, igl: 52, clutch: 80, consistency: 81 });
  assert.deepEqual(legacyFromAttrs(back), { aim: 84, awp: 50, igl: 52, clutch: 80, consistency: 81 });
});

test('registro da base: TPlayer de torneio acha os atributos pelo sourcePlayerId', () => {
  const x = deriveAttrs({ id: 'reg_src', role: 'AWP', aim: 90, awp: 95, igl: 60, clutch: 88, consistency: 90, age: 20 });
  registerAttrs('reg_src', x);
  const tp = { id: 'user__reg_src', sourcePlayerId: 'reg_src', role: 'AWP' as Role, ...legacyFromAttrs(x) };
  assert.equal(attrsOf(tp), x);
});

test('dataset real: jogadores registrados com a idade real (PA) e números intactos sem base real', () => {
  const zywoo = CS2_REAL_2026.flatMap((t) => t.players).find((p) => p.nick === 'ZywOo')!;
  assert.equal(zywoo.aim, 96);
  const x = attrsOf(zywoo);
  assert.equal(x, attrsOf({ ...zywoo }), 'vem do registro');
  const donk = CS2_REAL_2026.flatMap((t) => t.players).find((p) => p.nick === 'donk')!;
  const dx = attrsOf(donk);
  assert.ok(dx.pa > dx.ca, 'donk (19) ainda tem espaço');
  assert.equal(Object.keys(PLAYER_ATTRS_DB).length, 0, 'sem o arquivo da frente de dados, base vazia');
});

test('carregador: fixture no disco, entrada inválida descartada, números saem dos atributos reais', () => {
  const raw = readAttrsFile(new URL('./fixtures/player-attrs-fixture.json', import.meta.url));
  assert.ok(raw && typeof raw === 'object');
  const db = normalizeAttrsDb(raw);
  assert.deepEqual(Object.keys(db).sort(), ['bo3_17515', 'bo3_18452']);
  assert.equal(readAttrsFile(new URL('./fixtures/nao-existe.json', import.meta.url)), undefined);
  assert.deepEqual(normalizeAttrsDb(undefined), {});
  assert.deepEqual(normalizeAttrsDb([1, 2]), {});

  const vit = (bo3 as unknown as TeamSeason[]).filter((t) => t.team === 'Vitality');
  const mat = materializeTeams(vit, db);
  const apex = mat[0].players.find((p) => p.id === 'bo3_17515')!;
  const real = db.bo3_17515;
  assert.deepEqual({ aim: apex.aim, awp: apex.awp, igl: apex.igl, clutch: apex.clutch, consistency: apex.consistency }, legacyFromAttrs(real));
  assert.ok(apex.aim < 80, 'mira real mais baixa derrubou o número legado');
  const ax = attrsOf(apex);
  assert.equal(ax.a.leadership, 20);
  assert.equal(ax.ca, 120);
  assert.equal(apex.attrs, undefined, 'o objeto não carrega os 28 atributos (saves enxutos)');
  const zy = mat[0].players.find((p) => p.id === 'bo3_18452')!;
  assert.equal(zy.aim, 96, 'base real igual à derivada não muda nada');
});
