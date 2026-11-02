// [URG-1] Edição da temporada: +OVR só enquanto season.n === ed, rollover conta
// quem virou Legado, Pacote da Temporada carimba todas, 10% determinístico por
// seed em pacote comum, e o normalize aceita/ignora `ed` inválido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/rng.ts';
import { buildCatalog } from '../src/engine/ultimate/cards.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { PACK_DEFS, rollPack } from '../src/engine/ultimate/packs.ts';
import { packOdds } from '../src/engine/ultimate/packOdds.ts';
import {
  applyEditionBoost, countEditionCards, editionBoost, editionLabel, editionStatus, normalizeEdition,
  SEASON_EDITION_BOOST, SEASON_EDITION_CHANCE, SEASON_PACK, seasonEnding, stampPackEditions,
} from '../src/engine/ultimate/seasonEdition.ts';
import { applySeasonRollover, defaultUltimateState, grantCard, migrateUltimate, startSeason, type OwnedCard } from '../src/engine/ultimate/state.ts';

const catalog = buildCatalog(CS2_REAL_2026);
const T0 = Date.UTC(2026, 8, 14);
const DAY = 86400000;

test('boost só quando ed === season.n; antes/depois é Legado ou nada', () => {
  assert.equal(editionBoost({ ed: 3 }, 3), SEASON_EDITION_BOOST);
  assert.equal(editionBoost({ ed: 3 }, 4), 0);
  assert.equal(editionBoost({ ed: 3 }, 2), 0);
  assert.equal(editionBoost({}, 3), 0);
  assert.equal(editionBoost({ ed: 3 }, undefined), 0);
  assert.equal(editionStatus({ ed: 3 }, 3), 'current');
  assert.equal(editionStatus({ ed: 3 }, 4), 'legacy');
  assert.equal(editionStatus({}, 4), null);
  assert.equal(editionLabel(3), 'S3');
  const base = catalog[0];
  const up = applyEditionBoost(base, { ed: 3 }, 3);
  assert.equal(up.ovr, Math.min(99, base.ovr + SEASON_EDITION_BOOST));
  assert.equal(up.stats.mira, Math.min(99, base.stats.mira + SEASON_EDITION_BOOST));
  assert.equal(up.key, base.key); // mesma carta, só os números sobem
  assert.strictEqual(applyEditionBoost(base, { ed: 3 }, 4), base); // Legado: base intacta (mesma referência)
});

test('rollover conta as cartas que viraram Legado e abre a edição seguinte', () => {
  let st = defaultUltimateState();
  st = { ...st, profile: { ...st.profile, season: startSeason(T0, 0, 1000, 3), w: 1 } };
  st = grantCard(st, catalog[0].key, 'pack', { at: T0, ed: 3 });
  st = grantCard(st, catalog[1].key, 'pack', { at: T0, ed: 3 });
  st = grantCard(st, catalog[2].key, 'pack', { at: T0, ed: 2 }); // já era Legado
  st = grantCard(st, catalog[3].key, 'pack', { at: T0 });        // comum
  assert.equal(countEditionCards(st.inventory, 3), 2);
  // ainda dentro da temporada: nada rola
  const same = applySeasonRollover(st, T0 + DAY);
  assert.equal(same.result.rolled, false);
  assert.equal(same.result.legacyCount, 0);
  // virou: 2 cópias perdem o +OVR, o inventário NÃO é reescrito (ed fica)
  const r = applySeasonRollover(st, st.profile.season!.endsAt + 1);
  assert.equal(r.result.rolled, true);
  assert.equal(r.result.legacyCount, 2);
  assert.equal(r.result.prevN, 3);
  assert.equal(r.result.newN, 4);
  assert.equal(r.state.profile.season?.n, 4);
  assert.deepEqual(r.state.inventory.map((o) => o.ed), [3, 3, 2, undefined]);
  assert.equal(countEditionCards(r.state.inventory, 4), 0);
  assert.equal(editionStatus(r.state.inventory[0], r.state.profile.season?.n), 'legacy');
});

test('Pacote da Temporada: 7 cartas, 2 Ouro+ garantidas, TODAS com ed = season.n', () => {
  assert.equal(SEASON_PACK.cards, 7);
  const odds = packOdds(SEASON_PACK);
  assert.deepEqual(odds.guaranteed.map((g) => [g.bucket, g.count]), [['gold', 2]]);
  assert.ok(SEASON_PACK.cost >= 14000 && SEASON_PACK.cost <= 25000, 'custo entre o Ouro e o Promo');
  const rng = makeRng(42);
  const cards = rollPack(catalog, SEASON_PACK, rng);
  assert.equal(cards.length, 7);
  const eds = stampPackEditions(cards.length, rng, 3, true);
  assert.deepEqual(eds, [3, 3, 3, 3, 3, 3, 3]);
  // pelo grantCard o campo chega no inventário
  let st = defaultUltimateState();
  cards.forEach((c, i) => { st = grantCard(st, c.key, 'pack', { at: T0, ed: eds[i] }); });
  assert.equal(st.inventory.length, 7);
  assert.ok(st.inventory.every((o) => o.ed === 3));
});

test('pacote comum: 10% por carta, determinístico pelo seed, e ~10% no agregado', () => {
  assert.equal(SEASON_EDITION_CHANCE, 0.10);
  const gold = PACK_DEFS.find((p) => p.id === 'gold')!;
  const roll = (seed: number) => {
    const rng = makeRng(seed);
    const cards = rollPack(catalog, gold, rng);
    return stampPackEditions(cards.length, rng, 3, false);
  };
  assert.deepEqual(roll(7), roll(7)); // mesmo seed ⇒ mesmo carimbo
  assert.ok(roll(7).every((e) => e === undefined || e === 3));
  // sem temporada aberta ninguém recebe carimbo (e o rng ainda anda 1× por carta)
  assert.deepEqual(stampPackEditions(3, makeRng(1), undefined, false), [undefined, undefined, undefined]);
  assert.deepEqual(stampPackEditions(3, makeRng(1), undefined, true), [undefined, undefined, undefined]);
  // agregado em 4000 cartas: fica perto de 10% (tolerância folgada, é um teste de sanidade)
  let hits = 0; let total = 0;
  for (let seed = 1; seed <= 4000 / gold.cards; seed++) {
    for (const e of roll(seed)) { total++; if (e === 3) hits++; }
  }
  const p = hits / total;
  assert.ok(p > 0.07 && p < 0.13, `proporção ${p.toFixed(3)} longe de 0,10`);
});

test('normalize: aceita ed inteiro ≥ 1 e ignora lixo; save antigo sem ed fica igual', () => {
  assert.equal(normalizeEdition(3), 3);
  assert.equal(normalizeEdition(0), undefined);
  assert.equal(normalizeEdition(-1), undefined);
  assert.equal(normalizeEdition(2.5), undefined);
  assert.equal(normalizeEdition('3'), undefined);
  assert.equal(normalizeEdition(NaN), undefined);
  assert.equal(normalizeEdition(undefined), undefined);
  const mk = (id: string, ed: unknown): OwnedCard => ({ id, cardKey: catalog[0].key, acquiredVia: 'pack', acquiredAt: T0, locked: null, ...(ed !== undefined ? { ed: ed as number } : {}) });
  const raw = {
    version: 1,
    profile: { ...defaultUltimateState().profile, season: startSeason(T0, 0, 1000, 3) },
    inventory: [mk('a', 3), mk('b', '3'), mk('c', 0), mk('d', undefined), mk('e', 1.5)],
    squads: [],
  };
  const st = migrateUltimate(raw);
  assert.deepEqual(st.inventory.map((o) => o.ed), [3, undefined, undefined, undefined, undefined]);
  assert.equal(st.profile.season?.n, 3);
  // grantCard também saneia o ed que recebe
  const g = grantCard(defaultUltimateState(), catalog[0].key, 'pack', { at: T0, ed: -2 });
  assert.equal(g.inventory[0].ed, undefined);
  assert.equal('ed' in g.inventory[0], false);
});

test('seasonEnding: contador e o que o jogador vai perder', () => {
  const season = startSeason(T0, 0, 1000, 3); // 30 dias
  const inv = [{ ed: 3 }, { ed: 3 }, { ed: 2 }, {}];
  const e = seasonEnding(season, inv, T0 + 27 * DAY + 5 * 3_600_000); // faltam 2d 19h
  assert.equal(e.active, true);
  assert.equal(e.dd, 2);
  assert.equal(e.hh, 19);
  assert.equal(e.days, 3);
  assert.equal(e.losing, 2);
  assert.equal(e.seasonN, 3);
  const over = seasonEnding(season, inv, season.endsAt + 1);
  assert.equal(over.active, false);
  assert.equal(over.msLeft, 0);
  assert.equal(seasonEnding(null, inv, T0).active, false);
});
