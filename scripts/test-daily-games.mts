// DIÁRIO — QUEM É O PRO? + O IMPOSTOR (engine/daily/whois.ts + impostor.ts).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import { DAILY_GAMES, dateKeyOf, normalizeGuess } from '../src/engine/daily/lines.ts';
import {
  whoisPool, whoisOfDay, findInPool, applyWhoisGuess, clueOf, freshWhois, giveUpWhois,
  shareTextOfWhois, WHOIS_MAX, WHOIS_MIN_OVR,
} from '../src/engine/daily/whois.ts';
import {
  impostorOfDay, applyPick, freshImpostor, shareTextOfImpostor, IMPOSTOR_TRIES,
} from '../src/engine/daily/impostor.ts';

const key = (d: number) => dateKeyOf(new Date(2026, 7, 1 + d)); // dias a partir da época local

test('registry: os 3 jogos diários registrados com ids únicos', () => {
  assert.deepEqual(DAILY_GAMES.map((g) => g.id), ['lines', 'whois', 'impostor']);
  assert.equal(new Set(DAILY_GAMES.map((g) => g.id)).size, 3);
});

test('whois: pool respeitável, dia determinístico, ciclo sem repetição', () => {
  const pool = whoisPool(CS2_REAL_2026);
  assert.ok(pool.length >= 50, `pool pequeno demais (${pool.length})`);
  assert.ok(pool.every((p) => p.ovr >= WHOIS_MIN_OVR));
  assert.equal(new Set(pool.map((p) => p.id)).size, pool.length);
  // mesmo dia = mesmo pro; dias diferentes variam dentro do ciclo
  assert.equal(whoisOfDay(key(3), pool).id, whoisOfDay(key(3), pool).id);
  const window = Array.from({ length: 30 }, (_, d) => whoisOfDay(key(d), pool).id);
  assert.equal(new Set(window).size, 30, 'repetiu pro dentro do ciclo');
});

test('whois: dicas comparam certo e o jogo fecha nas regras', () => {
  const pool = whoisPool(CS2_REAL_2026);
  const target = whoisOfDay(key(0), pool);
  // acerto: clue toda verde + won
  const self = clueOf(target, target);
  assert.deepEqual([self.team, self.country, self.role, self.ovr], ['hit', 'hit', 'hit', 'hit']);
  let p = applyWhoisGuess(target, freshWhois(), target);
  assert.equal(p.won, true);
  assert.equal(p.done, true);
  // erro até o cap encerra sem vitória
  const wrongs = pool.filter((x) => x.id !== target.id).slice(0, WHOIS_MAX);
  let q = freshWhois();
  for (const w of wrongs) q = applyWhoisGuess(target, q, w);
  assert.equal(q.done, true);
  assert.equal(q.won, false);
  assert.equal(q.guesses.length, WHOIS_MAX);
  // chute repetido é no-op; findInPool resolve com normalização
  assert.equal(applyWhoisGuess(target, q, wrongs[0]), q);
  assert.equal(findInPool(pool, ` ${target.nick.toUpperCase()} `)?.id, target.id);
  assert.equal(findInPool(pool, 'zzz-nao-existe'), null);
  // share carrega o nº do dia e uma linha por chute
  const share = shareTextOfWhois(key(0), q, 3);
  assert.ok(share.includes('QUEM É O PRO?'));
  assert.equal(share.split('\n').length, 3 + WHOIS_MAX); // head + streakline? não: título+head+rows+url
  assert.ok(giveUpWhois(freshWhois()).done);
});

test('impostor: rodada íntegra e determinística — intruso NUNCA é da line', () => {
  for (let d = 0; d < 40; d++) {
    const r = impostorOfDay(key(d));
    assert.equal(r.players.length, 5);
    assert.ok(r.impostorIdx >= 0 && r.impostorIdx < 5);
    // o intruso não pertence (por nick) à line anunciada
    const intruder = r.players[r.impostorIdx];
    assert.notEqual(`${r.from.team} ${r.from.year}`, `${r.team} ${r.year}`);
    const legit = r.players.filter((_, i) => i !== r.impostorIdx).map((p) => normalizeGuess(p.nick));
    assert.ok(!legit.includes(normalizeGuess(intruder.nick)));
    assert.equal(new Set(r.players.map((p) => normalizeGuess(p.nick))).size, 5, `dia ${d}: nick duplicado`);
    // determinístico
    assert.deepEqual(impostorOfDay(key(d)), r);
  }
});

test('impostor: 2 tentativas, acerto fecha, share reflete', () => {
  const r = impostorOfDay(key(1));
  // acerto de primeira
  const won = applyPick(r, freshImpostor(), r.impostorIdx);
  assert.deepEqual([won.done, won.won, won.picks.length], [true, true, 1]);
  assert.ok(shareTextOfImpostor(key(1), r, won, 0).includes('DE PRIMEIRA'));
  // dois erros = eliminado
  const wrongIdxs = [0, 1, 2, 3, 4].filter((i) => i !== r.impostorIdx);
  let p = applyPick(r, freshImpostor(), wrongIdxs[0]);
  assert.equal(p.done, false);
  p = applyPick(r, p, wrongIdxs[1]);
  assert.deepEqual([p.done, p.won], [true, false]);
  assert.equal(p.picks.length, IMPOSTOR_TRIES);
  // pick após done / fora da faixa = no-op
  assert.equal(applyPick(r, p, r.impostorIdx), p);
  assert.deepEqual(applyPick(r, freshImpostor(), 9).picks, []);
});
