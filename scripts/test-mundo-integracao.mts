// [fase 4 · integração K × L] Carreira com BASE CUSTOMIZADA (editor) e JOVENS
// GERADOS (juventude) juntos: a base do mundo é a base da Carreira (oficial +
// admin + customizada congelada) com os jovens no mercado livre; o time novo da
// base customizada entra no mundo, os jovens entram no mercado, os movíveis
// somam os dois, o fechamento do split roda e o save v30 abre e reabre igual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player, TeamSeason } from '../src/types.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import { HIDDEN_KEYS, attrsOf, legacyFromAttrs, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import {
  CUSTOM_PLAYER_PREFIX, CUSTOM_TEAM_PREFIX, addPlayer, addTeam, applyCustomDatabase, emptyDatabase, makeAttrs,
  newEntityId, resolveCareerDatabase, validateDatabase, withCareerDatabase, withPlayerEdit,
} from '../src/engine/mundo/editor.ts';
import { ensureYearIntake, movableIdsWith, tickJuventude, withNewgens, mundoOf } from '../src/engine/mundo/juventudeMundo.ts';
import { isNewgenId, newgenList, type MundoJuv } from '../src/engine/mundo/juventude.ts';
import { applyBo3Edits } from '../src/state/bo3-edits.ts';
import { BASE_PLAYER_IDS, buildAiWorld, currentFreeAgents } from '../src/engine/career/aiWorld.ts';
import { migrateSave, saveVersion, SAVE_VERSION } from '../src/state/saveMigrations.ts';

const OFFICIAL = CS2_REAL_2026;
const NOW = '2026-09-29T12:00:00.000Z';

function attrsAt(level: number): PlayerAttrs {
  const a = Object.fromEntries(ALL_ATTRS.map((k) => [k, level])) as PlayerAttrs['a'];
  const h = Object.fromEntries(HIDDEN_KEYS.map((k) => [k, 10])) as PlayerAttrs['h'];
  return makeAttrs(a, h, 170, 'Rifler');
}
function customBase() {
  const taken = new Set<string>();
  const players: Player[] = ['i1', 'i2', 'i3', 'i4', 'i5'].map((nick, i) => {
    const id = newEntityId(CUSTOM_PLAYER_PREFIX, taken, `int${i}`);
    taken.add(id);
    const x = attrsAt(16);
    return { id, nick, name: nick, country: 'br', role: 'Rifler', age: 20, ...legacyFromAttrs(x), attrs: x };
  });
  const teamId = newEntityId(CUSTOM_TEAM_PREFIX, taken, 'intteam');
  const team: TeamSeason = {
    id: teamId, team: 'Integrados', tag: 'INT', era: '2026', game: 'CS2', country: 'br', teamwork: 82, honors: '',
    colors: ['#112233', '#ddeeff'], mapPrefs: {}, coach: { nick: 'tec', name: 'Tec', country: 'br', rating: 80, style: 'tactical' }, players: [],
  };
  let db = emptyDatabase('Integração', [], NOW, 'integ');
  for (const p of players) db = addPlayer(OFFICIAL, db, p, null);
  db = addTeam(OFFICIAL, db, team, players.map((p) => p.id));
  const star = OFFICIAL.find((t) => !t.defunct && t.id !== '__free__' && t.players.length >= 5)!.players[0];
  const sx = attrsOf(star);
  db = withPlayerEdit(db, star.id, { attrs: makeAttrs({ ...sx.a, aim: 4 }, sx.h, sx.pa, star.role), nick: 'Integrado' });
  assert.equal(validateDatabase(db, OFFICIAL).ok, true);
  return { db, team, players, star };
}

test('Carreira com base customizada + jovens gerados: mundo, mercado, movíveis e fechamento do split', () => {
  const { db, team, players, star } = customBase();
  // save v29 (antes da fase 4) migra para v30; a Carreira nova escolhe a base e gera a leva do ano
  const v29 = { _v: 29, org: null, split: 1, squad: [], moves: {} } as Record<string, unknown>;
  const migrated = migrateSave(v29 as never) as Record<string, unknown> & { mundo?: MundoJuv };
  assert.equal(saveVersion(migrated as never), SAVE_VERSION);
  assert.ok(SAVE_VERSION >= 30);
  let mundo = withCareerDatabase(mundoOf(migrated), db) as MundoJuv;
  const res = resolveCareerDatabase(mundo, OFFICIAL);
  assert.equal(res.status, 'snapshot');
  const editedBase = applyCustomDatabase(applyBo3Edits(OFFICIAL, { players: {}, teams: {} }), res.db);
  const save = { org: { name: 'Nova', tag: 'NOV' }, split: 1, squad: [] as { playerId: string }[] };
  mundo = ensureYearIntake(mundo, { split: 1, save, world: buildAiWorld({ base: editedBase, split: 1, skip: new Set() }), user: null });
  const youth = newgenList(mundo);
  assert.ok(youth.length > 20, 'leva do ano gerada');
  assert.equal(mundo.database?.id, db.id, 'a cópia congelada da base sobrevive à leva');

  // base do mundo = base da Carreira + jovens no mercado livre (a composição do CareerScreen)
  const worldBase = withNewgens(editedBase, mundo, new Set());
  const world = buildAiWorld({ base: worldBase, split: 1, skip: new Set() });
  const t = world.find((w) => w.id === team.id);
  assert.ok(t, 'time novo da base customizada está no mundo');
  assert.deepEqual(t!.players.map((p) => p.id), players.map((p) => p.id));
  const s = world.flatMap((w) => w.players).find((p) => p.id === star.id)!;
  assert.equal(s.nick, 'Integrado');
  assert.equal(attrsOf(s).a.aim, 4);
  const free = currentFreeAgents(worldBase, {});
  assert.ok(youth.every((p) => free.some((f) => f.id === p.id)), 'todos os jovens entram no mercado livre');

  // movíveis: jogadores da base customizada + jovens (nunca só a base oficial)
  const baseMovable = new Set(applyCustomDatabase(OFFICIAL, res.db).flatMap((x) => x.players.map((p) => p.id)));
  const movable = movableIdsWith(mundo, baseMovable);
  assert.ok(players.every((p) => movable.has(p.id)), 'jogadores novos da base são movíveis');
  assert.ok(youth.every((p) => movable.has(p.id)), 'jovens são movíveis');
  assert.ok(players.every((p) => !BASE_PLAYER_IDS.has(p.id)));
  assert.equal(movableIdsWith(null, baseMovable), baseMovable);

  // um jovem contratado por um time da base customizada via moves
  const kid = youth[0];
  const moved = buildAiWorld({ base: worldBase, moves: { [kid.id]: team.id }, split: 1, skip: new Set() });
  assert.ok(moved.find((w) => w.id === team.id)!.players.some((p) => p.id === kid.id));

  // fechamento do split com a base da Carreira (oficial + customizada), sem quebrar
  const r = tickJuventude({ mundo, split: 1, base: editedBase, moves: { [kid.id]: team.id }, skip: new Set(), save, user: null });
  assert.ok(Object.keys(r.mundo.newgens).length > 0);
  assert.equal(r.mundo.database?.id, db.id);
  assert.ok(Object.keys(r.mundo.newgens).every(isNewgenId));

  // save v30 com base + jovens: JSON, reabre (migração idempotente) e resolve a mesma base
  const saved = JSON.parse(JSON.stringify({ ...migrated, mundo: r.mundo }));
  const reopened = migrateSave(saved) as typeof saved;
  assert.deepEqual(reopened.mundo, saved.mundo);
  const again = resolveCareerDatabase(reopened.mundo, OFFICIAL);
  assert.equal(again.status, 'snapshot');
  assert.equal(newgenList(reopened.mundo).length, newgenList(r.mundo).length);
});

test('sem base customizada: a composição é exatamente a de antes (oficial + jovens)', () => {
  const official = applyBo3Edits(OFFICIAL, { players: {}, teams: {} });
  const res = resolveCareerDatabase({ databaseId: null }, OFFICIAL);
  assert.equal(applyCustomDatabase(official, res.db), official);
  assert.equal(movableIdsWith(null), BASE_PLAYER_IDS);
});
