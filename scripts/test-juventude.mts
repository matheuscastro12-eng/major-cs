// [fase 4 · frente K] Juventude e envelhecimento: geração anual de jovens,
// distribuição de PA, atributos coerentes com a função, evolução com teto no PA,
// poda, e o MUNDO EQUILIBRADO — OVR médio do top 20 estável (±1) em 10 splits,
// com renovação de nomes e sem colapso (scripts/measure-mundo-10-splits.mts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  packAttrs, unpackAttrs, generateIntake, makeNewgen, samplePa, newgenAge, parseNewgenId, newgenId,
  evolveNewgens, pruneNewgens, storeNewgen, newgenPlayer, newgenList, applyIntake, REGION_YOUTH, isNewgenId,
  type MundoJuv,
} from '../src/engine/mundo/juventude.ts';
import { EMPTY_MUNDO, ensureYearIntake, withNewgens, retireeStaffSources, mundoOf } from '../src/engine/mundo/juventudeMundo.ts';
import { legacyFromAttrs, ovrFromLegacy } from '../src/engine/attrs/model.ts';
import { evoDelta, aiRetireAge, buildAiWorld, aiAgeOf, aiSlotPlayer, regenYouth, REGEN_DEBUT_CAP, REGEN_DEBUT_FLOOR } from '../src/engine/career/aiWorld.ts';
import { parseRegenPlayerId } from '../src/engine/career/signings.ts';
import { playerOvr } from '../src/engine/ratings.ts';
import { migrateMundo } from '../src/engine/mundo/mundoMigration.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { simulateMundo } from './measure-mundo-10-splits.mts';

const SAVE = { org: { name: 'Teste', tag: 'TST' }, split: 1, squad: [] };

test('atributos empacotados: ida e volta exata', () => {
  const p = makeNewgen({ id: newgenId(4, 17, 'europe', 3), seed: 's', region: 'europe', age: 17, pa: 150 });
  const back = unpackAttrs(packAttrs(p.attrs));
  assert.deepEqual(back, p.attrs);
  assert.equal(unpackAttrs('lixo'), null);
});

test('id do jovem carrega o relógio de idade (e não colide com regen)', () => {
  const id = newgenId(7, 16, 'cis', 12);
  assert.deepEqual(parseNewgenId(id), { debut: 7, ageAtDebut: 16, region: 'cis', n: 12 });
  assert.equal(newgenAge(id, 7), 16);
  assert.equal(newgenAge(id, 9), 16);
  assert.equal(newgenAge(id, 10), 17);
  assert.ok(!isNewgenId('bo3_team_1~rg0.1.4.18'));
  assert.equal(aiAgeOf({ id, nick: 'x' }, 13), 18);
});

test('leva anual: determinística, por região, 16–18 anos, atributos coerentes', () => {
  const a = generateIntake({ seed: 'k', year: 0, split: 1 });
  const b = generateIntake({ seed: 'k', year: 0, split: 1 });
  assert.deepEqual(a, b);
  const total = Object.values(REGION_YOUTH).reduce((s, r) => s + r.count, 0);
  assert.equal(a.players.length, total);
  for (const p of a.players) {
    const age = newgenAge(p.id, 1)!;
    assert.ok(age >= 16 && age <= 18, `idade ${age}`);
    assert.deepEqual(legacyFromAttrs(p.attrs), { aim: p.aim, awp: p.awp, igl: p.igl, clutch: p.clutch, consistency: p.consistency });
    assert.ok(p.attrs.ca <= p.attrs.pa);
    if (p.role === 'AWP') assert.ok(p.awp >= p.aim - 2, `AWP com awp ${p.awp} < mira ${p.aim}`);
    if (p.role === 'IGL') assert.ok(p.igl > p.awp, 'IGL lidera mais do que awpeia');
    assert.ok(p.nick && p.name && p.country);
  }
  // Europa mais que Ásia; África e Oceania poucos
  const byRegion = (r: string) => a.logs.find((l) => l.region === r)!.playerIds.length;
  assert.ok(byRegion('europe') > byRegion('asia') && byRegion('asia') > byRegion('africa'));
});

test('distribuição de PA realista: maioria 90–130, raros 160+, cena forte melhor', () => {
  const pas: number[] = [];
  for (let i = 0; i < 4000; i++) pas.push(samplePa(`d${i}`));
  const frac = (f: (x: number) => boolean) => pas.filter(f).length / pas.length;
  assert.ok(frac((x) => x >= 90 && x <= 130) >= 0.6, `90–130: ${frac((x) => x >= 90 && x <= 130)}`);
  const top = frac((x) => x >= 160);
  assert.ok(top > 0.01 && top < 0.06, `160+: ${top}`);
  const avg = (shift: number) => { let s = 0; for (let i = 0; i < 2000; i++) s += samplePa(`r${i}`, shift); return s / 2000; };
  assert.ok(avg(REGION_YOUTH.europe.paShift) - avg(REGION_YOUTH.africa.paShift) > 12);
});

test('evolução: o jovem sobe rumo ao PA e nunca passa dele; rodagem acelera', () => {
  const p = makeNewgen({ id: newgenId(1, 17, 'europe', 1), seed: 'evo', region: 'europe', age: 17, pa: 150 });
  let starter: MundoJuv = storeNewgen(EMPTY_MUNDO, p);
  let free: MundoJuv = storeNewgen(EMPTY_MUNDO, p);
  for (let s = 1; s <= 9; s++) {
    starter = evolveNewgens(starter, { split: s, statusOf: () => 'starter' });
    free = evolveNewgens(free, { split: s, statusOf: () => 'free' });
  }
  const st = newgenPlayer(starter, p.id)!, fr = newgenPlayer(free, p.id)!;
  assert.ok(st.attrs!.ca > p.attrs.ca + 20, `CA ${p.attrs.ca} → ${st.attrs!.ca}`);
  assert.ok(st.attrs!.ca <= st.attrs!.pa);
  assert.ok(st.attrs!.ca >= fr.attrs!.ca, 'titular evolui pelo menos o que evolui sem clube');
  // no seu elenco a cópia do mundo congela
  const frozen = evolveNewgens(storeNewgen(EMPTY_MUNDO, p), { split: 1, statusOf: () => 'user' });
  assert.deepEqual(newgenPlayer(frozen, p.id)!.attrs, p.attrs);
});

test('poda: sem clube e velho sai; do seu elenco e contratado fica', () => {
  const young = makeNewgen({ id: newgenId(1, 18, 'europe', 1), seed: 'p1', region: 'europe', age: 18, pa: 100 });
  const weak = makeNewgen({ id: newgenId(1, 18, 'europe', 2), seed: 'p2', region: 'europe', age: 18, pa: 120 });
  let m: MundoJuv = storeNewgen(storeNewgen(EMPTY_MUNDO, young), weak);
  // split 13: 22 anos
  const r = pruneNewgens(m, { split: 13, statusOf: () => 'free' });
  assert.equal(Object.keys(r.mundo.newgens).length, 0);
  const kept = pruneNewgens(m, { split: 13, statusOf: (id) => (id === young.id ? 'user' : 'starter') });
  assert.equal(Object.keys(kept.mundo.newgens).length, 2);
  m = r.mundo;
  assert.deepEqual(m.newgenAttrs, {});
});

test('jovens entram no mercado livre da base (e saem quando excluídos)', () => {
  const r = generateIntake({ seed: 'm', year: 0, split: 1 });
  const m = applyIntake({ ...EMPTY_MUNDO }, r);
  const base = withNewgens(CS2_REAL_2026, m);
  const free = base.find((t) => t.id === '__free__')!;
  assert.equal(free.players.filter((p) => isNewgenId(p.id)).length, r.players.length);
  const ex = new Set([r.players[0].id]);
  const base2 = withNewgens(CS2_REAL_2026, m, ex);
  assert.ok(!base2.find((t) => t.id === '__free__')!.players.some((p) => p.id === r.players[0].id));
  assert.equal(newgenList(m).length, r.players.length);
});

test('save migrado v29 → v30 continua jogável: bloco neutro e a leva do ano nasce idempotente', () => {
  const v29 = { squad: [], split: 5, org: { name: 'Migr', tag: 'MG' } };
  const s = migrateMundo(v29);
  const m0 = mundoOf(s as never);
  assert.deepEqual(m0.newgens, {});
  const world = buildAiWorld({ base: CS2_REAL_2026, split: 5, skip: new Set() });
  const m1 = ensureYearIntake(m0, { split: 5, save: v29, world });
  assert.ok(Object.keys(m1.newgens).length > 40);
  assert.equal(m1.intake[0].year, 1);
  assert.deepEqual(ensureYearIntake(m1, { split: 6, save: v29, world }), m1);
  // academias da IA revelam 1 a mais, com origem gravada
  assert.ok(m1.intake.some((l) => l.region === 'global' && Object.keys(l.origin ?? {}).length > 5));
});

test('curva da IA: jovem sobe, pico ~22–26 estável, declínio depois dos 28', () => {
  const mean = (age: number, ceil = false) => { let s = 0; for (let i = 0; i < 3000; i++) s += evoDelta(`p${i}`, i % 30, age, ceil); return s / 3000; };
  assert.ok(mean(18) > 0.6);
  assert.ok(Math.abs(mean(24, true)) < 0.15, `24 no teto: ${mean(24, true)}`);
  assert.ok(mean(29, true) < -0.2);
  assert.ok(mean(34, true) < mean(30, true));
  // aposentadoria por idade, nível e motivação: estrela joga mais
  let star = 0, low = 0;
  for (let i = 0; i < 500; i++) { star += aiRetireAge(`r${i}`, 88); low += aiRetireAge(`r${i}`, 70); }
  assert.ok(star / 500 > low / 500 + 2);
});

test('substituto da vaga: estreia pelo OVR ATUAL de quem sai, com teto, e se refaz pelo id', () => {
  const NONE = new Set<string>();
  let checked = 0, stars = 0;
  for (const team of CS2_REAL_2026.filter((t) => t.players.length >= 5).slice(0, 60)) {
    team.players.slice(0, 5).forEach((orig, slot) => {
      // acha a 1ª troca da vaga (split em que o titular vira regen)
      let prev = aiSlotPlayer(orig, team, slot, 1, NONE);
      for (let split = 2; split <= 30; split++) {
        const cur = aiSlotPlayer(orig, team, slot, split, NONE);
        const rg = parseRegenPlayerId(cur.id);
        if (rg && rg.debut === split && cur.id !== prev.id) {
          const leaving = playerOvr(prev);
          const debutOvr = playerOvr(cur);
          assert.ok(debutOvr <= REGEN_DEBUT_CAP + 1, `${cur.id}: estreia ${debutOvr} acima do teto`);
          assert.ok(debutOvr >= REGEN_DEBUT_FLOOR - 1, `${cur.id}: estreia ${debutOvr} abaixo do piso`);
          assert.ok(debutOvr < leaving || debutOvr <= REGEN_DEBUT_FLOOR + 1, `${cur.id}: estreia ${debutOvr} ≥ quem saiu (${leaving})`);
          // identidade por índice: o id refaz exatamente o mesmo jogador (Carreira: contratar um regen)
          const again = regenYouth(team, rg.slot, rg.generation, rg.debut, rg.ageAtDebut, orig);
          assert.deepEqual(again, cur, `${cur.id}: regen não se refaz pelo id`);
          if (playerOvr(orig) >= 88) stars++;
          checked++;
          break;
        }
        prev = cur;
      }
    });
  }
  assert.ok(checked > 40, `vagas renovadas medidas: ${checked}`);
  assert.ok(stars > 0, 'alguma vaga de estrela renovada');
});

test('MUNDO EQUILIBRADO: top 20 estável (±1) em 10 splits, renovação de nomes, sem colapso, save enxuto', () => {
  const { rows, mundo } = simulateMundo(10);
  const start = rows[0].top20;
  for (const r of rows) {
    assert.ok(Math.abs(r.top20 - start) <= 1, `split ${r.split}: top 20 ${r.top20.toFixed(2)} (início ${start.toFixed(2)})`);
    assert.ok(r.top5 >= rows[0].top5 - 2, `top 5 colapsou no split ${r.split}`);
    assert.ok(r.mid >= rows[0].mid - 2, `21º-40º colapsou no split ${r.split}`);
  }
  const last = rows[rows.length - 1];
  assert.ok(last.renewal >= 0.3, `renovação ${last.renewal}`);
  assert.ok(last.signed >= 10, `jovens contratados ${last.signed}`);
  assert.ok(last.bytes < 64 * 1024, `bloco de jovens ${last.bytes} bytes`);
  assert.ok(Object.keys(mundo.newgens).length < 260);
  // aposentados do mundo que viram comissão entram no mercado de staff
  const staff = retireeStaffSources(mundo);
  assert.ok((mundo.retirees ?? []).length > 20);
  assert.ok(staff.length > 0 && staff.every((s) => Object.keys(s.a).length === 28));
});
