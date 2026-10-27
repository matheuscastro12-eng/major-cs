// Testes da liga privada do Pick'em do Major (server/major-league.ts):
// validação pura (código, palpite, chave do membro) e o fluxo criar → entrar →
// palpitar → revelar num banco falso em memória.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeFromBytes, seedFromBytes, normalizeCode, validPicks, leagueName, memberKeyOf, picksComplete,
  createLeague, joinLeague, getLeague, revealLeague, schemaQueries, LEAGUE_MAX_MEMBERS, type SqlTag,
} from './major-league.js';

type Row = Record<string, unknown>;

// banco falso: entende só as queries do módulo (roteamento pelo texto)
function fakeDb() {
  const leagues = new Map<string, Row>();
  const entries: Row[] = [];
  let tick = 0;
  const sql: SqlTag = async (strings, ...v) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('CREATE')) return [];
    if (q.startsWith('INSERT INTO rtm_major_leagues')) {
      if (leagues.has(String(v[0]))) return [];
      leagues.set(String(v[0]), { code: v[0], name: v[1], seed: v[2], owner_key: v[3], revealed: false });
      return [{ code: v[0] }];
    }
    if (q.startsWith('SELECT code, name, seed, owner_key, revealed')) return leagues.has(String(v[0])) ? [{ ...leagues.get(String(v[0]))! }] : [];
    if (q.startsWith('INSERT INTO rtm_major_league_entries')) {
      const [code, key, nick, picks] = v;
      const e = entries.find((x) => x.code === code && x.member_key === key);
      if (e) {
        if (q.includes('DO NOTHING')) return [];
        e.nick = nick;
        if (picks !== undefined) { e.picks = picks; e.updated_at = ++tick; }
        return [];
      }
      entries.push({ code, member_key: key, nick, picks: picks ?? '', updated_at: ++tick });
      return [];
    }
    if (q.startsWith('SELECT member_key, nick FROM')) return entries.filter((x) => x.code === v[0]).map((x) => ({ ...x }));
    if (q.startsWith('SELECT member_key, nick, picks FROM')) {
      return entries.filter((x) => x.code === v[0]).sort((a, b) => Number(a.updated_at) - Number(b.updated_at)).map((x) => ({ ...x }));
    }
    if (q.startsWith('UPDATE rtm_major_leagues SET revealed=true')) { leagues.get(String(v[0]))!.revealed = true; return []; }
    throw new Error(`query não esperada: ${q}`);
  };
  return { sql, leagues, entries };
}

const FULL = 'abcd.0123456789abcdefghijklmnopqrstuv'.slice(0, 5 + 31);
const PARTIAL = `abcd.${'_'.repeat(31)}`;

test('código: 6 letras do alfabeto sem ambíguos, normaliza caixa', () => {
  const c = codeFromBytes(new Uint8Array([0, 1, 2, 250, 77, 31]));
  assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(normalizeCode(c.toLowerCase()), c);
  assert.equal(normalizeCode('ABC0OI'), null);
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode('ABCDEFG'), null);
});

test('seed: inteiro não negativo de 31 bits', () => {
  const s = seedFromBytes(new Uint8Array([255, 255, 255, 255]));
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 31);
});

test('palpite: aceita o formato do link (com e sem 3-0/0-3), recusa lixo', () => {
  assert.equal(validPicks(FULL), FULL);
  assert.equal(validPicks(`${FULL}.${'_'.repeat(12)}`), `${FULL}.${'_'.repeat(12)}`);
  assert.equal(validPicks(''), '');
  assert.equal(validPicks('lixo'), null);
  assert.equal(validPicks(`${FULL}.zz`), null);
  assert.ok(picksComplete(FULL));
  assert.ok(!picksComplete(PARTIAL));
});

test('nome da liga: limpo e cortado; chave do membro: conta vence anônimo', () => {
  assert.equal(leagueName('  Liga​  dos   amigos '), 'Liga dos amigos');
  assert.equal(leagueName('x'.repeat(99)).length, 40);
  assert.equal(memberKeyOf('A@B.com', 'qualquer'), 'acc:a@b.com');
  assert.equal(memberKeyOf(null, 'abcdefgh12345678'), 'anon:abcdefgh12345678');
  assert.equal(memberKeyOf(null, 'curto'), null);
  assert.equal(memberKeyOf(null, '../../etc/passwd/xxxxxxxx'), null);
});

test('DDL idempotente: só CREATE ... IF NOT EXISTS', async () => {
  const seen: string[] = [];
  const sql: SqlTag = async (s) => { seen.push(s.join('?')); return []; };
  await Promise.all(schemaQueries(sql));
  assert.equal(seen.length, 2);
  for (const q of seen) assert.match(q, /CREATE TABLE IF NOT EXISTS/);
});

test('fluxo: criar, entrar, palpite escondido até revelar, trava depois', async () => {
  const { sql } = fakeDb();
  assert.ok(await createLeague(sql, 'ABCDEF', 'Liga', 42, 'anon:dono-0000000000000', 'dono'));
  assert.equal(await createLeague(sql, 'ABCDEF', 'Outra', 1, 'anon:x', 'x'), false, 'colisão de código');

  assert.deepEqual(await joinLeague(sql, 'ABCDEF', 'anon:amigo-000000000000', 'amigo', FULL), { ok: true });
  assert.deepEqual(await joinLeague(sql, 'ABCDEF', 'anon:outro-000000000000', 'AMIGO', undefined), { ok: false, error: 'nick_taken' });
  assert.deepEqual(await joinLeague(sql, 'ZZZZZZ', 'anon:amigo-000000000000', 'amigo', FULL), { ok: false, error: 'not_found' });

  const asOwner = (await getLeague(sql, 'ABCDEF', 'anon:dono-0000000000000'))!;
  assert.equal(asOwner.league.seed, 42);
  assert.ok(asOwner.league.isOwner);
  assert.equal(asOwner.entries.length, 2);
  const friend = asOwner.entries.find((e) => e.nick === 'amigo')!;
  assert.equal(friend.picks, '', 'palpite do amigo escondido antes de revelar');
  assert.ok(friend.complete);

  assert.deepEqual(await revealLeague(sql, 'ABCDEF', 'anon:amigo-000000000000'), { ok: false, error: 'not_owner' });
  assert.deepEqual(await revealLeague(sql, 'ABCDEF', 'anon:dono-0000000000000'), { ok: true });
  const after = (await getLeague(sql, 'ABCDEF', null))!;
  assert.ok(after.league.revealed);
  assert.equal(after.entries.find((e) => e.nick === 'amigo')!.picks, FULL);
  assert.deepEqual(await joinLeague(sql, 'ABCDEF', 'anon:amigo-000000000000', 'amigo', PARTIAL), { ok: false, error: 'locked' });
  assert.deepEqual(await joinLeague(sql, 'ABCDEF', 'anon:novo-0000000000000', 'novo', undefined), { ok: false, error: 'locked' });
});

test(`liga cheia em ${LEAGUE_MAX_MEMBERS} membros`, async () => {
  const { sql } = fakeDb();
  await createLeague(sql, 'QWERTY', 'Cheia', 1, 'anon:dono-0000000000000', 'dono');
  for (let i = 1; i < LEAGUE_MAX_MEMBERS; i++) {
    assert.deepEqual(await joinLeague(sql, 'QWERTY', `anon:m${i}-00000000000000`, `m${i}`, undefined), { ok: true });
  }
  assert.deepEqual(await joinLeague(sql, 'QWERTY', 'anon:extra-000000000000', 'extra', undefined), { ok: false, error: 'full' });
  // quem já está pode atualizar mesmo com a liga cheia
  assert.deepEqual(await joinLeague(sql, 'QWERTY', 'anon:m1-00000000000000', 'm1', FULL), { ok: true });
});
