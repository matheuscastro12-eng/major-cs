// Endpoints públicos de escrita (O0-36): Hall da Fama com conta, teto de
// tamanho e 1 campanha por temporada; track com parse seguro e limite por IP.
import assert from 'node:assert/strict';
import test from 'node:test';
import hall from '../api/hall.js';
import track from '../api/track.js';
import { signAccountToken } from './auth.js';
import { HALL_JSON_MAX_BYTES, sanitizeHallEntry } from './hall.js';
import { FakeNeonHttp, rateLimitRoute, type SeenQuery } from './neon-fetch.mock.js';
import { __resetRateLimitForTests } from './rate-limit.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

const base = {
  teamName: 'Imperial', placement: '1', champion: 'Imperial', mvp: 'fer', season: 2, pool: 'br',
  roster: [{ nick: 'fer', country: 'br', ovr: 91 }], records: { bestRating: 1.31, bestRatingPlayer: 'fer', biggestFrag: 38, biggestFragPlayer: 'fer', pickemScore: '7/10' },
};

test('sanitizeHallEntry: só chaves conhecidas, com tipo e teto', () => {
  const huge = 'x'.repeat(4_000_000);
  const v = sanitizeHallEntry({
    ...base,
    roster: [...Array(20)].map(() => ({ nick: huge, country: huge, ovr: 9999, extra: huge })),
    records: { ...base.records, lixo: huge, bestRating: 99, pickemScore: huge },
  });
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.entry.roster.length, 6);
  assert.equal(v.entry.roster[0].nick.length, 24);
  assert.equal(v.entry.roster[0].country, '');
  assert.equal(v.entry.roster[0].ovr, 99);
  assert.deepEqual(Object.keys(v.entry.records).sort(), ['bestRating', 'bestRatingPlayer', 'biggestFrag', 'biggestFragPlayer']);
  assert.equal(v.entry.records.bestRating, 5);
  assert.ok(Buffer.byteLength(JSON.stringify(v.entry.roster)) <= HALL_JSON_MAX_BYTES);
});

test('sanitizeHallEntry: colocação fora da lista, campos faltando e nome ofensivo são recusados', () => {
  assert.equal(sanitizeHallEntry({ ...base, placement: 'campeão mundial' }).ok, false);
  assert.equal(sanitizeHallEntry({ ...base, teamName: '' }).ok, false);
  assert.equal(sanitizeHallEntry({ ...base, teamName: 'Time do Caralho' }).ok, false);
});

test('sanitizeHallEntry: o nick da conta vence o body.player', () => {
  const v = sanitizeHallEntry({ ...base, player: 'coldzera' }, 'meu_nick');
  assert.ok(v.ok && v.entry.player === 'meu_nick');
  const anon = sanitizeHallEntry({ ...base, player: 'p0rra' });
  assert.ok(anon.ok && anon.entry.player === 'anônimo');
});

function setup() {
  __resetRateLimitForTests();
  const store = new Map<string, number>();
  const rl = rateLimitRoute(store);
  const inserts: SeenQuery[] = [];
  const db = new FakeNeonHttp((q) => {
    const r = rl(q);
    if (r) return r;
    if (q.text.startsWith('SELECT nick FROM rtm_accounts')) return [{ nick: 'dono_da_conta' }];
    if (q.text.startsWith('INSERT INTO campaigns')) { inserts.push(q); return []; }
    if (q.text.startsWith('SELECT COUNT(*) AS n')) return [{ n: 0 }];
    return [];
  });
  return { db, inserts, uninstall: db.install() };
}

type Out = { code: number; body: Record<string, unknown> };
async function send(handler: typeof hall, req: Parameters<typeof hall>[0]): Promise<Out> {
  const out: Out = { code: 0, body: {} };
  await handler(req, {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: () => {},
  });
  return out;
}

test('POST do Hall sem conta dá 401; com conta grava com o nick da conta e upsert por temporada', async () => {
  const { inserts, uninstall } = setup();
  try {
    assert.equal((await send(hall, { method: 'POST', body: { ...base, player: 'coldzera' }, headers: { 'x-forwarded-for': '203.0.113.1' } })).code, 401);
    const ok = await send(hall, { method: 'POST', body: { ...base, player: 'coldzera', token: signAccountToken('eu@example.com') }, headers: { 'x-forwarded-for': '203.0.113.1' } });
    assert.equal(ok.code, 200);
    const q = inserts[0];
    assert.match(q.text, /ON CONFLICT \(email, season\) WHERE email IS NOT NULL DO UPDATE/);
    assert.equal(q.params[0], 'dono_da_conta');
    assert.equal(q.params.at(-1), 'eu@example.com');
    assert.equal((await send(hall, { method: 'POST', body: '{quebrado', headers: { 'x-forwarded-for': '203.0.113.2' } })).code, 400);
  } finally { uninstall(); }
});

test('POST do Hall: flood do mesmo IP leva 429', async () => {
  const { uninstall } = setup();
  try {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await send(hall, { method: 'POST', body: { ...base }, headers: { 'x-forwarded-for': '203.0.113.9' } })).code;
    assert.equal(last, 429);
  } finally { uninstall(); }
});

test('GET do Hall projeta os campos (sem devolver o blob cru de roster/records)', async () => {
  const { db, uninstall } = setup();
  try {
    assert.equal((await send(hall, { method: 'GET' })).code, 200);
    const list = db.texts().find((t) => t.includes('FROM campaigns ORDER BY'));
    assert.ok(list);
    assert.match(list, /jsonb_build_object\( 'bestRating'/);
    assert.doesNotMatch(list, /SELECT id, player, team_name, pool, placement, champion, mvp, season, roster, records/);
  } finally { uninstall(); }
});

test('track: JSON quebrado dá 400 e flood do mesmo IP dá 429', async () => {
  const { uninstall } = setup();
  try {
    assert.equal((await send(track, { method: 'POST', body: '{nope', headers: { 'x-forwarded-for': '203.0.113.30' } })).code, 400);
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await send(track, { method: 'POST', body: { type: 'visit', sid: 's' }, headers: { 'x-forwarded-for': '203.0.113.31' } })).code;
    assert.equal(last, 429);
  } finally { uninstall(); }
});
