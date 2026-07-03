// Ultimate Squad — suíte de regressão do engine PURO (packs, química, reducers,
// migração, SBC, daily). Complementa test-ultimate.mts com casos de borda e
// invariantes de economia. Determinística (makeRng), sem DOM/localStorage.
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACK_DEFS, PROMO_PACK, packById, rollPack } from '../src/engine/ultimate/packs.ts';
import { PROMO_BOOST, PROMO_EPOCH, PROMO_SIZE, PROMO_THEMES, monthEndMs, promoForMonth, promoSpecsThrough, themeForMonth } from '../src/engine/ultimate/promos.ts';
import { WEEKLY_PER_WEEK, WEEKLY_POOL, missionsForWeek, weekKey, weeklyProgress } from '../src/engine/ultimate/weeklyMissions.ts';
import { buildCatalog } from '../src/engine/ultimate/cards.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { rarityMatchesBucket, RARITIES, type UltRarity } from '../src/engine/ultimate/rarities.ts';
import { makeRng } from '../src/engine/rng.ts';
import { computeChemistry, type ChemNode, type ChemNodeCard } from '../src/engine/ultimate/chemistry.ts';
import { formationById } from '../src/engine/ultimate/formations.ts';
import type { UltCard } from '../src/engine/ultimate/cards.ts';
import {
  defaultUltimateState,
  addCredits,
  spendCredits,
  grantCard,
  claimDaily,
  applySeasonRollover,
  startSeason,
  gauntletStart,
  gauntletRecord,
  evolveCard,
  ensureWeekly,
  markWeeklyClaimed,
  markWeeklyBonusClaimed,
  markBazaarBought,
  migrateUltimate,
  countCopies,
  STARTING_CREDITS,
  STARTING_ELO,
  EVO_MAX,
  EVO_COSTS,
  GAUNTLET_TARGET,
} from '../src/engine/ultimate/state.ts';
import { computeNextDaily, dailyCredits, DAILY_TABLE } from '../src/engine/ultimate/daily.ts';
import { checkSbc } from '../src/engine/ultimate/sbc.ts';
import type { Role } from '../src/types.ts';

// ---------- helpers: catálogo sintético (controle total das raridades) ----------
function mkCard(o: Partial<UltCard> & { playerId: string }): UltCard {
  return {
    key: `${o.playerId}:${o.rarity ?? 'gold'}`, playerId: o.playerId, nick: o.playerId,
    country: 'br', region: 'samerica', role: 'Rifler', teamOrigin: 'furia', teamOriginName: 'FURIA',
    rarity: 'gold', ovr: 80, stats: { tiro: 80, mira: 80, reflexo: 80, visao: 80, clutch: 80, util: 80 }, ...o,
  };
}

// 4 cartas por raridade (playerIds distintos) — todo pool de pack fica não-vazio.
function syntheticCatalog(): UltCard[] {
  const rarities: UltRarity[] = ['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon', 'tots', 'major', 'promo'];
  const out: UltCard[] = [];
  for (const r of rarities) {
    for (let i = 0; i < 4; i++) {
      out.push(mkCard({ playerId: `${r}${i}`, rarity: r, ovr: RARITIES[r].ovrMin }));
    }
  }
  return out;
}

// ---------- packs ----------
test('rollPack: Pacote Ouro tem 7 cartas com 2 do bucket ouro garantidas', () => {
  const gold = packById('gold')!;
  assert.equal(gold.cards, 7);
  assert.deepEqual(gold.guaranteed, [{ bucket: 'gold', count: 2 }]);
  const cat = syntheticCatalog();
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const cards = rollPack(cat, gold, makeRng(seed));
    assert.equal(cards.length, 7, `seed ${seed}: 7 cartas`);
    const inGold = cards.filter((c) => rarityMatchesBucket(c.rarity, 'gold')).length;
    assert.ok(inGold >= 2, `seed ${seed}: ${inGold} >= 2 ouros`);
  }
});

test('rollPack: todo pack respeita tamanho + garantias no catálogo sintético', () => {
  const cat = syntheticCatalog();
  for (const pack of PACK_DEFS) {
    for (const seed of [3, 11, 500]) {
      const cards = rollPack(cat, pack, makeRng(seed));
      assert.equal(cards.length, pack.cards, `${pack.id} seed ${seed}: ${pack.cards} cartas`);
      for (const g of pack.guaranteed ?? []) {
        const n = cards.filter((c) => rarityMatchesBucket(c.rarity, g.bucket)).length;
        assert.ok(n >= g.count, `${pack.id} seed ${seed}: ${n} >= ${g.count} do bucket ${g.bucket}`);
      }
    }
    // mesma seed → mesmo pack (determinístico)
    assert.deepEqual(
      rollPack(cat, pack, makeRng(77)).map((c) => c.key),
      rollPack(cat, pack, makeRng(77)).map((c) => c.key),
      `${pack.id} determinístico`,
    );
  }
});

test('compra de pack debita EXATAMENTE o custo de PACK_DEFS', () => {
  for (const pack of PACK_DEFS) {
    const st = addCredits(defaultUltimateState(), 100000); // saldo folgado
    const r = spendCredits(st, pack.cost);
    assert.ok(r.ok, `${pack.id}: compra passa com saldo`);
    assert.equal(st.profile.credits - r.state.profile.credits, pack.cost, `${pack.id}: debitou ${pack.cost}`);
  }
});

// ---------- chemistry ----------
const REGIONS = ['samerica', 'europe', 'cis', 'asia', 'namerica'] as const;

function chemCard(o: Partial<ChemNodeCard> = {}): ChemNodeCard {
  return { teamOrigin: 'furia', region: 'samerica', country: 'br', role: 'Rifler', ...o };
}

test('computeChemistry: multiplicador SEMPRE em [0.90, 1.10] (fuzz semeado)', () => {
  const form = formationById('standard');
  const roles = form.slots.map((s) => s.role);
  const rng = makeRng(2026);
  const rolePool: Role[] = ['AWP', 'Entry', 'Rifler', 'Lurker', 'Support', 'IGL'];
  for (let it = 0; it < 200; it++) {
    const nodes: ChemNode[] = roles.map((role, i) => ({
      slot: i, slotRole: role,
      card: rng() < 0.15 ? null : chemCard({
        teamOrigin: `org${Math.floor(rng() * 4)}`,
        region: REGIONS[Math.floor(rng() * REGIONS.length)],
        country: `c${Math.floor(rng() * 4)}`,
        role: rolePool[Math.floor(rng() * rolePool.length)],
      }),
    }));
    const res = computeChemistry(form.adjacency, nodes);
    assert.ok(res.multiplier >= 0.9 - 1e-9 && res.multiplier <= 1.1 + 1e-9, `it ${it}: mult ${res.multiplier}`);
    assert.ok(res.total >= 0 && res.total <= 15, `it ${it}: total ${res.total}`);
  }
});

test('computeChemistry: aresta pontua +1 org, +0.5 região, +0.5 país (como documentado)', () => {
  const pair = (a: ChemNodeCard, b: ChemNodeCard) => {
    const nodes: ChemNode[] = [
      { slot: 0, slotRole: 'Rifler', card: a },
      { slot: 1, slotRole: 'Rifler', card: b },
    ];
    return computeChemistry([[0, 1]], nodes).edges[0].score;
  };
  const base = chemCard();
  // tudo igual: 1 + 0.5 + 0.5 = 2 (teto da aresta)
  assert.equal(pair(base, chemCard()), 2);
  // só org (região+país distintos)
  assert.equal(pair(base, chemCard({ region: 'europe', country: 'de' })), 1);
  // só região
  assert.equal(pair(base, chemCard({ teamOrigin: 'navi', country: 'ar' })), 0.5);
  // só país
  assert.equal(pair(base, chemCard({ teamOrigin: 'navi', region: 'europe' })), 0.5);
  // nada em comum
  assert.equal(pair(base, chemCard({ teamOrigin: 'navi', region: 'europe', country: 'de' })), 0);
  // aresta com slot vazio = 0
  const half: ChemNode[] = [{ slot: 0, slotRole: 'Rifler', card: base }, { slot: 1, slotRole: 'Rifler', card: null }];
  assert.equal(computeChemistry([[0, 1]], half).edges[0].score, 0);
});

// ---------- state reducers ----------
test('spendCredits insuficiente: ok=false e devolve o MESMO estado (sem mutação)', () => {
  const st = defaultUltimateState();
  const bad = spendCredits(st, STARTING_CREDITS + 1);
  assert.equal(bad.ok, false);
  assert.equal(bad.state, st); // referência intacta — no-op de verdade
  assert.equal(st.profile.credits, STARTING_CREDITS);
  // exato no limite passa e zera
  const edge = spendCredits(st, STARTING_CREDITS);
  assert.ok(edge.ok);
  assert.equal(edge.state.profile.credits, 0);
});

test('grantCard: imutável, conta cópias e numera serial por cardKey', () => {
  const s0 = defaultUltimateState();
  const s1 = grantCard(s0, 'p1:gold', 'pack', { id: 'a', at: 1 });
  const s2 = grantCard(s1, 'p1:gold', 'daily', { id: 'b', at: 2 });
  assert.equal(s0.inventory.length, 0); // original intacto
  assert.equal(countCopies(s2, 'p1:gold'), 2);
  assert.equal(s2.inventory.find((o) => o.id === 'b')!.serial, 2);
  assert.equal(s2.inventory.find((o) => o.id === 'b')!.acquiredVia, 'daily');
  assert.equal(s2.inventory.find((o) => o.id === 'b')!.locked, null);
});

test('claimDaily: mesmo dia não duplica; gap reseta streak; dia 7 volta pro 1', () => {
  // mesmo dia → 2º claim falha e não paga de novo
  let st = defaultUltimateState();
  st = claimDaily(st, '2026-07-01').state;
  const credits1 = st.profile.credits;
  const dup = claimDaily(st, '2026-07-01');
  assert.equal(dup.result.claimed, false);
  assert.equal(dup.state.profile.credits, credits1);
  assert.equal(dup.state.profile.daily.streakDay, 1);
  // gap (>1 dia) → reseta pro dia 1 com flag wasReset
  let gap = defaultUltimateState();
  gap = { ...gap, profile: { ...gap.profile, daily: { lastClaim: '2026-06-25', streakDay: 4 } } };
  const rGap = claimDaily(gap, '2026-07-01');
  assert.ok(rGap.result.claimed && rGap.result.wasReset);
  assert.equal(rGap.result.day, 1);
  assert.equal(rGap.result.credits, DAILY_TABLE[0].credits);
  // dia 7 ontem → hoje dá a volta pro dia 1 (sem reset)
  let wrap = defaultUltimateState();
  wrap = { ...wrap, profile: { ...wrap.profile, daily: { lastClaim: '2026-06-30', streakDay: 7 } } };
  const rWrap = claimDaily(wrap, '2026-07-01');
  assert.ok(rWrap.result.claimed && !rWrap.result.wasReset);
  assert.equal(rWrap.result.day, 1);
  assert.equal(rWrap.state.profile.daily.streakDay, 1);
});

test('applySeasonRollover: soft-reset 1000+(elo-1000)*0.5 (acima E abaixo de 1000)', () => {
  const roll = (elo: number) => {
    const base = defaultUltimateState();
    const st = { ...base, profile: { ...base.profile, elo, peakElo: Math.max(elo, 1000), w: 2, streak: 4, season: startSeason(0, 0, elo) } };
    return applySeasonRollover(st, st.profile.season!.endsAt + 1);
  };
  const up = roll(1800);
  assert.ok(up.result.rolled);
  assert.equal(up.state.profile.elo, 1400); // 1000 + 800*0.5
  assert.equal(up.state.profile.streak, 0); // sequência zera
  const down = roll(800);
  assert.equal(down.state.profile.elo, 900); // soft-reset também PUXA quem está abaixo
  const flat = roll(1000);
  assert.equal(flat.state.profile.elo, 1000);
});

test('gauntletStart: 1 run por dia; dia novo abre run zerado preservando best', () => {
  let s = gauntletStart(defaultUltimateState(), 'D1');
  s = gauntletRecord(s, true).state;
  s = gauntletRecord(s, false).state; // encerra com best=1
  assert.equal(gauntletStart(s, 'D1'), s); // mesmo dia → no-op (não re-abre)
  const s2 = gauntletStart(s, 'D2');
  assert.ok(s2.profile.gauntlet.active);
  assert.equal(s2.profile.gauntlet.wins, 0);
  assert.equal(s2.profile.gauntlet.best, 1); // best sobrevive ao dia novo
});

test('gauntletRecord: derrota encerra; run inativo devolve advanced=false (não paga)', () => {
  let s = gauntletStart(defaultUltimateState(), 'D1');
  const loss = gauntletRecord(s, true);
  s = loss.state;
  const over = gauntletRecord(s, false);
  assert.ok(over.over && !over.completed && over.advanced);
  s = over.state;
  assert.equal(s.profile.gauntlet.active, false);
  // run já encerrado → advanced=false e estado intacto
  const dead = gauntletRecord(s, true);
  assert.equal(dead.advanced, false);
  assert.equal(dead.state, s);
  assert.equal(dead.state.profile.gauntlet.wins, 1); // vitória fantasma NÃO conta
  // completar exige exatamente GAUNTLET_TARGET vitórias
  let t = gauntletStart(defaultUltimateState(), 'D2');
  for (let i = 0; i < GAUNTLET_TARGET - 1; i++) {
    const r = gauntletRecord(t, true);
    assert.ok(!r.over, `vitória ${i + 1} não encerra`);
    t = r.state;
  }
  const fim = gauntletRecord(t, true);
  assert.ok(fim.completed && fim.over);
});

test('evolveCard: debita EVO_COSTS[boost], respeita EVO_MAX e não evolui sem saldo', () => {
  let s = addCredits(grantCard(defaultUltimateState(), 'p1:gold', 'pack', { id: 'c1' }), 200000);
  let gasto = 0;
  for (let b = 0; b < EVO_MAX; b++) {
    const r = evolveCard(s, 'c1');
    assert.ok(r.ok && r.cost === EVO_COSTS[b] && r.newBoost === b + 1);
    gasto += EVO_COSTS[b];
    s = r.state;
  }
  assert.equal(s.profile.credits, STARTING_CREDITS + 200000 - gasto); // soma exata dos 3 níveis
  assert.equal(s.inventory[0].boost, EVO_MAX);
  assert.equal(evolveCard(s, 'c1').reason, 'maxed'); // teto
  // sem saldo: falha sem debitar nem subir boost
  const broke = grantCard(spendCredits(defaultUltimateState(), STARTING_CREDITS).state, 'p2:gold', 'pack', { id: 'c2' });
  const r = evolveCard(broke, 'c2');
  assert.equal(r.reason, 'insufficient');
  assert.equal(r.state.profile.credits, 0);
  assert.equal(r.state.inventory[0].boost, undefined);
});

// ---------- migrateUltimate ----------
test('migrateUltimate: entrada lixo NUNCA lança e sempre produz estado válido', () => {
  const garbage: unknown[] = [
    null, undefined, 42, 'lixo', true, [], () => 0,
    { profile: 'nope' },
    { profile: { credits: 'muito', elo: NaN, daily: 7, titles: 'x', season: { startedAt: 'ontem' } } },
    { inventory: 'não é array' },
    { inventory: [null, 42, { id: 7, cardKey: 'p:gold' }, { id: 'ok' }] }, // todas inválidas
    { squads: [null, 'x', { name: 'sem id' }, { id: 'q', slots: 'nope' }] },
    { squads: [{ id: 'q', slots: [{ slot: 'zero' }, null] }] },
    { inventory: [{ id: 'a', cardKey: 'p:gold', boost: Infinity }] },
  ];
  const dflt = defaultUltimateState();
  for (const raw of garbage) {
    const m = migrateUltimate(raw); // não pode lançar
    assert.equal(typeof m.profile.credits, 'number');
    assert.ok(Number.isFinite(m.profile.elo));
    assert.ok(Array.isArray(m.inventory) && Array.isArray(m.squads) && Array.isArray(m.profile.titles));
    assert.equal(typeof m.profile.daily.streakDay, 'number');
    for (const sq of m.squads) assert.ok(Array.isArray(sq.slots)); // slots sempre iteráveis
    for (const o of m.inventory) assert.ok(o.boost === undefined || (o.boost >= 1 && o.boost <= EVO_MAX));
  }
  assert.deepEqual(migrateUltimate('lixo'), dflt);
});

test('migrateUltimate: save válido preserva credits, inventário e daily', () => {
  const save = {
    version: 1,
    profile: {
      credits: 123456, elo: 1420, peakElo: 1500, w: 10, l: 3, streak: 2,
      daily: { lastClaim: '2026-06-30', streakDay: 5 },
    },
    inventory: [
      { id: 'a', cardKey: 'p1:gold', serial: 1, acquiredVia: 'pack', acquiredAt: 10, locked: null },
      { id: 'b', cardKey: 'p2:elite', serial: 1, acquiredVia: 'sbc', acquiredAt: 20, locked: null, boost: 2 },
    ],
  };
  const m = migrateUltimate(save);
  assert.equal(m.profile.credits, 123456);
  assert.equal(m.profile.elo, 1420);
  assert.deepEqual(m.profile.daily, { lastClaim: '2026-06-30', streakDay: 5 });
  assert.equal(m.inventory.length, 2);
  assert.equal(m.inventory.find((o) => o.id === 'b')!.boost, 2);
  assert.equal(m.inventory.find((o) => o.id === 'b')!.acquiredVia, 'sbc');
});

// ---------- SBC ----------
test('checkSbc: aceita/recusa por país, org e OVR médio', () => {
  const br = (id: string, ovr = 80) => mkCard({ playerId: id, ovr, country: 'br' });
  // mesmo país, média 80 ≥ 78 → passa
  const ok = checkSbc([br('a'), br('b'), br('c'), br('d'), br('e')], { count: 5, sameCountry: true, minOvrAvg: 78 });
  assert.ok(ok.ok);
  // um gringo no meio → recusa por país
  const gringo = checkSbc([br('a'), br('b'), br('c'), br('d'), mkCard({ playerId: 'e', country: 'dk' })], { count: 5, sameCountry: true, minOvrAvg: 78 });
  assert.ok(!gringo.ok);
  assert.ok(gringo.items.some((i) => i.label === 'mesmo país' && !i.ok));
  // média 77.8 < 78 → recusa por OVR (checa a MÉDIA, não o mínimo)
  const low = checkSbc([br('a', 74), br('b', 74), br('c', 74), br('d', 74), br('e', 93)], { count: 5, sameCountry: true, minOvrAvg: 78 });
  assert.ok(!low.ok);
  assert.ok(low.items.some((i) => i.label.startsWith('OVR médio') && !i.ok));
  // org diferente → recusa; itens da checklist apontam qual falhou
  const orgs = checkSbc([mkCard({ playerId: 'a' }), mkCard({ playerId: 'b', teamOrigin: 'navi' })], { count: 2, sameOrg: true });
  assert.ok(!orgs.ok);
  assert.ok(orgs.items.some((i) => i.label === 'mesma organização' && !i.ok));
});

// ---------- daily (função pura) ----------
test('computeNextDaily cobre os 3 ramos: mesmo dia, ontem (+1), gap (reset)', () => {
  // ramo 1: mesmo dia (diff<=0) → não pode; relógio recuado idem
  assert.equal(computeNextDaily(2, '2026-07-01', '2026-07-01').canClaim, false);
  assert.equal(computeNextDaily(2, '2026-07-02', '2026-07-01').canClaim, false); // relógio voltou
  // ramo 2: ontem → streak+1 (e 7 dá a volta pro 1)
  assert.deepEqual(computeNextDaily(2, '2026-06-30', '2026-07-01'), { canClaim: true, day: 3, wasReset: false });
  assert.deepEqual(computeNextDaily(7, '2026-06-30', '2026-07-01'), { canClaim: true, day: 1, wasReset: false });
  // ramo 3: gap > 1 dia → reset pro dia 1
  assert.deepEqual(computeNextDaily(6, '2026-06-20', '2026-07-01'), { canClaim: true, day: 1, wasReset: true });
  // tabela: credits crescem dia a dia e dailyCredits clampa fora da faixa
  for (let d = 2; d <= 7; d++) assert.ok(dailyCredits(d) > dailyCredits(d - 1));
  assert.equal(dailyCredits(0), DAILY_TABLE[0].credits);
  assert.equal(dailyCredits(99), DAILY_TABLE[6].credits);
});

// ---------- promos mensais ----------
test('promoForMonth: determinística por mês, 11 jogadores do tema com +2 de boost', () => {
  const base = buildCatalog(CS2_REAL_2026);
  const mi = PROMO_EPOCH; // julho/2026, mês de estreia
  const a = promoForMonth(base, mi);
  const b = promoForMonth(base, mi);
  assert.deepEqual(a.playerIds, b.playerIds); // mesma seed → mesma promo
  assert.equal(a.playerIds.length, PROMO_SIZE);
  assert.equal(new Set(a.playerIds).size, PROMO_SIZE); // 11 jogadores DISTINTOS
  assert.equal(a.theme, themeForMonth(mi));
  for (const s of a.specs) {
    assert.equal(s.rarity, 'promo');
    assert.equal(s.ovrBoost, PROMO_BOOST);
    // todo promovido de fato pertence ao tema do mês
    const card = base.find((c) => c.playerId === s.playerId)!;
    assert.ok(a.theme.filter(card), `${s.playerId} bate o tema ${a.theme.id}`);
  }
  // mês seguinte → tema rotaciona e o elenco muda
  const next = promoForMonth(base, mi + 1);
  assert.notEqual(next.theme.id, a.theme.id);
  assert.notDeepEqual(next.playerIds, a.playerIds);
  // fim do mês = 00:00 do dia 1 do mês seguinte
  assert.equal(monthEndMs(2026 * 12 + 6), new Date(2026, 7, 1).getTime());
  assert.equal(PROMO_THEMES.length >= 2, true);
});

test('promoSpecsThrough: acumula meses passados sem duplicar jogador (chaves estáveis)', () => {
  const base = buildCatalog(CS2_REAL_2026);
  const specs = promoSpecsThrough(base, PROMO_EPOCH + 3); // 4 meses de promo
  assert.ok(specs.length > PROMO_SIZE); // acumulou mais de um mês
  assert.equal(new Set(specs.map((s) => s.playerId)).size, specs.length); // dedup
  // toda promo do mês corrente está presente (inventário antigo E pack novo resolvem)
  const cur = promoForMonth(base, PROMO_EPOCH + 3);
  const ids = new Set(specs.map((s) => s.playerId));
  for (const id of cur.playerIds) assert.ok(ids.has(id));
  // catálogo montado com os specs resolve a chave `${playerId}:promo`
  const cat = buildCatalog(CS2_REAL_2026, specs);
  const promoCards = cat.filter((c) => c.rarity === 'promo');
  assert.equal(promoCards.length, specs.length);
});

test('Pacote Promo: 25k, só via packById, garante 1 carta promo', () => {
  assert.equal(PROMO_PACK.cost, 25000);
  assert.equal(packById('promo'), PROMO_PACK);
  assert.ok(!PACK_DEFS.some((p) => p.id === 'promo')); // fora da grade fixa da Loja
  const cat = syntheticCatalog();
  for (const seed of [1, 42, 999]) {
    const cards = rollPack(cat, PROMO_PACK, makeRng(seed));
    assert.equal(cards.length, PROMO_PACK.cards);
    assert.ok(cards.some((c) => c.rarity === 'promo'), `seed ${seed}: 1 promo garantida`);
    // a garantia 'special' do Promo NUNCA cai em tots/major (weights só têm promo)
    assert.ok(!cards.some((c) => c.rarity === 'tots' || c.rarity === 'major'), `seed ${seed}: sem tots/major`);
  }
});

// ---------- missões semanais ----------
test('weekKey: semana ISO no fuso local (segunda vira a semana; W53 em ano longo)', () => {
  assert.equal(weekKey(new Date(2026, 6, 3)), '2026-W27');  // sexta 3/jul
  assert.equal(weekKey(new Date(2026, 6, 5)), '2026-W27');  // domingo ainda é W27
  assert.equal(weekKey(new Date(2026, 6, 6)), '2026-W28');  // segunda vira
  assert.equal(weekKey(new Date(2026, 0, 1)), '2026-W01');  // 1/jan/2026 é quinta → W01
  assert.equal(weekKey(new Date(2027, 0, 1)), '2026-W53');  // 1/jan/2027 pertence à W53 de 2026
});

test('missionsForWeek: determinística por semana, 3 missões distintas do pool', () => {
  const a = missionsForWeek('2026-W27');
  assert.deepEqual(a.map((m) => m.id), missionsForWeek('2026-W27').map((m) => m.id));
  assert.equal(a.length, WEEKLY_PER_WEEK);
  assert.equal(new Set(a.map((m) => m.id)).size, WEEKLY_PER_WEEK);
  for (const m of a) assert.ok(WEEKLY_POOL.some((p) => p.id === m.id));
  // semanas diferentes tendem a sortear conjuntos diferentes (ao menos uma destas difere)
  const weeks = ['2026-W27', '2026-W28', '2026-W29', '2026-W30'];
  const sets = weeks.map((w) => missionsForWeek(w).map((m) => m.id).join(','));
  assert.ok(new Set(sets).size > 1);
});

test('ensureWeekly: abre a semana com baseline; semana nova reseta; mesma semana é no-op', () => {
  let s = defaultUltimateState();
  s = { ...s, profile: { ...s.profile, w: 4, l: 2, packSeedCounter: 3, bazaarBuys: 1 } };
  const w1 = ensureWeekly(s, '2026-W27');
  assert.deepEqual(w1.profile.weekly, { week: '2026-W27', base: { w: 4, l: 2, packs: 3, sbc: 0, bazaar: 1 }, claimed: [], bonusClaimed: false });
  assert.equal(ensureWeekly(w1, '2026-W27'), w1); // mesma semana → referência intacta
  // progride e resgata; a semana seguinte zera claims/bonus e re-baselina
  let s2 = { ...w1, profile: { ...w1.profile, w: 11 } };
  s2 = markWeeklyClaimed(s2, 'w-win7');
  s2 = markWeeklyBonusClaimed(s2);
  assert.ok(s2.profile.weekly!.claimed.includes('w-win7') && s2.profile.weekly!.bonusClaimed);
  const w2 = ensureWeekly(s2, '2026-W28');
  assert.equal(w2.profile.weekly!.week, '2026-W28');
  assert.deepEqual(w2.profile.weekly!.claimed, []);
  assert.equal(w2.profile.weekly!.bonusClaimed, false);
  assert.equal(w2.profile.weekly!.base.w, 11); // baseline novo = contadores atuais
});

test('markWeeklyClaimed/BonusClaimed: idempotentes (2º resgate é no-op)', () => {
  const s = ensureWeekly(defaultUltimateState(), '2026-W27');
  const once = markWeeklyClaimed(s, 'w-win7');
  assert.equal(markWeeklyClaimed(once, 'w-win7'), once); // referência intacta
  assert.deepEqual(once.profile.weekly!.claimed, ['w-win7']);
  const bonus = markWeeklyBonusClaimed(once);
  assert.equal(markWeeklyBonusClaimed(bonus), bonus);
  // sem semana aberta → no-op
  const empty = defaultUltimateState();
  assert.equal(markWeeklyClaimed(empty, 'w-win7'), empty);
  assert.equal(markWeeklyBonusClaimed(empty), empty);
});

test('weeklyProgress + bazaarBuys: progresso vem dos contadores menos o baseline', () => {
  const def = WEEKLY_POOL.find((m) => m.id === 'w-bazaar3')!;
  assert.deepEqual(weeklyProgress(def, { winsWeek: 0, matchesWeek: 0, packsWeek: 0, sbcWeek: 0, bazaarWeek: 2 }), { value: 2, done: false, pct: 67 });
  assert.ok(weeklyProgress(def, { winsWeek: 0, matchesWeek: 0, packsWeek: 0, sbcWeek: 0, bazaarWeek: 3 }).done);
  // markBazaarBought incrementa o acumulado que alimenta a métrica
  let s = ensureWeekly(defaultUltimateState(), '2026-W27');
  s = markBazaarBought(s, 100, 'l1');
  s = markBazaarBought(s, 101, 'l2'); // dia novo zera o bucket, mas NÃO o acumulado
  assert.equal(s.profile.bazaarBuys, 2);
  assert.deepEqual(s.profile.bazaarBought, { day: 101, ids: ['l2'] });
});

test('migrateUltimate: backfill de weekly=null e bazaarBuys=0 em save antigo', () => {
  const old = { version: 1, profile: { credits: 500, missions: { day: '2026-07-01', base: { w: 0, l: 0, packs: 0, sbc: 0 }, claimed: [] } } };
  const m = migrateUltimate(old);
  assert.equal(m.profile.weekly, null);
  assert.equal(m.profile.bazaarBuys, 0);
  // weekly válido sobrevive à migração
  const withWeekly = { version: 1, profile: { weekly: { week: '2026-W27', base: { w: 1, l: 0, packs: 2, sbc: 0, bazaar: 1 }, claimed: ['w-win7'], bonusClaimed: true }, bazaarBuys: 3 } };
  const m2 = migrateUltimate(withWeekly);
  assert.deepEqual(m2.profile.weekly, { week: '2026-W27', base: { w: 1, l: 0, packs: 2, sbc: 0, bazaar: 1 }, claimed: ['w-win7'], bonusClaimed: true });
  assert.equal(m2.profile.bazaarBuys, 3);
});
