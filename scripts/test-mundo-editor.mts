// [fase 4 · frente EDITOR] Editor de base: validação forte, exportar/importar
// (inclusive JSON malicioso/gigante), storage fora do save e a base aplicada
// numa Carreira nova (mundo da IA, jogador editado, time novo, oficial intacta).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import type { Player, TeamSeason } from '../src/types.ts';
import { ALL_ATTRS } from '../src/engine/attributes.ts';
import { HIDDEN_KEYS, attrsOf, caFromAttrs, legacyFromAttrs, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import {
  DB_LIMITS, FREE_TEAM_ID, addPlayer, addTeam, applyCustomDatabase, applyCustomPlayer, databaseBytes, emptyDatabase as emptyDb,
  exportDatabaseJson, importDatabaseJson, isSpecialTeam, makeAttrs, movePlayer, newEntityId, removeAddedPlayer,
  removeAddedTeam, resolveCareerDatabase, resolveRosters, setRoster, validateDatabase, withCareerDatabase,
  withPlayerEdit, withTeamEdit, CUSTOM_PLAYER_PREFIX, CUSTOM_TEAM_PREFIX,
} from '../src/engine/mundo/editor.ts';
import type { CustomDatabase } from '../src/engine/mundo/model.ts';
import { migrateMundo } from '../src/engine/mundo/mundoMigration.ts';
import { applyBo3Edits, applyBo3PlayerEdit } from '../src/state/bo3-edits.ts';
import { buildAiWorld, currentFreeAgents } from '../src/engine/career/aiWorld.ts';
import { CUSTOM_DB_KEY, loadCustomDbs, saveCustomDbs } from '../src/state/customDb.ts';

const OFFICIAL = CS2_REAL_2026;
const NOW = '2026-09-29T12:00:00.000Z';
let salt = 0;
const emptyDatabase = (name: string, taken: string[] = []) => emptyDb(name, taken, NOW, `t${++salt}`);
const live = OFFICIAL.filter((t) => !isSpecialTeam(t));
const teamWith = (n: number) => live.find((t) => t.players.length === n)!;
const bigTeam = live.find((t) => t.players.length >= 6)!;
const five = teamWith(5);

function attrsFor(level: number, pa = 180): PlayerAttrs {
  const a = Object.fromEntries(ALL_ATTRS.map((k) => [k, level])) as PlayerAttrs['a'];
  const h = Object.fromEntries(HIDDEN_KEYS.map((k) => [k, 10])) as PlayerAttrs['h'];
  return makeAttrs(a, h, pa, 'Rifler');
}
function newPlayer(taken: Set<string>, nick: string, level = 15): Player {
  const id = newEntityId(CUSTOM_PLAYER_PREFIX, taken, `p${++salt}`);
  taken.add(id);
  const x = attrsFor(level);
  return { id, nick, name: nick, country: 'br', role: 'Rifler', age: 19, ...legacyFromAttrs(x), attrs: x };
}
function newTeam(taken: Set<string>): TeamSeason {
  const id = newEntityId(CUSTOM_TEAM_PREFIX, taken, `t${++salt}`);
  taken.add(id);
  return {
    id, team: 'Os Editados', tag: 'EDT', era: '2026', game: 'CS2', country: 'br', teamwork: 80, honors: '',
    colors: ['#112233', '#ddeeff'], mapPrefs: {}, coach: { nick: 'mestre', name: 'Mestre', country: 'br', rating: 80, style: 'tactical' },
    players: [],
  };
}

test('base vazia: válida, pequena e não muda a base oficial', () => {
  const db = emptyDatabase('Vazia');
  const v = validateDatabase(db, OFFICIAL);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.ok(v.bytes < 1000);
  const out = applyCustomDatabase(OFFICIAL, db);
  assert.equal(out.length, OFFICIAL.length);
  for (let i = 0; i < OFFICIAL.length; i++) {
    assert.equal(out[i].id, OFFICIAL[i].id);
    assert.deepEqual(out[i].players.map((p) => p.id), OFFICIAL[i].players.map((p) => p.id));
  }
  assert.equal(applyCustomDatabase(OFFICIAL, null), OFFICIAL);
});

test('faixas 1–20 e CA coerente: CA SEMPRE recalculado com caFromAttrs', () => {
  const p = five.players[0];
  const x = attrsOf(p);
  const good = { ...x, a: { ...x.a, aim: 20 }, ca: 1 }; // CA informado errado
  let db = withPlayerEdit(emptyDatabase('Faixas'), p.id, { attrs: good });
  let v = validateDatabase(db, OFFICIAL);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  const e = v.db!.playerEdits[p.id].attrs!;
  assert.equal(e.ca, caFromAttrs(e.a, p.role));
  assert.ok(e.pa >= e.ca);
  assert.ok(v.warnings.some((w) => w.code === 'ca-recalc'));

  db = withPlayerEdit(emptyDatabase('Fora'), p.id, { attrs: { ...x, a: { ...x.a, aim: 21 } } });
  v = validateDatabase(db, OFFICIAL);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((w) => w.code === 'attr-range'));
  db = withPlayerEdit(emptyDatabase('Oculto'), p.id, { attrs: { ...x, h: { ...x.h, loyalty: 0 } } });
  assert.ok(validateDatabase(db, OFFICIAL).errors.some((w) => w.code === 'hidden-range'));
  db = withPlayerEdit(emptyDatabase('PA'), p.id, { attrs: { ...x, pa: 250 } });
  assert.ok(validateDatabase(db, OFFICIAL).errors.some((w) => w.code === 'pa-range'));
  db = withPlayerEdit(emptyDatabase('Idade'), p.id, { age: 70 });
  assert.ok(validateDatabase(db, OFFICIAL).errors.some((w) => w.code === 'player-age-range'));
  // atributo faltando → erro, nunca vira NaN
  const partial = { ...x, a: { ...x.a } } as PlayerAttrs;
  delete (partial.a as Partial<PlayerAttrs['a']>).tap;
  db = withPlayerEdit(emptyDatabase('Falta'), p.id, { attrs: partial });
  assert.ok(validateDatabase(db, OFFICIAL).errors.some((w) => w.code === 'attr-missing'));
});

test('elenco com 5+: mover jogador grava os dois elencos; time de 5 que perde um fica inválido', () => {
  const pid = bigTeam.players[0].id;
  let db = movePlayer(OFFICIAL, emptyDatabase('Mover'), pid, five.id);
  let v = validateDatabase(db, OFFICIAL);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  const r = resolveRosters(OFFICIAL, db).rosters;
  assert.ok(r.get(five.id)!.includes(pid));
  assert.ok(!r.get(bigTeam.id)!.includes(pid));

  // tira um do time de 5 e manda pro mercado livre → 4 → erro
  db = movePlayer(OFFICIAL, emptyDatabase('Quatro'), five.players[0].id, FREE_TEAM_ID);
  v = validateDatabase(db, OFFICIAL);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((x) => x.code === 'roster-min' && x.ref === five.id));
  // quem sai sem destino vira free agent na base aplicada
  const out = applyCustomDatabase(OFFICIAL, db);
  assert.ok(out.find((t) => t.id === FREE_TEAM_ID)!.players.some((p) => p.id === five.players[0].id));

  // jogador em dois elencos editados → erro
  const dup = withTeamEdit(withTeamEdit(emptyDatabase('Dup'), five.id, { roster: five.players.map((p) => p.id) }), bigTeam.id, { roster: [...bigTeam.players.map((p) => p.id), five.players[0].id] });
  assert.ok(validateDatabase(dup, OFFICIAL).errors.some((x) => x.code === 'roster-dup'));
  // mais de 10 → erro
  const many = setRoster(OFFICIAL, emptyDatabase('Muitos'), five.id, OFFICIAL.find((t) => t.id === FREE_TEAM_ID)!.players.slice(0, 11).map((p) => p.id));
  assert.ok(validateDatabase(many, OFFICIAL).errors.some((x) => x.code === 'roster-max'));
});

test('ids únicos: jogador/time novo com id repetido, de outra base ou fora do formato é recusado', () => {
  const taken = new Set<string>();
  const a = newPlayer(taken, 'alpha');
  const base = emptyDatabase('Ids');
  const dup = { ...base, addedPlayers: [a, { ...a }] };
  assert.ok(validateDatabase(dup, OFFICIAL).errors.some((x) => x.code === 'player-id-dup'));
  const clash = { ...base, addedPlayers: [{ ...a, id: OFFICIAL[0].players[0].id }] };
  assert.ok(validateDatabase(clash, OFFICIAL).errors.some((x) => x.code === 'player-id'));
  const weird = { ...base, addedPlayers: [{ ...a, id: 'cdb_p_ABC!' }] };
  assert.ok(validateDatabase(weird, OFFICIAL).errors.some((x) => x.code === 'player-id'));
  const t = newTeam(taken);
  const tdup = { ...base, addedTeams: [t, { ...t }] };
  assert.ok(validateDatabase(tdup, OFFICIAL).errors.some((x) => x.code === 'team-id-dup'));
  // time novo sem elenco
  assert.ok(validateDatabase({ ...base, addedTeams: [t] }, OFFICIAL).errors.some((x) => x.code === 'roster-missing'));
});

test('exportar → importar devolve a mesma base; id que já existe vira cópia', () => {
  const taken = new Set<string>();
  const players = ['um', 'dois', 'tres', 'quatro', 'cinco'].map((n) => newPlayer(taken, n));
  let db = emptyDatabase('Roundtrip');
  for (const p of players) db = addPlayer(OFFICIAL, db, p, null);
  db = addTeam(OFFICIAL, db, newTeam(taken), players.map((p) => p.id));
  db = withPlayerEdit(db, OFFICIAL[0].players[0].id, { nick: 'EditadoX', age: 30, role2: null });
  db = withTeamEdit(db, OFFICIAL[0].id, { team: 'Novo Nome', colors: ['#000000', '#ffffff'] });
  const v0 = validateDatabase(db, OFFICIAL);
  assert.equal(v0.ok, true, JSON.stringify(v0.errors));

  const json = exportDatabaseJson(db);
  const back = importDatabaseJson(json, OFFICIAL, [], 'x', NOW);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  const strip = (d: CustomDatabase) => ({ ...d, updatedAt: undefined });
  assert.deepEqual(strip(back.db!), strip(v0.db!));

  const copy = importDatabaseJson(json, OFFICIAL, [db.id], 'y', NOW);
  assert.equal(copy.ok, true);
  assert.notEqual(copy.db!.id, db.id);
  assert.ok(copy.warnings.some((w) => w.code === 'db-id-renamed'));
});

test('import malicioso/gigante nunca quebra: tamanho, JSON quebrado, __proto__, tipos errados', () => {
  // gigante: recusado antes do parse
  const huge = '{"v":1,"pad":"' + 'x'.repeat(DB_LIMITS.importBytes) + '"}';
  const r1 = importDatabaseJson(huge, OFFICIAL);
  assert.equal(r1.ok, false);
  assert.equal(r1.errors[0].code, 'file-too-big');
  // JSON quebrado / não-texto / tipos errados
  assert.equal(importDatabaseJson('{"v":1,', OFFICIAL).errors[0].code, 'json');
  assert.equal(importDatabaseJson(42 as unknown as string, OFFICIAL).ok, false);
  for (const bad of ['null', '[]', '"x"', '{"v":2}', '{"v":1,"id":"cdb_x","name":"x","addedPlayers":"nope"}']) {
    const r = importDatabaseJson(bad, OFFICIAL);
    assert.equal(r.ok, false, bad);
  }
  // protótipo: chave __proto__ nunca vira propriedade nem polui Object.prototype
  const evil = `{"v":1,"id":"cdb_evil","name":"Evil","basedOn":"official","createdAt":"x",
    "playerEdits":{"__proto__":{"polluted":true},"constructor":{"nick":"x"}},
    "teamEdits":{"__proto__":{"roster":["a"]}},"addedPlayers":[],"addedTeams":[]}`;
  const r2 = importDatabaseJson(evil, OFFICIAL);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(r2.ok, true, JSON.stringify(r2.errors));
  assert.deepEqual(Object.keys(r2.db!.playerEdits), []);
  // muitos itens: recusado pelo limite, sem processar tudo
  const many = JSON.stringify({ v: 1, id: 'cdb_many', name: 'M', addedPlayers: Array.from({ length: DB_LIMITS.addedPlayers + 1 }, () => ({})) });
  assert.equal(importDatabaseJson(many, OFFICIAL).errors[0].code, 'too-many-players');
  // aninhamento absurdo em campo ignorado não derruba
  const deep = `{"v":1,"id":"cdb_deep","name":"D","junk":${'['.repeat(2000)}${']'.repeat(2000)}}`;
  assert.equal(importDatabaseJson(deep, OFFICIAL).ok, true);
  // texto de controle no nome é limpo; string enorme no nick é recusada
  const p = OFFICIAL[0].players[0].id;
  const r3 = importDatabaseJson(JSON.stringify({ v: 1, id: 'cdb_ctl', name: 'A\u0000B', playerEdits: { [p]: { nick: 'n'.repeat(500) } } }), OFFICIAL);
  assert.equal(r3.db!.name, 'AB');
  assert.ok(r3.errors.some((x) => x.code === 'player-nick'));
});

test('base grande demais (> 256 KB) é inválida', () => {
  let db = emptyDatabase('Grande');
  const edits: CustomDatabase['playerEdits'] = {};
  for (const t of OFFICIAL) for (const p of t.players) edits[p.id] = { attrs: attrsOf(p), name: 'x'.repeat(40) };
  db = { ...db, playerEdits: edits };
  assert.ok(databaseBytes(db) > DB_LIMITS.storedBytes);
  const v = validateDatabase(db, OFFICIAL);
  assert.ok(v.errors.some((x) => x.code === 'too-big' || x.code === 'too-many-player-edits'));
});

test('storage próprio (rtm-db-custom-v1): grava, relê validado, sobrevive a lixo e a cota cheia', () => {
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const a = emptyDatabase('A');
  const b = withPlayerEdit(emptyDatabase('B', [a.id]), OFFICIAL[0].players[0].id, { nick: 'zzz' });
  assert.deepEqual(saveCustomDbs([a, b], st), { ok: true });
  const back = loadCustomDbs(OFFICIAL, st);
  assert.deepEqual(back.map((x) => x.db.id), [a.id, b.id]);
  assert.ok(back.every((x) => x.check.ok));
  mem.set(CUSTOM_DB_KEY, '{lixo');
  assert.deepEqual(loadCustomDbs(OFFICIAL, st), []);
  mem.set(CUSTOM_DB_KEY, JSON.stringify({ v: 1, dbs: [null, 3, { v: 1 }, a] }));
  assert.deepEqual(loadCustomDbs(OFFICIAL, st).map((x) => x.db.id), [a.id]);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(saveCustomDbs([a], full), { ok: false, reason: 'quota' });
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => undefined };
  assert.deepEqual(loadCustomDbs(OFFICIAL, blocked), []);
  assert.equal(loadCustomDbs(OFFICIAL, null).length, 0);
});

test('Carreira nova com base customizada: mundo da IA, jogador editado, time novo; edição do admin por baixo', () => {
  const taken = new Set<string>();
  const players = ['n1', 'n2', 'n3', 'n4', 'n5'].map((n) => newPlayer(taken, n, 17));
  const star = live[0].players[0];
  const x = attrsOf(star);
  const starAttrs = makeAttrs({ ...x.a, aim: 3, spray: 3, tap: 3 }, x.h, x.pa, star.role);
  let db = emptyDatabase('Carreira');
  for (const p of players) db = addPlayer(OFFICIAL, db, p, null);
  const nt = newTeam(taken);
  db = addTeam(OFFICIAL, db, nt, players.map((p) => p.id));
  db = withPlayerEdit(db, star.id, { attrs: starAttrs, nick: 'Trocado' });
  db = withTeamEdit(db, live[1].id, { team: 'Renomeado', tag: 'RNM', country: 'us' });
  assert.equal(validateDatabase(db, OFFICIAL).ok, true);

  // save novo: v30 grava mundo; a criação escolhe a base (id + cópia congelada)
  const save0 = migrateMundo({ squad: [] });
  const save = { ...save0, mundo: withCareerDatabase(save0.mundo!, db) };
  assert.equal(save.mundo.databaseId, db.id);
  const res = resolveCareerDatabase(save.mundo, OFFICIAL, []);
  assert.equal(res.status, 'snapshot');

  // oficial = dados + edições do admin; a customizada por cima vence
  const adminEdits = { players: { [star.id]: { ovr: 95 } }, teams: {} };
  const official = applyBo3Edits(OFFICIAL, adminEdits);
  const base = applyCustomDatabase(official, res.db);
  const world = buildAiWorld({ base, split: 1, skip: new Set() });
  const t = world.find((w) => w.id === nt.id);
  assert.ok(t, 'time novo entra no mundo da Carreira');
  assert.deepEqual(t!.players.map((p) => p.id), players.map((p) => p.id));
  assert.equal(attrsOf(t!.players[0]).a.aim, 17);
  const s = world.flatMap((w) => w.players).find((p) => p.id === star.id)!;
  assert.equal(s.nick, 'Trocado');
  assert.equal(attrsOf(s).a.aim, 3, 'atributo editado vence a edição do admin');
  assert.deepEqual({ aim: s.aim, awp: s.awp, igl: s.igl, clutch: s.clutch, consistency: s.consistency }, legacyFromAttrs(starAttrs));
  assert.equal(world.find((w) => w.id === live[1].id)!.team, 'Renomeado');
  // findSigning: edição do admin por cima do jogador cru e a customizada de novo por cima
  const signed = applyCustomPlayer(applyBo3PlayerEdit(star, adminEdits), res.db);
  assert.equal(attrsOf(signed).a.aim, 3);
  // free agents do mundo continuam vindo do __free__ da base aplicada
  assert.ok(currentFreeAgents(base, {}).length > 0);
  // a oficial não foi mexida (a customizada é só por cima)
  assert.equal(OFFICIAL.find((o) => o.id === live[1].id)!.team, live[1].team);
  assert.equal(OFFICIAL.some((o) => o.id === nt.id), false);
});

test('base que some ou fica inválida: a Carreira continua na oficial (com status para o aviso)', () => {
  const db = emptyDatabase('Some');
  // cópia no save vence o storage (editar/apagar depois não muda a Carreira)
  const edited = withTeamEdit(db, live[0].id, { tag: 'NEW' });
  assert.equal(resolveCareerDatabase({ databaseId: db.id, database: db }, OFFICIAL, [edited]).db!.teamEdits[live[0].id], undefined);
  // sem cópia no save: storage com o mesmo id
  assert.equal(resolveCareerDatabase({ databaseId: db.id }, OFFICIAL, [db]).status, 'storage');
  // sem cópia e sem storage: oficial + aviso
  const gone = resolveCareerDatabase({ databaseId: db.id, database: null }, OFFICIAL, []);
  assert.equal(gone.status, 'missing');
  assert.equal(gone.db, null);
  // cópia adulterada (atributo 99): inválida → oficial
  const bad = JSON.parse(JSON.stringify(withPlayerEdit(db, star0().id, { attrs: attrsOf(star0()) })));
  bad.playerEdits[star0().id].attrs.a.aim = 99;
  const inv = resolveCareerDatabase({ databaseId: db.id, database: bad }, OFFICIAL, []);
  assert.equal(inv.status, 'invalid');
  assert.equal(inv.db, null);
  // oficial
  assert.equal(resolveCareerDatabase({ databaseId: null }, OFFICIAL).status, 'official');
  assert.equal(resolveCareerDatabase(undefined, OFFICIAL).status, 'official');
});
function star0() { return live[0].players[0]; }

test('apagar jogador/time novo nunca deixa referência pendurada', () => {
  const taken = new Set<string>();
  const players = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((n) => newPlayer(taken, n));
  let db = emptyDatabase('Apagar');
  for (const p of players) db = addPlayer(OFFICIAL, db, p, null);
  const nt = newTeam(taken);
  db = addTeam(OFFICIAL, db, nt, players.map((p) => p.id));
  db = removeAddedPlayer(db, players[5].id);
  assert.equal(validateDatabase(db, OFFICIAL).ok, true);
  db = removeAddedTeam(db, nt.id);
  const v = validateDatabase(db, OFFICIAL);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  const out = applyCustomDatabase(OFFICIAL, v.db);
  assert.ok(out.find((t) => t.id === FREE_TEAM_ID)!.players.some((p) => p.id === players[0].id), 'elenco do time apagado vira free agent');
});
