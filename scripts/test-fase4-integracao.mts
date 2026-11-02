// [fase 4 · integração J × K × L] Carreira com BASE CUSTOMIZADA (editor), JOVENS
// GERADOS (juventude) e o CIRCUITO REAL juntos:
//   - o time novo da base customizada entra no mundo, no calendário da etapa
//     (field) e no ranking VRS; o nome dele fica guardado no resultado;
//   - o split fecha (etapas em segundo plano + juventude) e o bloco `mundo`
//     guarda os campos das três frentes;
//   - o save v30 vai pro JSON, reabre (migração idempotente) e continua igual;
//   - save de Carreira longa (Major jogado) fica abaixo de ~2 MB (killFeed fora).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player, TeamSeason, TTeam } from '../src/types.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import { HIDDEN_KEYS, legacyFromAttrs, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import {
  CUSTOM_PLAYER_PREFIX, CUSTOM_TEAM_PREFIX, addPlayer, addTeam, applyCustomDatabase, emptyDatabase, makeAttrs,
  newEntityId, resolveCareerDatabase, withCareerDatabase,
} from '../src/engine/mundo/editor.ts';
import { ensureYearIntake, tickJuventude, withNewgens, mundoOf } from '../src/engine/mundo/juventudeMundo.ts';
import { newgenList, type MundoJuv } from '../src/engine/mundo/juventude.ts';
import { applyBo3Edits } from '../src/state/bo3-edits.ts';
import { buildAiWorld } from '../src/engine/career/aiWorld.ts';
import { migrateSave } from '../src/state/saveMigrations.ts';
import { teamSeasonToTTeam } from '../src/engine/ratings.ts';
import { buildEtapaEvents, etapaTime, EVENTS_PER_SPLIT } from '../src/engine/mundo/circuito.ts';
import {
  seedWorld, simulateEtapaWorld, closeWorld, nameUnofficialTeams, storedTagOf, withCircuit, withFreshCalendar, USER_ID,
} from '../src/engine/mundo/mundoCarreira.ts';
import { compactCareerSave } from '../src/state/careerSaveCompact.ts';
import { createGSLStage, resolveGSLRound, gslDone } from '../src/engine/gsl.ts';
import { createSwissStage, createPlayoffStage, resolveRound, stageAdvancers } from '../src/engine/swiss.ts';
import { makeRng } from '../src/engine/rng.ts';
import { runWorld, aiPool } from './measure-circuito.mts';

const OFFICIAL = CS2_REAL_2026;
const NOW = '2026-09-29T12:00:00.000Z';

function attrsAt(level: number): PlayerAttrs {
  const a = Object.fromEntries(ALL_ATTRS.map((k) => [k, level])) as PlayerAttrs['a'];
  const h = Object.fromEntries(HIDDEN_KEYS.map((k) => [k, 10])) as PlayerAttrs['h'];
  return makeAttrs(a, h, 175, 'Rifler');
}
function customBase() {
  const taken = new Set<string>();
  const players: Player[] = ['j1', 'j2', 'j3', 'j4', 'j5'].map((nick, i) => {
    const id = newEntityId(CUSTOM_PLAYER_PREFIX, taken, `jkl${i}`);
    taken.add(id);
    const x = attrsAt(17);
    return { id, nick, name: nick, country: 'br', role: 'Rifler', age: 21, ...legacyFromAttrs(x), attrs: x };
  });
  const teamId = newEntityId(CUSTOM_TEAM_PREFIX, taken, 'jklteam');
  const team: TeamSeason = {
    id: teamId, team: 'Circuito Integrado', tag: 'JKL', era: '2026', game: 'CS2', country: 'br', teamwork: 88, honors: '',
    colors: ['#123456', '#fedcba'], mapPrefs: {}, coach: { nick: 'tec', name: 'Tec', country: 'br', rating: 82, style: 'tactical' }, players: [],
  };
  let db = emptyDatabase('J×K×L', [], NOW, 'jkl');
  for (const p of players) db = addPlayer(OFFICIAL, db, p, null);
  db = addTeam(OFFICIAL, db, team, players.map((p) => p.id));
  return { db, team };
}
const pool = (world: TeamSeason[]) => world.filter((t) => !t.defunct && !t.id.startsWith('__') && t.players.length >= 5);

test('J×K×L: time novo da base customizada no calendário e no VRS; split fecha; save v30 reabre', () => {
  const { db, team } = customBase();
  const migrated = migrateSave({ _v: 29, org: null, split: 1, squad: [], moves: {} } as never) as Record<string, unknown> & { mundo?: MundoJuv };
  let mundo = withCareerDatabase(mundoOf(migrated), db) as MundoJuv;
  const res = resolveCareerDatabase(mundo, OFFICIAL);
  const editedBase = applyCustomDatabase(applyBo3Edits(OFFICIAL, { players: {}, teams: {} }), res.db);
  const save = { org: { name: 'Nova', tag: 'NOV' }, split: 1, squad: [] as { playerId: string }[] };
  mundo = ensureYearIntake(mundo, { split: 1, save, world: buildAiWorld({ base: editedBase, split: 1, skip: new Set() }), user: null });
  assert.ok(newgenList(mundo).length > 0, 'jovens do ano');

  // base do mundo integrada (oficial + customizada + jovens) → o circuito semeia nela
  const worldBase = withNewgens(editedBase, mundo, new Set());
  const world = pool(buildAiWorld({ base: worldBase, split: 1, skip: new Set() }));
  const str = new Map(world.map((t) => [t.id, teamSeasonToTTeam(t).strength]));
  const sOf = (id: string) => str.get(id) ?? 72;
  const official = new Set(OFFICIAL.map((t) => t.id));
  const tagOf = (id: string) => world.find((t) => t.id === id)?.tag ?? id;
  const seeded = seedWorld({ pool: world, strengthOf: sOf, now: 0 });
  mundo = withCircuit(mundo, { ...mundo, calendar: mundo.calendar, results: nameUnofficialTeams(seeded.results, (id) => official.has(id), tagOf), vrs: seeded.vrs, vrsAt: seeded.vrsAt });
  assert.ok(mundo.vrs[team.id]?.points > 0, 'o time novo tem ranking VRS');
  assert.equal(storedTagOf(mundo.results, team.id), 'JKL', 'o nome do time novo fica guardado no resultado');

  // calendário da etapa: o time novo está no field de algum evento
  const events = buildEtapaEvents(world, 1, 1, mundo.vrs);
  assert.ok(events.some((e) => e.teams.some((t) => t.id === team.id)), 'o time novo aparece no calendário da etapa');

  // o split fecha: 3 etapas em segundo plano + juventude, as três frentes no mesmo bloco
  let circ = mundo as MundoJuv;
  for (let e = 1; e <= EVENTS_PER_SPLIT; e++) {
    const evs = buildEtapaEvents(world, 1, e, circ.vrs);
    circ = closeWorld(circ, nameUnofficialTeams(simulateEtapaWorld(evs, 1, e, sOf), (id) => official.has(id), tagOf), etapaTime(1, e)).mundo as MundoJuv;
  }
  const juv = tickJuventude({ mundo: circ, split: 1, base: editedBase, moves: {}, skip: new Set(), save, user: null });
  const closedMundo = withCircuit(juv.mundo, withFreshCalendar(circ, 2)) as MundoJuv;
  assert.ok(closedMundo.vrs[team.id], 'VRS sobrevive à juventude');
  assert.equal(closedMundo.database?.id, db.id, 'a base congelada sobrevive ao circuito');
  assert.ok(Object.keys(closedMundo.newgens).length > 0, 'os jovens sobrevivem ao circuito');
  assert.ok(closedMundo.calendar.every((e) => e.split === 2 || e.kind === 'major' || e.kind === 'rmr'), 'calendário renovou pro split 2');

  // save v30: JSON → reabre (migração idempotente) igual; compactar não muda o mundo
  const saved = JSON.parse(JSON.stringify({ ...migrated, split: 2, mundo: closedMundo }));
  const reopened = migrateSave(saved) as typeof saved;
  assert.deepEqual(reopened.mundo, saved.mundo);
  assert.equal(resolveCareerDatabase(reopened.mundo, OFFICIAL).status, 'snapshot');
  assert.equal(compactCareerSave(reopened), reopened, 'save sem séries: nada a compactar (mesma referência)');
});

// ─── save longo: Major jogado (liga + playoffs + 3 stages + Champions) ──────

test('save de Carreira longa (Major jogado) fica abaixo de ~2 MB: killFeed fora, stats e placar ficam', () => {
  const teams = aiPool(1).slice(0, 40).map(teamSeasonToTTeam);
  const rng = makeRng(20260929);
  // liga GSL de 16 (a etapa) até o fim
  const league = createGSLStage('Liga', teams.slice(0, 16));
  let g = 0;
  while (!gslDone(league) && g++ < 6) resolveGSLRound(league, rng);
  // Major: 3 stages suíços + Champions Stage, histórico acumulado como na Carreira
  let carry: TTeam[] = [];
  const history: { phase: string; pairing: unknown }[] = [];
  let last = createSwissStage(teams.slice(16, 32), rng, 'Stage 1');
  for (let k = 1; k <= 3; k++) {
    if (k > 1) last = createSwissStage([...carry, ...teams.slice(k === 2 ? 0 : 32, k === 2 ? 8 : 40)], rng, `Stage ${k}`);
    let r = 0;
    while (last.phase !== 'done' && r++ < 12) resolveRound(last, rng);
    history.push(...last.history);
    carry = stageAdvancers(last);
  }
  const po = createPlayoffStage(carry, 'Champions');
  let r = 0;
  while (po.phase !== 'done' && r++ < 8) resolveRound(po, rng);
  const world = runWorld(12, aiPool(1)).mundo;
  // layout gravado no fim do Major (concludeMajor): o histórico inteiro só no resultado
  const raw = {
    _v: 30, split: 12, league, playoff: null, majorT: { ...po, history: [] }, majorHistory: [],
    majorResult: { tournament: { ...po, history: [...history, ...po.history] }, placement: 'champion', prize: 1, vrs: 1, champion: true },
    mundo: world, news: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, split: 12, icon: 'x', tone: 'info', title: 'x'.repeat(60), body: 'y'.repeat(200) })),
  };
  const before = JSON.stringify(raw).length;
  const compact = compactCareerSave(raw);
  const after = JSON.stringify(compact).length;
  console.log(`  save com Major jogado: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB`);
  assert.ok(after < 2_000_000, `save longo acima de 2 MB (${after})`);
  assert.ok(after < before * 0.5, 'o killFeed era a maior parte do peso');
  assert.equal(compactCareerSave(compact), compact, 'idempotente');
  assert.equal(raw.league.rounds[0][0].result!.maps[0].killFeed.length > 0, true, 'não muta o save de entrada');
  const m0 = compact.league.rounds[0][0].result!.maps[0];
  assert.equal(m0.killFeed.length, 0);
  assert.ok(m0.roundLog.length > 0 && Object.keys(m0.stats).length === 10, 'placar round a round e stats por jogador ficam');
  assert.equal(compact.mundo, raw.mundo, 'o resto do save segue com a mesma referência');
});
