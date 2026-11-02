// [U12] elegibilidade de evento e prêmio por faixa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventEligibility, eventRewardFor, describeRule } from '../src/engine/ultimate/events.ts';

const five = (ovr: number, extra: Partial<{ region: string; country: string; role: string; tier: number }> = {}) =>
  Array.from({ length: 5 }, (_, i) => ({ pid: `p${i}`, ovr, region: 'samerica', country: 'br', role: ['IGL', 'AWP', 'Entry', 'Support', 'Rifler'][i], tier: 3, ...extra }));

test('regras: teto de OVR, região, país, funções, raridade — com motivo legível', () => {
  assert.equal(eventEligibility(five(80), { kind: 'ovrcap', max: 82 }).ok, true);
  assert.match(eventEligibility(five(85), { kind: 'ovrcap', max: 82 }).reason!, /5 carta\(s\) acima de 82/);
  assert.equal(eventEligibility(five(80), { kind: 'region', region: 'samerica' }).ok, true);
  assert.equal(eventEligibility(five(80, { region: 'europe' }), { kind: 'region', region: 'samerica' }).ok, false);
  assert.equal(eventEligibility(five(80), { kind: 'country', country: 'br' }).ok, true);
  assert.equal(eventEligibility(five(80), { kind: 'roles', roles: ['IGL', 'AWP'] }).ok, true);
  assert.match(eventEligibility(five(80, { role: 'Rifler' }), { kind: 'roles', roles: ['IGL', 'AWP'] }).reason!, /Faltam as funções: IGL, AWP/);
  assert.equal(eventEligibility(five(80, { tier: 8 }), { kind: 'rarity-max', maxTier: 7 }).ok, false);
  assert.equal(eventEligibility(five(80).slice(0, 4), { kind: 'ovrcap', max: 99 }).ok, false);
  assert.equal(describeRule({ kind: 'ovrcap', max: 82 }), 'Teto de 82 OVR por carta');
});

test('prêmio paga a maior faixa alcançada', () => {
  const tiers = [{ wins: 1, credits: 2000 }, { wins: 3, credits: 6000 }, { wins: 5, credits: 12000 }];
  assert.equal(eventRewardFor(0, tiers), 0);
  assert.equal(eventRewardFor(4, tiers), 6000);
  assert.equal(eventRewardFor(9, tiers), 12000);
});
