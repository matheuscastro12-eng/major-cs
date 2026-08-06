// ÍCONES HISTÓRICOS + TOTW SEMANAL (engine/ultimate/icons.ts + totw.ts).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { makeRng } from '../src/engine/rng.ts';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.ts';
import { ICONS, iconCards } from '../src/engine/ultimate/icons.ts';
import { ICON_PACK, rollPack, TOTW_PACK } from '../src/engine/ultimate/packs.ts';
import { rarityInfo } from '../src/engine/ultimate/rarities.ts';
import { checkSbc, sbcById } from '../src/engine/ultimate/sbc.ts';
import { totwForWeek, totwSpecsThroughMonth, TOTW_BOOST, TOTW_SIZE, weekEndMs, weekStartMs } from '../src/engine/ultimate/totw.ts';

const AUG26 = 2026 * 12 + 7; // agosto/2026 (mês de estreia do TOTW)

test('icons: dataset curado íntegro (ids/keys únicos, OVR e stats na faixa)', () => {
  const cards = iconCards();
  assert.equal(cards.length, ICONS.length);
  assert.ok(cards.length >= 25, 'esperava um panteão de ao menos 25 lendas');
  assert.equal(new Set(cards.map((c) => c.playerId)).size, cards.length);
  assert.equal(new Set(cards.map((c) => c.key)).size, cards.length);
  for (const c of cards) {
    assert.ok(c.playerId.startsWith('hist_'), `${c.nick}: playerId fora do namespace hist_`);
    assert.equal(c.rarity, 'histIcon');
    assert.ok(c.ovr >= 88 && c.ovr <= 97, `${c.nick}: OVR ${c.ovr} fora da faixa`);
    assert.ok(c.teamOrigin.startsWith('hist-'), `${c.nick}: squad de época fora do namespace hist-`);
    for (const [k, v] of Object.entries(c.stats)) {
      assert.ok(v >= 1 && v <= 99, `${c.nick}.${k} = ${v}`);
    }
  }
  // determinístico
  assert.deepEqual(iconCards(), cards);
  // ninguém do dataset REAL 2026 (lendas ≠ elenco ativo)
  const activeIds = new Set(CS2_REAL_2026.flatMap((t) => t.players.map((p) => p.id)));
  for (const c of cards) assert.ok(!activeIds.has(c.playerId));
});

test('icons: catálogo completo carrega o panteão + raridade registrada', () => {
  const { catalog } = buildFullCatalog(CS2_REAL_2026, AUG26);
  const hist = catalog.filter((c) => c.rarity === 'histIcon');
  assert.equal(hist.length, ICONS.length);
  assert.equal(rarityInfo('histIcon').special, true);
  assert.equal(rarityInfo('totw').special, true);
});

test('totw: semana determinística, 7 únicos, boost aplicado no catálogo', () => {
  const { base, catalog } = buildFullCatalog(CS2_REAL_2026, AUG26);
  const w0 = totwForWeek(base, 0);
  assert.deepEqual(totwForWeek(base, 0), w0);                       // mesma semana = mesmo time
  assert.equal(w0.playerIds.length, TOTW_SIZE);
  assert.equal(new Set(w0.playerIds).size, TOTW_SIZE);
  assert.equal(w0.endsAt, weekEndMs(0));
  assert.ok(weekStartMs(0) < weekEndMs(0));
  // semanas diferentes divergem em algum ponto do mês
  const w1 = totwForWeek(base, 1);
  assert.notDeepEqual(w1.playerIds, w0.playerIds);
  // carta in-form existe no catálogo com +TOTW_BOOST sobre a base
  const baseOvr = new Map(base.map((c) => [c.playerId, c.ovr]));
  for (const pid of w0.playerIds) {
    const card = catalog.find((c) => c.key === `${pid}:totw`);
    assert.ok(card, `in-form ${pid} ausente do catálogo`);
    assert.equal(card!.ovr, Math.min(99, (baseOvr.get(pid) ?? 0) + TOTW_BOOST));
  }
});

test('totw: acúmulo mensal com dedup e época respeitada', () => {
  const { base } = buildFullCatalog(CS2_REAL_2026, AUG26);
  // julho/2026: nenhuma semana começa antes de 03/08 → zero specs
  assert.equal(totwSpecsThroughMonth(base, AUG26 - 1).length, 0);
  const aug = totwSpecsThroughMonth(base, AUG26);
  assert.ok(aug.length >= TOTW_SIZE, 'agosto tem ao menos a semana de estreia');
  assert.equal(new Set(aug.map((s) => s.playerId)).size, aug.length); // dedup
  // mês seguinte só ACRESCENTA (chaves estáveis — in-forms passadas continuam válidas)
  const sep = totwSpecsThroughMonth(base, AUG26 + 1);
  const augIds = new Set(aug.map((s) => s.playerId));
  assert.ok(sep.length >= aug.length);
  assert.ok(aug.every((s) => sep.some((x) => x.playerId === s.playerId)));
  assert.ok(augIds.size > 0);
});

test('sbc Panteão: 2 Ícones exatos viram lenda; specials e lendas barrados como insumo', () => {
  const { catalog } = buildFullCatalog(CS2_REAL_2026, AUG26);
  const def = sbcById('pantheon');
  assert.ok(def, 'SBC pantheon registrada');
  assert.equal(def!.reward.card, 'histIcon');
  const icons2 = catalog.filter((c) => c.rarity === 'icon').slice(0, 2);
  assert.equal(icons2.length, 2, 'catálogo tem ao menos 2 Ícones base');
  assert.equal(checkSbc(icons2, def!.req).ok, true);
  // insumo tier ≠ 7 barrado: special (tots, tier 8) e a própria lenda (tier 10)
  const tots = catalog.find((c) => c.rarity === 'tots')!;
  const hist = catalog.find((c) => c.rarity === 'histIcon')!;
  assert.equal(checkSbc([icons2[0], tots], def!.req).ok, false);
  assert.equal(checkSbc([icons2[0], hist], def!.req).ok, false);
  // pool da recompensa existe (as 31 lendas)
  assert.ok(catalog.filter((c) => c.rarity === def!.reward.card).length >= 25);
});

test('packs: Pacote Ícone garante histIcon; Pacote TOTW garante in-form', () => {
  const { catalog } = buildFullCatalog(CS2_REAL_2026, AUG26);
  for (let seed = 1; seed <= 20; seed++) {
    const iconPull = rollPack(catalog, ICON_PACK, makeRng(seed));
    assert.equal(iconPull.length, ICON_PACK.cards);
    assert.ok(iconPull.some((c) => c.rarity === 'histIcon'), `seed ${seed}: sem Ícone garantido`);
    const totwPull = rollPack(catalog, TOTW_PACK, makeRng(seed * 31));
    assert.equal(totwPull.length, TOTW_PACK.cards);
    assert.ok(totwPull.some((c) => c.rarity === 'totw'), `seed ${seed}: sem in-form garantido`);
    // lendas NÃO caem no pack TOTW (weights não têm histIcon)
    assert.ok(!totwPull.some((c) => c.rarity === 'histIcon'));
  }
});

test('eras: só squads 4+, contagem de completas exige TODOS os integrantes', async () => {
  const { iconEras, countCompletedEras, ICONS } = await import('../src/engine/ultimate/icons.ts');
  const eras = iconEras();
  assert.ok(eras.every((e) => e.size >= 4), 'era completável tem 4+ lendas');
  assert.ok(!eras.some((e) => e.eraId === 'hist-mibr06'), 'cogu solo não é era completável');
  assert.equal(countCompletedEras(new Set()), 0);
  // completa a NiP 2013 inteira = 1 era; faltando 1 integrante = 0
  const nip = ICONS.filter((d) => d.eraId === 'hist-nip13').map((d) => d.id);
  assert.equal(countCompletedEras(new Set(nip)), 1);
  assert.equal(countCompletedEras(new Set(nip.slice(1))), 0);
  // todas as eras = total
  assert.equal(countCompletedEras(new Set(ICONS.map((d) => d.id))), eras.length);
});
