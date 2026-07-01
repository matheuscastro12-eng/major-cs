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
import { ensureSquad, setSlot, setFormation, activeSquad, computeMatchOutcome, applyMatchResult } from '../src/engine/ultimate/state.ts';
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
  const cat = buildCatalog(CS2_REAL_2026);
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
