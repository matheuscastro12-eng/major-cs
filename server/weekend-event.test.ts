// [URG-2] mescla do evento automático de fim de semana nos itens de live-ops:
// entra só na janela, item manual com o mesmo id vence, payload passa no
// validador do kind 'event', e a def por id funciona com a janela fechada.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateEventPayload, type LiveopsRow } from './liveops.js';
import {
  activeWeekendEventDef, mergeWeekendEvent, weekendEventDef, weekendEventDefById, weekendEventPayload, weekendLiveopsRow,
} from './weekendEvent.js';
import { weekendEventById } from '../src/engine/ultimate/weekendEvent.js';

const cands = [{ key: 'p1:elite', rarity: 'elite' }, { key: 'p2:legendary', rarity: 'legendary' }, { key: 'p3:icon', rarity: 'icon' }];
const catalogFor = () => cands;
const SAT = new Date('2026-09-19T15:00:00Z'); // sábado da semana ISO 38
const TUE = new Date('2026-09-15T15:00:00Z');

const manual = (id: string): LiveopsRow => ({
  id, kind: 'event',
  payload: { version: 2, name: 'Custom', desc: 'manual', rule: { kind: 'ovrcap', max: 90 }, winTiers: [{ wins: 1, credits: 100 }], maxMatches: 5 },
  startsAt: '2026-09-18T00:00:00.000Z', endsAt: '2026-09-21T00:00:00.000Z', enabled: true, createdBy: 'admin', updatedAt: '2026-09-17T00:00:00.000Z',
});

describe('mergeWeekendEvent', () => {
  it('sem nada agendado, o automático da semana entra na janela sex–dom', () => {
    const out = mergeWeekendEvent([], SAT, catalogFor);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'wknd-2026-38');
    assert.equal(out[0].kind, 'event');
    assert.equal(out[0].startsAt, '2026-09-18T00:00:00.000Z');
    assert.equal(out[0].endsAt, '2026-09-21T00:00:00.000Z');
    const p = out[0].payload as { exclusiveCardKey?: string; cardAtWins?: number };
    assert.ok(p.exclusiveCardKey === 'p1:elite' || p.exclusiveCardKey === 'p2:legendary');
    assert.equal(p.cardAtWins, 10);
  });

  it('fora da janela não mexe na lista', () => {
    const rows = [manual('promo-x')];
    assert.deepEqual(mergeWeekendEvent(rows, TUE, catalogFor), rows);
    assert.deepEqual(mergeWeekendEvent([], TUE, catalogFor), []);
  });

  it('item manual com o mesmo id sobrescreve o automático', () => {
    const rows = [manual('wknd-2026-38')];
    const out = mergeWeekendEvent(rows, SAT, catalogFor);
    assert.equal(out.length, 1);
    assert.equal((out[0].payload as { name: string }).name, 'Custom');
  });

  it('manuais de outro id continuam na frente; o automático vai pro fim', () => {
    const out = mergeWeekendEvent([manual('copa-br')], SAT, catalogFor);
    assert.deepEqual(out.map((r) => r.id), ['copa-br', 'wknd-2026-38']);
  });

  it('payload do automático passa no validador do kind event', () => {
    const ev = weekendEventById('wknd-2026-38', cands)!;
    const v = validateEventPayload(weekendEventPayload(ev));
    assert.equal(v.ok, true);
    if (v.ok) { assert.equal(v.payload.exclusiveCardKey, ev.exclusiveCardKey); assert.equal(v.payload.cardAtWins, 10); }
    assert.equal(weekendLiveopsRow(ev).createdBy, 'auto');
  });
});

describe('def por id', () => {
  it('reconstrói com a janela fechada; id que não é de fim de semana → null', () => {
    const def = weekendEventDefById('wknd-2026-38', catalogFor)!;
    assert.equal(def.id, 'wknd-2026-38');
    assert.ok(def.exclusiveCardKey);
    assert.equal(weekendEventDefById('copa-br', catalogFor), null);
    assert.equal(weekendEventDefById('wknd-2027-53', catalogFor), null);
  });

  it('activeWeekendEventDef só na janela', () => {
    assert.equal(activeWeekendEventDef('wknd-2026-38', SAT)?.id, 'wknd-2026-38');
    assert.equal(activeWeekendEventDef('wknd-2026-38', TUE), null);
    assert.equal(activeWeekendEventDef('wknd-2026-38', new Date('2026-09-21T00:00:00Z')), null);
  });

  it('wrapper com o snapshot do servidor sorteia uma Elite/Lendário real', () => {
    const def = weekendEventDef('wknd-2026-38')!;
    assert.ok(def.exclusiveCardKey && /:(elite|legendary)$/.test(def.exclusiveCardKey), def.exclusiveCardKey ?? 'null');
    assert.equal(weekendEventDef('wknd-2026-39')!.exclusiveCardKey === def.exclusiveCardKey, false);
  });
});
