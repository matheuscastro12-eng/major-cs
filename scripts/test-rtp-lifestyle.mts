// RTP v16 — VIDA DE PRO (moradia, casa da família, investimentos) + árvore de
// perks estendida (tiers 4-5). Roda via `npm run test:sim`.
//
// Cobertura:
//   - buyHousing: escada 0→4, débito correto, trava sem dinheiro e no topo
//   - buyFamilyHome: única, cara, salta relação com a família, imutável
//   - invest/redeem: conservação de dinheiro, resgate parcial/total, travas
//   - investRate/investYield: determinístico por (seed, tick), dentro da faixa
//   - investWeekTick: compõe no aplicado, no-op com 0 investido
//   - lifestyleWeeklyMods + weeklyTick: moradia melhora a virada da semana
//   - migração v15→v16: backfill do lifestyle em save antigo
//   - perks: tiers 4-5 existem em TODAS as trilhas, gated por T3 e nível
//   - legacyScore: casa da família e moradia pesam no legado

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import {
  HOUSING_TIERS, housingDef, buyHousing, buyFamilyHome, invest, redeem,
  investRate, investYield, investWeekTick, lifestyleWeeklyMods,
  FAMILY_HOME_PRICE, FAMILY_HOME_REL_BOOST, STARTER_LIFESTYLE,
} from '../src/engine/rtp/lifestyle.ts';
import { weeklyTick } from '../src/engine/rtp/weekly.ts';
import { PERKS, perkTreeFor, legacyScore } from '../src/engine/rtp/perks.ts';
import { loadRtp, saveRtp } from '../src/state/rtpSaves.ts';
import type { RoadToProSave, GearTier } from '../src/engine/rtp/types.ts';
import type { Role } from '../src/types.ts';

function fixture(money = 5_000_000): RoadToProSave {
  const save = createRtpSave({
    nick: 'tst', country: 'br', role: 'Rifler',
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed: 42,
  });
  return { ...save, life: { ...save.life, money } };
}

test('lifestyle: save novo nasce no quarto dos pais com zero investido', () => {
  const s = fixture();
  assert.deepEqual(s.lifestyle, STARTER_LIFESTYLE());
  assert.deepEqual(lifestyleWeeklyMods(s.lifestyle), { energyBonus: 0, recoveryBonus: 0 });
});

test('buyHousing: escada 0→4 com débito correto; trava no topo e sem dinheiro', () => {
  let s = fixture();
  for (let t = 1; t <= 4; t++) {
    const before = s.life.money;
    const res = buyHousing(s);
    assert.ok(res.ok, `tier ${t} deveria comprar`);
    s = res.save;
    assert.equal(s.lifestyle.housing, t);
    assert.equal(s.life.money, before - HOUSING_TIERS[t].price);
  }
  assert.equal(buyHousing(s).ok, false);                       // topo
  const broke = { ...fixture(100) };
  assert.equal(buyHousing(broke).ok, false);                   // sem dinheiro
  assert.equal(broke.lifestyle.housing, 0);                    // imutável no fail
  // escada de preços e efeitos é monotônica
  for (let t = 1; t < HOUSING_TIERS.length; t++) {
    assert.ok(HOUSING_TIERS[t].price > HOUSING_TIERS[t - 1].price);
    assert.ok(HOUSING_TIERS[t].energyBonus > HOUSING_TIERS[t - 1].energyBonus);
  }
});

test('buyFamilyHome: única, salta a relação com a família, imutável', () => {
  const s = fixture();
  const res = buyFamilyHome(s);
  assert.ok(res.ok);
  assert.equal(res.save.lifestyle.familyHome, true);
  assert.equal(res.save.life.money, s.life.money - FAMILY_HOME_PRICE);
  assert.equal(res.save.life.rel.family, Math.min(100, s.life.rel.family + FAMILY_HOME_REL_BOOST));
  assert.equal(buyFamilyHome(res.save).ok, false);             // já comprada
  assert.equal(s.lifestyle.familyHome, false);                 // original intacto
  assert.equal(buyFamilyHome(fixture(1000)).ok, false);        // sem dinheiro
});

test('invest/redeem: dinheiro conserva, parcial e total, travas', () => {
  const s = fixture(100_000);
  const inv = invest(s, 60_000);
  assert.ok(inv.ok);
  assert.equal(inv.save.life.money, 40_000);
  assert.equal(inv.save.lifestyle.invested, 60_000);
  // total (money + invested) conserva
  assert.equal(inv.save.life.money + inv.save.lifestyle.invested, 100_000);
  const part = redeem(inv.save, 25_000);
  assert.ok(part.ok);
  assert.equal(part.save.life.money, 65_000);
  assert.equal(part.save.lifestyle.invested, 35_000);
  const all = redeem(part.save);
  assert.ok(all.ok);
  assert.equal(all.save.life.money, 100_000);
  assert.equal(all.save.lifestyle.invested, 0);
  assert.equal(redeem(all.save).ok, false);                    // nada aplicado
  assert.equal(invest(s, 200_000).ok, false);                  // mais que o bolso
  assert.equal(invest(s, 0).ok, false);                        // valor inválido
  // resgate acima do aplicado clampa no total (não cria dinheiro)
  const over = redeem(inv.save, 999_999);
  assert.ok(over.ok);
  assert.equal(over.save.life.money + over.save.lifestyle.invested, 100_000);
});

test('investRate/investYield: determinístico, faixa -0,3%..+1,1%', () => {
  for (let tick = 0; tick < 200; tick++) {
    const r = investRate(42, tick);
    assert.equal(r, investRate(42, tick));                     // determinístico
    assert.ok(r >= -0.003 && r <= 0.0111, `tick ${tick}: ${r}`);
  }
  // ticks diferentes → taxas diferentes (não é constante)
  assert.notEqual(investRate(42, 1), investRate(42, 2));
  assert.equal(investYield(0, 42, 1), 0);
  assert.equal(investYield(100_000, 42, 7), Math.round(100_000 * investRate(42, 7)));
});

test('investWeekTick: compõe no aplicado; no-op sem investimento', () => {
  const s = fixture(100_000);
  assert.equal(investWeekTick(s), s);                          // no-op (mesma ref)
  const inv = invest(s, 50_000).save;
  const after = investWeekTick(inv);
  assert.equal(after.lifestyle.invested, 50_000 + investYield(50_000, inv.rng.seed, inv.rng.tick));
  assert.equal(after.life.money, inv.life.money);              // não pinga no bolso
});

test('weeklyTick: moradia melhora energia e recuperação da virada', () => {
  const s = fixture();
  const life = { ...s.life, energy: 40, morale: 40, focus: 40 };
  const base = weeklyTick(life, 1000, s.setup, s.lifestyle);
  const mansion = { ...s.lifestyle, housing: 4 as GearTier, familyHome: true };
  const rich = weeklyTick(life, 1000, s.setup, mansion);
  const mods = lifestyleWeeklyMods(mansion);
  assert.equal(mods.energyBonus, 8);
  assert.equal(mods.recoveryBonus, 4 + 2);                     // cobertura + família
  assert.equal(rich.energy, base.energy + 8);
  assert.ok(rich.morale > base.morale && rich.focus > base.focus);
  // retrocompat: sem lifestyle (caller antigo) = comportamento antigo
  assert.deepEqual(weeklyTick(life, 1000, s.setup), base);
});

test('migração v15→v16: backfill do lifestyle em save antigo', () => {
  const s = fixture();
  const legacy = { ...(s as unknown as Record<string, unknown>), _v: 15 };
  delete (legacy as Record<string, unknown>).lifestyle;
  const g = globalThis as Record<string, unknown>;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  try {
    store.set('rtm-rtp-v1', JSON.stringify(legacy));
    const loaded = loadRtp();
    assert.ok(loaded);
    assert.equal(loaded._v, 16);
    assert.deepEqual(loaded.lifestyle, STARTER_LIFESTYLE());
    // round-trip: salvar de novo preserva
    assert.ok(saveRtp(loaded));
  } finally {
    delete g.localStorage;
  }
});

test('perks: toda trilha tem T4 (nível 18) e T5 (nível 30), encadeados no T3', () => {
  const trees = ['universal', 'Entry', 'AWP', 'Rifler', 'Support', 'Lurker', 'IGL'] as const;
  for (const tree of trees) {
    const t4 = PERKS.filter((p) => p.tree === tree && p.tier === 4);
    const t5 = PERKS.filter((p) => p.tree === tree && p.tier === 5);
    assert.equal(t4.length, 1, `${tree}: sem T4`);
    assert.equal(t5.length, 1, `${tree}: sem T5`);
    assert.equal(t4[0].reqLevel, 18);
    assert.equal(t5[0].reqLevel, 30);
    assert.equal(t5[0].reqPerk, t4[0].id);                     // T5 encadeia no T4
    const t3 = PERKS.find((p) => p.id === t4[0].reqPerk);
    assert.equal(t3?.tier, 3, `${tree}: T4 não encadeia no T3`);
  }
  // cada jogador agora enxerga 10 perks compráveis (5 universais + 5 da role)
  for (const role of ['Entry', 'AWP', 'Rifler', 'Support', 'Lurker', 'IGL'] as Role[]) {
    assert.equal(perkTreeFor(role).length, 10, `${role}`);
  }
  // ids únicos
  assert.equal(new Set(PERKS.map((p) => p.id)).size, PERKS.length);
});

test('legacyScore: moradia e casa da família pesam no legado', () => {
  const s = fixture();
  const before = legacyScore(s);
  const after = legacyScore({ ...s, lifestyle: { housing: 4, familyHome: true, invested: 0 } });
  assert.equal(after - before, 4 * 12 + 40);
});
