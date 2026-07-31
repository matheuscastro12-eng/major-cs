// DIÁRIO — Lines Históricas (engine/daily). Roda via `npm run test:sim`.
//
// Cobertura:
//   - dataset: 5 jogadores por line, ids únicos, sem nick duplicado NA MESMA line,
//     países alpha-2, nenhuma resposta normalizada vazia ou ambígua dentro da line
//   - dia: dateKey/dayNumber coerentes, epoch = dia 1
//   - lineOfDay: determinístico, mesma line pro mundo inteiro, e SEM repetição
//     dentro de um ciclo completo do pool
//   - matching: caixa/acento/pontuação ignorados, aliases funcionam, palpite
//     curto não conta, slot achado não re-acerta
//   - applyGuess: imutável, erro conta vida, MAX_ERRORS encerra, 5/5 vence
//   - shareTextOf: grid bate com o resultado e leva o link

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_GAMES, DAILY_EPOCH, dateKeyOf, dayNumberOf, lineOfDay, slotOrderOf,
  normalizeGuess, matchGuess, applyGuess, freshProgress, giveUp, shareTextOf, MAX_ERRORS,
} from '../src/engine/daily/lines.ts';
import { HISTORIC_LINES } from '../src/engine/daily/lineups.ts';

test('dataset: lines válidas, sem ambiguidade interna', () => {
  assert.ok(HISTORIC_LINES.length >= 20, 'pool mínimo pra um mês sem repetir muito');
  const ids = new Set<string>();
  for (const line of HISTORIC_LINES) {
    assert.ok(!ids.has(line.id), `id duplicado: ${line.id}`);
    ids.add(line.id);
    assert.equal(line.players.length, 5, `${line.id}: precisa de 5 jogadores`);
    assert.ok(line.context.length > 10 && line.year >= 2012, line.id);
    // dentro da MESMA line, nenhuma resposta (nick ou alias) pode colidir entre
    // dois jogadores — senão o palpite certo acerta o slot errado.
    const seen = new Map<string, string>();
    for (const p of line.players) {
      assert.match(p.country, /^[a-z]{2}$/, `${line.id}/${p.nick}: país`);
      const answers = [normalizeGuess(p.nick), ...(p.aliases ?? []).map(normalizeGuess)];
      for (const a of answers) {
        assert.ok(a.length >= 2, `${line.id}/${p.nick}: resposta vazia/curta`);
        assert.ok(!seen.has(a) || seen.get(a) === p.nick, `${line.id}: "${a}" ambíguo (${seen.get(a)} × ${p.nick})`);
        seen.set(a, p.nick);
      }
    }
  }
  assert.ok(DAILY_GAMES.some((g) => g.id === 'lines'));
});

test('dia: epoch é o dia 1 e a contagem avança por data local', () => {
  assert.equal(dayNumberOf(DAILY_EPOCH), 1);
  assert.equal(dayNumberOf('2026-08-02'), 2);
  assert.equal(dayNumberOf('2026-08-31'), 31);
  assert.equal(dateKeyOf(new Date(2026, 7, 5)), '2026-08-05');
});

test('lineOfDay: determinística e sem repetição dentro de um ciclo', () => {
  const N = HISTORIC_LINES.length;
  const seen = new Set<string>();
  for (let d = 0; d < N; d++) {
    const key = dateKeyOf(new Date(2026, 7, 1 + d));   // datas LOCAIS — como o jogo usa
    const a = lineOfDay(key);
    const b = lineOfDay(key);
    assert.equal(a.id, b.id, 'não é determinística');
    assert.ok(!seen.has(a.id), `repetiu ${a.id} dentro do ciclo (dia ${d + 1})`);
    seen.add(a.id);
  }
  assert.equal(seen.size, N, 'o ciclo não cobre o pool inteiro');
  // a ordem dos slots também é estável por dia
  const key = '2026-08-03';
  assert.deepEqual(slotOrderOf(key, lineOfDay(key)), slotOrderOf(key, lineOfDay(key)));
});

test('matching: caixa, acento, pontuação e aliases', () => {
  const lg = HISTORIC_LINES.find((l) => l.id === 'lg-2016')!;
  const iFallen = lg.players.findIndex((p) => p.nick === 'FalleN');
  assert.equal(matchGuess(lg, 'FalleN', []), iFallen);
  assert.equal(matchGuess(lg, 'fallen', []), iFallen);
  assert.equal(matchGuess(lg, '  FALLÉN!! ', []), iFallen);
  const nip = HISTORIC_LINES.find((l) => l.id === 'nip-2013')!;
  const iGtr = nip.players.findIndex((p) => p.nick === 'GeT_RiGhT');
  assert.equal(matchGuess(nip, 'getright', []), iGtr);
  assert.equal(matchGuess(nip, 'get right', []), iGtr);
  const vp = HISTORIC_LINES.find((l) => l.id === 'vp-2014')!;
  const iPasha = vp.players.findIndex((p) => p.nick === 'pashaBiceps');
  assert.equal(matchGuess(vp, 'pasha', []), iPasha);
  // errado, curto e slot já achado
  assert.equal(matchGuess(lg, 'device', []), null);
  assert.equal(matchGuess(lg, 'f', []), null);
  assert.equal(matchGuess(lg, 'fallen', [iFallen]), null);
});

test('applyGuess: vidas, vitória, derrota e imutabilidade', () => {
  const lg = HISTORIC_LINES.find((l) => l.id === 'lg-2016')!;
  let p = freshProgress();
  // erro consome vida; repetição de erro TAMBÉM (não há memória de chutes) —
  // mas palpite curto não.
  p = applyGuess(lg, p, 'device').progress;
  assert.equal(p.errors, 1);
  assert.equal(applyGuess(lg, p, 'x').progress.errors, 1);
  // acerta os 5 → vence
  for (const nick of ['fallen', 'cold', 'fer', 'fnx', 'taco']) p = applyGuess(lg, p, nick).progress;
  assert.equal(p.won, true);
  assert.equal(p.done, true);
  assert.equal(p.found.length, 5);
  // done é terminal
  assert.equal(applyGuess(lg, p, 'device').progress, p);
  // estourar as vidas encerra sem vitória
  let q = freshProgress();
  for (let i = 0; i < MAX_ERRORS; i++) q = applyGuess(lg, q, `errado${i}`).progress;
  assert.equal(q.done, true);
  assert.equal(q.won, false);
  // giveUp encerra na hora; freshProgress não foi mutado em nada acima
  assert.deepEqual(freshProgress(), { found: [], errors: 0, done: false, won: false });
  assert.equal(giveUp(freshProgress()).done, true);
});

test('shareTextOf: grid e link coerentes', () => {
  const lg = HISTORIC_LINES.find((l) => l.id === 'lg-2016')!;
  let p = freshProgress();
  p = applyGuess(lg, p, 'fallen').progress;
  p = applyGuess(lg, p, 'errado').progress;
  p = giveUp(p);
  const text = shareTextOf('2026-08-01', lg, p, 0);
  assert.ok(text.includes('#1'));
  assert.ok(text.includes('🟩'));
  assert.equal((text.match(/🟥/g) ?? []).length, 4);
  assert.ok(text.includes('❌'));
  assert.ok(text.includes('roadtomajor.com.br/diario'));
  // vitória com streak mostra o fogo
  let w = freshProgress();
  for (const nick of ['fallen', 'cold', 'fer', 'fnx', 'taco']) w = applyGuess(lg, w, nick).progress;
  const wt = shareTextOf('2026-08-02', lg, w, 3);
  assert.ok(wt.includes('🟩🟩🟩🟩🟩'));
  assert.ok(wt.includes('🔥 3'));
});
