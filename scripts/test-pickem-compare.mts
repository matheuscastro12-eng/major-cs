// Desafio do Pick'em: comparação de dois palpites, apelido do link (&de=) e a
// lista de amigos guardados. Roda `tsx --test scripts/test-pickem-compare.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import {
  bracketSides, decodePicks, emptyPicks, encodePicks, normalizePicks, pickPool, picksComplete,
  type MajorData, type MajorPicks,
} from '../src/engine/majorSingapore.ts';
import { addRival, cleanNick, comparePicks, MAX_RIVALS, parseRivals } from '../src/engine/pickemChallenge.ts';

const D = data as unknown as MajorData;

/**
 * Palpite completo e válido. `from` escolhe a ponta da lista de cada pool
 * ('top' = primeiros 8 por seed, 'bottom' = últimos 8); `side` escolhe qual
 * lado vence cada jogo da chave.
 */
function build(from: 'top' | 'bottom', side: 0 | 1, ext = true): MajorPicks {
  let p = emptyPicks();
  for (const st of [1, 2, 3] as const) {
    const pool = pickPool(D, p, st).map((t) => t.id);
    const k = `s${st}` as 's1' | 's2' | 's3';
    p[k] = from === 'top' ? pool.slice(0, 8) : pool.slice(-8);
    if (ext) {
      p.x30[st - 1] = p[k].slice(0, 2);
      p.x03[st - 1] = pool.filter((id) => !p[k].includes(id)).slice(0, 2);
    }
    p = normalizePicks(D, p);
  }
  for (let i = 0; i < 7; i++) p.bracket[i] = bracketSides(D, p)[i][side];
  return normalizePicks(D, p);
}

test('palpites de teste são completos e válidos', () => {
  for (const p of [build('top', 0), build('top', 1), build('bottom', 0)]) {
    assert.ok(picksComplete(p));
    assert.deepEqual(decodePicks(D, encodePicks(D, p)), p, 'ida e volta pelo link');
  }
});

test('palpites iguais batem em tudo', () => {
  const a = build('top', 0);
  const c = comparePicks(a, structuredClone(a));
  assert.deepEqual(c.stage, [8, 8, 8]);
  assert.equal(c.qualified, 24);
  assert.deepEqual(c.x30, a.x30);
  assert.deepEqual(c.x03, a.x03);
  assert.deepEqual(c.semis, a.bracket.slice(0, 4));
  assert.deepEqual(c.final, a.bracket.slice(4, 6));
  assert.deepEqual(c.champion, { a: a.bracket[6], b: a.bracket[6], same: true });
});

test('palpites totalmente diferentes não batem em nada', () => {
  // Stage 1: seeds 17–24 x 25–32. Stage 2 e 3 têm os seeds diretos em comum no
  // pool, mas 'top' pega os melhores e 'bottom' os piores: sem interseção.
  const a = build('top', 0);
  const b = build('bottom', 1);
  const c = comparePicks(a, b);
  assert.deepEqual(c.stage, [0, 0, 0]);
  assert.equal(c.qualified, 0);
  assert.deepEqual(c.x30, [[], [], []]);
  assert.deepEqual(c.x03, [[], [], []]);
  assert.deepEqual(c.semis, []);
  assert.deepEqual(c.final, []);
  assert.notEqual(c.champion.a, c.champion.b);
  assert.equal(c.champion.same, false);
  // e é simétrico nas contagens
  assert.deepEqual(comparePicks(b, a).stage, c.stage);
});

test('parcial: mesmos classificados, chave invertida', () => {
  const a = build('top', 0);
  const b = build('top', 1); // mesmos 24 classificados, vencedores do outro lado
  const c = comparePicks(a, b);
  assert.deepEqual(c.stage, [8, 8, 8]);
  assert.equal(c.qualified, 24);
  assert.deepEqual(c.semis, [], 'cada quarta teve o outro vencedor');
  assert.equal(c.champion.same, false);
  assert.ok(c.champion.a && c.champion.b);
});

/** troca os 3 últimos classificados do Stage 1 pelos 3 primeiros que ficaram de fora */
function swapThreeInStage1(a: MajorPicks): MajorPicks {
  const outs = pickPool(D, emptyPicks(), 1).map((t) => t.id).filter((id) => !a.s1.includes(id)).slice(0, 3);
  return normalizePicks(D, { ...structuredClone(a), s1: [...a.s1.slice(0, 5), ...outs] });
}

test('parcial: 5 de 8 no Stage 1, o resto igual e o mesmo campeão', () => {
  // 'top' classifica os seeds diretos no Stage 2 e 3: mexer no Stage 1 não muda o resto
  const a = build('top', 0);
  const b = swapThreeInStage1(a);
  const c = comparePicks(a, b);
  assert.deepEqual(c.stage, [5, 8, 8]);
  assert.equal(c.qualified, 21);
  assert.deepEqual(c.x30[0], a.x30[0], 'os dois 3-0 do Stage 1 continuam nos dois');
  assert.deepEqual(c.x03[0], [], 'os 0-3 do a viraram classificados do b');
  assert.deepEqual(c.x30[1], a.x30[1]);
  assert.deepEqual(c.semis, a.bracket.slice(0, 4));
  assert.equal(c.champion.same, true);
});

test('parcial: mudança em cascata e palpite do outro sem campeão', () => {
  // 'bottom' leva os do Stage 1 adiante: trocar 3 deles desfaz o Stage 2, o 3 e a chave do b
  const a = build('bottom', 0);
  const b = swapThreeInStage1(a);
  assert.ok(!picksComplete(b));
  const c = comparePicks(a, b);
  assert.deepEqual(c.stage, [5, 5, 0]);
  assert.equal(c.qualified, 10);
  assert.deepEqual(c.semis, []);
  assert.equal(c.champion.b, '');
  assert.equal(c.champion.same, false, 'sem campeão do outro lado não é "mesmo campeão"');
});

test('campeão: igual com chave diferente, e palpite sem campeão nunca é "mesmo campeão"', () => {
  const a = build('top', 0);
  const b = structuredClone(a);
  // muda só um vencedor de quartas que não chegou à final
  const sides = bracketSides(D, b);
  const g = [0, 1, 2, 3].find((i) => !b.bracket.slice(4).includes(b.bracket[i]))!;
  b.bracket[g] = sides[g].find((id) => id !== b.bracket[g])!;
  const n = normalizePicks(D, b);
  const c = comparePicks(a, n);
  assert.equal(c.semis.length, 3);
  assert.equal(c.champion.same, true);

  const vazio = comparePicks(emptyPicks(), emptyPicks());
  assert.deepEqual(vazio.champion, { a: '', b: '', same: false });
  assert.equal(vazio.qualified, 0);
  assert.deepEqual(comparePicks(a, emptyPicks()).semis, []);
});

test('comparação ignora repetidos e vazios', () => {
  const a = { ...emptyPicks(), s1: ['x', 'x', 'y', ''], bracket: ['', '', '', '', '', '', ''] };
  const b = { ...emptyPicks(), s1: ['x', 'y', 'z', ''], bracket: ['', '', '', '', '', '', ''] };
  assert.equal(comparePicks(a, b).stage[0], 2);
});

test('apelido do link: saneado para [a-z0-9_-]{1,20}', () => {
  assert.equal(cleanNick('Matheus'), 'matheus');
  assert.equal(cleanNick('  João Pé de Feijão  '), 'joao-pe-de-feijao');
  assert.equal(cleanNick('xX_Pro_Xx'), 'xx_pro_xx');
  assert.equal(cleanNick('fallen<script>'), 'fallenscript');
  assert.equal(cleanNick('a'.repeat(40)), 'a'.repeat(20));
  assert.equal(cleanNick('abcdefghijklmnopqrs tuvwxyz'), 'abcdefghijklmnopqrs', 'corte não termina em hífen');
  assert.equal(cleanNick('--dev--'), 'dev');
  for (const bad of ['', '   ', '😀😀', '---', '__', '!!!', null, undefined, 42, {}]) assert.equal(cleanNick(bad), '', String(bad));
  for (const s of ['Ana Flávia', 'S1MPLE', 'zywOo', 'ñandú', 'a b c d e f g h i j k l']) assert.match(cleanNick(s), /^[a-z0-9_-]{1,20}$/);
});

test('amigos guardados: o mais recente primeiro, sem repetir, até 5', () => {
  const codes = [build('top', 0), build('top', 1), build('bottom', 0), build('bottom', 1), build('top', 0, false), build('bottom', 1, false)]
    .map((p) => encodePicks(D, p));
  assert.equal(new Set(codes).size, codes.length, 'códigos distintos');
  let list = addRival([], { code: codes[0], nick: 'Ana' });
  assert.deepEqual(list, [{ code: codes[0], nick: 'ana' }]);
  list = addRival(list, { code: codes[1], nick: '' });
  list = addRival(list, { code: codes[0].toUpperCase(), nick: '' });
  assert.deepEqual(list.map((r) => r.code), [codes[0], codes[1]], 'o mesmo código volta pra frente');
  assert.equal(list[0].nick, 'ana', 'sem apelido novo, fica o antigo');
  for (const c of codes) list = addRival(list, { code: c, nick: '' });
  assert.equal(list.length, MAX_RIVALS);
  assert.equal(list[0].code, codes[codes.length - 1]);
  assert.deepEqual(addRival(list, { code: 'lixo', nick: 'x' }), list, 'código inválido não entra');

  // leitura do localStorage: descarta lixo, repetido e excesso
  assert.deepEqual(parseRivals(null), []);
  assert.deepEqual(parseRivals('x'), []);
  const parsed = parseRivals([{ code: codes[0], nick: 'Zé Ninguém' }, { code: codes[0] }, { code: 'abc' }, 7, null, ...codes.map((code) => ({ code }))]);
  assert.equal(parsed.length, MAX_RIVALS);
  assert.deepEqual(parsed[0], { code: codes[0], nick: 'ze-ninguem' });
  assert.equal(new Set(parsed.map((r) => r.code)).size, parsed.length);
});
