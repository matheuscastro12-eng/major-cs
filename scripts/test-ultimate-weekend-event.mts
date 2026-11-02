// [URG-2] evento de fim de semana: janela UTC, id determinístico, rotação de
// regras, carta exclusiva determinística (sempre Elite/Lendário), próximo evento.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKEND_EVENT_RULES, WEEKEND_EVENT_CARD_AT_WINS, formatCountdown, isWeekendEventId,
  nextWeekendEvent, weekendEventById, weekendEventFor, weekendExclusiveCardKey,
} from '../src/engine/ultimate/weekendEvent.ts';

const T = (iso: string) => Date.parse(iso);
const cands = [
  { key: 'p1:elite', rarity: 'elite' }, { key: 'p2:legendary', rarity: 'legendary' }, { key: 'p3:elite', rarity: 'elite' },
  { key: 'p4:icon', rarity: 'icon' }, { key: 'p5:gold', rarity: 'gold' }, { key: 'p6:tots', rarity: 'tots' },
];

test('janela sex 00:00 → dom 23:59:59 UTC; fora dela retorna null', () => {
  // 2026-09-14 é segunda (semana ISO 38); sexta = 18/09
  assert.equal(weekendEventFor(T('2026-09-14T12:00:00Z')), null);
  assert.equal(weekendEventFor(T('2026-09-17T23:59:59Z')), null);
  const ev = weekendEventFor(T('2026-09-18T00:00:00Z'));
  assert.ok(ev);
  assert.equal(ev.id, 'wknd-2026-38');
  assert.equal(ev.startsAt, T('2026-09-18T00:00:00Z'));
  assert.equal(ev.endsAt, T('2026-09-21T00:00:00Z'));
  assert.equal(weekendEventFor(T('2026-09-20T23:59:59Z'))?.id, 'wknd-2026-38');
  assert.equal(weekendEventFor(T('2026-09-21T00:00:00Z')), null);
});

test('id determinístico e reconstruível; virada de ano ISO', () => {
  const a = weekendEventFor(T('2026-09-19T10:00:00Z'))!;
  const b = weekendEventById('wknd-2026-38')!;
  assert.deepEqual(a, b);
  // 2027-01-01 é sexta e cai na semana ISO 53 de 2026
  assert.equal(weekendEventFor(T('2027-01-01T05:00:00Z'))?.id, 'wknd-2026-53');
  assert.equal(weekendEventById('wknd-2027-53'), null); // 2027 não tem semana 53
  assert.equal(weekendEventById('wknd-2026-00'), null);
  assert.equal(weekendEventById('major-x'), null);
  assert.equal(isWeekendEventId('wknd-2026-38'), true);
  assert.equal(isWeekendEventId('wknd-2026-3'), false);
});

test('rotação fixa de 4 regras por semana % 4', () => {
  const w38 = weekendEventById('wknd-2026-38')!; // 38 % 4 = 2
  const w39 = weekendEventById('wknd-2026-39')!; // 3
  const w40 = weekendEventById('wknd-2026-40')!; // 0
  const w41 = weekendEventById('wknd-2026-41')!; // 1
  assert.deepEqual(w38.rule, WEEKEND_EVENT_RULES[2].rule);
  assert.deepEqual(w39.rule, WEEKEND_EVENT_RULES[3].rule);
  assert.deepEqual(w40.rule, WEEKEND_EVENT_RULES[0].rule);
  assert.deepEqual(w41.rule, WEEKEND_EVENT_RULES[1].rule);
  assert.deepEqual(weekendEventById('wknd-2026-42')!.rule, w38.rule);
  assert.equal(w38.maxMatches, 20);
  assert.deepEqual(w38.winTiers.map((t) => t.wins), [3, 6, 10]);
  assert.ok(w38.winTiers[0].credits < w38.winTiers[1].credits && w38.winTiers[1].credits < w38.winTiers[2].credits);
  assert.equal(w38.cardAtWins, WEEKEND_EVENT_CARD_AT_WINS);
});

test('carta exclusiva: determinística por semana, sempre Elite/Lendário, independe da ordem', () => {
  const k1 = weekendExclusiveCardKey(2026, 38, cands);
  const k2 = weekendExclusiveCardKey(2026, 38, [...cands].reverse());
  assert.equal(k1, k2);
  assert.ok(['p1:elite', 'p2:legendary', 'p3:elite'].includes(k1!));
  const seen = new Set<string>();
  for (let w = 1; w <= 52; w++) {
    const k = weekendExclusiveCardKey(2026, w, cands)!;
    assert.ok(k.endsWith(':elite') || k.endsWith(':legendary'), `semana ${w} sorteou ${k}`);
    seen.add(k);
  }
  assert.ok(seen.size > 1, 'o seed da semana varia a carta');
  assert.equal(weekendExclusiveCardKey(2026, 38, [{ key: 'x:icon', rarity: 'icon' }]), null);
  assert.equal(weekendEventFor(T('2026-09-19T10:00:00Z'), cands)!.exclusiveCardKey, k1);
  assert.equal(weekendEventFor(T('2026-09-19T10:00:00Z'))!.exclusiveCardKey, null);
});

test('nextWeekendEvent: esta semana antes de sexta, a corrente durante, a próxima depois', () => {
  assert.equal(nextWeekendEvent(T('2026-09-14T12:00:00Z')).id, 'wknd-2026-38');
  assert.equal(nextWeekendEvent(T('2026-09-19T12:00:00Z')).id, 'wknd-2026-38');
  assert.equal(nextWeekendEvent(T('2026-09-21T00:00:00Z')).id, 'wknd-2026-39');
  assert.equal(nextWeekendEvent(T('2026-09-21T00:00:00Z')).startsAt, T('2026-09-25T00:00:00Z'));
});

test('contador regressivo legível', () => {
  assert.equal(formatCountdown(2 * 86_400_000 + 5 * 3_600_000), '2d 5h');
  assert.equal(formatCountdown(5 * 3_600_000 + 12 * 60_000), '5h 12m');
  assert.equal(formatCountdown(12 * 60_000 + 5_000), '12m');
  assert.equal(formatCountdown(-5), '0m');
});
