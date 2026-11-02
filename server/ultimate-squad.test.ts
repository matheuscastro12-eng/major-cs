// [F1] Elenco autoritativo: squad montado no servidor (posse, cartas distintas,
// OVR/química do catálogo ignorando o cliente), migração única ultImport e
// prêmio da ranqueada creditado no servidor.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeDb } from './ultimate-economy.mock.js';
import { buildServerSquad, deriveServerSquad, SERVER_SQUAD_VERSION, SQUAD_EVO_MAX, type OwnedRow } from './ultimate-squad.js';
import { IMPORT_MAX_CARDS, IMPORT_MAX_CREDITS, IMPORT_RARITY_CAP, importLocalCollection, importOpId, planImport } from './ultimate-import.js';
import { creditRankedPvpReward, RANKED_WIN_CREDITS, rankedRewardOpId } from './ultimate-pvp-reward.js';
import { computeChemistry } from '../src/engine/ultimate/chemistry.js';
import { formationById } from '../src/engine/ultimate/formations.js';
import { EVO_MAX } from '../src/engine/ultimate/state.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';
import type { Role } from '../src/types.js';

const stats = { tiro: 80, mira: 80, reflexo: 80, visao: 80, clutch: 80, util: 80 };
function card(key: string, ovr: number, role: Role, team: string, rarity = 'gold'): UltCard {
  return { key, playerId: key.split(':')[0], nick: key, country: 'br', region: 'samerica', role, teamOrigin: team, teamOriginName: team, rarity: rarity as UltCard['rarity'], ovr, stats };
}
const CATALOG = new Map<string, UltCard>([
  ['p1:gold', card('p1:gold', 78, 'IGL', 'T1')],
  ['p2:gold', card('p2:gold', 77, 'Support', 'T1')],
  ['p3:gold', card('p3:gold', 79, 'AWP', 'T1')],
  ['p4:gold', card('p4:gold', 76, 'Entry', 'T2')],
  ['p5:gold', card('p5:gold', 75, 'Rifler', 'T2')],
  ['p6:icon', card('p6:icon', 95, 'AWP', 'T3', 'icon')],
]);
const lookup = (k: string) => CATALOG.get(k) ?? null;
const owned = (ids: [string, string][], meta: Record<string, unknown> = {}): OwnedRow[] => ids.map(([cardId, cardKey]) => ({ cardId, cardKey, meta }));
const FIVE: [string, string][] = [['c1', 'p1:gold'], ['c2', 'p2:gold'], ['c3', 'p3:gold'], ['c4', 'p4:gold'], ['c5', 'p5:gold']];
const IDS = FIVE.map(([id]) => id);

test('EVO_MAX do squad não diverge do engine', () => {
  assert.equal(SQUAD_EVO_MAX, EVO_MAX);
});

test('squad: OVR e química vêm do servidor, ignorando ovr/chem do cliente', () => {
  const r = deriveServerSquad(owned(FIVE), IDS, 'standard', lookup, { name: 'Ana', elo: 1200, approach: 'control', ovr: 99, chem: 1.2 } as never);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.squad.cards, [{ pid: 'p1', ovr: 78 }, { pid: 'p2', ovr: 77 }, { pid: 'p3', ovr: 79 }, { pid: 'p4', ovr: 76 }, { pid: 'p5', ovr: 75 }]);
  const form = formationById('standard');
  const expected = computeChemistry(form.adjacency, form.slots.map((fs, i) => {
    const c = CATALOG.get(FIVE[i][1])!;
    return { slot: fs.slot, slotRole: fs.role, card: { teamOrigin: c.teamOrigin, region: c.region, country: c.country, role: c.role } };
  }));
  assert.equal(r.squad.chemTotal, expected.total);
  // sem estilo, o bônus de duelo vem só das traits das cartas (≥ 1): chem ≥ química pura
  assert.ok(r.squad.chem >= expected.multiplier - 1e-9 && r.squad.chem <= 1.2);
  assert.equal(r.squad.v, SERVER_SQUAD_VERSION);
  assert.equal(r.squad.auth, true);
  assert.equal(r.squad.approach, 'control');
  assert.equal(r.squad.name, 'Ana');
});

test('squad: boost do meta (clamp EVO_MAX) sobe o OVR; boost forjado não passa do teto', () => {
  const rows = owned(FIVE);
  rows[0].meta = { boost: 2 };
  rows[1].meta = { boost: 50 };
  const r = deriveServerSquad(rows, IDS, 'standard', lookup);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.squad.cards[0].ovr, 80);
  assert.equal(r.squad.cards[1].ovr, 77 + SQUAD_EVO_MAX);
});

test('squad: carta que a conta não possui é negada', () => {
  const r = deriveServerSquad(owned(FIVE.slice(0, 4)), IDS, 'standard', lookup);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.error, 'not_owner'); assert.deepEqual(r.cardIds, ['c5']); assert.match(r.message, /conta online/); }
});

test('squad: carta duplicada, tamanho errado e formação inválida', () => {
  const dup = deriveServerSquad(owned(FIVE), ['c1', 'c1', 'c3', 'c4', 'c5'], 'standard', lookup);
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.error, 'duplicate_card');
  const four = deriveServerSquad(owned(FIVE), IDS.slice(0, 4), 'standard', lookup);
  assert.equal(!four.ok && four.error, 'bad_input');
  const form = deriveServerSquad(owned(FIVE), IDS, 'hack', lookup);
  assert.equal(!form.ok && form.error, 'bad_formation');
});

test('squad: carta fora do catálogo do servidor é recusada', () => {
  const rows = owned(FIVE);
  rows[4] = { cardId: 'c5', cardKey: 'forjada:icon', meta: {} };
  const r = deriveServerSquad(rows, IDS, 'standard', lookup);
  assert.equal(!r.ok && r.error, 'unknown_card');
});

test('buildServerSquad lê a posse de rtm_ult_cards (outra conta não serve)', async () => {
  const db = new FakeDb();
  db.cards.set('ana@x', FIVE.map(([cardId, cardKey]) => ({ cardId, cardKey, meta: {}, acquiredAt: '' })));
  const ok = await buildServerSquad(db.sql, 'ana@x', { cardIds: IDS, formationId: 'control' }, lookup);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.squad.formation, 'control');
  const other = await buildServerSquad(db.sql, 'beto@x', { cardIds: IDS, formationId: 'control' }, lookup);
  assert.equal(!other.ok && other.error, 'not_owner');
});

// ------------------------------------------------------------- ultImport

test('planImport: cardKey do catálogo, clamps de boost/ed/style e cartas já no servidor', () => {
  const plan = planImport({
    credits: 10_000,
    cards: [
      { id: 'a', cardKey: 'p1:gold', boost: 9, ed: 3, style: 'fragger' },
      { id: 'b', cardKey: 'nao-existe:gold' },
      { id: 'a', cardKey: 'p2:gold' },
      { id: 'c', cardKey: 'p2:gold', boost: -4, ed: 1.5, style: 'hack' },
      { id: 'srv', cardKey: 'p3:gold' },
      { id: '', cardKey: 'p3:gold' },
    ],
  }, new Set(['srv']), (k) => CATALOG.get(k));
  assert.deepEqual(plan.cards.map((c) => c.cardId), ['a', 'c']);
  assert.deepEqual(plan.cards[0].meta, { acquiredVia: 'import', boost: SQUAD_EVO_MAX, ed: 3, style: 'fragger' });
  assert.deepEqual(plan.cards[1].meta, { acquiredVia: 'import' });
  assert.deepEqual(plan.rejected.map((r) => r.reason).sort(), ['already_on_server', 'duplicate', 'invalid', 'unknown_card']);
  assert.equal(plan.creditsTarget, 10_000);
});

test('planImport: teto por raridade, teto total e teto de créditos', () => {
  const icons = Array.from({ length: IMPORT_RARITY_CAP.icon + 3 }, (_, i) => ({ id: `i${i}`, cardKey: 'p6:icon' }));
  const golds = Array.from({ length: IMPORT_MAX_CARDS + 5 }, (_, i) => ({ id: `g${i}`, cardKey: 'p1:gold' }));
  const plan = planImport({ credits: 9_999_999, cards: [...icons, ...golds] }, new Set(), (k) => CATALOG.get(k));
  assert.equal(plan.cards.filter((c) => c.cardKey === 'p6:icon').length, IMPORT_RARITY_CAP.icon);
  assert.equal(plan.cards.length, IMPORT_MAX_CARDS);
  assert.equal(plan.rejected.filter((r) => r.reason === 'cap_rarity').length, 3);
  assert.ok(plan.rejected.some((r) => r.reason === 'cap_total'));
  assert.equal(plan.creditsTarget, IMPORT_MAX_CREDITS);
});

test('ultImport: importa 1× só por conta (marca + ledger idempotente)', async () => {
  const db = new FakeDb();
  const logs: string[] = [];
  const local = { credits: 7000, cards: [{ id: 'a', cardKey: 'p1:gold', boost: 1 }, { id: 'b', cardKey: 'p6:icon' }] };
  const first = await importLocalCollection(db.sql, 'ana@x', local, (k) => CATALOG.get(k), (m) => logs.push(m));
  assert.deepEqual(first, { ok: true, already: false, imported: 2, rejected: 0, credits: 7000 });
  assert.equal(db.cardsOf('ana@x').length, 2);
  assert.ok(db.ledger.some((l) => l.email === 'ana@x' && l.opId === importOpId('ana@x') && l.kind === 'grant'));
  assert.ok(db.imported.has('ana@x'));
  // segunda chamada (outro aparelho, save inflado): nada entra
  const again = await importLocalCollection(db.sql, 'ana@x', { credits: 50_000, cards: [{ id: 'z', cardKey: 'p6:icon' }] }, (k) => CATALOG.get(k));
  assert.deepEqual(again, { ok: true, already: true, credits: 7000 });
  assert.equal(db.cardsOf('ana@x').length, 2);
  assert.equal(db.wallets.get('ana@x'), 7000);
  assert.equal(db.ledger.filter((l) => l.email === 'ana@x').length, 1);
});

test('ultImport: créditos nunca descem e o excedente do teto é logado', async () => {
  const db = new FakeDb();
  db.wallets.set('beto@x', 20_000); // já tem saldo de packs/mercado no servidor
  const logs: string[] = [];
  const icons = Array.from({ length: IMPORT_RARITY_CAP.icon + 1 }, (_, i) => ({ id: `i${i}`, cardKey: 'p6:icon' }));
  const r = await importLocalCollection(db.sql, 'beto@x', { credits: 5000, cards: icons }, (k) => CATALOG.get(k), (m) => logs.push(m));
  assert.ok(r.ok && !r.already);
  assert.equal(db.wallets.get('beto@x'), 20_000);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /recusada/);
});

// --------------------------------------------------- prêmio da ranqueada

test('prêmio da ranqueada: credita a vitória 1× por partida; derrota não credita', async () => {
  const db = new FakeDb();
  const r1 = await creditRankedPvpReward(db.sql, 'ana@x', 'ABCDE', true);
  assert.ok(r1 && r1.ok && !r1.replayed);
  const r2 = await creditRankedPvpReward(db.sql, 'ana@x', 'ABCDE', true);
  assert.ok(r2 && r2.ok && r2.replayed);
  assert.equal(db.wallets.get('ana@x'), RANKED_WIN_CREDITS);
  assert.ok(db.ledger.some((l) => l.opId === rankedRewardOpId('ABCDE') && l.kind === 'reward'));
  assert.equal(await creditRankedPvpReward(db.sql, 'beto@x', 'ABCDE', false), null);
  assert.equal(db.wallets.get('beto@x'), undefined);
});
