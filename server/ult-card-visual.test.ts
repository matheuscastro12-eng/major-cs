// Visual das cartas do Ultimate (src/components/ultimate/cardVisual.ts), que saiu
// da UltimateSquadScreen: boost de evolução com clamp e pele por raridade.
import assert from 'node:assert/strict';
import test from 'node:test';
import { boostCard, cardSkin, inkOnLight } from '../src/components/ultimate/cardVisual.js';
import { EVO_MAX } from '../src/engine/ultimate/state.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';

const base = { ovr: 97, rarity: 'gold', stats: { tiro: 98, mira: 90, reflexo: 80, visao: 70, clutch: 60, util: 50 } } as unknown as UltCard;

test('boostCard: sem boost devolve a mesma carta', () => {
  assert.equal(boostCard(base, 0), base);
  assert.equal(boostCard(base, undefined), base);
});

test('boostCard: soma o nível, limita em 99 e em EVO_MAX', () => {
  const b = boostCard(base, 2);
  assert.equal(b.ovr, 99);
  assert.equal(b.stats.tiro, 99);
  assert.equal(b.stats.util, 52);
  assert.equal(boostCard(base, 999).stats.util, 50 + EVO_MAX);
});

test('cardSkin: especiais escuras, comuns claras', () => {
  assert.equal(cardSkin('legendary').dark, true);
  assert.equal(cardSkin('gold' as UltCard['rarity']).dark, false);
});

test('inkOnLight: escurece cor clara e mantém hex inválido', () => {
  assert.equal(inkOnLight('#000000'), '#000000');
  assert.notEqual(inkOnLight('#ffffff'), '#ffffff');
  assert.equal(inkOnLight('red'), 'red');
});
