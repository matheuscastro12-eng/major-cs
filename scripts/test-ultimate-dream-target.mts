// [U07] alvo: caminhos reais (sem chance individual inventada), circulação, preview de escalação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServerCatalog } from '../server/ultimate-pack.ts';
import { PACK_DEFS, TOTW_PACK, ICON_PACK, PROMO_PACK } from '../src/engine/ultimate/packs.ts';
import { weeklyPackPool } from '../src/engine/ultimate/packPool.ts';
import { targetPaths, missingCredits, slotSwapPreview, bestSlotFor, normalizeTarget } from '../src/engine/ultimate/dreamTarget.ts';
import type { ChemNode } from '../src/engine/ultimate/chemistry.ts';
import { formationById } from '../src/engine/ultimate/formations.ts';

const now = new Date('2026-09-11T12:00:00Z');
const catalog = buildServerCatalog(now);
const packs = [...PACK_DEFS, TOTW_PACK, ICON_PACK, PROMO_PACK];
const totwPool = weeklyPackPool(catalog, now);

test('carta base: sempre em circulação; packs listados são só os que contêm a raridade; P e pool separados', () => {
  const gold = catalog.find((c) => c.rarity === 'gold')!;
  const p = targetPaths(gold, { catalog, packs, promoPlayerIds: [], totwPool, owned: false });
  assert.equal(p.circulation, 'sempre');
  assert.ok(p.packs.length >= 2);
  for (const pk of p.packs) { assert.ok(pk.pRarity > 0 && pk.pRarity <= 1); assert.ok(pk.rarityPoolSize > 1); }
  assert.equal(p.cheapestPackCost, Math.min(...p.packs.map((x) => x.cost)));
  assert.equal(missingCredits(1000, p.cheapestPackCost), Math.max(0, p.cheapestPackCost! - 1000));
});

test('TOTW: só a semana vigente está "agora"; fora da semana só mercado', () => {
  const totws = catalog.filter((c) => c.rarity === 'totw');
  assert.ok(totws.length > 0 && totwPool);
  const inWeek = totws.find((c) => totwPool!.some((x) => x.key === c.key));
  const outWeek = totws.find((c) => !totwPool!.some((x) => x.key === c.key));
  if (inWeek) { const p = targetPaths(inWeek, { catalog, packs, promoPlayerIds: [], totwPool, owned: false }); assert.equal(p.circulation, 'agora'); assert.ok(p.packs.some((x) => x.id === 'totw')); }
  if (outWeek) { const p = targetPaths(outWeek, { catalog, packs, promoPlayerIds: [], totwPool, owned: false }); assert.equal(p.circulation, 'fora'); assert.equal(p.packs.length, 0); }
});

test('preview de escalação bate com computeChemistry e escolhe slot que encaixa a função', () => {
  const form = formationById('standard');
  const five = catalog.filter((c) => c.rarity === 'gold').slice(0, 5);
  const nodes: ChemNode[] = form.slots.map((s, i) => ({ slot: s.slot, slotRole: s.role, card: five[i] }));
  const awp = catalog.find((c) => c.role === 'AWP' && c.rarity === 'elite')!;
  const best = bestSlotFor(form.adjacency, nodes, awp)!;
  assert.ok(best.roleFit, 'AWP deve cair num slot que aceite AWP/Rifler');
  const pv = slotSwapPreview(form.adjacency, nodes, best.slot, awp)!;
  assert.equal(pv.chemAfter, best.chemAfter);
  assert.ok(pv.chemBefore >= 0 && pv.chemAfter <= 15);
  assert.equal(pv.ovrAfter, awp.ovr);
});

test('normalizeTarget rejeita lixo', () => {
  assert.equal(normalizeTarget({ cardKey: 'x' }), null);
  assert.deepEqual(normalizeTarget({ cardKey: 'p1:gold', setAt: '5' }), { cardKey: 'p1:gold', setAt: 5 });
});
