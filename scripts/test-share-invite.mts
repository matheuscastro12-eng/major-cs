// Convite pra compartilhar (pick'em pronto, fim da série, fim da campanha):
// kinds estáveis do share_card, links com atribuição, escolha do texto pronto,
// dados do card da série e a aba de entrada do desafio da campanha.
// Roda `tsx --test scripts/test-share-invite.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_PATH, INVITE_ACTIONS, INVITE_MOMENTS, campaignText, dataUrlBytes, fillTemplate, inviteKind,
  inviteMessage, inviteUrl, scoreFor, seriesDareText,
} from '../src/state/shareInvite.ts';
import { seriesCardData } from '../src/state/seriesShareCard.ts';
import { majorTabFromSearch } from '../src/components/major/majorTabs.ts';
import type { MapResult, SeriesResult } from '../src/types.ts';

const CODE = 'ab12.0123456789abcdefghijklmnopqrstu'; // formato do encodePicks (o conteúdo não importa aqui)

test('kinds: os 6 são estáveis, únicos, kebab-case e cabem nos 40 chars do share_card', () => {
  const all = INVITE_MOMENTS.flatMap((m) => INVITE_ACTIONS.map((a) => inviteKind(m, a)));
  assert.deepEqual(all, ['pickem-desafio', 'pickem-card', 'serie-desafio', 'serie-card', 'campanha-desafio', 'campanha-card']);
  assert.equal(new Set(all).size, all.length);
  for (const k of all) {
    assert.match(k, /^[a-z0-9-]+$/);
    assert.ok(k.length <= 40);
  }
});

test('link do pick\'em: ?p= com o código, ref/utm do kind e &de só no desafio', () => {
  const dare = new URL(inviteUrl('pickem', 'desafio', { code: CODE, nick: 'Fallen BR' }));
  assert.equal(dare.origin, 'https://roadtomajor.com.br');
  assert.equal(dare.pathname, '/major-singapore');
  assert.equal(dare.searchParams.get('p'), CODE);
  assert.equal(dare.searchParams.get('de'), 'fallen-br'); // saneado (cleanNick)
  assert.equal(dare.searchParams.get('ref'), 'pickem-desafio');
  assert.equal(dare.searchParams.get('utm_source'), 'share');
  assert.equal(dare.searchParams.get('utm_medium'), 'pickem-desafio');

  const card = new URL(inviteUrl('pickem', 'card', { code: CODE, nick: 'fallen' }));
  assert.equal(card.searchParams.get('p'), CODE);
  assert.equal(card.searchParams.has('de'), false, 'post público não assina com o nick');
  assert.equal(card.searchParams.get('ref'), 'pickem-card');
});

test('link do pick\'em: sem nick (ou nick que vira vazio) não leva &de; sem código não há link', () => {
  assert.equal(new URL(inviteUrl('pickem', 'desafio', { code: CODE })).searchParams.has('de'), false);
  assert.equal(new URL(inviteUrl('pickem', 'desafio', { code: CODE, nick: '!!!' })).searchParams.has('de'), false);
  assert.equal(inviteUrl('pickem', 'desafio', {}), '');
  assert.equal(inviteUrl('pickem', 'card', { code: '  ' }), '');
});

test('link da série vai pra página inicial e o da campanha pro Modo Major na aba Jogar', () => {
  assert.equal(inviteUrl('serie', 'desafio'), 'https://roadtomajor.com.br/?ref=serie-desafio&utm_source=share&utm_medium=serie-desafio');
  assert.equal(inviteUrl('serie', 'card'), 'https://roadtomajor.com.br/?ref=serie-card&utm_source=share&utm_medium=serie-card');
  const camp = new URL(inviteUrl('campanha', 'desafio'));
  assert.equal(camp.pathname, '/major-singapore');
  assert.equal(camp.searchParams.get('aba'), 'jogar');
  assert.equal(camp.searchParams.get('ref'), 'campanha-desafio');
  assert.equal(camp.search.split('?').length, 2, 'um ? só');
  assert.equal(new URL(inviteUrl('campanha', 'card')).searchParams.get('ref'), 'campanha-card');
  assert.ok(inviteUrl('serie', 'desafio', {}, 'http://localhost:5196').startsWith('http://localhost:5196/?ref=serie-desafio'));
});

test('o link do desafio da campanha abre a aba Jogar; ?p e ?liga continuam valendo', () => {
  assert.equal(majorTabFromSearch(CAMPAIGN_PATH.slice(CAMPAIGN_PATH.indexOf('?'))), 'play');
  assert.equal(majorTabFromSearch(new URL(inviteUrl('campanha', 'desafio')).search), 'play');
  assert.equal(majorTabFromSearch(`?p=${CODE}&aba=jogar`), 'pickem');
  assert.equal(majorTabFromSearch('?liga=ABC123'), 'league');
  assert.equal(majorTabFromSearch('?aba=outra'), 'overview');
  assert.equal(majorTabFromSearch(''), 'overview');
});

test('fillTemplate troca as chaves e não apaga chave sem valor', () => {
  assert.equal(fillTemplate('{a} e {b}', { a: '1', b: '2' }), '1 e 2');
  assert.equal(fillTemplate('{a} e {c}', { a: '1' }), '1 e {c}');
});

test('inviteMessage põe o link na linha de baixo, sem repetir', () => {
  const url = inviteUrl('serie', 'desafio');
  assert.equal(inviteMessage('Duvido:', url), `Duvido:\n${url}`);
  assert.equal(inviteMessage(`Duvido: ${url}`, url), `Duvido: ${url}`);
  assert.equal(inviteMessage('  só texto  ', ''), 'só texto');
});

test('desafio da série: molde de vitória/derrota e o placar do lado do jogador', () => {
  const tpl = { win: '{me} {score} {opp}: duvido', loss: '{me} {score} {opp}: vence?' };
  assert.equal(scoreFor([2, 1], 0), '2-1');
  assert.equal(scoreFor([2, 1], 1), '1-2');
  assert.equal(seriesDareText({ won: true, me: 'FURIA', opp: 'Vitality', mapScore: [2, 1], userIdx: 0 }, tpl), 'FURIA 2-1 Vitality: duvido');
  // jogador no lado 1 que perdeu 2-1: o placar sai 1-2 do ponto de vista dele
  assert.equal(seriesDareText({ won: false, me: 'paiN', opp: 'MOUZ', mapScore: [2, 1], userIdx: 1 }, tpl), 'paiN 1-2 MOUZ: vence?');
});

test('texto da campanha: campeão tem molde próprio; senão vai o recorde em séries', () => {
  const tpl = { champ: 'campeão com {team} ({record})', run: '{team} fez {record}' };
  assert.equal(campaignText({ champion: true, team: 'FURIA', record: [7, 1] }, tpl), 'campeão com FURIA (7–1)');
  assert.equal(campaignText({ champion: false, team: 'FURIA', record: [3, 3] }, tpl), 'FURIA fez 3–3');
});

test('dataUrlBytes decodifica base64 e texto, e recusa o que não é dataURL', () => {
  const png = dataUrlBytes('data:image/png;base64,iVBORw0KGgo=');
  assert.ok(png);
  assert.equal(png.type, 'image/png');
  assert.deepEqual([...png.bytes], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // assinatura do PNG
  const txt = dataUrlBytes('data:,oi%20X');
  assert.ok(txt);
  assert.equal(txt.type, 'text/plain');
  assert.equal(String.fromCharCode(...txt.bytes), 'oi X');
  assert.equal(dataUrlBytes(''), null);
  assert.equal(dataUrlBytes('https://roadtomajor.com.br/og.png'), null);
  assert.equal(dataUrlBytes('data:image/png;base64,@@@'), null);
});

function map(map: string, score: [number, number]): MapResult {
  return {
    map: map as MapResult['map'], pickedBy: -1, score, halves: '', ot: false,
    winner: score[0] > score[1] ? 0 : 1, roundLog: [], killFeed: [], stats: {},
  };
}

test('card da série: tudo orientado pro lado do jogador', () => {
  const series: SeriesResult = { teamIds: ['a', 'b'], maps: [map('mirage', [13, 9]), map('nuke', [7, 13]), map('anubis', [16, 14])], winner: 0, mapScore: [2, 1] };
  const asA = seriesCardData(series, ['FURIA', 'Vitality'], 0, { nick: 'KSCERATO', rating: 1.31, team: 0 });
  assert.equal(asA.won, true);
  assert.deepEqual([asA.me, asA.opp, asA.score], ['FURIA', 'Vitality', [2, 1]]);
  assert.deepEqual(asA.maps.map((m) => [m.label, m.score, m.won]), [['Mirage', [13, 9], true], ['Nuke', [7, 13], false], ['Anubis', [16, 14], true]]);
  assert.deepEqual(asA.potm, { nick: 'KSCERATO', rating: 1.31, team: 'FURIA' });

  const asB = seriesCardData(series, ['FURIA', 'Vitality'], 1, { nick: 'KSCERATO', rating: 1.31, team: 0 });
  assert.equal(asB.won, false);
  assert.deepEqual([asB.me, asB.opp, asB.score], ['Vitality', 'FURIA', [1, 2]]);
  assert.deepEqual(asB.maps.map((m) => [m.score, m.won]), [[[9, 13], false], [[13, 7], true], [[14, 16], false]]);
  assert.equal(asB.potm?.team, 'FURIA', 'o destaque pode ser do adversário');
  assert.equal(seriesCardData(series, ['A', 'B'], 0, null).potm, null);
});
