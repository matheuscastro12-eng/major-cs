// INTEGRAÇÃO DA FASE 3 (contratos × vestiário × mercado). `npm run test:sim`.
//
//   - pontes: o mercado usa as funções reais de H e G; a régua de tempo de jogo
//     é uma só (expectedPlayTime da G);
//   - lesão: cadeia única de cobertura (banco da escalação → stand-in → reserva
//     do elenco → base → genérico), ninguém contado duas vezes;
//   - status automático: titular da escalação nunca vira "rotação" pelo OVR;
//   - reunião "acalmar": ~+4 de média no melhor cenário, teto ±6 por jogador;
//   - proposta de elite é um IncomingOffer ('elite');
//   - roster lock da G lê o `window` que o mercado grava.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TTeam } from '../src/types.ts';
import { toTPlayer } from '../src/engine/ratings.ts';
import { substituteInjured, type StandIn } from '../src/engine/gestao/condicao.ts';
import {
  statusesOf, defaultDressingRoom, resolveTeamMeeting, hierarchy, rosterLocked, expectedPlayTime, type VPlayer,
} from '../src/engine/clube/vestiario.ts';
import { expectedPlayTime as contractsPlayTime } from '../src/engine/clube/contratos.ts';
import * as pontes from '../src/engine/clube/mercadoPontes.ts';
import * as vestiario from '../src/engine/clube/vestiario.ts';
import * as contratos from '../src/engine/clube/contratos.ts';
import { NEED_LABEL, withWindowStatus, defaultMarket } from '../src/engine/clube/mercado.ts';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';

const si = (id: string, role: StandIn['role'], v: number): StandIn => ({ id, nick: id, name: id, country: 'br', role, aim: v, clutch: v, consistency: v, awp: 60, igl: 50 });
const userTeam = (): TTeam => {
  const players = ['a', 'b', 'c', 'd', 'e'].map((id, i) => toTPlayer({ ...si(id, (['AWP', 'IGL', 'Entry', 'Rifler', 'Support'] as const)[i], 80) }, { runtimeId: `user__${id}` }));
  return { id: 'user', name: 'U', tag: 'U', country: 'br', isUser: true, game: 'CS2', colors: ['#000000', '#ffffff'], strength: 80, teamwork: 78, mapPrefs: {}, players, wins: 0, losses: 0 } as unknown as TTeam;
};

test('pontes: o mercado re-exporta as funções reais de H e G; a régua de tempo de jogo é uma só', () => {
  assert.equal(pontes.releaseClauseOf, contratos.releaseClauseOf);
  assert.equal(pontes.contractWageOf, contratos.contractWageOf);
  assert.equal(pontes.wantsToLeave, vestiario.wantsToLeave);
  assert.equal(pontes.leaveRequests, vestiario.leaveRequests);
  assert.equal(pontes.benchValueFactor, vestiario.benchValueFactor);
  assert.equal(pontes.SQUAD_MAX, 7);
  assert.equal(contractsPlayTime, expectedPlayTime, 'contratos usa a régua da G');
});

test('lesão: banco da escalação → stand-in → reserva do elenco → base; ninguém duas vezes', () => {
  const injured = new Set(['c']);
  const bench = si('bench', 'Entry', 70), stand = si('stand', 'Entry', 85), res = si('res', 'Entry', 90), aca = si('aca', 'Entry', 95);
  const pick = (tiers: StandIn[][], academy: StandIn[]) => substituteInjured(userTeam(), injured, academy, tiers).subs[0].in;
  assert.equal(pick([[bench], [stand], [res]], [aca]), 'bench', 'o banco escolhido entra primeiro, mesmo mais fraco');
  assert.equal(pick([[], [stand], [res]], [aca]), 'stand', 'sem banco escolhido, o stand-in');
  assert.equal(pick([[], [], [res]], [aca]), 'res', 'depois o reserva do elenco');
  assert.equal(pick([[], [], []], [aca]), 'aca', 'depois a base');
  assert.equal(pick([[], [], []], []), 'reserva', 'por fim o reserva genérico');
  // o mesmo jogador em duas faixas (e na base) só conta uma vez
  const two = substituteInjured(userTeam(), new Set(['c', 'd']), [bench], [[bench], [bench]]);
  assert.deepEqual(two.subs.map((x) => x.in).filter((x) => x === 'bench').length, 1);
});

test('status automático: titular da escalação tem piso de "titular"; status à mão continua valendo', () => {
  const ps = [90, 88, 86, 70, 69, 85, 65].map((ovr, i) => ({ id: `p${i}`, ovr, age: 25 }));
  const dr = defaultDressingRoom();
  const st = statusesOf(dr, ps); // sem escalação: os 5 primeiros do elenco jogam
  assert.equal(st.p4, 'starter', 'titular de OVR baixo (6º do elenco por OVR) não vira rotação');
  assert.equal(st.p6, 'rotation', 'quem está no banco segue o automático');
  const manual = statusesOf({ ...dr, status: { p4: 'backup' } }, ps);
  assert.equal(manual.p4, 'backup', 'status atribuído por você vale como está');
});

test('reunião "acalmar": ~+4 de média no melhor cenário (era +7), teto ±6, líder e motivação ainda pesam', () => {
  const vp = (id: string, o: Partial<VPlayer> = {}): VPlayer => ({ id, nick: id, ovr: 75, age: 24, country: 'br', role: 'Rifler', leadership: 9, temperament: 11, professionalism: 11, ambition: 12, loyalty: 10, fm: 'balanced', tenure: 1, ...o } as VPlayer);
  const ps = [vp('igl', { leadership: 18, tenure: 5, ovr: 82, fm: 'bornLeader' }), vp('b'), vp('c', { fm: 'temperamental', temperament: 5 }), vp('d', { fm: 'professional' }), vp('e')];
  const hier = hierarchy(ps, { igl: 'key', b: 'starter', c: 'starter', d: 'starter', e: 'starter' });
  const morale = { igl: 70, b: 45, c: 40, d: 48, e: 45 };
  const strong = resolveTeamMeeting({ kind: 'calm', results01: 0.5, players: ps, morale, hierarchy: hier, conflicts: 1, motivating: 15 });
  assert.ok(strong.mean >= 3 && strong.mean <= 5, `média ${strong.mean}`);
  assert.ok(Object.values(strong.deltas).every((d) => Math.abs(d) <= 6));
  const weakCoach = resolveTeamMeeting({ kind: 'calm', results01: 0.5, players: ps, morale, hierarchy: hier, conflicts: 1, motivating: 5 });
  assert.ok(weakCoach.mean < strong.mean, 'técnico pouco motivador rende menos');
  const noLeader = resolveTeamMeeting({ kind: 'calm', results01: 0.5, players: ps, morale: { ...morale, igl: 30 }, hierarchy: hier, conflicts: 1, motivating: 15 });
  assert.ok(noLeader.mean < strong.mean, 'sem o líder a favor rende menos');
});

test('proposta de elite entra no fluxo de propostas com motivo próprio; roster lock da G lê o window do mercado', () => {
  assert.equal(NEED_LABEL.elite, 'Proposta de elite');
  const s = migrateClube({}) as Record<string, unknown> & { clube: { market: ReturnType<typeof defaultMarket> } };
  assert.equal(rosterLocked(s as never), false);
  s.clube.market = withWindowStatus(defaultMarket(), { split: 4, eventInSplit: 3, inMajor: false, majorSplit: true });
  assert.equal(rosterLocked(s as never), true);
});
