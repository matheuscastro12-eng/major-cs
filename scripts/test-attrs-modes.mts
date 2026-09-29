// [realismo FM · frente B] Atributos nos modos: cartas do Ultimate (OVR, preço,
// atributos da carta, apelido de raridade) e sessão do Draft (versão + attrs).
// Roda: `tsx --test scripts/test-attrs-modes.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.ts';
import { cardAttrs, catalogIndex, estimateCardValue, type UltCard } from '../src/engine/ultimate/cards.ts';
import { monthIndex } from '../src/engine/ultimate/promos.ts';
import { CardIndex } from '../src/engine/ultimate/cardIndex.ts';
import { attrsOf, legacyFromAttrs, ovrFromAttrs, ovrFromLegacy } from '../src/engine/attrs/model.ts';
import { ULT_CATALOG_MONTHS } from '../server/ultimate-catalog.snapshot.ts';
import { DRAFT_SESSION_VERSION, migrateDraftSession } from '../src/state/draftSession.ts';
import { toTPlayer, buildUserTeam } from '../src/engine/ratings.ts';
import { BASE_TEAMS } from '../src/data/teams.ts';
import type { Tournament } from '../src/types.ts';

const MI = monthIndex(new Date(Date.UTC(2026, 8, 15)));

test('Ultimate: OVR, raridade, preço e face de TODAS as cartas iguais ao snapshot do servidor', () => {
  const cat = buildFullCatalog(CS2_REAL_2026, MI).catalog;
  const snap = ULT_CATALOG_MONTHS[MI];
  assert.ok(snap && snap.length === cat.length);
  const byKey = new Map(snap.map((c) => [c.key, c]));
  for (const c of cat) {
    const s = byKey.get(c.key);
    assert.ok(s, c.key);
    assert.equal(c.ovr, s.ovr, c.key);
    assert.equal(estimateCardValue(c.ovr, c.rarity), s.value, c.key);
    assert.deepEqual(c.stats, s.stats, c.key);
  }
});

test('Ultimate: atributos da carta — base = do jogador; especial leva o boost no OVR', () => {
  const cat = buildFullCatalog(CS2_REAL_2026, MI).catalog;
  const players = new Map(CS2_REAL_2026.flatMap((t) => t.players.map((p) => [p.id, p] as const)));
  const base = cat.find((c) => c.rarity === 'elite')!;
  assert.equal(cardAttrs(base), attrsOf(players.get(base.playerId)!));
  for (const sp of cat.filter((c) => c.rarity === 'totw' || c.rarity === 'tots').slice(0, 10)) {
    const x = cardAttrs(sp);
    assert.ok(Math.abs(ovrFromAttrs(x) - sp.ovr) <= 1, `${sp.key}: ${ovrFromAttrs(x)} × ${sp.ovr}`);
  }
  const orphan: UltCard = { ...base, playerId: 'fora_da_base', key: 'fora_da_base:gold' };
  assert.equal(cardAttrs(orphan).v, 1);
});

test('Ultimate: chave base que mudou de faixa resolve para a carta base atual (coleção não perde carta)', () => {
  const cat = buildFullCatalog(CS2_REAL_2026, MI).catalog;
  const idx = catalogIndex(cat);
  const base = cat.find((c) => c.rarity === 'rareGold')!;
  const oldKey = `${base.playerId}:gold`;
  assert.equal(idx.get(oldKey), base);
  assert.equal(idx.has(oldKey), true);
  assert.equal(idx.get(`${base.playerId}:totw`), cat.find((c) => c.key === `${base.playerId}:totw`));
  assert.equal(new CardIndex(cat).get('ninguem:gold'), undefined);
  const noPromo = cat.find((c) => c.rarity === 'bronze' && !cat.some((x) => x.key === `${c.playerId}:promo`))!;
  assert.equal(idx.get(`${noPromo.playerId}:promo`), undefined, 'chave especial nunca é apelidada');
});

test('Draft: sessão v1 (sem _v) vira v2 com attrs no SEU time; idempotente; IA sem attrs', () => {
  const t1 = BASE_TEAMS[0];
  const t2 = BASE_TEAMS[1];
  const user = buildUserTeam('Meu Time', t1.players.slice(0, 5).map((p) => ({ player: p, from: t1 })), t1.coach);
  const ai = { ...user, id: 'ai', isUser: false, players: t2.players.slice(0, 5).map((p) => toTPlayer(p)) };
  const tournament = { name: 'Major', teams: [user, ai], phase: 'swiss', swissRound: 1, pairings: [], history: [] } as unknown as Tournament;
  const raw = { draft: null, tournament, pickem: { picks: {} } };
  const m = migrateDraftSession(JSON.parse(JSON.stringify(raw)));
  assert.equal(m._v, DRAFT_SESSION_VERSION);
  const mine = m.tournament!.teams.find((t) => t.isUser)!;
  for (const p of mine.players) {
    assert.equal(p.attrs?.v, 1);
    const l = legacyFromAttrs(p.attrs!);
    assert.deepEqual([l.aim, l.awp, l.igl, l.clutch, l.consistency], [p.aim, p.awp, p.igl, p.clutch, p.consistency]);
    assert.equal(ovrFromLegacy(l), p.ovr, 'OVR do draft igual');
  }
  assert.ok(m.tournament!.teams.find((t) => !t.isUser)!.players.every((p) => !p.attrs));
  assert.deepEqual(migrateDraftSession(m), m);
});
