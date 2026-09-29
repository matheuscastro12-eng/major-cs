// [fase 2 · frente TREINO] Treino semanal (engine/gestao/treino.ts), condição no
// motor (engine/gestao/condicao.ts) e migração do foco antigo. `npm run test:sim`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEEK, INTENSITY, REF_WEEK_GAINS, SESSIONS, SESSION_GAINS, applyRealScrim, closeTrainingSplit, conditionWithFatigue,
  defaultCondition, defaultTrainingState, fatigueView, gestaoOf, playerWeekPoints, previewGrowthMul, runTrainingWeek,
  sessionGains, trainingFromLegacy, trainingGrowthMul, weekFitnessDelta, weeklyInjuryRisk, decayLeaks, leakAgainst,
  recoverCondition, normalizeTraining,
} from '../src/engine/gestao/treino.ts';
import {
  conditionDuelMod, conditionForm, applyConditionToTeam, substituteInjured, applyScrimLeak, scrimLeakReadiness,
} from '../src/engine/gestao/condicao.ts';
import { migrateGestao } from '../src/engine/gestao/gestaoMigration.ts';
import { staffEffects } from '../src/engine/gestao/staff.ts';
import { defaultTactics } from '../src/engine/gestao/tatica.ts';
import type { PlayerCondition, TrainingState } from '../src/engine/gestao/model.ts';
import { ALL_ATTRS, type AttrKey } from '../src/engine/attributes.ts';
import { ATTR_CLASS, evolveAttrs } from '../src/engine/attrs/progression.ts';
import { deriveAttrs, caFromOvr, ovrFromAttrs } from '../src/engine/attrs/model.ts';
import { simulateSeries } from '../src/engine/match.ts';
import { setMatchEngine } from '../src/engine/match2/flag.ts';
import { makeRng } from '../src/engine/rng.ts';
import { realTeams } from './calibrate-engine.mts';
import { MAP_POOL, type MapId, type TTeam } from '../src/types.ts';

const T = (over: Partial<TrainingState> = {}): TrainingState => ({ ...defaultTrainingState(), ...over });

// ─── ganhos por sessão ─────────────────────────────────────────────────────
test('ganho por sessão: cada sessão treina o seu grupo de atributos', () => {
  const aim = sessionGains('aim');
  assert.ok((aim.aim ?? 0) > 0 && (aim.spray ?? 0) > 0 && (aim.headshot ?? 0) > 0, 'mira treina mecânica');
  assert.equal(aim.leadership ?? 0, 0, 'mira não treina liderança');
  const tac = sessionGains('tactics');
  assert.ok((tac.positioning ?? 0) > 0 && (tac.discipline ?? 0) > 0);
  assert.equal(tac.aim ?? 0, 0);
  assert.ok((sessionGains('physical').stamina ?? 0) > 1, 'físico treina stamina');
  assert.ok((sessionGains('mental').composure ?? 0) > 1, 'mental treina frieza');
  assert.deepEqual(sessionGains('rest'), {}, 'descanso não treina atributo');
  // toda sessão tem tabela; todo atributo é coberto pela agenda padrão (senão a régua quebra)
  for (const s of SESSIONS) assert.ok(SESSION_GAINS[s]);
  for (const k of ALL_ATTRS) assert.ok(REF_WEEK_GAINS[k] > 0, `agenda padrão não treina ${k}`);
});

test('ganho por sessão: intensidade e comissão escalam', () => {
  const lo = sessionGains('aim', 'low').aim!, no = sessionGains('aim', 'normal').aim!, hi = sessionGains('aim', 'high').aim!;
  assert.ok(lo < no && no < hi);
  assert.equal(hi / no, INTENSITY.high.gain);
  const staff = staffEffects(null);
  const strong = { ...staff, training: { ...staff.training, aim: 1.5 } };
  assert.equal(sessionGains('aim', 'normal', strong).aim, 1.5 * no);
  assert.equal(sessionGains('vod', 'normal', strong).gameSense, sessionGains('vod').gameSense, 'multiplicador é por sessão');
});

test('multiplicador do split: agenda padrão = 1,0 em tudo; agenda de mira puxa mecânica e derruba leitura', () => {
  const def = previewGrowthMul(T(), null);
  for (const k of ALL_ATTRS) assert.equal(def[k], 1, `${k} ≠ 1 na agenda padrão`);
  const mech = previewGrowthMul(T({ week: ['aim', 'aim', 'aim', 'aim', 'utility', 'physical', 'rest'] }), null);
  assert.ok(mech.aim! > 1.8 && mech.spray! > 1.8, `mira ${mech.aim}`);
  assert.ok(mech.gameSense! < 0.8, `game sense ${mech.gameSense}`);
  // foco individual: o atributo em foco dispara; o resto cede um pouco
  const f = previewGrowthMul(T(), { kind: 'attr', attr: 'clutch' });
  assert.ok(f.clutch! >= 2 && f.aim! < 1);
  const r = previewGrowthMul(T(), { kind: 'role', role: 'AWP' });
  assert.ok(r.awp! > 1.3 && r.leadership! < 1);
  // sem semanas: neutro
  assert.equal(trainingGrowthMul({}, 0), undefined);
  // pontos acumulam por semana
  const w = runTrainingWeek({ training: T(), condition: {}, tactics: defaultTactics(), players: [{ id: 'a', nick: 'a' }], maps: {}, split: 1 });
  const w2 = runTrainingWeek({ training: w.training, condition: { a: { ...w.condition.a, injury: null } }, tactics: w.tactics, players: [{ id: 'a', nick: 'a' }], maps: {}, split: 1 });
  assert.equal(w2.training.weeks, 2);
  assert.ok(Math.abs(w2.training.progress!.a.aim! - 2 * playerWeekPoints(T(), null).aim) < 0.02);
  const mul = trainingGrowthMul(w2.training.progress!.a, w2.training.weeks)!;
  for (const k of ALL_ATTRS) assert.equal(mul[k], 1);
  assert.deepEqual(closeTrainingSplit(w2.training).progress, {});
});

test('treino alimenta a evolução: agenda de mira rende mais mecânica que a padrão (mesmo jogador, mesmos sorteios)', () => {
  const mech = previewGrowthMul(T({ week: ['aim', 'aim', 'aim', 'aim', 'utility', 'physical', 'rest'] }), null);
  let dMech = 0, dDef = 0;
  for (let i = 0; i < 60; i++) {
    const x = deriveAttrs({ id: `t${i}`, role: 'Rifler', age: 18, aim: 66, awp: 50, igl: 55, clutch: 64, consistency: 64 });
    const a = evolveAttrs(x, { playerId: `t${i}`, split: 1, age: 18, trainMul: mech });
    const b = evolveAttrs(x, { playerId: `t${i}`, split: 1, age: 18 });
    for (const k of ALL_ATTRS) if (ATTR_CLASS[k] === 'mechanical') { dMech += a.attrs.a[k] - x.a[k]; dDef += b.attrs.a[k] - x.a[k]; }
  }
  assert.ok(dMech > dDef * 1.5, `mecânica ${dMech} × padrão ${dDef}`);
});

test('teto do PA: treino máximo por muitos splits nunca leva o CA acima do PA', () => {
  const max = Object.fromEntries(ALL_ATTRS.map((k) => [k, 2.2])) as Record<AttrKey, number>;
  for (let i = 0; i < 25; i++) {
    let x = deriveAttrs({ id: `pa${i}`, role: 'Entry', age: 17, aim: 70, awp: 55, igl: 55, clutch: 66, consistency: 66 });
    x = { ...x, pa: Math.min(x.pa, x.ca + 6) }; // teto apertado
    for (let s = 1; s <= 12; s++) {
      const r = evolveAttrs(x, { playerId: `pa${i}`, split: s, age: 17 + Math.floor((s - 1) / 3), trainMul: max, focusPlayer: true, growthMul: 1.5 });
      assert.ok(r.attrs.ca <= r.attrs.pa, `CA ${r.attrs.ca} > PA ${r.attrs.pa}`);
      assert.ok(caFromOvr(ovrFromAttrs(r.attrs)) <= x.pa);
      x = r.attrs;
    }
  }
});

// ─── intensidade × lesão ───────────────────────────────────────────────────
test('intensidade × lesão: risco semanal cresce com a intensidade, o cansaço e a propensão', () => {
  const lo = weeklyInjuryRisk(T({ intensity: 'low' }), 80);
  const no = weeklyInjuryRisk(T({ intensity: 'normal' }), 80);
  const hi = weeklyInjuryRisk(T({ intensity: 'high' }), 80);
  assert.ok(lo < no && no < hi, `${lo} ${no} ${hi}`);
  assert.ok(weeklyInjuryRisk(T(), 25) > no * 1.8, 'cansado se machuca mais');
  assert.ok(weeklyInjuryRisk(T(), 80, 18) > weeklyInjuryRisk(T(), 80, 4), 'propenso se machuca mais');
  const staff = staffEffects(null);
  assert.ok(weeklyInjuryRisk(T(), 80, 10, { ...staff, injuryRisk: 0.6 }) < no, 'preparador físico reduz o risco');
  // físico na agenda protege (mesma carga de exposição trocando VOD por físico reduz)
  const phys = weeklyInjuryRisk(T({ week: ['aim', 'tactics', 'scrim', 'physical', 'utility', 'physical', 'rest'] }), 80);
  assert.ok(phys < weeklyInjuryRisk(T({ week: ['aim', 'tactics', 'scrim', 'aim', 'utility', 'vod', 'rest'] }), 80));
  // carga: intensa gasta, leve recupera, padrão normal é neutra (= fadiga do sistema antigo)
  assert.equal(weekFitnessDelta(T()), 0);
  assert.ok(weekFitnessDelta(T({ intensity: 'high' })) < 0 && weekFitnessDelta(T({ intensity: 'low' })) > 0);
});

function seasonInjuries(intensity: TrainingState['intensity'], seasons = 120) {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
  let n = 0;
  for (let s = 0; s < seasons; s++) {
    let cond: Record<string, PlayerCondition> = Object.fromEntries(ids.map((id) => [id, defaultCondition()]));
    let t = T({ intensity, weekNo: s * 1000 });
    for (let w = 0; w < 30; w++) {
      const maps: Record<string, number> = {};
      for (const id of ids) if (!cond[id].injury) { maps[id] = 2.5; cond[id] = { ...cond[id], fitness: Math.max(0, cond[id].fitness - 9) }; }
      const r = runTrainingWeek({ training: t, condition: cond, tactics: defaultTactics(), players: ids.map((id) => ({ id, nick: id })), maps, split: s });
      n += r.report.injuries.length;
      t = r.training; cond = r.condition;
      if (w % 3 === 2) cond = recoverCondition(cond, 16);
      if (w % 10 === 9) cond = recoverCondition(cond, 40);
    }
  }
  return n / seasons;
}

test('intensidade × lesão: taxa por temporada (leve < normal < intensa), determinística', () => {
  const lo = seasonInjuries('low'), no = seasonInjuries('normal'), hi = seasonInjuries('high');
  assert.ok(lo < no && no < hi, `leve ${lo} normal ${no} intensa ${hi}`);
  assert.ok(no >= 0.8 && no <= 3.5, `normal ${no} lesões/temporada fora da faixa`);
  assert.ok(hi >= no * 2.5, `intensa ${hi} não pesa o bastante`);
  assert.equal(seasonInjuries('normal', 20), seasonInjuries('normal', 20));
});

test('lesionado não treina, recupera no ritmo da comissão e volta sem lesão', () => {
  const cond = { a: { fitness: 60, sharpness: 70, injury: { kind: 'wrist' as const, weeksLeft: 2 } } };
  const staff = staffEffects(null);
  const r1 = runTrainingWeek({ training: T(), condition: cond, tactics: defaultTactics(), players: [{ id: 'a', nick: 'A' }], maps: {}, split: 1, staff });
  assert.equal(r1.condition.a.injury?.weeksLeft, 1);
  assert.equal(r1.training.progress?.a, undefined, 'lesionado não acumula treino');
  assert.ok(r1.condition.a.sharpness < 70, 'perde ritmo parado');
  const r2 = runTrainingWeek({ training: r1.training, condition: r1.condition, tactics: r1.tactics, players: [{ id: 'a', nick: 'A' }], maps: {}, split: 1, staff });
  assert.equal(r2.condition.a.injury, null);
  assert.deepEqual(r2.report.recovered, [{ playerId: 'a', nick: 'A' }]);
  // recuperação acelerada (departamento médico melhor): volta em 1 semana
  const fast = runTrainingWeek({ training: T(), condition: cond, tactics: defaultTactics(), players: [{ id: 'a', nick: 'A' }], maps: {}, split: 1, staff: { ...staff, injuryRecovery: 2 } });
  assert.equal(fast.condition.a.injury, null);
});

test('ritmo: quem joga e treina tática/scrim ganha; parado perde', () => {
  const c0 = { a: defaultCondition(), b: defaultCondition() };
  const r = runTrainingWeek({ training: T(), condition: c0, tactics: defaultTactics(), players: [{ id: 'a', nick: 'a' }, { id: 'b', nick: 'b' }], maps: { a: 3 }, split: 1 });
  assert.ok(r.condition.a.sharpness > r.condition.b.sharpness);
  const rest = runTrainingWeek({ training: T({ week: ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'] }), condition: c0, tactics: defaultTactics(), players: [{ id: 'a', nick: 'a' }], maps: {}, split: 1 });
  assert.ok(rest.condition.a.sharpness < 70 && rest.condition.a.fitness === 100);
});

test('familiaridade dos mapas priorizados e vazamento de scrim', () => {
  const r = runTrainingWeek({ training: T({ mapFocus: ['mirage', 'nuke'] }), condition: {}, tactics: defaultTactics(), players: [], maps: {}, split: 1 });
  assert.ok((r.tactics.maps.mirage?.familiarity ?? 0) > 0 && (r.tactics.maps.nuke?.familiarity ?? 0) > 0);
  assert.equal(r.tactics.maps.inferno, undefined);
  assert.equal(r.report.familiarity.length, 2);
  // um mapa só rende mais por mapa que três
  const one = runTrainingWeek({ training: T({ mapFocus: ['mirage'] }), condition: {}, tactics: defaultTactics(), players: [], maps: {}, split: 1 });
  const three = runTrainingWeek({ training: T({ mapFocus: ['mirage', 'nuke', 'inferno'] }), condition: {}, tactics: defaultTactics(), players: [], maps: {}, split: 1 });
  assert.ok(one.tactics.maps.mirage!.familiarity > three.tactics.maps.mirage!.familiarity);
  // vazamento: em algum momento de muitas semanas com scrim, vaza pra um time do circuito, e esfria
  let t = T({ week: ['scrim', 'scrim', 'scrim', 'scrim', 'tactics', 'vod', 'rest'] });
  let leaked = 0;
  for (let i = 0; i < 40; i++) {
    const w = runTrainingWeek({ training: t, condition: {}, tactics: defaultTactics(), players: [], maps: {}, split: 1, leakTargets: ['x', 'y'] });
    if (w.report.leak) leaked++;
    t = w.training;
  }
  assert.ok(leaked > 0 && leaked < 40, `vazou em ${leaked}/40 semanas`);
  assert.deepEqual(decayLeaks({ x: 0.05 }), {});
  assert.equal(leakAgainst({ leaks: { x: 0.5 } }, 'x'), 0.5);
  const real = applyRealScrim({ training: T(), condition: { a: defaultCondition() }, tactics: defaultTactics() }, ['a'], { oppId: 'z', map: 'ancient', oppInCircuit: false, seed: 's' });
  assert.equal(real.leaked, false, 'sparring de fora do circuito não vaza');
  assert.ok(real.condition.a.sharpness > 70 && real.condition.a.fitness < 100);
  assert.ok((real.tactics.maps.ancient?.familiarity ?? 0) > 0);
  // efeito do vazamento: força menor contra ESSE adversário e prontidão de anti-strat cortada
  const team = { isUser: true, strength: 80 } as TTeam;
  assert.equal(applyScrimLeak(team, 1).strength, 78.5);
  assert.equal(applyScrimLeak({ ...team, isUser: false }, 1).strength, 80);
  assert.equal(scrimLeakReadiness(80, 1), 40);
});

// ─── migração do foco antigo ───────────────────────────────────────────────
test('migração: foco antigo de 5 atributos vira foco por atributo; mapas e fadiga migram', () => {
  const legacy = {
    squad: [{ playerId: 'a' }, { playerId: 'b' }, { playerId: 'c' }],
    trainingFocusAttr: { a: 'aim', b: 'igl', c: 'lixo' },
    mapFocus: ['mirage', 'xxx', 'nuke', 'inferno', 'ancient'],
    fatigue: { a: 30, b: 90 },
  };
  const t = trainingFromLegacy(legacy);
  assert.deepEqual(t.focus.a, { kind: 'attr', attr: 'aim' });
  assert.deepEqual(t.focus.b, { kind: 'attr', attr: 'gameSense' });
  assert.equal(t.focus.c, undefined);
  assert.deepEqual(t.mapFocus, ['mirage', 'nuke', 'inferno']);
  assert.deepEqual(trainingFromLegacy({ mapFocus: 'dust2' }).mapFocus, ['dust2'], 'formato antigo de mapa único');
  const s = migrateGestao(legacy);
  assert.equal(s.gestao!.condition.a.fitness, 70);
  assert.equal(s.gestao!.condition.b.fitness, 10);
  assert.equal(s.gestao!.condition.c.fitness, 100);
  assert.deepEqual(s.gestao!.training.focus.a, { kind: 'attr', attr: 'aim' });
  assert.deepEqual(migrateGestao(s), s, 'idempotente');
  // save sem bloco (carreira nova) lê o mesmo que a migração gravaria
  assert.deepEqual(gestaoOf(legacy).training, s.gestao!.training);
  assert.deepEqual(fatigueView(s, ['a', 'b', 'z']), { a: 30, b: 90, z: 0 });
  // a fadiga antiga (funções puras) volta pra condição na borda
  const c2 = conditionWithFatigue(s.gestao!.condition, { a: 50 });
  assert.equal(c2.a.fitness, 50);
  assert.equal(c2.b.fitness, 10);
  // bloco corrompido volta ao padrão sem perder o resto
  assert.deepEqual(normalizeTraining({ ...defaultTrainingState(), week: ['x'] as never }).week, DEFAULT_WEEK);
});

// ─── condição no motor ─────────────────────────────────────────────────────
test('condição no duelo: neutra sem condição; ritmo e cansaço pesam', () => {
  assert.equal(conditionDuelMod(undefined), 0);
  assert.equal(conditionDuelMod({ fitness: 100, sharpness: 70 }), 0);
  assert.equal(conditionDuelMod({ fitness: 70, sharpness: 70 }), 0);
  assert.ok(conditionDuelMod({ fitness: 100, sharpness: 100 }) > 0);
  assert.ok(conditionDuelMod({ fitness: 30, sharpness: 70 }) < -0.3);
  assert.ok(conditionDuelMod({ fitness: 0, sharpness: 0 }) >= -1.31);
  assert.equal(conditionForm({ form: 1.05 }), 1.05);
  // times da IA não recebem condição
  const ai = { isUser: false, players: [{ id: 'x' }] } as unknown as TTeam;
  assert.equal(applyConditionToTeam(ai, { x: { fitness: 10, sharpness: 10 } }), ai);
});

function condWin(engine: 'v1' | 'v2', cond: { fitness: number; sharpness: number } | null, n: number): number {
  setMatchEngine(engine);
  try {
    const teams = realTeams().sort((x, y) => y.strength - x.strength);
    const base = teams[Math.floor(teams.length / 2)];
    const maps = MAP_POOL.map((m) => ({ map: m as MapId, pickedBy: -1 as const }));
    const a: TTeam = { ...base, id: 'a', isUser: false, players: base.players.map((p) => ({ ...p, id: `a-${p.id}`, ...(cond ? { cond } : {}) })) };
    const b: TTeam = { ...base, id: 'b', players: base.players.map((p) => ({ ...p, id: `b-${p.id}` })) };
    let w = 0;
    for (let k = 0; k < n; k++) if (simulateSeries(makeRng(Math.imul(k + 7, 2654435761) >>> 0), a, b, maps, 3).winner === 0) w++;
    return w / n;
  } finally {
    setMatchEngine(null);
  }
}

test('condição no motor (v2 e v1): time cansado e sem ritmo perde mais; condição neutra não muda nada', () => {
  for (const eng of ['v2', 'v1'] as const) {
    const neutral = condWin(eng, null, 400);
    const sameAsNeutral = condWin(eng, { fitness: 100, sharpness: 70 }, 400);
    assert.equal(sameAsNeutral, neutral, `${eng}: condição neutra mudou o resultado`);
    const tired = condWin(eng, { fitness: 30, sharpness: 35 }, 400);
    const sharp = condWin(eng, { fitness: 100, sharpness: 95 }, 400);
    assert.ok(tired < neutral - 0.05, `${eng}: cansado ${tired} × neutro ${neutral}`);
    assert.ok(sharp >= neutral, `${eng}: com ritmo ${sharp} × neutro ${neutral}`);
    assert.ok(tired > neutral - 0.25, `${eng}: efeito grande demais (${tired} × ${neutral})`);
  }
});

test('lesionado não joga: entra o jovem da base da mesma função e a força acompanha', () => {
  const base = realTeams().sort((x, y) => y.strength - x.strength)[0];
  const team: TTeam = { ...base, isUser: true, players: base.players.map((p) => ({ ...p, id: `user__${p.sourcePlayerId ?? p.id}` })) };
  const hurt = team.players[0];
  const oid = hurt.id.slice('user__'.length);
  const kid = { id: 'prospect__k', nick: 'kid', name: 'Kid', country: 'br', role: hurt.role, aim: 62, clutch: 60, consistency: 60, awp: 55, igl: 50 };
  const other = { ...kid, id: 'prospect__o', nick: 'other', role: hurt.role === 'IGL' ? 'AWP' as const : 'IGL' as const, aim: 70 };
  const r = substituteInjured(team, new Set([oid]), [other, kid]);
  assert.equal(r.team.players.length, 5);
  assert.ok(!r.team.players.some((p) => p.id === hurt.id), 'lesionado fora');
  assert.ok(r.team.players.some((p) => p.id === 'stand__prospect__k'), 'jovem da mesma função entra');
  assert.ok(r.team.strength < team.strength, 'força cai');
  assert.deepEqual(r.subs, [{ out: hurt.nick, in: 'kid' }]);
  // sem jovem na base: reserva genérico do motor
  const g = substituteInjured(team, new Set([oid]), []);
  assert.equal(g.team.players.length, 5);
  assert.equal(g.subs[0].in, 'reserva');
  // ninguém lesionado: nada muda
  assert.equal(substituteInjured(team, new Set(), [kid]).team, team);
});
