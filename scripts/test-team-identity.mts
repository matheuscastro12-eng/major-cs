// IDENTIDADE TÁTICA EMERGENTE (W5 — engine/career/teamIdentity.ts + match.ts).
// Roda via `npm run test:sim`.
//
// Cobertura:
//   - acumulação com decaimento por partida; leitor tolerante do save
//   - rótulo SÓ com amostra mínima; rótulo emergente bate com as chamadas feitas
//   - casa × contra: a chamada de casa soma, quem te lê desconta (limites ±3/±6pp)
//   - step/peek COM identidade aplica o delta esperado; SEM identidade é
//     bit-a-bit igual ao motor de sempre (mesmo seed → mesmo resultado)
//   - identidade derivada da IA é determinística e legível pelo jogador

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeMatchIdentity, decayIdentity, recordCalls, identityLabel, normalizeIdentity,
  identityRoundDelta, isCounterCall, isHomeCall, derivedIdentity, scoutingOf,
  HOME_PP, COUNTER_PP, IDENTITY_MIN_CALLS, IDENTITY_DECAY,
  type IdentityCall, type TeamIdentity,
} from '../src/engine/career/teamIdentity.ts';
import { movesFor } from '../src/engine/career/battleCalls.ts';
import { createMapSim } from '../src/engine/match.ts';
import { makeRng } from '../src/engine/rng.ts';
import type { TTeam, TPlayer, Playstyle } from '../src/types.ts';

const call = (over: Partial<IdentityCall> = {}): IdentityCall =>
  ({ side: 't', call: 'default', stance: 'default', econ: 'full', ...over });
const rushT = (n: number) => Array.from({ length: n }, () => call({ call: 'rush', stance: 'aggressive' }));
const defT = (n: number) => Array.from({ length: n }, () => call());
const saveLow = (n: number) => Array.from({ length: n }, () => call({ side: 'ct', call: 'save', stance: 'cautious', econ: 'low' }));
// amostra EQUILIBRADA (nenhum traço fecha em nenhum recorte): o Camaleão
const rep = (n: number, over: Partial<IdentityCall>) => Array.from({ length: n }, () => call(over));
const MISTO: IdentityCall[] = [
  ...rushT(4), ...defT(4), ...rep(1, { call: 'retake', stance: 'cautious' }),
  ...rep(3, { side: 'ct', call: 'retake', stance: 'cautious' }), ...rep(4, { side: 'ct' }), ...rep(2, { side: 'ct', call: 'rush', stance: 'aggressive' }),
  ...rep(2, { call: 'force', stance: 'aggressive', econ: 'low' }), ...saveLow(2), ...rep(2, { econ: 'low' }),
];

function mkTeam(id: string, strength: number, style: Playstyle = 'balanced', isUser = false): TTeam {
  const players: TPlayer[] = Array.from({ length: 5 }, (_, i) => ({
    id: `${id}-p${i}`, nick: `${id}${i}`, country: 'br', role: i === 0 ? 'AWP' : i === 1 ? 'IGL' : i === 2 ? 'Entry' : 'Rifler',
    playstyle: style, aim: strength, clutch: strength, consistency: strength, awp: strength, igl: strength, form: 1,
  } as unknown as TPlayer));
  return {
    id, name: id, tag: id.slice(0, 3).toUpperCase(), country: 'br', isUser, game: 'CS2',
    colors: ['#111', '#eee'], strength, teamwork: 70, mapPrefs: {},
    coach: { nick: 'coach', name: 'coach', country: 'br', rating: 80, style: 'tactical' }, players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  } as unknown as TTeam;
}

test('acumula com decaimento por partida (o passado pesa menos, nunca some de vez)', () => {
  let id: TeamIdentity | undefined;
  id = closeMatchIdentity(id, rushT(6));
  assert.equal(id.total, 6);
  assert.equal(id.matches, 1);
  id = closeMatchIdentity(id, defT(6));
  // 6 antigas × 0.85 + 6 novas
  assert.ok(Math.abs(id.total - (6 * IDENTITY_DECAY + 6)) < 0.01, `total ${id.total}`);
  assert.equal(id.matches, 2);
  // 30 partidas sem chamada: as migalhas somem e o time volta a "não ter cara"
  for (let i = 0; i < 30; i++) id = decayIdentity(id);
  assert.ok(id.total < 1, 'decaiu');
  assert.equal(identityLabel(id).kind, 'none');
});

test('leitor do save: campo ausente ou lixo → undefined; válido → normalizado', () => {
  assert.equal(normalizeIdentity(undefined), undefined);
  assert.equal(normalizeIdentity('x'), undefined);
  assert.equal(normalizeIdentity([1]), undefined);
  const n = normalizeIdentity({ hist: { 't|rush|aggressive|full': 4, 'lixo': 2, 'ct|retake|cautious|full': -1 }, matches: '3' });
  assert.deepEqual(n, { hist: { 't|rush|aggressive|full': 4 }, total: 4, matches: 3 });
});

test('rótulo SÓ com amostra mínima; abaixo dela o time ainda não tem cara', () => {
  const pouco = recordCalls(undefined, rushT(IDENTITY_MIN_CALLS - 1));
  assert.equal(identityLabel(pouco).kind, 'none');
  assert.equal(identityLabel(pouco).strength, 0);
  const bastante = recordCalls(undefined, rushT(IDENTITY_MIN_CALLS));
  assert.equal(identityLabel(bastante).kind, 'rush');
});

test('rótulo emergente: rush no T vira "Time de rush", save sem caixa vira "Economia de ferro", misto vira Camaleão', () => {
  const rusher = recordCalls(undefined, [...rushT(10), ...defT(4), ...saveLow(4)]);
  const l = identityLabel(rusher);
  assert.equal(l.kind, 'rush');
  assert.equal(l.label, 'Time de rush');
  assert.ok(l.strength > 0 && l.strength <= 1);
  assert.ok(Math.abs(l.share - 10 / 14) < 0.001, 'a estatística é o recorte do lado T');
  assert.match(l.stat, /71% dos rounds de T abriram em rush/);
  // mais amostra = mais força (confiança)
  const maisForte = identityLabel(recordCalls(rusher, [...rushT(10), ...defT(4), ...saveLow(4)]));
  assert.ok(maisForte.strength > l.strength);

  const ferro = identityLabel(recordCalls(undefined, [...saveLow(8), ...defT(6)]));
  assert.equal(ferro.kind, 'iron');
  assert.match(ferro.stat, /100% dos rounds sem caixa foram save/);

  const misto = identityLabel(recordCalls(undefined, MISTO));
  assert.equal(misto.kind, 'chameleon');
  assert.equal(misto.label, 'Camaleão');
});

test('casa × contra: a chamada de casa soma, quem te estuda desconta — nos limites definidos', () => {
  const label = identityLabel(recordCalls(undefined, rushT(40))); // força ~1
  assert.ok(label.strength > 0.99, `força ${label.strength}`);
  const mod = { team: 0 as const, label, readBy: 1, auto: false };
  // rush no T = casa; IA lendo tudo = contra cheio
  const d = identityRoundDelta(mod, { ownerSide: 't', ownerEcon: 'full', ownerAction: { call: 'rush', stance: 'aggressive' }, oppAuto: true });
  assert.equal(d.home, true);
  assert.equal(d.countered, true);
  assert.ok(Math.abs(d.pp - (HOME_PP - COUNTER_PP)) < 1e-9);
  assert.ok(d.notes.some((n) => /estudou o seu rush/.test(n)), d.notes.join(' | '));
  // ninguém te lê: só o bônus
  const solto = identityRoundDelta({ ...mod, readBy: 0 }, { ownerSide: 't', ownerEcon: 'full', ownerAction: { call: 'rush', stance: 'aggressive' }, oppAuto: true });
  assert.ok(Math.abs(solto.pp - HOME_PP) < 1e-9 && !solto.countered);
  // chamada fora de casa (retake no CT) = nada
  const fora = identityRoundDelta(mod, { ownerSide: 'ct', ownerEcon: 'full', ownerAction: { call: 'retake', stance: 'cautious' }, oppAuto: true });
  assert.equal(fora.pp, 0);
  // adversário HUMANO só contra se fizer a chamada certa (segurar o CT)
  const humanoErrou = identityRoundDelta(mod, { ownerSide: 't', ownerEcon: 'full', ownerAction: { call: 'rush', stance: 'aggressive' }, oppAction: { call: 'rush', stance: 'aggressive' }, oppAuto: false });
  assert.equal(humanoErrou.countered, false);
  const humanoLeu = identityRoundDelta(mod, { ownerSide: 't', ownerEcon: 'full', ownerAction: { call: 'rush', stance: 'aggressive' }, oppAction: { call: 'retake', stance: 'cautious' }, oppAuto: false });
  assert.equal(humanoLeu.countered, true);
  // Camaleão: sem bônus e sem leitura
  const cam = identityLabel(recordCalls(undefined, MISTO));
  assert.equal(cam.kind, 'chameleon');
  assert.equal(identityRoundDelta({ ...mod, label: cam }, { ownerSide: 't', ownerEcon: 'full', ownerAction: { call: 'rush', stance: 'aggressive' }, oppAuto: true }).pp, 0);
  // tabela de casa/contra é coerente
  assert.equal(isHomeCall(label, call({ call: 'rush', stance: 'aggressive' })), true);
  assert.equal(isCounterCall(label, call({ side: 'ct', call: 'retake', stance: 'cautious' })), true);
  assert.equal(isCounterCall(label, call({ side: 't', call: 'retake', stance: 'cautious' })), false);
});

test('motor: SEM identidade é bit-a-bit o de sempre; COM identidade o delta do round é o esperado', () => {
  const a = mkTeam('alpha', 72, 'aggressive', true);
  const b = mkTeam('beta', 70);
  const play = (opts?: Parameters<typeof createMapSim>[5]) => {
    const sim = createMapSim(makeRng(4242), a, b, 'mirage', -1, opts);
    const probs: number[] = [];
    while (!sim.done()) { probs.push(sim.peekWinProb(0)); sim.step(null, { team: 0, mode: 'aggressive' }, { team: 0, kind: 'rush' }); }
    return { score: sim.score(), probs, feed: sim.killFeed().length };
  };
  const semA = play();
  const semB = play({});
  const semC = play({ identity: [] });
  assert.deepEqual(semA, semB);
  assert.deepEqual(semA, semC, 'lista vazia de identidade não muda nada');

  const label = identityLabel(recordCalls(undefined, rushT(40)));
  const sim = createMapSim(makeRng(4242), a, b, 'mirage', -1, { identity: [{ team: 0, label, readBy: 0.5, auto: false }] });
  const base = createMapSim(makeRng(4242), a, b, 'mirage', -1);
  // mesmo seed: os dois sims consomem o RNG igual até aqui (a identidade não rola dado)
  const tIdx = sim.side()[0] === 't' ? 0 : 1;
  // round de T do usuário: rush = casa (+3pp) e a IA lê metade (−3pp) → líquido 0
  // round de CT: rush está fora de casa → sem desvio
  const p0 = sim.peekWinProb(0, { team: 0, mode: 'aggressive' }, { team: 0, kind: 'rush' });
  const q0 = base.peekWinProb(0, { team: 0, mode: 'aggressive' }, { team: 0, kind: 'rush' });
  const esperado = tIdx === 0 ? HOME_PP - COUNTER_PP * 0.5 : 0;
  assert.ok(Math.abs((p0 - q0) - esperado) < 1e-9, `delta ${p0 - q0} vs ${esperado}`);
  // sem chamada nenhuma, o time explícito joga "o padrão": não é casa do rush
  assert.ok(Math.abs(sim.peekWinProb(0) - base.peekWinProb(0)) < 1e-9);
  // e o step() usa a MESMA fórmula do peek (fonte única)
  const readBy0 = createMapSim(makeRng(4242), a, b, 'mirage', -1, { identity: [{ team: 0, label, readBy: 0, auto: false }] });
  const pHome = readBy0.peekWinProb(0, { team: 0, mode: 'aggressive' }, { team: 0, kind: 'rush' });
  assert.ok(Math.abs((pHome - q0) - (tIdx === 0 ? HOME_PP : 0)) < 1e-9);
});

test('motor: identidade da IA joga sozinha e o jogador pode contrar (mesmo mecanismo nos dois sentidos)', () => {
  const user = mkTeam('alpha', 72, 'balanced', true);
  const ai = mkTeam('beta', 72, 'aggressive');
  const label = identityLabel(derivedIdentity({ ...ai, playbook: 'fast' }));
  assert.equal(label.kind, 'rush', 'elenco agressivo + playbook rápido = Time de rush');
  assert.deepEqual(identityLabel(derivedIdentity({ ...ai, playbook: 'fast' })), label, 'determinística');
  const opts = { identity: [{ team: 1 as const, label, readBy: 0.8, auto: true }] };
  const sim = createMapSim(makeRng(99), user, ai, 'inferno', -1, opts);
  const base = createMapSim(makeRng(99), user, ai, 'inferno', -1);
  const aiIsT = sim.side()[1] === 't';
  // sem chamada minha, a IA rusha "de casa" no T e ganha o bônus (eu ainda não controu)
  const dNoCall = sim.peekWinProb(0) - base.peekWinProb(0);
  assert.ok(Math.abs(dNoCall - (aiIsT ? -HOME_PP * label.strength : 0)) < 1e-9, `IA em casa: ${dNoCall}`);
  // segurando o CT (retake) eu contro: o bônus deles vira desconto
  const dCounter = sim.peekWinProb(0, { team: 0, mode: 'cautious' }, { team: 0, kind: 'retake' }) - base.peekWinProb(0, { team: 0, mode: 'cautious' }, { team: 0, kind: 'retake' });
  const esperado = aiIsT ? -(HOME_PP * label.strength) + COUNTER_PP * label.strength * 0.8 : 0;
  assert.ok(Math.abs(dCounter - esperado) < 1e-9, `contra: ${dCounter} vs ${esperado}`);
});

test('scouting cresce com força e coach; a Chamada marca casa/lido/contra sem inventar %', () => {
  assert.ok(scoutingOf(mkTeam('x', 62)) < scoutingOf(mkTeam('y', 85)));
  assert.ok(scoutingOf(mkTeam('z', 95)) <= 1 && scoutingOf(mkTeam('w', 40)) >= 0);
  const mine = identityLabel(recordCalls(undefined, rushT(40)));
  const opp = identityLabel(derivedIdentity({ ...mkTeam('beta', 72, 'passive'), playbook: 'controlled', coach: { nick: 'c', name: 'c', country: 'br', rating: 80, style: 'discipline' } }));
  const players = mkTeam('alpha', 72, 'aggressive').players;
  const ctx = { side: 't' as const, round: 4, score: [2, 2] as [number, number], money: 6000, isPistol: false, momentum: 0, target: 13 };
  const sem = movesFor(players, ctx);
  assert.ok(sem.every((m) => !m.home && !m.countered && !m.counter && m.identityNote === ''), 'sem ctx.identity nada é marcado');
  const com = movesFor(players, { ...ctx, identity: { mine, opp, myScouting: 0.6, oppScouting: 0.7 } });
  const rush = com.find((m) => m.call === 'rush')!;
  assert.equal(rush.home, true);
  assert.equal(rush.countered, true);
  assert.match(rush.identityNote, /estudou o seu rush: −4%/);
  assert.ok(com.find((m) => m.call === null)!.home === false, 'o padrão não é casa do rush');
  // o adversário é "Retake ou nada"/Muralha: bater rápido no T contra
  assert.ok(['retake', 'cautious', 'iron'].includes(opp.kind), opp.kind);
  if (opp.kind === 'retake') assert.equal(rush.counter, true);
});
