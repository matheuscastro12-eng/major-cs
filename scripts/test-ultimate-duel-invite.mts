// [U11] convite por link: formato estrito do código, URL e textos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { duelInviteText, duelInviteUrl, h2hText, parseDuelInvite } from '../src/engine/ultimate/duelInvite.ts';

test('parse aceita só 5 chars do alfabeto do lobby', () => {
  assert.equal(parseDuelInvite('abcde'), 'ABCDE');
  assert.equal(parseDuelInvite(' K7M2P '), 'K7M2P');
  assert.equal(parseDuelInvite('ABC0E'), null);   // 0 não existe no alfabeto
  assert.equal(parseDuelInvite('ABCD'), null);
  assert.equal(parseDuelInvite(null), null);
});

test('url e textos', () => {
  assert.equal(duelInviteUrl('ABCDE'), 'https://roadtomajor.com.br/ultimate?duelo=ABCDE');
  assert.match(duelInviteText('ABCDE', 'Ana#1'), /Ana#1 te desafiou[\s\S]*ABCDE[\s\S]*duelo=ABCDE/);
  assert.match(h2hText({ oppNick: 'Bo', wins: 2, losses: 1, games: 3, lastAt: 0 }, 'Ana'), /Ana 2–1 Bo · 3 duelo\(s\) · Ana lidera/);
});
