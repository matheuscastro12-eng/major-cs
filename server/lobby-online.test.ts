// [O0-45] [O0-21] [O0-43] Handler do lobby (api/lobby.ts) com o protocolo HTTP
// do Neon falsificado: Online legado respondendo 410, create só do Ultimate e
// nunca ranqueado, fila ranqueada atrás de RANKED_QUEUE_ENABLED, bucket da
// fila de evento no queuePoll e 500 sem vazar a mensagem do Postgres.
import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { LEGACY_GONE_ACTIONS, rankedQueueEnabled, ticketBucket } from '../api/lobby.js';
import { captureRes, FAKE_DATABASE_URL, installFakeNeon, type FakeRoute } from './neon-http.mock.js';
import { INTERNAL_ERROR_MSG } from './internalError.js';

process.env.DATABASE_URL = FAKE_DATABASE_URL;

let ipSeq = 0;
// cada request com IP próprio: o rate-limit por instância não interfere
async function post(body: Record<string, unknown>) {
  const res = captureRes();
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': `10.0.0.${++ipSeq % 250}` } }, res);
  return res;
}

// rota default: DDL do ensureSchema e nada mais
const ddlOnly: FakeRoute = (sql) => (/^(CREATE|ALTER)/.test(sql) ? [] : undefined);

test('flag da fila: desligada por padrão, liga com true/1', () => {
  assert.equal(rankedQueueEnabled({}), false);
  assert.equal(rankedQueueEnabled({ RANKED_QUEUE_ENABLED: 'false' }), false);
  assert.equal(rankedQueueEnabled({ RANKED_QUEUE_ENABLED: 'true' }), true);
  assert.equal(rankedQueueEnabled({ RANKED_QUEUE_ENABLED: ' 1 ' }), true);
  assert.equal(ticketBucket(null), 'open');
  assert.equal(ticketBucket('ev:wknd-2026-38'), 'ev:wknd-2026-38');
});

test('Online legado: veto, Major em grupo e reportResult respondem 410 sem tocar no banco', async () => {
  const db = installFakeNeon(ddlOnly);
  try {
    for (const action of ['vetoAction', 'majorVetoAction', 'reportResult', 'startStage', 'advanceStage', 'readyStage']) {
      assert.ok(LEGACY_GONE_ACTIONS.has(action));
      const r = await post({ action, nick: 'Foo', code: 'ABCDE', winner: 0, mapScore: [2, 0] });
      assert.equal(r.statusCode, 410, action);
      assert.equal((r.body as { gone?: boolean }).gone, true);
      assert.deepEqual(db.queries.filter((q) => !/^(CREATE|ALTER)/.test(q.sql)), [], `${action} não pode consultar o banco`);
    }
  } finally { db.restore(); }
});

test("create: 'party', 'duel' e modo ausente dão 410; Ultimate nasce NUNCA ranqueado", async () => {
  const inserts: unknown[][] = [];
  const db = installFakeNeon((sql, params) => {
    if (/^(CREATE|ALTER)/.test(sql)) return [];
    if (sql.startsWith('SELECT 1 FROM lobbies')) return [];
    if (sql.startsWith('INSERT INTO lobbies')) { inserts.push(params); return []; }
    if (sql.startsWith('INSERT INTO lobby_players') || sql.startsWith('DELETE FROM lobbies')) return [];
    return undefined;
  });
  try {
    for (const mode of ['party', 'duel', undefined]) {
      const r = await post({ action: 'create', nick: 'Foo', mode, ranked: true });
      assert.equal(r.statusCode, 410, String(mode));
    }
    assert.equal(inserts.length, 0);
    const ok = await post({ action: 'create', nick: 'Foo', mode: 'ultimate', ranked: true, isPublic: true });
    assert.equal(ok.statusCode, 200);
    assert.equal(inserts.length, 1);
    // colunas: (code, mode, host, seed, run_seed, pool, name, is_public, ranked, ...)
    assert.equal(inserts[0][1], 'ultimate');
    assert.equal(String(inserts[0][8]), 'false', 'body.ranked é ignorado: sala do cliente nunca é ranqueada');
  } finally { db.restore(); }
});

test('fila ranqueada desligada: queueJoin/queuePoll = 503, queueLeave segue', async () => {
  delete process.env.RANKED_QUEUE_ENABLED;
  const db = installFakeNeon((sql) => (/^(CREATE|ALTER|DELETE FROM mm_queue)/.test(sql) ? [] : undefined));
  try {
    for (const action of ['queueJoin', 'queuePoll']) {
      const r = await post({ action, nick: 'Foo', elo: 1200 });
      assert.equal(r.statusCode, 503, action);
      assert.equal((r.body as { disabled?: boolean }).disabled, true);
      assert.ok(!db.queries.some((q) => q.sql.includes('mm_queue')), `${action} não pode mexer na fila`);
    }
    const leave = await post({ action: 'queueLeave', nick: 'Foo' });
    assert.equal(leave.statusCode, 200);
  } finally { db.restore(); }
});

// fila em memória: tickets com bucket, pareamento do tryMatchUltimate
function queueDb(tickets: { nick: string; elo: number; enqueuedAt: number; bucket: string }[]) {
  const q = tickets.map((t) => ({ ...t, matched: null as string | null }));
  const lobbies = new Set<string>();
  const route: FakeRoute = (sql, p) => {
    if (/^(CREATE|ALTER)/.test(sql)) return [];
    if (sql.startsWith('UPDATE mm_queue SET last_seen = now()')) {
      const t = q.find((x) => x.nick === p[0]);
      return t ? [{ elo: t.elo, enqueued_at: new Date(t.enqueuedAt).toISOString(), matched_code: t.matched, bucket: t.bucket }] : [];
    }
    if (sql.startsWith('SELECT bucket FROM mm_queue')) throw new Error('SELECT extra de bucket por poll');
    if (sql.startsWith('SELECT nick FROM mm_queue')) {
      const [me, bucket, elo, win, myIso] = p as [string, string, number, number, string];
      const mine = Date.parse(myIso);
      return q.filter((x) => x.matched == null && x.nick.toLowerCase() !== me && x.bucket === bucket && Math.abs(x.elo - elo) <= win && x.enqueuedAt < mine)
        .sort((a, b) => a.enqueuedAt - b.enqueuedAt).slice(0, 5).map((x) => ({ nick: x.nick }));
    }
    if (sql.startsWith('SELECT 1 FROM lobbies')) return lobbies.has(String(p[0])) ? [{ '?column?': 1 }] : [];
    if (sql.startsWith('INSERT INTO lobbies')) { lobbies.add(String(p[0])); return []; }
    if (sql.startsWith('INSERT INTO lobby_players')) return [];
    if (sql.startsWith('UPDATE mm_queue SET matched_code')) {
      const t = q.find((x) => x.nick === p[1] && x.matched == null);
      if (!t) return [];
      t.matched = String(p[0]);
      return [{ nick: t.nick }];
    }
    if (sql.startsWith('SELECT COUNT(*)::int AS n FROM mm_queue')) return [{ n: q.filter((x) => x.matched == null).length }];
    return undefined;
  };
  return { q, route };
}

test('queuePoll: pareia só no MESMO bucket e sem SELECT extra de bucket', async () => {
  process.env.RANKED_QUEUE_ENABLED = 'true';
  const now = Date.now();
  // Ana (evento) poll; Beto está há mais tempo na RANQUEADA normal, Caio no mesmo evento
  const { q, route } = queueDb([
    { nick: 'Beto', elo: 1000, enqueuedAt: now - 30_000, bucket: 'open' },
    { nick: 'Caio', elo: 1000, enqueuedAt: now - 20_000, bucket: 'ev:wknd-2026-38' },
    { nick: 'Ana', elo: 1000, enqueuedAt: now - 10_000, bucket: 'ev:wknd-2026-38' },
  ]);
  const db = installFakeNeon(route);
  try {
    const r = await post({ action: 'queuePoll', nick: 'Ana', elo: 1000 });
    assert.equal(r.statusCode, 200);
    const body = r.body as { matched?: boolean; code?: string };
    assert.equal(body.matched, true);
    assert.equal(q.find((x) => x.nick === 'Caio')!.matched, body.code, 'pareou com o rival do mesmo evento');
    assert.equal(q.find((x) => x.nick === 'Beto')!.matched, null, 'o ticket da ranqueada normal fica na fila');
    const cand = db.queries.find((x) => x.sql.startsWith('SELECT nick FROM mm_queue'))!;
    assert.equal(cand.params[1], 'ev:wknd-2026-38');
  } finally { db.restore(); delete process.env.RANKED_QUEUE_ENABLED; }
});

test('queuePoll: sozinho no bucket do evento continua na fila', async () => {
  process.env.RANKED_QUEUE_ENABLED = 'true';
  const now = Date.now();
  const { route } = queueDb([
    { nick: 'Beto', elo: 1000, enqueuedAt: now - 30_000, bucket: 'open' },
    { nick: 'Ana', elo: 1000, enqueuedAt: now - 10_000, bucket: 'ev:wknd-2026-38' },
  ]);
  const db = installFakeNeon(route);
  try {
    const r = await post({ action: 'queuePoll', nick: 'Ana', elo: 1000 });
    assert.equal((r.body as { queued?: boolean }).queued, true);
  } finally { db.restore(); delete process.env.RANKED_QUEUE_ENABLED; }
});

test('nextSeason: só a revanche do Ultimate (keepRoster) sobrevive', async () => {
  const rooms: Record<string, { host: string; status: string; mode: string }> = {
    ULT01: { host: 'Foo', status: 'done', mode: 'ultimate' },
    PAR01: { host: 'Foo', status: 'done', mode: 'party' },
  };
  const db = installFakeNeon((sql, p) => {
    if (/^(CREATE|ALTER)/.test(sql)) return [];
    if (sql.startsWith('SELECT host, status, mode FROM lobbies')) { const r = rooms[String(p[0])]; return r ? [r] : []; }
    if (sql.startsWith('UPDATE lobbies SET status') || sql.startsWith('UPDATE lobby_players')) return [];
    return undefined;
  });
  try {
    assert.equal((await post({ action: 'nextSeason', nick: 'Foo', code: 'PAR01', keepRoster: true })).statusCode, 410);
    assert.equal((await post({ action: 'nextSeason', nick: 'Foo', code: 'ULT01', keepRoster: false })).statusCode, 410);
    assert.equal((await post({ action: 'nextSeason', nick: 'Outro', code: 'ULT01', keepRoster: true })).statusCode, 403);
    const ok = await post({ action: 'nextSeason', nick: 'Foo', code: 'ULT01', keepRoster: true });
    assert.equal(ok.statusCode, 200);
    assert.equal((ok.body as { keepRoster?: boolean }).keepRoster, true);
  } finally { db.restore(); }
});

test('erro do banco: 500 genérico com id, sem a mensagem do Postgres', async () => {
  const db = installFakeNeon((sql) => {
    if (/^(CREATE|ALTER)/.test(sql)) return [];
    throw new Error('relation "lobbies" does not exist');
  });
  const origErr = console.error;
  const logged: unknown[] = [];
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const res = captureRes();
    await handler({ method: 'GET', query: { list: '1' }, headers: {} }, res);
    assert.equal(res.statusCode, 500);
    const body = res.body as { error: string; id: string };
    assert.equal(body.error, INTERNAL_ERROR_MSG);
    assert.match(body.id, /^[0-9a-f]{10}$/);
    assert.ok(!JSON.stringify(body).includes('relation'), 'a mensagem interna não vaza');
    assert.ok(JSON.stringify(logged).includes(body.id), 'o id vai pro log');
  } finally { console.error = origErr; db.restore(); }
});
