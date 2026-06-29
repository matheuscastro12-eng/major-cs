import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlayerCommittedForExit, matchesNegotiationFilters, sortMarketEntries } from '../src/engine/career/market.js';

const player = { nick: 'KSCERATO', role: 'Rifler' as const, country: 'br' };

test('negotiation filters combine query, role and nationality', () => {
  assert.equal(matchesNegotiationFilters(player, 'FURIA', { query: 'ksce', role: 'Rifler', country: 'br' }), true);
  assert.equal(matchesNegotiationFilters(player, 'FURIA', { query: 'furia', role: '', country: '' }), true);
  assert.equal(matchesNegotiationFilters(player, 'FURIA', { query: '', role: 'AWP', country: 'br' }), false);
  assert.equal(matchesNegotiationFilters(player, 'FURIA', { query: '', role: 'Rifler', country: 'us' }), false);
});

test('negotiation query ignores whitespace and letter case', () => {
  assert.equal(matchesNegotiationFilters(player, 'FURIA', { query: '  KsCe  ', role: '', country: '' }), true);
});

test('a player already sold cannot also be offered in a swap', () => {
  const deals = [{ outPlayerIds: ['already-in-swap'] }];
  const sales = [{ playerId: 'already-sold' }];
  assert.equal(isPlayerCommittedForExit('already-in-swap', deals, sales), true);
  assert.equal(isPlayerCommittedForExit('already-sold', deals, sales), true);
  assert.equal(isPlayerCommittedForExit('available', deals, sales), false);
});

test('market entries can be sorted by OVR before visual pagination', () => {
  const entries = [
    { name: 'Beta', ovr: 76 },
    { name: 'Alpha', ovr: 91 },
    { name: 'Zeta', ovr: 76 },
    { name: 'Gamma', ovr: 84 },
  ];

  assert.deepEqual(
    sortMarketEntries(entries, 'ovr-desc', (entry) => entry.ovr, (entry) => entry.name).map((entry) => entry.name),
    ['Alpha', 'Gamma', 'Beta', 'Zeta'],
  );
  assert.deepEqual(
    sortMarketEntries(entries, 'ovr-asc', (entry) => entry.ovr, (entry) => entry.name).map((entry) => entry.name),
    ['Beta', 'Zeta', 'Gamma', 'Alpha'],
  );
});
