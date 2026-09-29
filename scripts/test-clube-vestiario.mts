// FASE 3 · VESTIÁRIO E BANCO (engine/clube/vestiario.ts). `npm run test:sim`.
//
// Uma regra por teste: status × tempo de jogo, banco e escalação, incômodo →
// conversa → saída, hierarquia e influência, grupos sociais, personalidade
// derivada dos ocultos (com compatibilidade), felicidade unificada, reuniões,
// conversas, conflitos e a neutralidade de quem não configura nada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDressingRoom, dressingOf, expectedPlayTime, autoStatus, statusesOf, statusChangeMorale, SQUAD_STATUSES,
  resolveLineup, swapLineup, rosterLocked, recordPlayTime, playShareOf, effectivePlayShare, benchValueFactor,
  closeSplitDressing, wantsToLeave, leaveRequests, talkUnrestDelta, applyUnrestDelta,
  hierarchy, influencePull, influentialMorale,
  languageOf, socialGroups, isolatedIds, socialPairBonus,
  playTimeScore, roleScore, wageScore, promisesScore, staffScore, socialScore, ambitionScore,
  canHoldMeeting, resolveTeamMeeting, recordMeeting,
  frictionOf, tickConflicts, conflictEffects, mediateConflict, mediationChance, pruneDressing,
  SQUAD_MAX, STARTERS, type VPlayer,
} from '../src/engine/clube/vestiario.ts';
import type { DressingRoomState, SquadStatus } from '../src/engine/clube/model.ts';
import {
  fmPersonalityOf, derivePersonality, playerPersonality, hashPersonality, setPersonalitySource, personalityProfileOf,
} from '../src/engine/career/personality.ts';
import { computeHappiness, HAPPINESS_WEIGHTS } from '../src/engine/career/happiness.ts';
import { tickPairChemAfterMatch, pairKey } from '../src/engine/chemistry.ts';
import { judgePlayerPromises, type PlayerPromise } from '../src/engine/career/playerPromises.ts';
import { substituteInjured, STANDIN_TEAMWORK_COST, BENCH_TEAMWORK_COST, type StandIn } from '../src/engine/gestao/condicao.ts';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';
import { realTeams } from './calibrate-engine.mts';
import { measureVestiario } from './measure-vestiario.mts';

const vp = (id: string, o: Partial<VPlayer> = {}): VPlayer => ({
  id, nick: id, ovr: 75, age: 24, country: 'br', role: 'Rifler', leadership: 9, temperament: 11,
  professionalism: 11, ambition: 12, loyalty: 10, fm: 'balanced', tenure: 1, ...o,
});
const dr0 = (): DressingRoomState => defaultDressingRoom();

// ─── status × tempo de jogo ───────────────────────────────────────────────
test('status: expectativa de tempo de jogo cai de estrela a promessa', () => {
  const e = SQUAD_STATUSES.map(expectedPlayTime);
  for (let i = 1; i < e.length; i++) assert.ok(e[i] < e[i - 1], `${SQUAD_STATUSES[i]} espera menos que ${SQUAD_STATUSES[i - 1]}`);
  assert.equal(expectedPlayTime('star'), 0.95);
});

test('status automático: melhor OVR = estrela/importante, 3º–5º titulares, 6º/7º rotação ou promessa', () => {
  const ps = [vp('a', { ovr: 88 }), vp('b', { ovr: 80 }), vp('c', { ovr: 78 }), vp('d', { ovr: 77 }), vp('e', { ovr: 76 }), vp('f', { ovr: 70 }), vp('g', { ovr: 65, age: 19 })];
  const s = autoStatus(ps);
  assert.deepEqual([s.a, s.b, s.c, s.d, s.e, s.f, s.g], ['star', 'key', 'starter', 'starter', 'starter', 'rotation', 'prospect']);
  assert.equal(autoStatus([vp('x', { ovr: 80 })]).x, 'key', 'sem OVR de estrela, o melhor é importante');
  const dr = { ...dr0(), status: { f: 'key' as SquadStatus } };
  assert.equal(statusesOf(dr, ps).f, 'key', 'o status atribuído por você vence o automático');
});

test('status: rebaixar dói (mais no ambicioso, menos no leal); promover anima', () => {
  assert.ok(statusChangeMorale('key', 'rotation', vp('a')) < 0);
  assert.ok(statusChangeMorale('key', 'rotation', vp('a', { fm: 'ambitious', ambition: 16 })) < statusChangeMorale('key', 'rotation', vp('a')));
  assert.ok(statusChangeMorale('key', 'rotation', vp('a', { fm: 'loyal' })) > statusChangeMorale('key', 'rotation', vp('a')));
  assert.ok(statusChangeMorale('rotation', 'key', vp('a')) > 0);
  assert.equal(statusChangeMorale('starter', 'starter', vp('a')), 0);
});

// ─── banco e escalação ────────────────────────────────────────────────────
test('escalação: sem escalação salva o motor usa os 5 primeiros do elenco (neutro); o resto é banco', () => {
  const squad = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual(resolveLineup(squad.slice(0, 5), null), { starters: ['a', 'b', 'c', 'd', 'e'], bench: [] });
  assert.deepEqual(resolveLineup(squad, null), { starters: ['a', 'b', 'c', 'd', 'e'], bench: ['f', 'g'] });
  assert.equal(SQUAD_MAX, 7);
  assert.equal(STARTERS, 5);
});

test('escalação: titular escolhido joga; quem saiu do elenco é reposto pela ordem do elenco', () => {
  const squad = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const l = resolveLineup(squad, { starters: ['g', 'a', 'b', 'c', 'x'], bench: ['e'] });
  assert.deepEqual(l.starters, ['g', 'a', 'b', 'c', 'd']);
  assert.deepEqual(l.bench, ['e', 'f']);
});

test('escalação: trocar titular ↔ banco e posições entre titulares', () => {
  const squad = ['a', 'b', 'c', 'd', 'e', 'f'];
  const l = swapLineup(squad, null, 'b', 'f');
  assert.deepEqual(l.starters, ['a', 'f', 'c', 'd', 'e']);
  assert.deepEqual(l.bench, ['b']);
  const l2 = swapLineup(squad, l, 'a', 'e');
  assert.deepEqual(l2.starters, ['e', 'f', 'c', 'd', 'a']);
  assert.deepEqual(swapLineup(squad, l, 'a', 'zz'), { starters: l.starters, bench: l.bench }, 'id fora do elenco não mexe');
});

test('escalação: roster lock vem da janela gravada pela frente de mercado', () => {
  assert.equal(rosterLocked({}), false);
  assert.equal(rosterLocked({ clube: { market: { v: 1, budgets: {}, incoming: [], rumors: [], loans: [], window: { open: false, rosterLocked: true, label: 'Major' } } as never } }), true);
});

test('banco: reserva do SEU banco entra antes da base na lesão, com id do elenco e custo menor', () => {
  const t = realTeams()[0];
  const team = { ...t, id: 'user', isUser: true, players: t.players.map((p) => ({ ...p, id: `user__${p.id}` })) };
  const hurt = t.players[1];
  const benchP: StandIn = { id: 'bench1', nick: 'bench1', name: 'b', country: 'br', role: hurt.role, aim: 70, clutch: 70, consistency: 70, awp: 40, igl: 40 };
  const acad: StandIn = { id: 'kid1', nick: 'kid1', name: 'k', country: 'br', role: hurt.role, aim: 90, clutch: 90, consistency: 90, awp: 40, igl: 40 };
  const withBench = substituteInjured(team, new Set([hurt.id]), [acad], [benchP]);
  assert.ok(withBench.team.players.some((p) => p.id === 'user__bench1'), 'o reserva do banco entra com id do elenco (conta tempo de jogo)');
  assert.deepEqual(withBench.subs, [{ out: hurt.nick, in: 'bench1' }]);
  const noBench = substituteInjured(team, new Set([hurt.id]), [acad]);
  assert.ok(noBench.team.players.some((p) => p.id === 'stand__kid1'), 'sem banco, como antes: jovem da base');
  assert.ok(BENCH_TEAMWORK_COST < STANDIN_TEAMWORK_COST);
  // mesmo jogador entrando: o do banco custa menos entrosamento que o da base
  const same = substituteInjured(team, new Set([hurt.id]), [], [{ ...benchP, aim: 90, clutch: 90, consistency: 90 }]);
  assert.ok(same.team.strength > noBench.team.strength, 'banco treinado com o time > jovem da base de mesmo nível');
});

// ─── tempo de jogo → incômodo → conversa → saída ──────────────────────────
test('tempo de jogo: disponível × jogado por série; lesionado não conta como disponível', () => {
  let d = recordPlayTime(dr0(), { squadIds: ['a', 'b', 'f'], playedIds: ['a', 'b'], maps: 3 });
  d = recordPlayTime(d, { squadIds: ['a', 'b', 'f'], playedIds: ['a', 'f'], maps: 2, unavailable: new Set(['b']) });
  assert.deepEqual(d.playTime.a, { played: 5, available: 5 });
  assert.deepEqual(d.playTime.b, { played: 3, available: 3 });
  assert.deepEqual(d.playTime.f, { played: 2, available: 5 });
  assert.equal(playShareOf(d, 'f'), 0.4);
  assert.equal(playShareOf(d, 'zz'), null);
});

test('incômodo: abaixo do esperado → incomodado → pede conversa → pede para sair; volta a jogar e acalma', () => {
  const ps = [vp('a', { ovr: 85 }), vp('b'), vp('c'), vp('d'), vp('e'), vp('f', { ovr: 60 })];
  const benchSplit = (d: DressingRoomState) => recordPlayTime(d, { squadIds: ps.map((p) => p.id), playedIds: ['b', 'c', 'd', 'e', 'f'], maps: 12 });
  let d: DressingRoomState = { ...dr0(), status: { a: 'star' } };
  const levels: number[] = [];
  const kinds: string[] = [];
  for (let s = 1; s <= 3; s++) {
    const r = closeSplitDressing(benchSplit(d), ps, s);
    d = r.dressing; levels.push(d.unrest?.a?.level ?? 0); kinds.push(...r.events.map((e) => e.kind));
  }
  assert.deepEqual(levels, [1, 2, 3], 'estrela no banco escala um nível por split');
  assert.deepEqual(kinds, ['talkRequest', 'leaveRequest']);
  assert.equal(d.lastPlayTime?.a, 0);
  assert.deepEqual(d.playTime, {}, 'a contagem zera na virada');
  assert.equal(wantsToLeave({ clube: { dressing: d } }, 'a'), true);
  assert.deepEqual(leaveRequests({ clube: { dressing: d } }, ['a', 'b']), ['a']);
  // volta a jogar tudo: desce um nível por split
  const r = closeSplitDressing(recordPlayTime(d, { squadIds: ['a'], playedIds: ['a'], maps: 9 }), ps, 4);
  assert.equal(r.dressing.unrest?.a?.level, 2);
  // reserva que joga pouco NÃO reclama (o status promete pouco)
  assert.equal(d.unrest?.f, undefined);
});

test('incômodo: leal/acomodado aguenta mais banco que ambicioso', () => {
  const run = (fm: VPlayer['fm']) => {
    const ps = [vp('a', { fm, ovr: 80 })];
    let d: DressingRoomState = { ...dr0(), status: { a: 'starter' } };
    d = recordPlayTime(d, { squadIds: ['a'], playedIds: [], maps: 10 });
    d = recordPlayTime(d, { squadIds: ['a'], playedIds: ['a'], maps: 5 }); // joga 1/3 (esperado 0.7)
    return closeSplitDressing(d, ps, 1).dressing.unrest?.a?.level ?? 0;
  };
  assert.equal(run('ambitious'), 1);
  assert.equal(run('loyal'), 1, 'gap 0.37 > 0.30: até o leal reclama');
  const mild = (fm: VPlayer['fm']) => {
    let d: DressingRoomState = { ...dr0(), status: { a: 'starter' } };
    d = recordPlayTime(d, { squadIds: ['a'], playedIds: ['a'], maps: 5 });
    d = recordPlayTime(d, { squadIds: ['a'], playedIds: [], maps: 5 }); // joga 1/2 (gap 0.2)
    return closeSplitDressing(d, [vp('a', { fm, ovr: 80 })], 1).dressing.unrest?.a?.level ?? 0;
  };
  assert.equal(mild('balanced'), 1);
  assert.equal(mild('loyal'), 0, 'o leal tolera um pouco de banco');
});

test('insatisfação crônica também é pedido de saída (satisfação < 25 e moral < 35)', () => {
  assert.equal(wantsToLeave({ satisfaction: { a: 20 }, morale: { a: 30 } }, 'a'), true);
  assert.equal(wantsToLeave({ satisfaction: { a: 20 }, morale: { a: 60 } }, 'a'), false);
});

test('conversa: falar de tempo de jogo com quem está incomodado acalma (tom certo) ou piora (tom errado)', () => {
  assert.equal(talkUnrestDelta('playtime', 'positive', 2), -1);
  assert.equal(talkUnrestDelta('playtime', 'negative', 1), 1);
  assert.equal(talkUnrestDelta('praise', 'positive', 1), -1);
  assert.equal(talkUnrestDelta('praise', 'positive', 2), 0, 'elogio não resolve quem quer jogar');
  assert.equal(talkUnrestDelta('effort', 'negative', 2), 1);
  assert.equal(talkUnrestDelta('playtime', 'positive', 0), 0, 'sem incômodo, nada muda');
  const d = applyUnrestDelta({ ...dr0(), unrest: { a: { level: 2, since: 1 } } }, 'a', -1, 3);
  assert.equal(d.unrest?.a?.level, 1);
  assert.equal(applyUnrestDelta(d, 'a', -1, 3).unrest?.a, undefined);
});

test('promessa de tempo de jogo: cumpre se jogou o que o status promete até o prazo', () => {
  const p: PlayerPromise = { kind: 'playtime', madeAtSplit: 1, deadlineSplit: 3, status: 'open' };
  const base = { split: 2, contractUntil: () => null, squadIds: [], fatigue: () => 0 };
  assert.equal(judgePlayerPromises({ a: [p] }, { ...base, playTimeMet: () => true }).outcomes[0]?.kept, true);
  assert.equal(judgePlayerPromises({ a: [p] }, { ...base, playTimeMet: () => false }).outcomes.length, 0, 'ainda no prazo');
  assert.equal(judgePlayerPromises({ a: [p] }, { ...base, split: 3 }).outcomes[0]?.kept, false, 'sem o dado, no prazo quebra');
});

test('banco derruba o valor de mercado (até −15%)', () => {
  const d = { ...dr0(), lastPlayTime: { a: 0, b: 1, c: 0.3 } };
  assert.equal(benchValueFactor(d, 'a'), 0.85);
  assert.equal(benchValueFactor(d, 'b'), 1);
  assert.ok(benchValueFactor(d, 'c') > 0.85 && benchValueFactor(d, 'c') < 1);
  assert.equal(benchValueFactor(d, 'zz'), 1);
  const cur = recordPlayTime(d, { squadIds: ['a'], playedIds: ['a'], maps: 3 });
  assert.equal(effectivePlayShare(cur, 'a'), 1, 'o split corrente com 3+ mapas vale mais que o fechado');
});

// ─── hierarquia e influência ──────────────────────────────────────────────
test('hierarquia: liderança, tempo de casa, qualidade e status definem o líder', () => {
  const ps = [vp('igl', { leadership: 17, tenure: 6, ovr: 78 }), vp('star', { leadership: 8, ovr: 90 }), vp('kid', { leadership: 6, tenure: 0, ovr: 66 })];
  const h = hierarchy(ps, { igl: 'key', star: 'star', kid: 'prospect' });
  assert.equal(h[0].id, 'igl');
  assert.equal(h[0].tier, 'leader');
  assert.equal(h.find((x) => x.id === 'kid')!.tier, 'none');
  const sum = h[0].parts.leadership + h[0].parts.tenure + h[0].parts.ability + h[0].parts.status;
  assert.equal(h[0].score, sum);
});

test('influência: os influentes arrastam a moral do grupo (positivo e negativo); o líder não é arrastado', () => {
  const ps = [vp('igl', { leadership: 18, tenure: 8, ovr: 85 }), vp('b'), vp('c')];
  const h = hierarchy(ps, { igl: 'star', b: 'starter', c: 'starter' });
  const happy = influencePull(h, { igl: 95, b: 60, c: 60 });
  assert.ok(happy.b > 0 && happy.c > 0);
  assert.equal(happy.igl, undefined);
  const sad = influencePull(h, { igl: 20, b: 70, c: 70 });
  assert.ok(sad.b < 0 && sad.b >= -3, 'arrasto limitado a ±3');
  assert.equal(influentialMorale(h, { igl: 80 }), 80);
});

// ─── grupos sociais ───────────────────────────────────────────────────────
test('grupos sociais: idioma (CIS fala russo), veteranos × jovens; isolado só com língua dominante', () => {
  assert.equal(languageOf('ua'), 'ru');
  assert.equal(languageOf('BR'), 'pt');
  assert.equal(languageOf('dk'), languageOf('se'));
  const ps = [vp('a', { country: 'br', age: 30 }), vp('b', { country: 'br', age: 29 }), vp('c', { country: 'pt', age: 20 }), vp('d', { country: 'ar', age: 19 }), vp('e', { country: 'us' })];
  const g = socialGroups(ps);
  assert.deepEqual(g.find((x) => x.key === 'lang:pt')?.members, ['a', 'b', 'c']);
  assert.deepEqual(g.find((x) => x.key === 'veterans')?.members, ['a', 'b']);
  assert.deepEqual(g.find((x) => x.key === 'youngsters')?.members, ['c', 'd']);
  assert.deepEqual(isolatedIds(ps, g), ['d', 'e']);
  const mixed = [vp('a', { country: 'br' }), vp('b', { country: 'dk' }), vp('c', { country: 'us' })];
  assert.deepEqual(isolatedIds(mixed, socialGroups(mixed)), [], 'line mista (sem língua dominante) não isola ninguém');
});

test('grupos sociais → química: mesmo idioma entrosa mais rápido; par em conflito, menos', () => {
  const ps = [vp('a', { country: 'br' }), vp('b', { country: 'br' }), vp('c', { country: 'ru' })];
  const bonus = socialPairBonus(ps, [{ a: 'c', b: 'a', since: 1, severity: 1 }]);
  assert.equal(bonus('a', 'b'), 1.15);
  assert.equal(bonus('b', 'c'), 1);
  assert.equal(bonus('a', 'c'), 0.5);
  const chem = tickPairChemAfterMatch({}, ['a', 'b', 'c'], false, undefined, bonus);
  assert.ok(chem[pairKey('a', 'b')] > chem[pairKey('b', 'c')]);
  assert.ok(chem[pairKey('b', 'c')] > chem[pairKey('a', 'c')]);
  const legacy = tickPairChemAfterMatch({}, ['a', 'b'], false);
  assert.equal(legacy[pairKey('a', 'b')], 32, 'sem bônus social, o ganho de sempre');
});

// ─── personalidade derivada dos ocultos ───────────────────────────────────
test('personalidade: rótulos FM saem dos ocultos (liderança, profissionalismo, temperamento, ambição, lealdade)', () => {
  const h = { professionalism: 11, ambition: 12, loyalty: 10, temperament: 11 };
  assert.equal(fmPersonalityOf(h, 17), 'bornLeader');
  assert.equal(fmPersonalityOf({ ...h, professionalism: 15, temperament: 14 }, 8), 'modelPro');
  assert.equal(fmPersonalityOf({ ...h, temperament: 5 }, 8), 'temperamental');
  assert.equal(fmPersonalityOf({ ...h, loyalty: 5, ambition: 14 }, 8), 'mercenary');
  assert.equal(fmPersonalityOf({ ...h, ambition: 17 }, 8), 'ambitious');
  assert.equal(fmPersonalityOf({ ...h, loyalty: 15 }, 8), 'loyal');
  assert.equal(fmPersonalityOf({ ...h, temperament: 17 }, 8), 'resolute');
  assert.equal(fmPersonalityOf({ ...h, professionalism: 14 }, 8), 'professional');
  assert.equal(fmPersonalityOf({ ...h, ambition: 7 }, 8), 'unambitious');
  assert.equal(fmPersonalityOf(h, 8), 'balanced');
});

test('personalidade: compatibilidade — sem fonte, o tipo por hash de sempre; com fonte, o derivado', () => {
  const p = realTeams()[0].players[0];
  setPersonalitySource(null);
  assert.equal(playerPersonality(p.id), hashPersonality(p.id));
  assert.equal(personalityProfileOf(p.id), null);
  const src = { ...p, id: p.sourcePlayerId ?? p.id };
  setPersonalitySource((id) => (id === src.id ? src : null));
  const d = derivePersonality(src);
  assert.equal(playerPersonality(src.id), d.legacy);
  assert.equal(personalityProfileOf(src.id)?.fm, d.fm);
  setPersonalitySource(null);
  assert.equal(playerPersonality(src.id), hashPersonality(src.id));
});

// ─── felicidade unificada ─────────────────────────────────────────────────
test('felicidade: com só os 5 fatores antigos, o número é o mesmo de antes (compatível)', () => {
  const i = { ratings: [1.1, 1.05], results01: 0.62, contractSplitsLeft: 1, bond: 57, chemistry: 48 };
  const f = computeHappiness(i).factors;
  const old = Math.round(f.performance * 0.25 + f.results * 0.25 + f.contract * 0.15 + f.bond * 0.2 + f.chemistry * 0.15);
  assert.equal(computeHappiness(i).overall, old);
  const sum = Object.values(HAPPINESS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'pesos do modelo único somam 1');
});

test('felicidade: fatores novos entram visíveis e movem o total; ausentes não pesam', () => {
  const base = { ratings: [1.0, 1.0], results01: 0.5, contractSplitsLeft: 2, bond: 50, chemistry: 50 };
  const mid = computeHappiness(base).overall;
  const benched = computeHappiness({ ...base, playTime: playTimeScore(0, 'star') });
  assert.equal(benched.factors.playTime, 0);
  assert.ok(benched.overall < mid - 5, 'estrela no banco derruba a satisfação');
  const neutral = computeHappiness({ ...base, playTime: 60, role: 60, promises: 60, staff: 60, social: 60, ambition: 60 });
  assert.ok(Math.abs(neutral.overall - mid) <= 1, 'tudo "como esperado" (60) ≈ o número antigo');
  assert.equal(computeHappiness(base).factors.wage, undefined);
});

test('fatores do vestiário: cada um na direção certa', () => {
  assert.equal(playTimeScore(1, 'starter'), 65);
  assert.equal(playTimeScore(0.95, 'star'), 60);
  assert.ok(playTimeScore(0.3, 'rotation')! < 60);
  assert.equal(playTimeScore(null, 'star'), undefined);
  assert.equal(roleScore('AWP', undefined, 'AWP'), 60);
  assert.ok(roleScore('AWP', undefined, 'Entry') < 60);
  assert.equal(roleScore('AWP', 'Rifler', 'Rifler'), 60, 'a 2ª função também serve');
  assert.equal(wageScore(0, 100), undefined, 'sem contrato com salário, o fator não entra');
  assert.ok(wageScore(130, 100)! > 60 && wageScore(70, 100)! < 60);
  assert.equal(promisesScore(undefined, 5), undefined);
  assert.ok(promisesScore([{ kind: 'extension', madeAtSplit: 3, deadlineSplit: 5, status: 'broken' }], 5)! < 60);
  assert.ok(promisesScore([{ kind: 'extension', madeAtSplit: 3, deadlineSplit: 5, status: 'kept' }], 5)! > 60);
  assert.ok(promisesScore(undefined, 5, 'star', 'rotation')! < 60, 'status prometido em contrato e não cumprido');
  assert.equal(staffScore(1), 60);
  assert.ok(staffScore(1.2) > 60 && staffScore(0.8) < 60);
  assert.ok(ambitionScore(18, 3) < 60 && ambitionScore(18, 1) >= 60 && ambitionScore(9, 3) >= 60);
  const g = socialGroups([vp('a'), vp('b'), vp('c'), vp('d', { country: 'fi' })]);
  assert.ok(socialScore('a', g) > 60);
  assert.ok(socialScore('d', g) < 40, 'isolado sofre');
  assert.ok(socialScore('a', g, [{ a: 'a', b: 'b', since: 1, severity: 2 }]) < socialScore('a', g));
});

// ─── reuniões de equipe ───────────────────────────────────────────────────
test('reunião: elogiar depois de vitórias sobe; cobrar time que vence irrita; acalmar ajuda com conflito', () => {
  const ps = [vp('igl', { leadership: 18, tenure: 5, ovr: 82, fm: 'bornLeader' }), vp('b'), vp('c', { fm: 'temperamental', temperament: 5 }), vp('d', { fm: 'professional' })];
  const hier = hierarchy(ps, { igl: 'key', b: 'starter', c: 'starter', d: 'starter' });
  const morale = { igl: 70, b: 65, c: 60, d: 70 };
  const praise = resolveTeamMeeting({ kind: 'praise', results01: 0.75, players: ps, morale, hierarchy: hier, conflicts: 0 });
  assert.equal(praise.fit, 'good');
  assert.ok(praise.mean > 0);
  const demandWin = resolveTeamMeeting({ kind: 'demand', results01: 0.75, players: ps, morale, hierarchy: hier, conflicts: 0 });
  assert.equal(demandWin.fit, 'bad');
  assert.ok(demandWin.mean < 0);
  const demandLoss = resolveTeamMeeting({ kind: 'demand', results01: 0.3, players: ps, morale, hierarchy: hier, conflicts: 0 });
  assert.ok(demandLoss.deltas.d > demandLoss.deltas.c, 'profissional aceita cobrança; temperamental não');
  const calm = resolveTeamMeeting({ kind: 'calm', results01: 0.5, players: ps, morale, hierarchy: hier, conflicts: 1 });
  assert.equal(calm.fit, 'good');
});

test('reunião: mais forte com o líder a favor; líder insatisfeito rema contra', () => {
  const ps = [vp('igl', { leadership: 18, tenure: 5, ovr: 82 }), vp('b'), vp('c')];
  const hier = hierarchy(ps, { igl: 'key', b: 'starter', c: 'starter' });
  const withLeader = resolveTeamMeeting({ kind: 'praise', results01: 0.8, players: ps, morale: { igl: 75, b: 60, c: 60 }, hierarchy: hier, conflicts: 0 });
  const against = resolveTeamMeeting({ kind: 'praise', results01: 0.8, players: ps, morale: { igl: 30, b: 60, c: 60 }, hierarchy: hier, conflicts: 0 });
  assert.equal(withLeader.leaderBacks, true);
  assert.equal(against.leaderBacks, false);
  assert.ok(withLeader.deltas.b > against.deltas.b);
});

test('reunião: uma por split; acalmar alivia um nível de cada conflito', () => {
  const d = { ...dr0(), conflicts: [{ a: 'a', b: 'b', since: 1, severity: 1 }, { a: 'c', b: 'd', since: 1, severity: 2 }] };
  assert.equal(canHoldMeeting(d, 3), true);
  const r = resolveTeamMeeting({ kind: 'calm', results01: 0.5, players: [vp('a'), vp('b')], morale: {}, hierarchy: [], conflicts: 2 });
  const after = recordMeeting(d, r, 3);
  assert.equal(canHoldMeeting(after, 3), false);
  assert.equal(canHoldMeeting(after, 4), true);
  assert.deepEqual(after.conflicts.map((c) => c.severity), [1]);
});

// ─── conflitos ────────────────────────────────────────────────────────────
test('conflito: atrito cresce com temperamento baixo, idioma diferente e má fase; profissional modelo apazigua', () => {
  const calm = frictionOf(vp('a', { temperament: 15 }), vp('b', { temperament: 15 }), { pairChem: 60, results01: 0.6 });
  const hot = frictionOf(vp('a', { temperament: 5 }), vp('b', { temperament: 6, country: 'ru' }), { pairChem: 20, results01: 0.3 });
  assert.equal(calm, 0);
  assert.ok(hot > 0.4);
  const pro = frictionOf(vp('a', { temperament: 5, fm: 'modelPro' }), vp('b', { temperament: 6, country: 'ru' }), { pairChem: 20, results01: 0.3 });
  assert.ok(pro < hot);
});

test('conflito: abre por sorteio semeado (determinístico), no máximo 2; escala se não mediar; poda quem saiu', () => {
  const ps = [vp('a', { temperament: 3, country: 'ru' }), vp('b', { temperament: 3 }), vp('c', { temperament: 3, country: 'fr' }), vp('d', { temperament: 4, country: 'tr' })];
  const statuses = { a: 'star', b: 'key', c: 'starter', d: 'starter' } as Record<string, SquadStatus>;
  let d = dr0();
  let opened = 0;
  for (let s = 1; s <= 40 && d.conflicts.length < 2; s++) {
    const r = tickConflicts(d, ps, { split: s, results01: 0.2, pairChem: () => 20, statuses });
    d = r.dressing; opened += r.started.length;
    assert.deepEqual(tickConflicts(dr0(), ps, { split: s, results01: 0.2, pairChem: () => 20, statuses }).started,
      tickConflicts(dr0(), ps, { split: s, results01: 0.2, pairChem: () => 20, statuses }).started, 'mesmo split, mesmo sorteio');
  }
  assert.ok(opened >= 1 && d.conflicts.length <= 2);
  const fx = conflictEffects([{ a: 'a', b: 'b', since: 1, severity: 2 }]);
  assert.deepEqual(fx.morale, { a: -4, b: -4 });
  assert.equal(fx.pairChem[0].delta, -6);
  const pruned = tickConflicts({ ...dr0(), conflicts: [{ a: 'a', b: 'zz', since: 1, severity: 1 }] }, ps, { split: 99, results01: 0.9, pairChem: () => 90, statuses });
  assert.ok(!pruned.dressing.conflicts.some((c) => c.b === 'zz'), 'vendeu um dos dois: conflito some');
});

test('conflito: mediar (1x por split) resolve ou deixa os dois mais irritados; gestão de pessoas ajuda', () => {
  const a = vp('a', { temperament: 8 }), b = vp('b', { temperament: 9 });
  assert.ok(mediationChance(a, b, { manManagement: 18, bondA: 70, bondB: 70 }) > mediationChance(a, b, { manManagement: 6, bondA: 40, bondB: 40 }));
  const d = { ...dr0(), conflicts: [{ a: 'a', b: 'b', since: 1, severity: 2 }] };
  const seen = { ok: 0, fail: 0 };
  for (let s = 1; s <= 30; s++) {
    const r = mediateConflict(d, a, b, { split: s, manManagement: 12, bondA: 55, bondB: 55 });
    if (r.resolved) { seen.ok++; assert.equal(r.dressing.conflicts.length, 0); assert.ok(r.moraleA > 0); }
    else {
      seen.fail++; assert.equal(r.dressing.conflicts[0].mediatedAt, s); assert.ok(r.moraleA < 0);
      const again = mediateConflict(r.dressing, a, b, { split: s, manManagement: 12, bondA: 55, bondB: 55 });
      assert.equal(again.dressing, r.dressing, 'segunda tentativa no mesmo split não faz nada');
    }
  }
  assert.ok(seen.ok > 0 && seen.fail > 0);
});

test('poda: quem sai do elenco some de status, escalação, tempo de jogo, incômodo e conflitos', () => {
  const d: DressingRoomState = {
    ...dr0(), status: { a: 'star', x: 'key' }, lineup: { starters: ['a', 'x'], bench: ['x'] },
    playTime: { x: { played: 1, available: 2 } }, unrest: { x: { level: 2, since: 1 } }, conflicts: [{ a: 'a', b: 'x', since: 1, severity: 1 }],
  };
  const p = pruneDressing(d, ['a']);
  assert.deepEqual(p.status, { a: 'star' });
  assert.deepEqual(p.lineup, { starters: ['a'], bench: [] });
  assert.deepEqual(p.unrest, {});
  assert.deepEqual(p.conflicts, []);
});

// ─── neutralidade e save ──────────────────────────────────────────────────
test('neutralidade: elenco de 5 sem nada configurado — todos jogam tudo, ninguém reclama, felicidade ≈ a de antes', () => {
  const ps = [vp('a', { ovr: 86 }), vp('b', { ovr: 80 }), vp('c'), vp('d'), vp('e')];
  const ids = ps.map((p) => p.id);
  let d = dr0();
  for (let k = 0; k < 12; k++) d = recordPlayTime(d, { squadIds: ids, playedIds: resolveLineup(ids, d.lineup).starters, maps: 3 });
  const r = closeSplitDressing(d, ps, 1);
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.dressing.unrest, {});
  const st = statusesOf(d, ps);
  const base = { ratings: [1.0, 1.02], results01: 0.5, contractSplitsLeft: 2, bond: 50, chemistry: 50 };
  const g = socialGroups(ps);
  for (const p of ps) {
    const now = computeHappiness({ ...base, playTime: playTimeScore(1, st[p.id]), role: 60, staff: 60, social: socialScore(p.id, g), ambition: ambitionScore(p.ambition, 3) }).overall;
    assert.ok(Math.abs(now - computeHappiness(base).overall) <= 3, `${p.id}: ${now} × ${computeHappiness(base).overall}`);
  }
});

test('save: v29 grava o vestiário padrão (sem escalação, sem status) e dressingOf lê com segurança', () => {
  const s = migrateClube({ squad: [{ playerId: 'a' }] });
  assert.equal(s.clube!.dressing.lineup, null);
  assert.deepEqual(s.clube!.dressing.status, {});
  assert.deepEqual(dressingOf(s), s.clube!.dressing);
  assert.deepEqual(dressingOf({}), defaultDressingRoom());
});

test('neutralidade medida (scripts/measure-vestiario.mts): mesmo cinco, felicidade ±2, moral no motor monotônica', () => {
  const r = measureVestiario(300);
  assert.equal(r.sameFive.identical, r.sameFive.teams, 'sem escalação salva, o motor joga os mesmos 5 de antes');
  for (const h of r.happiness) assert.ok(Math.abs(h.diff) <= 2, `tier ${h.tier}: satisfação ${h.before.toFixed(1)} → ${h.after.toFixed(1)}`);
  const wins = r.morale.map((m) => m.win);
  assert.ok(wins[0] < wins[2] && wins[2] < wins[4], 'moral baixa perde mais, moral alta ganha mais');
  assert.ok(Math.abs(r.personality.deltaNew - r.personality.deltaOld) < 0.5, 'a personalidade derivada não muda a deriva média de moral');
});
