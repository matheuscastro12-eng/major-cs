// TÁTICA POR MAPA (realismo FM, fase 2 · frente E). `npm run test:sim`.
//
// Trava:
//   - papel certo × errado (custo fora da função, versatilidade, AWPer/IGL do mapa)
//   - setup de CT × execução do T (matriz centrada, familiaridade escala, anti-strat)
//   - familiaridade (ganho com retorno decrescente, decaimento sem uso, custo de mudança)
//   - política de eco (muda a compra; o force/save ao vivo manda)
//   - sem contagem dupla (call ao vivo substitui ritmo/agressividade; sem viés de
//     lado; plano "Anti-strat" não soma o bônus genérico com preparação; sem
//     tática o motor é o de antes)
//   - % mostrado = % rolado com tática nos dois lados (inclui timeout automático)
//   - calibração: todos os alvos na tolerância com a tática padrão da IA

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSimV2 } from '../src/engine/match2/engine.ts';
import { makeRng } from '../src/engine/rng.ts';
import { MAP_POOL, type TTeam } from '../src/types.ts';
import { attrsOf } from '../src/engine/attrs/model.ts';
import {
  aiTactics, aiInstructions, antiStratReadOf, bestExecVs, bestSetupVs, CT_SETUPS, defaultTactics, editInstructions, editMapTactic,
  FAM_FLOOR, gainAntiStrat, gainFamiliarity, decayFamiliarity, matchTacticsFor, prepareAntiStrat, resolveTeamPlan, roleFitPts, RPS,
  rpsValue, T_EXECUTES, tacticDuelMods, tacticsAfterMatch, CHANGE_COST, NEUTRAL_TACTIC_MODS, famLogit, type TeamPlan,
} from '../src/engine/gestao/tatica.ts';
import type { TacticsState } from '../src/engine/gestao/model.ts';
import { realTeams, runCalibration, compareTargets, loadTargets } from './calibrate-engine.mts';
import { mirror, ai, fam, shuffledRoles, plan } from './measure-tactics.mts';

const TEAMS = realTeams();
const T0 = TEAMS[4];

const withTac = (t: TTeam, tac: TacticsState | null): TTeam => ({ ...t, tactics: tac });
const planOf = (tac: TacticsState, team: TTeam = T0, oppId: string | null = 'opp') => resolveTeamPlan(tac, 'mirage', team.players, team.id, oppId);

// ── papéis ───────────────────────────────────────────────────────────────────

test('papel: natural não custa; fora da função custa atributo; versatilidade atenua', () => {
  const p = T0.players.find((x) => x.role === 'Entry') ?? T0.players[0];
  assert.equal(roleFitPts(p, p.role === 'Entry' ? 'entry' : 'second'), p.role === 'Entry' ? 0 : roleFitPts(p, 'second'));
  const off = roleFitPts(p, 'awp');
  assert.ok(off < -0.5, `entry de AWP deveria custar pontos: ${off}`);
  const x = attrsOf(p);
  const versatile = { ...p, attrs: { ...x, h: { ...x.h, versatility: 20 } } };
  const rigid = { ...p, attrs: { ...x, h: { ...x.h, versatility: 3 } } };
  assert.ok(roleFitPts(rigid, 'awp') < -2, `sem versatilidade, fora da função custa caro: ${roleFitPts(rigid, 'awp')}`);
  assert.ok(roleFitPts(versatile, 'awp') > roleFitPts(rigid, 'awp') / 2, 'versatilidade alta atenua');
  assert.ok(roleFitPts(rigid, 'second') > roleFitPts(rigid, 'awp'), 'papel vizinho custa menos que papel distante');
});

test('papel: o papel AWP do mapa decide quem compra a AWP; papéis certos vencem os embaralhados', () => {
  const nonAwp = T0.players.find((x) => x.role !== 'AWP' && x.role !== 'IGL')!;
  const roles = Object.fromEntries(T0.players.map((x) => [x.id, x.id === nonAwp.id ? 'awp' : x.role === 'AWP' ? 'second' : x.role === 'IGL' ? 'igl' : x.role === 'Entry' ? 'entry' : x.role === 'Lurker' ? 'lurker' : x.role === 'Support' ? 'support' : 'second'])) as Record<string, 'awp'>;
  const tac: TacticsState = { ...defaultTactics(), maps: { mirage: { map: 'mirage', roles, ct: 'standard', t: ['default'], familiarity: 50 } } };
  const sim = createMapSimV2(makeRng(9), withTac(T0, tac), TEAMS[7], 'mirage', -1);
  while (!sim.step()) { /* */ }
  const awpKillers = new Set(sim.killFeed().filter((k) => k.weapon === 'awp' && k.killerTeam === 0).map((k) => k.killerId));
  assert.ok(awpKillers.size >= 1, 'ninguém matou de AWP');
  for (const id of awpKillers) assert.equal(id, nonAwp.id, 'só o papel AWP do mapa leva a AWP');
  const r = mirror(ai, shuffledRoles, 700, 11);
  assert.ok(r.mapWinA > 0.56, `papéis certos × embaralhados: ${(r.mapWinA * 100).toFixed(1)}%`);
});

// ── setup × execução ────────────────────────────────────────────────────────

test('RPS: matriz duplamente centrada — nenhum setup/execução domina na média', () => {
  for (const s of CT_SETUPS) assert.ok(Math.abs(T_EXECUTES.reduce((a, e) => a + RPS[s][e], 0)) < 0.02, `linha ${s}`);
  for (const e of T_EXECUTES) assert.ok(Math.abs(CT_SETUPS.reduce((a, s) => a + RPS[s][e], 0)) < 0.02, `coluna ${e}`);
  assert.ok(RPS.stackA.fastA < -1 && RPS.stackA.fastB > 1, 'stack no A pune rush A e abre o B');
  assert.equal(bestSetupVs(['fastA']), 'stackA');
  assert.equal(bestExecVs('stackA'), 'fastB');
});

test('setup × execução: o contra vence, a familiaridade escala e o anti-strat desloca pro contra', () => {
  const mk = (ct: TeamPlan['ct'], t: TeamPlan['t'], f: number, id: string, read = 0, oppId = 'x'): TeamPlan =>
    ({ ...planOf(defaultTactics()), teamId: id, ct, t, fam: f, read, oppId });
  const tRush = mk('standard', ['fastA'], 50, 'T');
  assert.ok(rpsValue(tRush, mk('stackA', ['default'], 50, 'C')) < 0, 'stack no A contra rush A favorece o CT');
  assert.ok(rpsValue(tRush, mk('stackB', ['default'], 50, 'C')) > 0, 'stack no B contra rush A favorece o T');
  const weakCt = rpsValue(tRush, mk('stackA', ['default'], 20, 'C'));
  const strongCt = rpsValue(tRush, mk('stackA', ['default'], 95, 'C'));
  assert.ok(strongCt < weakCt, 'CT mais familiarizado bate mais forte');
  // anti-strat: CT padrão que estudou o T previsível passa a jogar perto do stack certo
  const blind = rpsValue(tRush, mk('standard', ['default'], 50, 'C', 0, 'T'));
  const read = rpsValue(tRush, mk('standard', ['default'], 50, 'C', 0.6, 'T'));
  assert.ok(read < blind - 0.5, `anti-strat deveria tirar do T: ${blind.toFixed(2)} → ${read.toFixed(2)}`);
  // no motor: o contra ideal vence o plano previsível
  const r = mirror(plan('stackA', ['fastB']), plan('stackA', ['fastA']), 700, 12);
  assert.ok(r.mapWinA > 0.55, `contra ideal × previsível: ${(r.mapWinA * 100).toFixed(1)}%`);
});

// ── familiaridade ───────────────────────────────────────────────────────────

test('familiaridade: gainFamiliarity (contrato do treino) cresce com retorno decrescente, limita em 100 e cria o mapa', () => {
  let t = defaultTactics();
  t = gainFamiliarity(t, 'nuke', 10);
  assert.equal(t.maps.nuke?.familiarity, 56.2); // 50 + 10 × (1 − 50/130)
  const low = gainFamiliarity(t, 'nuke', 10).maps.nuke!.familiarity - t.maps.nuke!.familiarity;
  let hi = t;
  for (let i = 0; i < 40; i++) hi = gainFamiliarity(hi, 'nuke', 10);
  assert.ok(hi.maps.nuke!.familiarity <= 100);
  const high = gainFamiliarity({ ...hi, maps: { nuke: { ...hi.maps.nuke!, familiarity: 90 } } }, 'nuke', 10).maps.nuke!.familiarity - 90;
  assert.ok(high < low, 'perto de 100 o ganho é menor');
  assert.equal(gainFamiliarity(t, 'nuke', -5).maps.nuke!.familiarity, 51.2);
});

test('familiaridade: decai sem uso (piso), mapa jogado sobe, mudar o plano custa', () => {
  let t = defaultTactics();
  for (let i = 0; i < 40; i++) t = decayFamiliarity(t, ['mirage']);
  for (const m of MAP_POOL) {
    if (m === 'mirage') assert.equal(t.maps.mirage, undefined);
    else assert.equal(t.maps[m]!.familiarity, FAM_FLOOR);
  }
  const after = tacticsAfterMatch(defaultTactics(), ['inferno', 'nuke'], 'rival');
  assert.ok(after.maps.inferno!.familiarity > 50 && after.maps.ancient!.familiarity < 50);
  const e = editMapTactic(defaultTactics(), 'mirage', { ct: 'stackB', t: ['default', 'splitA', 'fake'] });
  assert.equal(e.maps.mirage!.familiarity, 50 - CHANGE_COST.ct - CHANGE_COST.newExec - CHANGE_COST.dropExec);
  const same = editMapTactic(defaultTactics(), 'mirage', { ct: 'standard' });
  assert.equal(same.maps.mirage!.familiarity, 50, 'não mudar não custa');
  const gi = editInstructions(defaultTactics(), { tempo: 'fast' });
  for (const m of MAP_POOL) assert.equal(gi.maps[m]!.familiarity, 50 - CHANGE_COST.instr);
});

test('familiaridade 90 × 20 no mesmo elenco move a vitória de forma plausível', () => {
  const r = mirror(fam(90), fam(20), 900, 13);
  assert.ok(r.mapWinA > 0.55 && r.mapWinA < 0.75, `fam 90 × 20: ${(r.mapWinA * 100).toFixed(1)}%`);
});

// ── política de eco ─────────────────────────────────────────────────────────

test('política de eco: sempre forçar força mais, save total menos; o force/save ao vivo manda', () => {
  const count = (policy: 'alwaysForce' | 'fullSave' | 'forceAfterPistol') => {
    let force = 0, dry = 0;
    for (let s = 1; s <= 25; s++) {
      const tac = { ...aiTactics(T0), instr: { ...aiInstructions(T0), ecoPolicy: policy } };
      const sim = createMapSimV2(makeRng(s), withTac(T0, tac), TEAMS[9], MAP_POOL[s % 7], -1);
      while (!sim.step()) { /* */ }
      for (const x of sim.trace()) { if (x.buys[0] === 'force') force++; if (x.econ[0] === -1) dry++; }
    }
    return { force, dry };
  };
  const always = count('alwaysForce'), std = count('forceAfterPistol'), save = count('fullSave');
  assert.ok(always.force > std.force && std.force > save.force, `force: sempre ${always.force} · padrão ${std.force} · save ${save.force}`);
  assert.ok(always.dry < std.dry && std.dry < save.dry, `eco seco: sempre ${always.dry} · padrão ${std.dry} · save ${save.dry}`);
  // a call de save ao vivo vence a política "sempre forçar"
  const tac = { ...aiTactics(T0), instr: { ...aiInstructions(T0), ecoPolicy: 'alwaysForce' as const } };
  const sim = createMapSimV2(makeRng(3), withTac(T0, tac), TEAMS[9], 'mirage', -1);
  for (let r = 0; r < 3; r++) sim.step();
  sim.step(null, undefined, { team: 0, kind: 'save' });
  assert.equal(sim.trace()[3].buys[0], 'eco');
});

// ── sem contagem dupla ──────────────────────────────────────────────────────

test('sem contagem dupla: call/postura ao vivo substitui ritmo e agressividade preparados', () => {
  // [estilo de jogo] o estilo é outra camada (test-estilo.mts): aqui, Padrão
  const tac = { ...aiTactics(T0), style: undefined, styleFam: undefined, instr: { ...aiInstructions(T0), tempo: 'fast' as const, aggression: 'aggressive' as const, utility: 'balanced' as const } };
  const p = planOf(tac);
  const prep = tacticDuelMods({ plan: p, opp: null, side: 't' });
  const live = tacticDuelMods({ plan: p, opp: null, side: 't', live: true });
  assert.ok(prep.phaseLogit && prep.plantMult && prep.timeMult);
  assert.equal(live.phaseLogit, undefined);
  assert.equal(live.plantMult, undefined);
  assert.equal(live.timeMult, undefined);
  // no motor: com rush chamado, ritmo rápido × equilibrado dão a MESMA %
  const bal = { ...tac, instr: { ...tac.instr, tempo: 'balanced' as const, aggression: 'balanced' as const } };
  const s1 = createMapSimV2(makeRng(5), withTac(T0, tac), withTac(TEAMS[8], aiTactics(TEAMS[8])), 'mirage', -1);
  const s2 = createMapSimV2(makeRng(5), withTac(T0, bal), withTac(TEAMS[8], aiTactics(TEAMS[8])), 'mirage', -1);
  let same = 0, differ = 0;
  for (let r = 0; r < 20 && !s1.done() && !s2.done(); r++) {
    const call = { team: 0 as const, kind: 'rush' as const };
    if (Math.abs(s1.peekWinProb(0, undefined, call) - s2.peekWinProb(0, undefined, call)) < 1e-12) same++;
    if (Math.abs(s1.peekWinProb(0) - s2.peekWinProb(0)) > 1e-6) differ++;
    s1.step(null, undefined, call); s2.step(null, undefined, call);
  }
  assert.ok(same >= 10, `com call ao vivo a instrução não conta (${same})`);
  assert.ok(differ >= 5, `sem call a instrução conta (${differ})`);
});

test('sem contagem dupla: a tática não soma viés de lado/pistol (isso é do playbook) e a linha de base é neutra', () => {
  const p = planOf({ ...aiTactics(T0), instr: { tempo: 'balanced', utility: 'balanced', ecoPolicy: 'forceAfterPistol', aggression: 'balanced', timeoutPolicy: 'normal' } });
  const t = tacticDuelMods({ plan: p, opp: null, side: 't' });
  const c = tacticDuelMods({ plan: p, opp: null, side: 'ct' });
  assert.equal(t.teamLogit, c.teamLogit, 'sem adversário, T e CT recebem o mesmo (só familiaridade)');
  assert.ok(Math.abs(t.teamLogit - famLogit(p.fam)) < 1e-12);
  assert.equal(NEUTRAL_TACTIC_MODS.teamLogit, 0);
  // sem team.tactics o motor é bit a bit o de antes (tactics null = undefined)
  const a = createMapSimV2(makeRng(21), T0, TEAMS[6], 'nuke', -1);
  const b = createMapSimV2(makeRng(21), withTac(T0, null), withTac(TEAMS[6], null), 'nuke', -1);
  while (!a.step()) b.step();
  b.step();
  assert.deepEqual(a.roundLog(), b.roundLog());
});

test('sem contagem dupla: o plano "Anti-strat" troca o bônus genérico pelo foco na preparação', () => {
  const base = defaultTactics();
  assert.equal(matchTacticsFor(base, 'antistrat', 'rival').genericAntiStrat, true, 'sem preparação vale o bônus genérico');
  assert.equal(matchTacticsFor(base, 'aggressive', 'rival').genericAntiStrat, false);
  const prep = prepareAntiStrat(base, 'rival', 0.35);
  const m = matchTacticsFor(prep, 'antistrat', 'rival');
  assert.equal(m.genericAntiStrat, false, 'com preparação o genérico sai');
  assert.ok(antiStratReadOf(m.tactics, 'rival') > antiStratReadOf(prep, 'rival'), 'e a leitura foca');
  assert.equal(antiStratReadOf(prep, 'outro'), 0, 'preparação vale só contra o adversário estudado');
  assert.equal(matchTacticsFor(prep, 'antistrat', 'outro').genericAntiStrat, true);
  const g = gainAntiStrat(prep, 'rival', 30);
  assert.equal(g.antiStrat!.readiness, prep.antiStrat!.readiness + 30);
  assert.equal(tacticsAfterMatch(g, ['mirage'], 'rival').antiStrat, null, 'a série consome a preparação');
});

// ── % mostrado = % rolado ───────────────────────────────────────────────────

test('% mostrado = % rolado com tática nos dois lados (instruções, anti-strat, timeout automático)', () => {
  let rounds = 0, sumP = 0, sumVar = 0, wins = 0, checked = 0, timeouts = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const a = TEAMS[seed % TEAMS.length], b = TEAMS[(seed * 7 + 5) % TEAMS.length];
    const ta = { ...aiTactics(a, { id: b.id, scouting: 0.8 }), instr: { ...aiInstructions(a), tempo: seed % 2 ? 'fast' as const : 'slow' as const, ecoPolicy: seed % 3 ? 'alwaysForce' as const : 'fullSave' as const, timeoutPolicy: 'early' as const } };
    const sim = createMapSimV2(makeRng(seed), withTac(a, ta), withTac(b, aiTactics(b, { id: a.id, scouting: 0.6 })), MAP_POOL[seed % 7], -1);
    let g = 0;
    while (!sim.done() && g++ < 60) {
      const stance = g % 3 === 0 ? { team: 0 as const, mode: 'aggressive' as const } : undefined;
      const call = g % 7 === 0 ? { team: 1 as const, kind: 'retake' as const } : undefined;
      const boost = g % 5 === 0 ? 1 : null;
      const shown = sim.peekWinProb(0, stance, call, boost);
      sim.step(boost, stance, call);
      const rolled = sim.lastRollP(0)!;
      if (sim.lastSite()!.ctStack == null) { assert.ok(Math.abs(rolled - shown) < 1e-12, `seed ${seed}: ${shown} × ${rolled}`); checked++; }
      const log = sim.roundLog();
      rounds++; sumP += rolled; sumVar += rolled * (1 - rolled);
      if (log[log.length - 1] === 0) wins++;
    }
    timeouts += sim.autoTimeouts().length;
  }
  assert.ok(checked > 300);
  assert.ok(timeouts > 10, `timeout automático nunca disparou (${timeouts})`);
  const z = (wins - sumP) / Math.sqrt(sumVar);
  assert.ok(Math.abs(z) < 4, `a % rolada não é a probabilidade real: z=${z.toFixed(2)}`);
});

test('timeout automático: o time que chama à mão (manualTimeouts) fica fora', () => {
  const tac = { ...aiTactics(T0), instr: { ...aiInstructions(T0), timeoutPolicy: 'early' as const } };
  let auto0 = 0, manual0 = 0;
  for (let s = 1; s <= 20; s++) {
    const a = createMapSimV2(makeRng(s), withTac(T0, tac), withTac(TEAMS[2], tac), 'dust2', -1);
    const m = createMapSimV2(makeRng(s), withTac(T0, tac), withTac(TEAMS[2], tac), 'dust2', -1, { manualTimeouts: 0 });
    while (!a.step()) { /* */ }
    while (!m.step()) { /* */ }
    auto0 += a.autoTimeouts().filter((x) => x.team === 0).length;
    manual0 += m.autoTimeouts().filter((x) => x.team === 0).length;
    assert.ok(a.autoTimeouts().filter((x) => x.team === 0).length <= 2);
  }
  assert.ok(auto0 > 0);
  assert.equal(manual0, 0);
});

// ── IA ──────────────────────────────────────────────────────────────────────

test('IA: tática determinística e coerente com técnico/IGL (agressivo puxa rush/agressivo, disciplinador salva)', () => {
  assert.deepEqual(aiTactics(T0), aiTactics(T0));
  const aggro: TTeam = { ...T0, coach: { ...T0.coach, style: 'aggressive' }, playbook: 'fast', players: T0.players.map((p) => ({ ...p, playstyle: 'aggressive' as const })) };
  const calm: TTeam = { ...T0, coach: { ...T0.coach, style: 'discipline' }, playbook: 'controlled', players: T0.players.map((p) => ({ ...p, playstyle: 'passive' as const })) };
  const ia = aiTactics(aggro), ic = aiTactics(calm);
  assert.equal(ia.instr.tempo, 'fast'); assert.equal(ia.instr.aggression, 'aggressive');
  assert.equal(ic.instr.ecoPolicy, 'fullSave'); assert.equal(ic.instr.aggression, 'passive'); assert.equal(ic.instr.tempo, 'slow');
  const rushes = (t: TacticsState) => MAP_POOL.reduce((n, m) => n + t.maps[m]!.t.filter((e) => e === 'fastA' || e === 'fastB').length, 0);
  assert.ok(rushes(ia) > rushes(ic), `agressivo ${rushes(ia)} × calmo ${rushes(ic)} rushes`);
  for (const m of MAP_POOL) {
    const mt = ia.maps[m]!;
    assert.ok(mt.t.length >= 1 && mt.t.length <= 4 && mt.familiarity >= 25 && mt.familiarity <= 85);
    assert.equal(Object.values(mt.roles).filter((r) => r === 'awp').length <= 1, true);
  }
});

// ── calibração ──────────────────────────────────────────────────────────────

test('calibração: com a tática padrão da IA nos dois lados, todo alvo continua na tolerância', () => {
  const m = runCalibration(2500, 20260929, { tactics: true });
  const out = compareTargets(m, loadTargets()).filter((c) => !c.ok);
  assert.equal(out.length, 0, `fora da tolerância:\n${out.map((c) => `  ${c.key}: alvo ${c.target} ± ${c.tol}, obtido ${c.got.toFixed(3)}`).join('\n')}`);
});
