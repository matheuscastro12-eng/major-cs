// Fixtures dos testes (sem node:test aqui, para o tsc do app não reclamar).
import { ALL_ATTRS, type AttrKey } from '../../engine/attributes';
import { HIDDEN_KEYS, type HiddenKey, type PlayerAttrs } from '../../engine/attrs/model';
import type { ClutchConfig } from '../types';

export function flatAttrs(v: number, over: Partial<Record<AttrKey, number>> = {}, hidden = 10): PlayerAttrs {
  const a = Object.fromEntries(ALL_ATTRS.map((k) => [k, v])) as Record<AttrKey, number>;
  const h = Object.fromEntries(HIDDEN_KEYS.map((k) => [k, hidden])) as Record<HiddenKey, number>;
  return { v: 1, a: { ...a, ...over }, h, ca: 100, pa: 150 };
}

export function demoConfig(seed = 42, n = 3, attr = 12): ClutchConfig {
  return {
    map: 'nuke', scenario: 'postplant-B-1v3', hp: 100, armor: 100,
    weapons: { primary: 'rifle', secondary: 'pistol' }, seed,
    opponents: Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, role: 'Rifler' as const, attrs: flatAttrs(attr + i) })),
  };
}
