// [UT-REW2] fase 2: prêmios só-do-aparelho → servidor (planClaim puro + parse)
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServerCatalog, serverCardByKeyAnyMonth } from './ultimate-pack.js';
import { GAUNTLET_TARGET_SRV, GAUNTLET_WIN_CREDITS_SRV, brtDate, claimOpId, packMatches, parseClaim, planClaim, type ClaimCtx, type ClaimInput } from './ultimate-claims.js';
import { makeRng } from '../src/engine/rng.js';
import { packById, rollPack, PROMO_PACK } from '../src/engine/ultimate/packs.js';
import { missionsForDay } from '../src/engine/ultimate/missions.js';
import { missionsForWeek, weekKey } from '../src/engine/ultimate/weeklyMissions.js';
import { GAUNTLET_TARGET, GAUNTLET_WIN_CREDITS } from '../src/engine/ultimate/state.js';

const NOW = new Date('2026-11-02T15:00:00Z'); // 12:00 BRT
const cat = buildServerCatalog(NOW);
const byRarity = (r: string) => cat.find((c) => c.rarity === r)!;
function ctx(over: Partial<ClaimCtx> = {}, ops: string[] = []): ClaimCtx {
  return {
    now: NOW, lookup: (k) => serverCardByKeyAnyMonth(k) ?? null, catalogs: [cat], hasOp: (o) => ops.includes(o),
    lastDaily: null, draftEntries24h: 0, draftClaims24h: 0, unpaidPacks24h: 0, lastPaidSeed: 0, promoCost: null, ...over,
  };
}
const inp = (src: ClaimInput['src'], key: string, p: ClaimInput['p'], cards: ClaimInput['cards'] = []): ClaimInput => ({ src, key, p, cards });
const today = brtDate(NOW);

test('parse: recusa src desconhecido, ids repetidos e id com caractere estranho', () => {
  assert.equal(parseClaim({ src: 'hack', key: 'x', cards: [] }), null);
  assert.equal(parseClaim({ src: 'daily', key: 'x', cards: [{ cardId: 'a', cardKey: 'k' }, { cardId: 'a', cardKey: 'k' }] }), null);
  assert.equal(parseClaim({ src: 'daily', key: 'x', cards: [{ cardId: 'a b', cardKey: 'k' }] }), null);
  assert.ok(parseClaim({ src: 'daily', key: today, p: { date: today, day: 3 } }));
});

test('op_id: estável, ≤64 chars mesmo com chave longa', () => {
  assert.equal(claimOpId('daily', today), `rw:daily:${today}`);
  assert.ok(claimOpId('legacy', 'x'.repeat(100)).length <= 64);
});

test('diária: crédito do SERVIDOR (sequência do ledger), fora da janela recusa', () => {
  const r = planClaim(inp('daily', today, { date: today, day: 7 }), ctx({ lastDaily: { date: '2026-10-20', day: 6 } }));
  assert.ok(r.ok && r.plan.creditsDelta === 800, 'gap → volta pro dia 1 mesmo o cliente dizendo 7');
  const y = brtDate(NOW, -1);
  const r2 = planClaim(inp('daily', today, { date: today, day: 1 }), ctx({ lastDaily: { date: y, day: 2 } }));
  assert.ok(r2.ok && r2.plan.creditsDelta === 1800 && r2.plan.opId === `rw:daily:${today}`);
  assert.deepEqual(planClaim(inp('daily', '2026-01-01', { date: '2026-01-01', day: 1 }), ctx()), { ok: false, error: 'out_of_window' });
});

test('missão/semanal: só ids sorteados do dia/semana, crédito da tabela', () => {
  const m = missionsForDay(today)[0];
  const r = planClaim(inp('mission', `${today}:${m.id}`, { day: today, id: m.id }), ctx());
  assert.ok(r.ok && r.plan.creditsDelta === m.credits);
  const notToday = ['m-win1', 'm-win2', 'm-win3', 'm-play2', 'm-play4', 'm-pack1', 'm-pack2', 'm-sbc1'].find((id) => !missionsForDay(today).some((x) => x.id === id))!;
  assert.deepEqual(planClaim(inp('mission', `${today}:${notToday}`, { day: today, id: notToday }), ctx()), { ok: false, error: 'unknown_reward' });
  const wk = weekKey(new Date(2026, 10, 2));
  const w = missionsForWeek(wk)[0];
  assert.ok(planClaim(inp('weekly', `${wk}:${w.id}`, { week: wk, id: w.id }), ctx()).ok);
});

test('bônus semanal: exige as 3 semanais no servidor + pack re-rolado bate', () => {
  const wk = weekKey(new Date(2026, 10, 2));
  const seed = 42;
  const keys = rollPack(cat, packById('silver')!, makeRng(((seed * 2654435761) >>> 0) || 1)).map((c) => c.key);
  const cards = keys.map((k, i) => ({ cardId: `b${i}`, cardKey: k }));
  const ops = missionsForWeek(wk).map((m) => claimOpId('weekly', `${wk}:${m.id}`));
  assert.deepEqual(planClaim(inp('weekly-bonus', wk, { week: wk, seed }, cards), ctx({}, ops.slice(0, 2))), { ok: false, error: 'not_reached' });
  assert.ok(planClaim(inp('weekly-bonus', wk, { week: wk, seed }, cards), ctx({}, ops)).ok);
  const swapped = [...cards]; swapped[0] = { ...swapped[0], cardKey: byRarity('icon').key };
  assert.deepEqual(planClaim(inp('weekly-bonus', wk, { week: wk, seed }, swapped), ctx({}, ops)), { ok: false, error: 'pack_mismatch' });
});

test('Gauntlet: estágio N exige o N-1 no servidor; carta Elite só no 5º', () => {
  assert.deepEqual(planClaim(inp('gauntlet', `${today}:2`, { date: today, wins: 2 }), ctx()), { ok: false, error: 'not_reached' });
  const r1 = planClaim(inp('gauntlet', `${today}:1`, { date: today, wins: 1 }), ctx());
  assert.ok(r1.ok && r1.plan.creditsDelta === GAUNTLET_WIN_CREDITS[0]);
  const prev = claimOpId('gauntlet', `${today}:4`);
  assert.deepEqual(planClaim(inp('gauntlet', `${today}:5`, { date: today, wins: 5 }, [{ cardId: 'g', cardKey: byRarity('icon').key }]), ctx({}, [prev])), { ok: false, error: 'bad_cards' });
  assert.ok(planClaim(inp('gauntlet', `${today}:5`, { date: today, wins: 5 }, [{ cardId: 'g', cardKey: byRarity('elite').key }]), ctx({}, [prev])).ok);
});

test('Draft: raridade da tabela e teto por inscrições pagas', () => {
  const card = [{ cardId: 'd', cardKey: byRarity('legendary').key }];
  assert.ok(planClaim(inp('draft', '77', { seed: 77, wins: 4 }, card), ctx()).ok);
  assert.deepEqual(planClaim(inp('draft', '77', { seed: 77, wins: 4 }, card), ctx({ draftClaims24h: 1, draftEntries24h: 1 })), { ok: false, error: 'rate_limited' });
  assert.deepEqual(planClaim(inp('draft', '77', { seed: 77, wins: 2 }, card), ctx()), { ok: false, error: 'bad_cards' });
});

test('passe: premium sem pass:<season> no ledger = locked; carta da raridade do nível', () => {
  const tots = [{ cardId: 'p', cardKey: byRarity('tots').key }];
  assert.deepEqual(planClaim(inp('pass', '3:premium:35', { season: 3, track: 'premium', level: 35 }, tots), ctx()), { ok: false, error: 'locked' });
  assert.ok(planClaim(inp('pass', '3:premium:35', { season: 3, track: 'premium', level: 35 }, tots), ctx({}, ['pass:3'])).ok);
});

test('Promo pago: debita custo do servidor, exige seed crescente', () => {
  const seed = 9;
  const keys = rollPack(cat, PROMO_PACK, makeRng(((seed * 2654435761) >>> 0) || 1)).map((c) => c.key);
  const cards = keys.map((k, i) => ({ cardId: `x${i}`, cardKey: k }));
  const r = planClaim(inp('pack-paid', `promo:${seed}`, { packId: 'promo', seed }, cards), ctx({ promoCost: 30000 }));
  assert.ok(r.ok && r.plan.creditsDelta === -30000 && r.plan.kind === 'pack');
  assert.deepEqual(planClaim(inp('pack-paid', `promo:${seed}`, { packId: 'promo', seed }, cards), ctx({ lastPaidSeed: 9 })), { ok: false, error: 'rate_limited' });
  assert.deepEqual(planClaim(inp('pack-paid', `promo:${seed}`, { packId: 'promo', seed }, cards.slice(1)), ctx()), { ok: false, error: 'bad_cards' });
});

test('starter/objetivo/temporada: forma e raridade conferidas', () => {
  const starter = cat.filter((c) => c.rarity === 'gold' && c.ovr <= 80).slice(0, 5).map((c, i) => ({ cardId: `starter_${i}_x`, cardKey: c.key }));
  assert.ok(planClaim(inp('starter', 'v1', {}, starter), ctx()).ok);
  assert.deepEqual(planClaim(inp('starter', 'v1', {}, [{ cardId: 'starter_0', cardKey: byRarity('icon').key }]), ctx()), { ok: false, error: 'bad_cards' });
  assert.ok(planClaim(inp('season-tier', '2:s-elite', { season: 2, id: 's-elite' }, [{ cardId: 's', cardKey: byRarity('major').key }]), ctx()).ok);
  assert.deepEqual(planClaim(inp('season-tier', '2:s-elite', { season: 2, id: 's-elite' }, []), ctx()), { ok: false, error: 'bad_cards' });
  assert.ok(packMatches(packById('silver')!, 5, rollPack(cat, packById('silver')!, makeRng((5 * 2654435761) >>> 0)).map((c) => c.key), [cat]));
});

test('cópia do prefixo de lenda bate com o bridge', async () => {
  const { LEGACY_PLAYER_PREFIX } = await import('../src/engine/bridge/legacyBridge.js');
  assert.equal(LEGACY_PLAYER_PREFIX, 'rtp_legacy_');
});

test('cópias do Gauntlet no servidor batem com o engine', () => {
  assert.equal(GAUNTLET_TARGET_SRV, GAUNTLET_TARGET);
  assert.deepEqual(GAUNTLET_WIN_CREDITS_SRV, GAUNTLET_WIN_CREDITS);
});
