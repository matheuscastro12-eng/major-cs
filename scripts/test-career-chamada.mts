// A CHAMADA (Carreira) — contrato do turno tático inspirado em RPG de turno.
// Fixa: efetividade (estilo × postura), seleção do executor por função+atributo,
// composição do leque (≤4, sempre com saída neutra), contexto econômico e a
// detecção de round-chave (o que vira turno vs o que corre no ticker).
// Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  movesFor, isKeyRound, effectivenessOf, LIMITED_USES_PER_HALF,
  type CallCtx,
} from '../src/engine/career/battleCalls.ts';
import type { Playstyle, Role, TPlayer } from '../src/types.ts';

function player(nick: string, role: Role, playstyle: Playstyle, over: Partial<TPlayer> = {}): TPlayer {
  return {
    id: `p-${nick}`, sourcePlayerId: `s-${nick}`, nick, name: nick, country: 'br',
    role, playstyle, aim: 70, clutch: 70, consistency: 70, awp: 70, igl: 70,
    skill: 70, ovr: 75, ...over,
  } as TPlayer;
}

const SQUAD: TPlayer[] = [
  player('igl', 'IGL', 'balanced', { igl: 90 }),
  player('entry', 'Entry', 'aggressive', { aim: 92 }),
  player('awp', 'AWP', 'passive', { awp: 94 }),
  player('sup', 'Support', 'passive', { clutch: 88 }),
  player('rifle', 'Rifler', 'balanced', { consistency: 91 }),
];

const ctx = (over: Partial<CallCtx> = {}): CallCtx => ({
  side: 't', round: 4, score: [2, 2], money: 6000, isPistol: false, momentum: 0, target: 13, ...over,
});

test('efetividade: postura casa (ou não) com o estilo — o "tipo" do golpe', () => {
  assert.equal(effectivenessOf('aggressive', 'aggressive'), 'super');
  assert.equal(effectivenessOf('passive', 'aggressive'), 'weak');
  assert.equal(effectivenessOf('passive', 'cautious'), 'super');
  assert.equal(effectivenessOf('aggressive', 'cautious'), 'weak');
  assert.equal(effectivenessOf('balanced', 'aggressive'), 'neutral');
  // postura neutra nunca tem vantagem/desvantagem de tipo
  for (const s of ['aggressive', 'balanced', 'passive'] as Playstyle[]) {
    assert.equal(effectivenessOf(s, 'default'), 'neutral');
  }
});

test('executor: cada golpe vai pra função natural, e pelo maior atributo dela', () => {
  const moves = movesFor(SQUAD, ctx());
  const rush = moves.find((m) => m.call === 'rush');
  const retake = moves.find((m) => m.call === 'retake');
  assert.equal(rush?.by.nick, 'entry', 'rush é do Entry');
  assert.equal(rush?.stab, true, 'função casa com o golpe → STAB');
  assert.equal(rush?.effect, 'super', 'Entry agressivo em chamada agressiva');
  assert.equal(retake?.by.nick, 'sup', 'retake é do Support');
  assert.equal(retake?.effect, 'super', 'Support passivo em chamada cautelosa');
  // o atributo exibido é o do EXECUTOR (não uma média do time)
  assert.equal(rush?.attr, 92);
});

test('sem a função natural no elenco, o golpe vai pro melhor atributo — e SEM STAB', () => {
  const semEntry = SQUAD.filter((p) => p.role !== 'Entry');
  const rush = movesFor(semEntry, ctx()).find((m) => m.call === 'rush');
  assert.ok(rush, 'o time joga com o que tem');
  assert.equal(rush!.stab, false, 'improviso não ganha bônus de identidade');
  // sem Entry, todos empatam em mira 70 → vence o primeiro do elenco (estável)
  assert.equal(rush!.by.nick, 'igl');
  // e com alguém claramente melhor de mira, é ELE quem improvisa
  const comAtirador = [...semEntry, player('mira', 'Rifler', 'balanced', { aim: 95 })];
  assert.equal(movesFor(comAtirador, ctx()).find((m) => m.call === 'rush')!.by.nick, 'mira');
});

test('leque: no máximo 4 golpes e SEMPRE uma saída neutra', () => {
  for (const c of [ctx(), ctx({ side: 'ct' }), ctx({ money: 800 }), ctx({ isPistol: true, round: 0 })]) {
    const moves = movesFor(SQUAD, c);
    assert.ok(moves.length <= 4, `no máximo 4 (veio ${moves.length})`);
    assert.ok(moves.some((m) => m.call === null), 'sempre existe o padrão do time');
    assert.ok(moves.every((m) => m.label.length > 0 && m.by), 'todo golpe nomeia quem executa');
  }
});

test('economia: força só aparece sem full buy; save só com o caixa curto; nunca na pistola', () => {
  const rico = movesFor(SQUAD, ctx({ money: 9000 })).map((m) => m.call);
  assert.ok(!rico.includes('force'), 'com dinheiro não faz sentido "forçar"');
  assert.ok(!rico.includes('save'), 'com dinheiro não se poupa');

  const apertado = movesFor(SQUAD, ctx({ money: 3000 })).map((m) => m.call);
  assert.ok(apertado.includes('force'), 'na faixa de force (2600..4500), forçar entra no leque');
  assert.ok(!apertado.includes('save'), '3000 ainda dá force — não é hora de save');
  // faixas EXCLUSIVAS: abaixo de 2600 não existe "forçar" (é eco disfarçado)
  assert.ok(!movesFor(SQUAD, ctx({ money: 1200 })).some((m) => m.call === 'force'));

  const quebrado = movesFor(SQUAD, ctx({ money: 1200 })).map((m) => m.call);
  assert.ok(quebrado.includes('save'), 'caixa curto abre o save');

  const pistola = movesFor(SQUAD, ctx({ isPistol: true, round: 0, money: 800 })).map((m) => m.call);
  assert.ok(!pistola.includes('force') && !pistola.includes('save'), 'pistola não tem decisão de compra');
});

test('força é o golpe de uso limitado (o "PP")', () => {
  const force = movesFor(SQUAD, ctx({ money: 3000 })).find((m) => m.call === 'force');
  assert.equal(force?.cost, 'limited');
  const rush = movesFor(SQUAD, ctx()).find((m) => m.call === 'rush');
  assert.equal(rush?.cost, 'free', 'chamada tática comum não gasta recurso');
  assert.ok(LIMITED_USES_PER_HALF >= 1);
});

test('lado muda a leitura do golpe (mesma mecânica, outra narrativa)', () => {
  const t = movesFor(SQUAD, ctx({ side: 't' })).find((m) => m.call === 'rush');
  const ct = movesFor(SQUAD, ctx({ side: 'ct' })).find((m) => m.call === 'rush');
  assert.notEqual(t?.label, ct?.label, 'o texto acompanha o lado');
  assert.equal(t?.stance, ct?.stance, 'a mecânica entregue ao sim é a mesma');
});

test('round-chave: pistola, match point dos DOIS lados, sequência e overtime', () => {
  assert.equal(isKeyRound(ctx({ isPistol: true, round: 0 })), true, 'pistola');
  assert.equal(isKeyRound(ctx({ score: [12, 8] })), true, 'meu match point');
  assert.equal(isKeyRound(ctx({ score: [8, 12] })), true, 'match point DELES (defender é turno)');
  assert.equal(isKeyRound(ctx({ momentum: 3 })), true, 'embalo');
  assert.equal(isKeyRound(ctx({ momentum: -4 })), true, 'sangria — a hora do pedido de tempo');
  assert.equal(isKeyRound(ctx({ round: 24, score: [12, 12] })), true, 'overtime');
  // e o round comum NÃO para o jogo (é o que segura o ritmo da temporada)
  assert.equal(isKeyRound(ctx({ score: [4, 3], momentum: 1 })), false);
  assert.equal(isKeyRound(ctx({ score: [7, 5], momentum: -2 })), false);
});

test('elenco diferente ⇒ chamadas diferentes (a "personalização" é real)', () => {
  const outro: TPlayer[] = [
    player('zeca', 'IGL', 'aggressive', { igl: 60 }),
    player('duda', 'Entry', 'passive', { aim: 71 }),
    player('nino', 'AWP', 'aggressive', { awp: 80 }),
    player('tuta', 'Support', 'balanced', { clutch: 65 }),
    player('mel', 'Rifler', 'aggressive', { consistency: 77 }),
  ];
  const a = movesFor(SQUAD, ctx());
  const b = movesFor(outro, ctx());
  assert.notDeepEqual(a.map((m) => m.label), b.map((m) => m.label), 'os nomes vêm do elenco');
  const rushA = a.find((m) => m.call === 'rush');
  const rushB = b.find((m) => m.call === 'rush');
  assert.equal(rushA?.effect, 'super', 'Entry agressivo aproveita o rush');
  assert.equal(rushB?.effect, 'weak', 'Entry passivo sofre no rush — a mesma opção é PIOR pra este time');
});
