// [realismo FM · frente B] Evolução por atributo (engine/attrs/progression.ts),
// aposentadoria, evolução do elenco da Carreira (attrEvo) e CA/PA em estrelas.
// Roda: `tsx --test scripts/test-attrs-progression.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAttrs, legacyFromAttrs, ovrFromAttrs, caFromOvr, type PlayerAttrs,
} from '../src/engine/attrs/model.ts';
import {
  evolveAttrs, retirementTick, shouldRetire, retirementChipLabel, ATTR_CLASS, classGrowth, classDecline,
  type EvolveContext,
} from '../src/engine/attrs/progression.ts';
import { ALL_ATTRS, type AttrKey } from '../src/engine/attributes.ts';
import { applyAttrDelta, attrDelta, attrDeltaFromScalarEvo, activeAttrDelta, normalizeAttrEvo } from '../src/engine/career/attrEvo.ts';
import { starsOf, paRange } from '../src/engine/attrs/stars.ts';
import type { Role } from '../src/types.ts';
import { SPLITS_PER_YEAR } from '../src/engine/clock.ts';

const ROLES: Role[] = ['AWP', 'IGL', 'Rifler', 'Entry', 'Support', 'Lurker'];
const mk = (id: string, age: number, lvl = 72, role: Role = 'Rifler') =>
  deriveAttrs({ id, role, age, aim: lvl + 2, awp: lvl - 14, igl: lvl - 10, clutch: lvl - 1, consistency: lvl });

function run(x0: PlayerAttrs, id: string, age0: number, splits: number, extra: Partial<EvolveContext> = {}) {
  let x = x0;
  const byClass: Record<string, number> = { reflex: 0, mechanical: 0, mental: 0, leadership: 0 };
  for (let s = 1; s <= splits; s++) {
    const r = evolveAttrs(x, { playerId: id, split: s, age: age0 + Math.floor((s - 1) / SPLITS_PER_YEAR), ...extra });
    for (const [k, d] of Object.entries(r.deltas)) byClass[ATTR_CLASS[k as AttrKey]] += d as number;
    assert.ok(r.attrs.ca <= r.attrs.pa, 'CA nunca passa do PA');
    x = r.attrs;
  }
  return { x, byClass };
}
const avgOver = (n: number, f: (i: number) => number) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += f(i);
  return s / n;
};

test('determinística: mesma entrada, mesma evolução', () => {
  const x = mk('det', 19);
  const a = evolveAttrs(x, { playerId: 'det', split: 4, age: 19 });
  const b = evolveAttrs(x, { playerId: 'det', split: 4, age: 19 });
  assert.deepEqual(a, b);
});

test('jovem cresce até o PA; veterano cai; o teto nunca é furado', () => {
  const young = avgOver(40, (i) => {
    const x0 = mk(`y${i}`, 17);
    return ovrFromAttrs(run(x0, `y${i}`, 17, 12).x) - ovrFromAttrs(x0);
  });
  const vet = avgOver(40, (i) => {
    const x0 = mk(`v${i}`, 33);
    return ovrFromAttrs(run(x0, `v${i}`, 33, 9).x) - ovrFromAttrs(x0);
  });
  assert.ok(young >= 6, `jovem cresceu ${young}`);
  assert.ok(vet <= -3, `veterano caiu ${vet}`);
  for (let i = 0; i < 20; i++) {
    const x0 = mk(`cap${i}`, 17);
    const { x } = run(x0, `cap${i}`, 17, 30);
    assert.ok(x.ca <= x0.pa, `CA ${x.ca} ≤ PA ${x0.pa}`);
  }
});

test('idade por classe: reflexo cai antes; leitura de jogo segura e liderança ainda cresce', () => {
  assert.ok(classDecline('reflex', 27) > 0 && classDecline('mental', 27) === 0);
  assert.ok(classGrowth('leadership', 29) > 0 && classGrowth('mechanical', 29) === 0);
  let reflex = 0, mental = 0;
  for (let i = 0; i < 60; i++) {
    const x0 = { ...mk(`cls${i}`, 29), pa: 200 }; // espaço de sobra: mede só a curva
    const { byClass } = run(x0, `cls${i}`, 29, 9);
    reflex += byClass.reflex; mental += byClass.mental + byClass.leadership;
  }
  assert.ok(reflex < 0, `reflexo caiu (${reflex})`);
  assert.ok(mental > reflex, `mental (${mental}) melhor que reflexo (${reflex})`);
});

test('profissionalismo acelera o crescimento e segura o declínio', () => {
  const withProf = (x: PlayerAttrs, prof: number): PlayerAttrs => ({ ...x, h: { ...x.h, professionalism: prof } });
  const grow = (prof: number) => avgOver(60, (i) => {
    const x0 = withProf({ ...mk(`pr${i}`, 18), pa: 200 }, prof);
    return ovrFromAttrs(run(x0, `pr${i}`, 18, 3).x) - ovrFromAttrs(x0);
  });
  assert.ok(grow(19) > grow(3), `pro ${grow(19)} × relaxado ${grow(3)}`);
  const decline = (prof: number) => avgOver(60, (i) => {
    const x0 = withProf(mk(`pd${i}`, 33), prof);
    return ovrFromAttrs(run(x0, `pd${i}`, 33, 6).x) - ovrFromAttrs(x0);
  });
  assert.ok(decline(19) > decline(3), `pro cai menos: ${decline(19)} × ${decline(3)}`);
});

test('treino: foco no grupo de atributos e foco no jogador aceleram', () => {
  const groupGain = (focus: 'aim' | 'igl' | null) => avgOver(60, (i) => {
    const x0 = { ...mk(`tr${i}`, 19), pa: 200 };
    const { x } = run(x0, `tr${i}`, 19, 3, { focusGroup: focus });
    return legacyFromAttrs(x).igl - legacyFromAttrs(x0).igl;
  });
  assert.ok(groupGain('igl') > groupGain(null), 'foco em IGL sobe o grupo de IGL');
  assert.ok(groupGain('igl') > groupGain('aim'));
  const focused = (on: boolean) => avgOver(60, (i) => {
    const x0 = { ...mk(`fp${i}`, 19), pa: 200 };
    return ovrFromAttrs(run(x0, `fp${i}`, 19, 3, { focusPlayer: on }).x) - ovrFromAttrs(x0);
  });
  assert.ok(focused(true) > focused(false));
});

test('partidas jogadas: rodagem acelera a leitura de jogo', () => {
  const mental = (maps: number) => avgOver(80, (i) => {
    const x0 = { ...mk(`mp${i}`, 20), pa: 200 };
    return run(x0, `mp${i}`, 20, 3, { mapsPlayed: maps }).byClass.mental;
  });
  assert.ok(mental(15) > mental(0), `titular ${mental(15)} × banco ${mental(0)}`);
});

test('aposentadoria: regras do antigo aging.ts preservadas', () => {
  assert.equal(shouldRetire(30, 60), false);
  assert.equal(shouldRetire(31, 69), true);
  assert.equal(shouldRetire(34, 86), false);
  assert.equal(shouldRetire(34, 75), false);
  assert.equal(shouldRetire(35, 75), true);
  assert.deepEqual(retirementTick([{ id: 'a', nick: 'A', age: 33, ovr: 65 }, { id: 'b', nick: 'B', age: 33, ovr: 65 }], ['b']), [{ id: 'a', nick: 'A', age: 33 }]);
  assert.equal(retirementChipLabel(36), 'Aposentado · 36 anos');
  assert.equal(retirementChipLabel(32), 'Aposentado · 32 anos (cedo)');
});

test('attrEvo: variação sobre a base, conversão do evo escalar e regra de validade', () => {
  const base = { id: 'ae', role: 'Entry' as Role, aim: 80, awp: 50, igl: 52, clutch: 76, consistency: 78, age: 24 };
  const bx = deriveAttrs(base);
  const d = attrDeltaFromScalarEvo(base, 3, { aim: 2 });
  const x = applyAttrDelta(bx, d);
  assert.deepEqual(legacyFromAttrs(x), { aim: 85, awp: 53, igl: 55, clutch: 79, consistency: 81 });
  assert.deepEqual(attrDelta(x.a, bx.a), d);
  assert.equal(x.ca, caFromOvr(ovrFromAttrs(x)));
  assert.equal(applyAttrDelta(bx, undefined), bx);
  assert.equal(activeAttrDelta({ ae: d }, {}, 'ae'), undefined, 'sem evo, a variação não vale (jogador vendido/liberado)');
  assert.equal(activeAttrDelta({ ae: d }, { ae: 0 }, 'ae'), d);
  assert.deepEqual(normalizeAttrEvo({ a: { aim: 2, lixo: 5, tap: 'x', spray: 99 }, b: 3 }), { a: { aim: 2, spray: 19 } });
  for (const k of ALL_ATTRS) assert.ok(x.a[k] >= 1 && x.a[k] <= 20);
});

test('CA/PA em estrelas: meia estrela, PA como faixa que contém o real', () => {
  assert.equal(starsOf(200), 5);
  assert.equal(starsOf(100), 2.5);
  assert.equal(starsOf(1), 0.5);
  for (const id of ['a', 'b', 'c', 'd']) {
    for (const k of ['full', 'scouted', 'rumor'] as const) {
      const [lo, hi] = paRange(150, 120, k, id);
      assert.ok(lo <= 150 && hi >= 150 && lo >= 120 && hi <= 200, `${id}/${k}: ${lo}-${hi}`);
    }
  }
  const w = (k: 'full' | 'rumor') => { const [lo, hi] = paRange(120, 90, k, 'w'); return hi - lo; };
  assert.ok(w('rumor') > w('full'), 'quem você conhece pouco tem faixa mais larga');
  const [lo, hi] = paRange(195, 190, 'rumor', 'top');
  assert.ok(lo >= 190 && hi === 200);
});

test('todas as funções evoluem sem sair das escalas', () => {
  for (const [i, role] of ROLES.entries()) {
    const x0 = mk(`all${i}`, 16 + i * 3, 70, role);
    const { x } = run(x0, `all${i}`, 16 + i * 3, 24, { focusGroup: 'awp', mapsPlayed: 20, growthMul: 1.6 });
    for (const k of ALL_ATTRS) assert.ok(x.a[k] >= 1 && x.a[k] <= 20);
  }
});
