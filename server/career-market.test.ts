import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesNegotiationFilters } from '../src/engine/career/market.js';

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
