// P0 Ultimate Squad — testa o núcleo puro (rarities, cards, quicksell, state).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rarityFromOvr, rarityInfo, RARITIES } from '../src/engine/ultimate/rarities.ts';
import {
  deriveStats,
  buildCatalog,
  catalogIndex,
  estimateCardValue,
  baseCardForPlayer,
  type UltCard,
} from '../src/engine/ultimate/cards.ts';
import { quickSellValue } from '../src/engine/ultimate/quicksell.ts';
import { PACK_DEFS, rollPack, packById } from '../src/engine/ultimate/packs.ts';
import { makeRng } from '../src/engine/rng.ts';
import { rarityMatchesBucket } from '../src/engine/ultimate/rarities.ts';
import { computeChemistry, roleFitsSlot, type ChemNode } from '../src/engine/ultimate/chemistry.ts';
import { formationById, formationSlotRoles } from '../src/engine/ultimate/formations.ts';
import { ensureSquad, setSlot, setFormation, activeSquad, computeMatchOutcome, applyMatchResult, claimDaily, mergeTitles, equipTitle, sellCard } from '../src/engine/ultimate/state.ts';
import { computeNextDaily } from '../src/engine/ultimate/daily.ts';
import { evaluateTitles } from '../src/engine/ultimate/titles.ts';
import { pickStarterCards } from '../src/engine/ultimate/cards.ts';
import { formationSlotRoles as slotRoles } from '../src/engine/ultimate/formations.ts';
import { checkSbc } from '../src/engine/ultimate/sbc.ts';
import { buildAiLadder, buildBazaar } from '../src/engine/ultimate/bazaar.ts';
import { applySeasonRollover, removeOwnedCards, markObjectiveClaimed, evolveCard, EVO_MAX, EVO_COSTS, claimSeasonReward, startSeason, STARTING_ELO, gauntletStart, gauntletRecord, pushHistory, markBazaarBought, ensureMissions, markMissionClaimed, HISTORY_MAX, type MatchRecord } from '../src/engine/ultimate/state.ts';
import { missionsForDay, missionProgress, MISSIONS_PER_DAY, MISSION_POOL } from '../src/engine/ultimate/missions.ts';
import { distinctPlayers } from '../src/engine/ultimate/sbc.ts';
import { evaluateSeasonTiers, seasonTierById } from '../src/engine/ultimate/seasonRewards.ts';
import { divisionFor, divisionChange, DIVISIONS, DIV_TIERS } from '../src/engine/ultimate/divisions.ts';
import { evaluateObjectives, objectiveById, OBJECTIVES } from '../src/engine/ultimate/objectives.ts';
import {
  defaultUltimateState,
  grantCard,
  sellCard,
  spendCredits,
  addCredits,
  countCopies,
  migrateUltimate,
  STARTING_CREDITS,
} from '../src/engine/ultimate/state.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player, Role } from '../src/types.ts';

function mkPlayer(o: Partial<Player> & { id: string; role: Role }): Player {
  return { id: o.id, nick: o.id, name: o.id, country: o.country ?? 'br', role: o.role, aim: 80, clutch: 80, consistency: 80, awp: 60, igl: 60, ...o };
}

// ---------- rarities ----------
test('rarityFromOvr respeita as faixas + clampa as bordas', () => {
  assert.equal(rarityFromOvr(67), 'bronze');
  assert.equal(rarityFromOvr(68), 'silver');
  assert.equal(rarityFromOvr(74), 'gold');
  assert.equal(rarityFromOvr(80), 'rareGold');
  assert.equal(rarityFromOvr(84), 'elite');
  assert.equal(rarityFromOvr(88), 'legendary');
  assert.equal(rarityFromOvr(92), 'icon');
  assert.equal(rarityFromOvr(999), 'icon');
  assert.equal(rarityFromOvr(-5), 'bronze');
});

test('rarityFromOvr nunca devolve special', () => {
  for (let o = 1; o <= 99; o++) assert.equal(rarityInfo(rarityFromOvr(o)).special, false);
});

// ---------- cards ----------
test('deriveStats clampa [1,99] e AWP puxa tiro pelo atributo awp', () => {
  const awper = mkPlayer({ id: 'a', role: 'AWP', aim: 70, awp: 95 });
  const s = deriveStats(awper);
  for (const v of Object.values(s)) { assert.ok(v >= 1 && v <= 99); }
  assert.equal(s.tiro, 95); // max(aim, awp)
});

test('buildCatalog: determinístico, dedup por nick, ordenado por OVR desc', () => {
  const a = buildCatalog(CS2_REAL_2026);
  const b = buildCatalog(CS2_REAL_2026);
  assert.deepEqual(a.map((c) => c.key), b.map((c) => c.key));
  assert.ok(a.length > 50, 'catálogo tem cartas');
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].ovr >= a[i].ovr, 'ordenado desc');
  const nicks = new Set(a.map((c) => c.nick.toLowerCase()));
  assert.equal(nicks.size, a.length, 'sem nick duplicado (base)');
});

test('buildCatalog aplica specials curados (tots/major)', () => {
  const base = buildCatalog(CS2_REAL_2026);
  const someId = base[0].playerId;
  const withSpecial = buildCatalog(CS2_REAL_2026, [{ playerId: someId, rarity: 'tots', ovrBoost: 3 }]);
  assert.equal(withSpecial.length, base.length + 1);
  const tots = withSpecial.find((c) => c.rarity === 'tots');
  assert.ok(tots && tots.playerId === someId);
});

test('estimateCardValue cresce com OVR e com a raridade', () => {
  assert.ok(estimateCardValue(90, 'gold') > estimateCardValue(75, 'gold'));
  assert.ok(estimateCardValue(85, 'legendary') > estimateCardValue(85, 'gold'));
});

// ---------- quicksell ----------
test('quickSellValue: única vale 70% da duplicata; bônus de OVR limitado a +50%', () => {
  const dup = quickSellValue('gold', 80, true);
  const uni = quickSellValue('gold', 80, false);
  assert.equal(uni, Math.floor(dup * 0.7));
  // OVR 75 = sem bônus; OVR 85+ = teto de +50%
  assert.equal(quickSellValue('gold', 75, true), RARITIES.gold.quickSellBase);
  assert.equal(quickSellValue('gold', 85, true), Math.floor(RARITIES.gold.quickSellBase * 1.5));
  assert.equal(quickSellValue('gold', 99, true), Math.floor(RARITIES.gold.quickSellBase * 1.5)); // cap
});

// ---------- packs ----------
test('rollPack devolve exatamente pack.cards cartas e é determinístico por seed', () => {
  const cat = buildCatalog(CS2_REAL_2026);
  for (const pack of PACK_DEFS) {
    const a = rollPack(cat, pack, makeRng(123));
    const b = rollPack(cat, pack, makeRng(123));
    assert.equal(a.length, pack.cards, `${pack.id} tem ${pack.cards} cartas`);
    assert.deepEqual(a.map((c) => c.key), b.map((c) => c.key), `${pack.id} determinístico`);
  }
});

test('rollPack honra as garantias de bucket', () => {
  // espelha o runtime: catálogo COM specials TOTS (o pack 'tots' garante bucket special)
  const base = buildCatalog(CS2_REAL_2026);
  const tots = [...base].sort((a, b) => b.ovr - a.ovr).slice(0, 11).map((c) => ({ playerId: c.playerId, rarity: 'tots' as const, ovrBoost: 2 }));
  const cat = buildCatalog(CS2_REAL_2026, tots);
  for (const pack of PACK_DEFS) {
    const g = (pack.guaranteed ?? [])[0];
    if (!g) continue;
    // roda algumas seeds; toda abertura deve ter >= count cartas do bucket (ou melhor)
    for (const seed of [1, 2, 7, 99]) {
      const cards = rollPack(cat, pack, makeRng(seed));
      const inBucket = cards.filter((c) => rarityMatchesBucket(c.rarity, g.bucket)).length;
      assert.ok(inBucket >= g.count, `${pack.id} seed ${seed}: ${inBucket} >= ${g.count} do bucket ${g.bucket}`);
    }
  }
});

test('packById resolve e custos são crescentes', () => {
  assert.ok(packById('bronze'));
  assert.equal(packById('nope'), undefined);
  for (let i = 1; i < PACK_DEFS.length; i++) assert.ok(PACK_DEFS[i].cost > PACK_DEFS[i - 1].cost);
});

// ---------- state reducers ----------
function mkIndex(cards: UltCard[]): Map<string, UltCard> { return catalogIndex(cards); }

test('grantCard adiciona com serial incremental por cardKey', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o1', at: 1 });
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o2', at: 2 });
  st = grantCard(st, 'p2:gold', 'pack', { id: 'o3', at: 3 });
  assert.equal(st.inventory.length, 3);
  assert.equal(countCopies(st, 'p1:gold'), 2);
  assert.equal(st.inventory.find((o) => o.id === 'o1')!.serial, 1);
  assert.equal(st.inventory.find((o) => o.id === 'o2')!.serial, 2);
});

test('sellCard credita, remove, e única sai por 70%', () => {
  const card = baseCardForPlayer(mkPlayer({ id: 'p1', role: 'Rifler', aim: 80 }), CS2_REAL_2026[0]);
  const idx = mkIndex([card]);
  let st = defaultUltimateState();
  st = grantCard(st, card.key, 'pack', { id: 'o1', at: 1 });
  const before = st.profile.credits;
  const res = sellCard(st, 'o1', idx);
  assert.ok(res.ok);
  assert.equal(res.state.inventory.length, 0);
  assert.equal(res.credited, quickSellValue(card.rarity, card.ovr, false)); // única = 70%
  assert.equal(res.state.profile.credits, before + res.credited);
});

test('sellCard bloqueia carta travada em squad e id inexistente', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o1', at: 1 });
  st = { ...st, inventory: st.inventory.map((o) => ({ ...o, locked: 'squad' as const })) };
  const idx = mkIndex([]);
  assert.equal(sellCard(st, 'o1', idx).reason, 'locked');
  assert.equal(sellCard(st, 'nope', idx).reason, 'not_found');
});

test('spendCredits debita se houver saldo; senão no-op', () => {
  const st = defaultUltimateState();
  const okr = spendCredits(st, 5000);
  assert.ok(okr.ok);
  assert.equal(okr.state.profile.credits, STARTING_CREDITS - 5000);
  const bad = spendCredits(st, STARTING_CREDITS + 1);
  assert.equal(bad.ok, false);
  assert.equal(bad.state.profile.credits, STARTING_CREDITS);
});

test('addCredits nunca deixa saldo negativo', () => {
  const st = defaultUltimateState();
  assert.equal(addCredits(st, -999999).profile.credits, 0);
});

// ---------- chemistry ----------
test('roleFitsSlot: Rifler é coringa; role2 conta', () => {
  assert.ok(roleFitsSlot('AWP', 'AWP'));
  assert.ok(roleFitsSlot('Rifler', 'AWP')); // rifler encaixa em qualquer
  assert.ok(roleFitsSlot('AWP', 'Rifler')); // qualquer encaixa em rifler
  assert.ok(roleFitsSlot('Entry', 'IGL', 'IGL')); // via role2
  assert.equal(roleFitsSlot('Entry', 'AWP'), false);
});

test('computeChemistry: time todo da mesma org/país bate perto do máximo; vazio = 0', () => {
  const form = formationById('standard');
  const roles = form.slots.map((s) => s.role);
  const sameOrg = (role: 'AWP' | 'Entry' | 'Rifler' | 'Lurker' | 'Support' | 'IGL') =>
    ({ teamOrigin: 'furia', region: 'samerica' as const, country: 'br', role });
  const nodes: ChemNode[] = roles.map((role, i) => ({ slot: i, slotRole: role, card: sameOrg(role) }));
  const res = computeChemistry(form.adjacency, nodes);
  assert.equal(res.total, 15, 'org+região+país+role-fit satura em 15');
  assert.ok(Math.abs(res.multiplier - 1.1) < 1e-9);
  // squad vazio
  const empty: ChemNode[] = roles.map((role, i) => ({ slot: i, slotRole: role, card: null }));
  const r0 = computeChemistry(form.adjacency, empty);
  assert.equal(r0.total, 0);
  assert.ok(Math.abs(r0.multiplier - 0.9) < 1e-9);
});

test('computeChemistry: sem nenhuma conexão (times/regiões/países distintos) fica baixa', () => {
  const form = formationById('standard');
  const roles = form.slots.map((s) => s.role);
  const nodes: ChemNode[] = roles.map((role, i) => ({
    slot: i, slotRole: role,
    card: { teamOrigin: `team${i}`, region: (['europe', 'cis', 'asia', 'namerica', 'oceania'] as const)[i], country: `c${i}`, role },
  }));
  const res = computeChemistry(form.adjacency, nodes);
  // só ganha o +1 de role-fit por slot (5 slots) → 5
  assert.equal(res.total, 5);
});

// ---------- squad reducers ----------
test('setSlot coloca/limpa e sincroniza o lock; não deixa carta em 2 slots', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o1', at: 1 });
  st = ensureSquad(st, 'standard', formationSlotRoles('standard'));
  st = setSlot(st, 0, 'o1');
  assert.equal(activeSquad(st)!.slots[0].ownedId, 'o1');
  assert.equal(st.inventory.find((o) => o.id === 'o1')!.locked, 'squad'); // travou
  // move pro slot 2 → sai do slot 0
  st = setSlot(st, 2, 'o1');
  assert.equal(activeSquad(st)!.slots[0].ownedId, null);
  assert.equal(activeSquad(st)!.slots[2].ownedId, 'o1');
  // limpa → destrava
  st = setSlot(st, 2, null);
  assert.equal(st.inventory.find((o) => o.id === 'o1')!.locked, null);
});

test('setFormation mantém cartas por índice e re-rotula as funções', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o1', at: 1 });
  st = ensureSquad(st, 'standard', formationSlotRoles('standard'));
  st = setSlot(st, 1, 'o1');
  st = setFormation(st, 'aggressive', formationSlotRoles('aggressive'));
  assert.equal(activeSquad(st)!.formation, 'aggressive');
  assert.equal(activeSquad(st)!.slots[1].ownedId, 'o1'); // carta preservada
  assert.equal(activeSquad(st)!.slots[1].role, formationSlotRoles('aggressive')[1]); // função nova
});

// ---------- ranqueada (elo + reward) ----------
test('computeMatchOutcome: vitória sobe ELO e paga credits; derrota desce e paga 0', () => {
  const win = computeMatchOutcome(1000, 1000, true);
  const loss = computeMatchOutcome(1000, 1000, false);
  assert.ok(win.eloDelta > 0 && win.credits > 0);
  assert.ok(loss.eloDelta < 0 && loss.credits === 0);
  // bater rival mais forte paga mais que rival mais fraco
  assert.ok(computeMatchOutcome(1000, 1400, true).eloDelta > computeMatchOutcome(1000, 600, true).eloDelta);
  assert.ok(computeMatchOutcome(1000, 1400, true).credits > computeMatchOutcome(1000, 600, true).credits);
  // delta clampado em ±40
  assert.ok(Math.abs(computeMatchOutcome(1, 9999, false).eloDelta) <= 40);
});

test('applyMatchResult atualiza perfil (elo/peak/w-l/streak/credits)', () => {
  let st = defaultUltimateState();
  const before = st.profile.credits;
  const r1 = applyMatchResult(st, true, 1100);
  st = r1.state;
  assert.equal(st.profile.w, 1);
  assert.equal(st.profile.streak, 1);
  assert.ok(st.profile.elo > 1000 && st.profile.peakElo === st.profile.elo);
  assert.equal(st.profile.credits, before + r1.outcome.credits);
  // derrota zera streak e não deixa elo negativo
  const r2 = applyMatchResult(st, false, 1100);
  assert.equal(r2.state.profile.streak, 0);
  assert.equal(r2.state.profile.l, 1);
  assert.ok(r2.state.profile.elo >= 0);
  assert.ok(r2.state.profile.peakElo >= r2.state.profile.elo); // peak preservado
});

// ---------- daily ----------
test('computeNextDaily: 1º claim, mesmo dia, ontem (+1) e gap (reset)', () => {
  assert.deepEqual(computeNextDaily(0, null, '2026-06-30'), { canClaim: true, day: 1, wasReset: false });
  assert.equal(computeNextDaily(3, '2026-06-30', '2026-06-30').canClaim, false); // já pegou hoje
  assert.deepEqual(computeNextDaily(3, '2026-06-29', '2026-06-30'), { canClaim: true, day: 4, wasReset: false });
  assert.deepEqual(computeNextDaily(7, '2026-06-29', '2026-06-30'), { canClaim: true, day: 1, wasReset: false }); // wrap 7→1
  assert.deepEqual(computeNextDaily(4, '2026-06-25', '2026-06-30'), { canClaim: true, day: 1, wasReset: true }); // gap
});

test('claimDaily credita e trava no mesmo dia', () => {
  let st = defaultUltimateState();
  const before = st.profile.credits;
  const r1 = claimDaily(st, '2026-06-30');
  assert.ok(r1.result.claimed && r1.result.day === 1 && r1.result.credits > 0);
  st = r1.state;
  assert.equal(st.profile.credits, before + r1.result.credits);
  assert.equal(st.profile.daily.lastClaim, '2026-06-30');
  const r2 = claimDaily(st, '2026-06-30');
  assert.equal(r2.result.claimed, false); // 1x por dia
});

// ---------- titles ----------
test('evaluateTitles concede por conquista absoluta', () => {
  assert.deepEqual(evaluateTitles({ wins: 0, peakElo: 1000, streak: 0, uniqueCards: 0, iconsOwned: 0, onboarded: false }), []);
  const t = evaluateTitles({ wins: 30, peakElo: 2300, streak: 6, uniqueCards: 30, iconsOwned: 1, onboarded: true });
  for (const s of ['rookie', 'first-win', 'collector', 'streaker', 'veteran', 'elite', 'icon-owner']) assert.ok(t.includes(s), s);
});

test('mergeTitles faz união + auto-equipa o 1º; equipTitle só se possui', () => {
  let st = defaultUltimateState();
  st = mergeTitles(st, ['rookie', 'first-win']).state;
  assert.deepEqual(st.profile.titles.sort(), ['first-win', 'rookie']);
  assert.equal(st.profile.equippedTitle, 'rookie'); // auto-equip 1º
  const dup = mergeTitles(st, ['rookie']);
  assert.equal(dup.newly.length, 0);
  st = equipTitle(st, 'first-win');
  assert.equal(st.profile.equippedTitle, 'first-win');
  st = equipTitle(st, 'nao-possui');
  assert.equal(st.profile.equippedTitle, 'first-win'); // ignorado
});

// ---------- starter ----------
test('pickStarterCards devolve 5 jogadores distintos', () => {
  const cat = buildCatalog(CS2_REAL_2026);
  const cards = pickStarterCards(cat, slotRoles('standard'), 76);
  assert.equal(cards.length, 5);
  assert.equal(new Set(cards.map((c) => c.playerId)).size, 5);
});

// ---------- SBC ----------
function mkCard(o: Partial<UltCard> & { playerId: string }): UltCard {
  return {
    key: `${o.playerId}:${o.rarity ?? 'gold'}`, playerId: o.playerId, nick: o.playerId,
    country: 'br', region: 'samerica', role: 'Rifler', teamOrigin: 'furia', teamOriginName: 'FURIA',
    rarity: 'gold', ovr: 80, stats: { tiro: 80, mira: 80, reflexo: 80, visao: 80, clutch: 80, util: 80 }, ...o,
  };
}

test('checkSbc valida count, mesma org, OVR médio e tier mínimo', () => {
  // 3 mesma org → ok
  const org = [mkCard({ playerId: 'a' }), mkCard({ playerId: 'b' }), mkCard({ playerId: 'c' })];
  assert.equal(checkSbc(org, { count: 3, sameOrg: true }).ok, true);
  // uma de org diferente → falha
  const mixed = [mkCard({ playerId: 'a' }), mkCard({ playerId: 'b', teamOrigin: 'navi' }), mkCard({ playerId: 'c' })];
  assert.equal(checkSbc(mixed, { count: 3, sameOrg: true }).ok, false);
  // count errado → falha
  assert.equal(checkSbc(org, { count: 5, sameOrg: true }).ok, false);
  // OVR médio
  const hi = [mkCard({ playerId: 'a', ovr: 90 }), mkCard({ playerId: 'b', ovr: 88 })];
  assert.equal(checkSbc(hi, { count: 2, minOvrAvg: 85 }).ok, true);
  assert.equal(checkSbc(hi, { count: 2, minOvrAvg: 95 }).ok, false);
  // tier mínimo (elite=5); gold=3 falha
  assert.equal(checkSbc([mkCard({ playerId: 'a', rarity: 'elite', ovr: 85 })], { count: 1, minTier: 5 }).ok, true);
  assert.equal(checkSbc([mkCard({ playerId: 'a', rarity: 'gold' })], { count: 1, minTier: 5 }).ok, false);
});

// ---------- season ----------
test('applySeasonRollover: inicia season; não rola antes do fim; rola e soft-reseta depois', () => {
  const t0 = 1_000_000_000_000;
  let st = defaultUltimateState();
  // sem season → inicia
  const a = applySeasonRollover(st, t0);
  assert.equal(a.result.rolled, false);
  assert.ok(a.state.profile.season && a.state.profile.season.endsAt > t0);
  st = a.state;
  // antes do fim → nada
  assert.equal(applySeasonRollover(st, t0 + 1000).result.rolled, false);
  // sobe ELO e joga, depois estoura o prazo → soft-reset 1000+(elo-1000)*0.5
  st = { ...st, profile: { ...st.profile, elo: 1600, peakElo: 1600, w: 3 } };
  const past = st.profile.season!.endsAt + 1000;
  const b = applySeasonRollover(st, past);
  assert.equal(b.result.rolled, true);
  assert.equal(b.state.profile.elo, 1300); // 1000 + 600*0.5
  assert.equal(b.state.profile.streak, 0);
  assert.ok(b.result.credits > 0);
  assert.ok(b.state.profile.season!.endsAt > past); // nova season
});

test('applySeasonRollover NÃO paga bônus a conta dormente (sem jogos na season)', () => {
  const t0 = 1_000_000_000_000;
  let st = defaultUltimateState();
  st = { ...st, profile: { ...st.profile, elo: 1400, peakElo: 1400, w: 5, l: 2 } }; // jogou em seasons passadas
  st = applySeasonRollover(st, t0).state; // abre season com baseline wl0 = 7
  const past = st.profile.season!.endsAt + 1000;
  const b = applySeasonRollover(st, past); // não jogou NADA nesta season
  assert.equal(b.result.rolled, true);
  assert.equal(b.result.credits, 0); // dormente → sem bônus (fecha a fonte de credits)
});

test('setSlot não deixa o MESMO jogador em dois slots (evita id duplicado no motor)', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o1', at: 1 });
  st = grantCard(st, 'p1:elite', 'pack', { id: 'o2', at: 2 }); // mesma pessoa p1, versão diferente
  st = ensureSquad(st, 'standard', slotRoles('standard'));
  st = setSlot(st, 0, 'o1');
  st = setSlot(st, 1, 'o2'); // mesmo jogador → limpa o slot 0
  assert.equal(activeSquad(st)!.slots[0].ownedId, null);
  assert.equal(activeSquad(st)!.slots[1].ownedId, 'o2');
});

test('grantCard: serial monotônico não colide após venda', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'a', at: 1 });
  st = grantCard(st, 'p1:gold', 'pack', { id: 'b', at: 2 });
  st = sellCard(st, 'a', new Map()).state; // remove 'a' (catalog vazio → 0 credits, ok)
  st = grantCard(st, 'p1:gold', 'pack', { id: 'c', at: 3 });
  const serials = st.inventory.filter((o) => o.cardKey === 'p1:gold').map((o) => o.serial).sort();
  assert.deepEqual(serials, [2, 3]); // b=2, c=3 — sem colisão em 2
});

test('removeOwnedCards remove do inventário e limpa slot do squad', () => {
  let st = defaultUltimateState();
  st = grantCard(st, 'p1:gold', 'pack', { id: 'o1', at: 1 });
  st = ensureSquad(st, 'standard', slotRoles('standard'));
  st = setSlot(st, 0, 'o1');
  st = removeOwnedCards(st, ['o1']);
  assert.equal(st.inventory.length, 0);
  assert.equal(activeSquad(st)!.slots[0].ownedId, null);
});

// ---------- bazar (P6) ----------
test('buildAiLadder: determinístico, ordenado por elo, elo cresce com OVR', () => {
  const pool = [{ nick: 'a', country: 'br', ovr: 95 }, { nick: 'b', country: 'br', ovr: 80 }, { nick: 'c', country: 'br', ovr: 70 }];
  const l1 = buildAiLadder(pool, 42);
  const l2 = buildAiLadder(pool, 42);
  assert.deepEqual(l1.map((p) => p.id), l2.map((p) => p.id));
  for (let i = 1; i < l1.length; i++) assert.ok(l1[i - 1].elo >= l1[i].elo);
  assert.equal(l1[0].nick, 'a'); // maior OVR no topo
  for (const p of l1) { assert.ok(p.w >= 0 && p.l >= 0); }
});

test('buildBazaar: N listagens, preços positivos e ordenados, determinístico', () => {
  const cat = buildCatalog(CS2_REAL_2026);
  const a = buildBazaar(cat, ['x', 'y'], 7, 20);
  const b = buildBazaar(cat, ['x', 'y'], 7, 20);
  assert.equal(a.length, 20);
  assert.deepEqual(a.map((l) => l.cardKey), b.map((l) => l.cardKey));
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].price <= a[i].price);
  for (const l of a) assert.ok(l.price >= 50);
});

test('migrateUltimate: lixo vira default; parcial é preenchido; inventário válido preservado', () => {
  assert.deepEqual(migrateUltimate(null), defaultUltimateState());
  assert.deepEqual(migrateUltimate(42), defaultUltimateState());
  const partial = migrateUltimate({ profile: { credits: 99 }, inventory: [{ id: 'x', cardKey: 'p1:gold', acquiredVia: 'pack', acquiredAt: 1, locked: null }] });
  assert.equal(partial.profile.credits, 99);
  assert.equal(partial.profile.elo, defaultUltimateState().profile.elo); // default preenchido
  assert.equal(partial.inventory.length, 1);
  // entrada de inventário inválida é filtrada
  const dirty = migrateUltimate({ inventory: [{ nope: true }, { id: 'y', cardKey: 'p2:gold' }] });
  assert.equal(dirty.inventory.length, 1);
});

test('evaluateObjectives: pct 0..100, done quando value>=target, cobre todos os defs', () => {
  const facts = { wins: 5, packsOpened: 2, uniqueCards: 25, totalCards: 40, squadOvr: 79, chem: 12, streak: 0, iconsOwned: 0, sbcDone: 1, peakElo: 1000 };
  const prog = evaluateObjectives(facts);
  assert.equal(prog.length, OBJECTIVES.length);
  const win5 = prog.find((p) => p.def.id === 'win-5')!;
  assert.ok(win5.done && win5.pct === 100);
  const ovr80 = prog.find((p) => p.def.id === 'ovr-80')!; // 79 < 80
  assert.ok(!ovr80.done);
  assert.equal(prog.find((p) => p.def.id === 'unique-60')!.pct, Math.round((25 / 60) * 100));
  for (const p of prog) assert.ok(p.pct >= 0 && p.pct <= 100);
});

test('markObjectiveClaimed: idempotente e não muta o estado original', () => {
  const s0 = defaultUltimateState();
  const s1 = markObjectiveClaimed(s0, 'win-5');
  assert.deepEqual(s0.profile.objectivesClaimed, []); // original intacto
  assert.deepEqual(s1.profile.objectivesClaimed, ['win-5']);
  const s2 = markObjectiveClaimed(s1, 'win-5');
  assert.equal(s2, s1); // já resgatado → mesmo objeto (no-op)
  assert.ok(objectiveById('win-5') && !objectiveById('nope'));
});

test('migrateUltimate preenche objectivesClaimed (default [] + preserva válidos)', () => {
  assert.deepEqual(migrateUltimate({}).profile.objectivesClaimed, []);
  const kept = migrateUltimate({ profile: { objectivesClaimed: ['win-5', 42, 'ovr-80'] } });
  assert.deepEqual(kept.profile.objectivesClaimed, ['win-5', 'ovr-80']); // filtra não-string
});

test('evolveCard: sobe boost gastando EVO_COSTS, respeita teto e saldo', () => {
  // saldo folgado: EVO_COSTS[0] agora pode ser > STARTING_CREDITS (evolução virou
  // investimento, não trivial) — o teste não pode depender do start bancar a evo.
  const s0 = addCredits(grantCard(defaultUltimateState(), 'p1:gold', 'pack', { id: 'c1' }), 100000);
  const startCredits = s0.profile.credits;
  const r1 = evolveCard(s0, 'c1');
  assert.ok(r1.ok && r1.newBoost === 1 && r1.cost === EVO_COSTS[0]);
  assert.equal(r1.state.profile.credits, startCredits - EVO_COSTS[0]);
  assert.equal(r1.state.inventory.find((o) => o.id === 'c1')!.boost, 1);
  assert.equal(s0.inventory.find((o) => o.id === 'c1')!.boost, undefined); // original intacto
  // sobe até o teto (com saldo folgado)
  let s = addCredits(r1.state, 100000);
  while ((s.inventory.find((o) => o.id === 'c1')!.boost ?? 0) < EVO_MAX) s = evolveCard(s, 'c1').state;
  assert.equal(s.inventory.find((o) => o.id === 'c1')!.boost, EVO_MAX);
  const maxed = evolveCard(s, 'c1');
  assert.ok(!maxed.ok && maxed.reason === 'maxed');
  // sem saldo → insufficient; carta inexistente → missing
  const broke = grantCard(spendCredits(defaultUltimateState(), STARTING_CREDITS).state, 'p2:gold', 'pack', { id: 'c2' });
  assert.equal(evolveCard(broke, 'c2').reason, 'insufficient');
  assert.equal(evolveCard(s0, 'nope').reason, 'missing');
});

test('pushHistory: mais novo primeiro, cap em HISTORY_MAX, imutável', () => {
  let s = defaultUltimateState();
  const rec = (i: number): MatchRecord => ({ t: i, mode: 'rivals', won: i % 2 === 0, score: `13-${i}`, eloDelta: i, credits: 0 });
  for (let i = 0; i < HISTORY_MAX + 5; i++) s = pushHistory(s, rec(i));
  assert.equal(s.profile.history.length, HISTORY_MAX);
  assert.equal(s.profile.history[0].t, HISTORY_MAX + 4); // mais recente primeiro
  assert.equal(defaultUltimateState().profile.history.length, 0);
});

test('markBazaarBought: acumula no mesmo dia, reseta em dia novo', () => {
  let s = markBazaarBought(defaultUltimateState(), 100, 'a');
  s = markBazaarBought(s, 100, 'b');
  assert.deepEqual(s.profile.bazaarBought, { day: 100, ids: ['a', 'b'] });
  s = markBazaarBought(s, 101, 'c'); // virou o dia → lista zera
  assert.deepEqual(s.profile.bazaarBought, { day: 101, ids: ['c'] });
});

test('computeMatchOutcome: multiplicador por divisão + bônus de streak', () => {
  // mesma diferença de elo: vencer na Elite (1960) paga mais que no Bronze (1000)
  const bronze = computeMatchOutcome(1000, 1000, true);
  const elite = computeMatchOutcome(1960, 1960, true);
  assert.ok(elite.credits > bronze.credits);
  // streak aumenta o pagamento (cap em 5)
  const noStreak = computeMatchOutcome(1000, 1000, true, 0);
  const st3 = computeMatchOutcome(1000, 1000, true, 3);
  const st5 = computeMatchOutcome(1000, 1000, true, 5);
  const st9 = computeMatchOutcome(1000, 1000, true, 9);
  assert.ok(st3.credits > noStreak.credits);
  assert.equal(st5.credits, st9.credits); // cap
  assert.equal(computeMatchOutcome(1960, 1960, false, 5).credits, 0); // derrota nunca paga
});

test('distinctPlayers + checkSbc: 3 cópias da mesma carta REPROVAM', () => {
  const catalog = buildCatalog(CS2_REAL_2026);
  const c = catalog[0];
  assert.ok(!distinctPlayers([c, c, c]));
  const chk = checkSbc([c, c, c], { count: 3, sameOrg: true });
  assert.ok(!chk.ok);
  assert.ok(chk.items.some((i) => i.label === 'jogadores diferentes' && !i.ok));
  // 3 jogadores distintos da MESMA org passam
  const org = catalog.filter((x) => x.teamOrigin === c.teamOrigin);
  if (org.length >= 3) {
    const trio = org.slice(0, 3);
    assert.ok(distinctPlayers(trio));
    assert.ok(checkSbc(trio, { count: 3, sameOrg: true }).ok);
  }
});

test('missões: sorteio determinístico por dia, ensure/claim idempotentes', () => {
  const a = missionsForDay('2026-07-01');
  const b = missionsForDay('2026-07-01');
  assert.deepEqual(a.map((m) => m.id), b.map((m) => m.id)); // determinístico
  assert.equal(a.length, MISSIONS_PER_DAY);
  assert.equal(new Set(a.map((m) => m.id)).size, MISSIONS_PER_DAY); // sem repetida
  assert.ok(a.every((m) => MISSION_POOL.some((p) => p.id === m.id)));
  // progresso
  const def = MISSION_POOL.find((m) => m.id === 'm-win2')!;
  assert.ok(!missionProgress(def, { winsToday: 1, matchesToday: 1, packsToday: 0, sbcToday: 0 }).done);
  assert.ok(missionProgress(def, { winsToday: 2, matchesToday: 2, packsToday: 0, sbcToday: 0 }).done);
  // ensure captura baseline e não re-reseta no mesmo dia
  let s = defaultUltimateState();
  s = { ...s, profile: { ...s.profile, w: 4, l: 2, packSeedCounter: 3 } };
  s = ensureMissions(s, 'D1');
  assert.deepEqual(s.profile.missions!.base, { w: 4, l: 2, packs: 3, sbc: 0 });
  assert.equal(ensureMissions(s, 'D1'), s); // no-op
  const s2 = markMissionClaimed(s, 'm-win1');
  assert.deepEqual(s2.profile.missions!.claimed, ['m-win1']);
  assert.equal(markMissionClaimed(s2, 'm-win1'), s2); // idempotente
  assert.equal(ensureMissions(s2, 'D2').profile.missions!.claimed.length, 0); // dia novo zera
});

test('migrateUltimate: squads com slots lixo não explodem; novos campos com default', () => {
  const m = migrateUltimate({ squads: [{ id: 'main' }, { id: 'x', slots: [null, { slot: 0, role: 'AWP', ownedId: 42 }, 'lixo'] }] });
  assert.equal(m.squads.length, 2);
  assert.deepEqual(m.squads[0].slots, []); // sem slots → vazio, não TypeError
  assert.equal(m.squads[1].slots.length, 1);
  assert.equal(m.squads[1].slots[0].ownedId, null); // ownedId não-string vira null
  assert.deepEqual(m.profile.bazaarBought, { day: 0, ids: [] });
  assert.equal(m.profile.missions, null);
  assert.deepEqual(m.profile.history, []);
});

test('applySeasonRollover incrementa season.n', () => {
  const base = defaultUltimateState();
  const started = { ...base, profile: { ...base.profile, w: 1, season: { startedAt: 0, endsAt: 10, wl0: 0, peak: 1200, claimed: [], n: 1 } } };
  const r = applySeasonRollover(started, 20);
  assert.ok(r.result.rolled);
  assert.equal(r.state.profile.season!.n, 2);
});

test('pack TOTS: catálogo com specials garante 1 special no roll', () => {
  const base = buildCatalog(CS2_REAL_2026);
  const tots = [...base].sort((a, b) => b.ovr - a.ovr).slice(0, 11).map((c) => ({ playerId: c.playerId, rarity: 'tots' as const, ovrBoost: 2 }));
  const catalog = buildCatalog(CS2_REAL_2026, tots);
  assert.ok(catalog.some((c) => c.rarity === 'tots'));
  const pack = packById('tots')!;
  assert.ok(pack);
  const cards = rollPack(catalog, pack, makeRng(42));
  assert.equal(cards.length, pack.cards);
  assert.ok(cards.some((c) => c.rarity === 'tots' || c.rarity === 'major')); // garantia do bucket special
});

test('gauntlet: start/record — vitória avança, derrota/5 encerra, best', () => {
  let s = gauntletStart(defaultUltimateState(), 'D1');
  assert.ok(s.profile.gauntlet.active && s.profile.gauntlet.wins === 0);
  assert.equal(gauntletStart(s, 'D1'), s); // no-op no mesmo dia
  const r1 = gauntletRecord(s, true); assert.equal(r1.wins, 1); assert.ok(!r1.over); s = r1.state;
  const r2 = gauntletRecord(s, false); assert.ok(r2.over && !r2.completed); s = r2.state;
  assert.equal(s.profile.gauntlet.active, false);
  assert.equal(s.profile.gauntlet.best, 1);
  // run completo (5 vitórias)
  let t = gauntletStart(defaultUltimateState(), 'D2');
  let last;
  for (let i = 0; i < 5; i++) { last = gauntletRecord(t, true); t = last.state; }
  assert.ok(last!.completed && last!.over);
  assert.equal(t.profile.gauntlet.wins, 5);
  assert.equal(t.profile.gauntlet.active, false);
  assert.equal(t.profile.gauntlet.best, 5);
  const idle = gauntletRecord(t, true); // run inativo → no-op
  assert.ok(idle.over && !idle.advanced); // advanced=false → chamador NÃO paga credits
});

test('migrateUltimate preenche gauntlet (default + preserva)', () => {
  assert.deepEqual(migrateUltimate({}).profile.gauntlet, { date: null, wins: 0, active: false, best: 0 });
  assert.deepEqual(migrateUltimate({ profile: { gauntlet: { date: 'X', wins: 3, active: true, best: 4 } } }).profile.gauntlet, { date: 'X', wins: 3, active: true, best: 4 });
});

test('divisionFor: mapeia elo → divisão, progress 0..100, toNext correto', () => {
  const b2 = divisionFor(1075); // Bronze II (1050-1099)
  assert.equal(b2.def.name, 'Bronze II');
  assert.ok(b2.progress >= 0 && b2.progress <= 100);
  assert.ok(b2.next && b2.next.name === 'Bronze I');
  assert.equal(b2.toNext, 25); // 1100 - 1075
  const elite = divisionFor(3000);
  assert.equal(elite.def.tier, 'elite');
  assert.equal(elite.next, null);
  assert.equal(elite.toNext, 0);
  assert.equal(elite.progress, 100);
  assert.equal(divisionFor(-50).def.name, 'Bronze III'); // clamp inferior
  assert.equal(divisionFor(1000).def.name, 'Bronze III'); // STARTING_ELO cai em Bronze III (0-1049)
});

test('divisionChange: promove/rebaixa/mantém pela faixa', () => {
  assert.equal(divisionChange(1049, 1050), 'promoted'); // Bronze III → Bronze II
  assert.equal(divisionChange(1050, 1049), 'relegated');
  assert.equal(divisionChange(1060, 1070), 'same');
  assert.equal(DIVISIONS.length, 12);
  assert.equal(DIV_TIERS.length, 6);
});

test('evaluateSeasonTiers: reached pelo pico, claimed pela lista', () => {
  const tiers = evaluateSeasonTiers(1300, ['s-bronze']);
  assert.ok(tiers.find((t) => t.tier.id === 's-bronze')!.reached);
  assert.ok(tiers.find((t) => t.tier.id === 's-bronze')!.claimed);
  assert.ok(tiers.find((t) => t.tier.id === 's-ouro')!.reached && !tiers.find((t) => t.tier.id === 's-ouro')!.claimed); // rp 1300
  assert.ok(!tiers.find((t) => t.tier.id === 's-platina')!.reached); // rp 1500
});

test('applyMatchResult atualiza o pico da season (season.peak)', () => {
  const s = { ...defaultUltimateState(), profile: { ...defaultUltimateState().profile, season: startSeason(0, 0, 1000) } };
  const r = applyMatchResult(s, true, 1400); // vitória vs elo alto → sobe
  assert.ok(r.state.profile.season!.peak! > 1000);
  assert.ok(r.state.profile.season!.peak! >= r.state.profile.elo);
});

test('claimSeasonReward: idempotente e imutável', () => {
  const s = { ...defaultUltimateState(), profile: { ...defaultUltimateState().profile, season: startSeason(0, 0, 1000) } };
  const s1 = claimSeasonReward(s, 's-bronze');
  assert.deepEqual(s1.profile.season!.claimed, ['s-bronze']);
  assert.deepEqual(s.profile.season!.claimed, []);
  assert.equal(claimSeasonReward(s1, 's-bronze'), s1); // no-op
  assert.ok(seasonTierById('s-ouro') && !seasonTierById('nope'));
});

test('applySeasonRollover: nova season nasce com peak=STARTING_ELO (sem re-resgate grátis)', () => {
  const base = defaultUltimateState();
  const started = { ...base, profile: { ...base.profile, elo: 1600, w: 5, l: 2, season: { startedAt: 0, endsAt: 1000, wl0: 0, peak: 1600, claimed: ['s-bronze', 's-prata', 's-ouro'] } } };
  const r = applySeasonRollover(started, 2000); // nowMs > endsAt → rola
  assert.ok(r.result.rolled);
  assert.equal(r.state.profile.season!.peak, STARTING_ELO); // NÃO herda o newElo do soft-reset
  assert.deepEqual(r.state.profile.season!.claimed, []);
  // com peak=1000 nenhuma faixa (>=1050) fica reached → nada re-resgatável na hora
  const tiers = evaluateSeasonTiers(r.state.profile.season!.peak!, r.state.profile.season!.claimed!);
  assert.ok(tiers.every((t) => !t.reached));
});

test('migrateUltimate preenche season.peak/claimed', () => {
  const m = migrateUltimate({ profile: { season: { startedAt: 1, endsAt: 2 } } });
  assert.equal(m.profile.season!.peak, STARTING_ELO);
  assert.deepEqual(m.profile.season!.claimed, []);
  const kept = migrateUltimate({ profile: { season: { startedAt: 1, endsAt: 2, peak: 1234, claimed: ['s-bronze', 7] } } });
  assert.equal(kept.profile.season!.peak, 1234);
  assert.deepEqual(kept.profile.season!.claimed, ['s-bronze']);
});

test('migrateUltimate sanitiza boost do inventário (clamp + descarta inválido)', () => {
  const m = migrateUltimate({ inventory: [
    { id: 'a', cardKey: 'p:gold', boost: 2 },
    { id: 'b', cardKey: 'p:gold', boost: 9 },
    { id: 'c', cardKey: 'p:gold', boost: -1 },
    { id: 'd', cardKey: 'p:gold', boost: 'x' },
  ] });
  const by = (id: string) => m.inventory.find((o) => o.id === id)!;
  assert.equal(by('a').boost, 2);
  assert.equal(by('b').boost, EVO_MAX);
  assert.equal(by('c').boost, undefined);
  assert.equal(by('d').boost, undefined);
});
