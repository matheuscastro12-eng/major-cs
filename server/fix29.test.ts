// [FIX29] duelo ("o draft já começou"), aviso de convidado e logos do Modo Major.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DRAFT_STARTED_ERR, startResultError, staleRoomError } from '../src/state/duelStart';
import { GUEST_BANNER_SNOOZE_MS, guestBannerVisible } from '../src/state/guestBanner';
import { logoForName } from '../src/data/media';
import major from '../src/data/major-singapore-2026.json';

test('duelo: 409 "já começou" no START não vira erro', () => {
  assert.equal(startResultError({ ok: true }, 'x'), '');
  assert.equal(startResultError({ ok: false, error: DRAFT_STARTED_ERR }, 'x'), '');
  assert.equal(startResultError({ ok: false, error: 'sala cheia' }, 'x'), 'sala cheia');
  assert.equal(startResultError(null, 'falhou'), 'falhou');
});

test('duelo: erro "já começou" é limpo quando a sala avança', () => {
  assert.equal(staleRoomError(DRAFT_STARTED_ERR, 'waiting', 'drafting'), true);
  assert.equal(staleRoomError(DRAFT_STARTED_ERR, 'drafting', 'done'), true);
  assert.equal(staleRoomError(DRAFT_STARTED_ERR, 'drafting', 'drafting'), false);
  assert.equal(staleRoomError('versão incompatível', 'drafting', 'done'), false);
  assert.equal(staleRoomError(DRAFT_STARTED_ERR, 'done', 'waiting'), false);
});

test('aviso de convidado: só no hub e no fim de run, com ✕ por 7 dias', () => {
  const now = 1_800_000_000_000;
  assert.equal(guestBannerVisible({ guest: true, tab: 'hub', now }), true);
  for (const tab of ['squad', 'store', 'ranked', 'duelo', 'draft', 'mercado']) assert.equal(guestBannerVisible({ guest: true, tab, now }), false, tab);
  assert.equal(guestBannerVisible({ guest: true, tab: 'run-end', runOver: true, now }), true);
  assert.equal(guestBannerVisible({ guest: true, tab: 'hub', dismissedAt: now - 1000, now }), false);
  assert.equal(guestBannerVisible({ guest: true, tab: 'hub', dismissedAt: now - GUEST_BANNER_SNOOZE_MS - 1, now }), true);
  assert.equal(guestBannerVisible({ guest: false, tab: 'hub', now }), false);
});

const SEM_LOGO = ['Aurora Gaming', 'GamerLegion', 'FUT Esports', 'PARIVISION', 'B8', 'BetBoom', 'magic', 'Lynn Vision', 'Wildcard', 'ENVY', 'M80', 'JiJieHao', 'THUNDER dOWNUNDER'];

test('Major: logos locais por nome; lista exata dos sem logo', () => {
  for (const n of ['Team Vitality', 'Natus Vincere', 'MOUZ', 'The MongolZ', 'FURIA', 'G2 Esports', 'Team Spirit', 'FaZe Clan']) {
    const l = logoForName(n);
    assert.ok(l && l.startsWith('/logos/') && !/liquipedia/i.test(l), n);
  }
  const teams = ((major as { teams?: { name: string; id?: string }[] }).teams ?? []);
  const missing = teams.filter((t) => !logoForName(t.name, t.id)).map((t) => t.name).sort();
  if (teams.length) assert.deepEqual(missing, [...SEM_LOGO].sort());
  for (const n of SEM_LOGO) assert.equal(logoForName(n), undefined, n);
});
