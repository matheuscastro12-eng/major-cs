// Novidades: o modal só abre sozinho para quem já joga. Na 1ª visita (sem
// manager) ele cobria o CTA da landing; o patch atual vira "visto" em silêncio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patchAutoOpen } from '../src/data/patchNotes.ts';

test('1ª visita (sem manager) não abre e marca o patch como visto', () => {
  assert.equal(patchAutoOpen({ unseen: true, hasManager: false, path: '/' }), 'mark-seen');
  assert.equal(patchAutoOpen({ unseen: true, hasManager: false, path: '/jogar' }), 'mark-seen');
});

test('quem já tem manager vê o patch novo uma vez', () => {
  assert.equal(patchAutoOpen({ unseen: true, hasManager: true, path: '/jogar' }), 'open');
  assert.equal(patchAutoOpen({ unseen: true, hasManager: true, path: '/' }), 'open');
});

test('patch já visto nunca abre', () => {
  assert.equal(patchAutoOpen({ unseen: false, hasManager: true, path: '/jogar' }), 'skip');
  assert.equal(patchAutoOpen({ unseen: false, hasManager: false, path: '/' }), 'skip');
});

test('link do pick\'em do Major não abre nem marca (o palpite vem primeiro)', () => {
  assert.equal(patchAutoOpen({ unseen: true, hasManager: true, path: '/major-singapore' }), 'skip');
  assert.equal(patchAutoOpen({ unseen: true, hasManager: false, path: '/Major-Singapore?p=x' }), 'skip');
});
