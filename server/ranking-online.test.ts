// [O0-45] [O0-43] Handler do ranking (api/ranking.ts) com o protocolo HTTP do
// Neon falsificado: o report ranqueado só aceita modos 1v1 zero-soma (o farm
// da sala 'party' saiu) e erro do banco vira 500 genérico com id.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import handler, { RANKED_REPORT_MODES } from '../api/ranking.js';
import { captureRes, FAKE_DATABASE_URL, installFakeNeon, type FakeRoute } from './neon-http.mock.js';
import { INTERNAL_ERROR_MSG } from './internalError.js';

process.env.DATABASE_URL = FAKE_DATABASE_URL;
process.env.APP_SECRET = 'segredo-de-teste';

// token no formato do api/account.ts: base64url(email|exp).hmac
function tokenFor(email: string): string {
  const body = `${email}|${Math.floor(Date.now() / 1000) + 3600}`;
  const sig = createHmac('sha256', 'segredo-de-teste').update(body).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
}

const seasonNo = () => { const d = new Date(); return (d.getUTCFullYear() - 2026) * 12 + (d.getUTCMonth() + 1); };

// conta paga com linha na temporada corrente + um lobby ranqueado do modo pedido
function reportDb(mode: string): FakeRoute {
  return (sql) => {
    if (/^(CREATE|ALTER)/.test(sql)) return [];
    if (sql.startsWith('SELECT paid, nick')) return [{ paid: true, nick: 'Foo', streak_current: 0, streak_best: 0, streak_last_day: null }];
    if (sql.startsWith('SELECT mmr, wins, losses, peak, season, season_games FROM rtm_ranking')) return [{ mmr: 1000, wins: 0, losses: 0, peak: 1000, season: seasonNo(), season_games: 0 }];
    if (sql.startsWith('UPDATE rtm_ranking SET nick')) return [];
    if (sql.startsWith('SELECT code, won FROM rtm_match_reports')) return [];
    if (sql.startsWith('SELECT ranked, mode, created_at FROM lobbies')) return [{ ranked: true, mode, created_at: new Date().toISOString() }];
    if (sql.startsWith('SELECT 1 FROM lobby_players')) return [{ ok: 1 }];
    if (sql.startsWith('INSERT INTO rtm_match_reports')) return [{ code: 'ABCDE' }];
    return undefined;
  };
}

test("report ranqueado: modo 'party' é recusado antes de gravar qualquer coisa", async () => {
  assert.deepEqual(RANKED_REPORT_MODES, ['ultimate', 'duel']);
  const db = installFakeNeon(reportDb('party'));
  try {
    const res = captureRes();
    await handler({ method: 'POST', body: { action: 'report', token: tokenFor('foo@x.com'), won: true, code: 'ABCDE', lobbyNick: 'Foo' } }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'modo não ranqueado' });
    assert.ok(!db.queries.some((q) => /^(INSERT INTO rtm_match_reports|UPDATE rtm_ranking SET mmr)/.test(q.sql)), 'nada de report nem MMR');
  } finally { db.restore(); }
});

test('report ranqueado do Ultimate segue pro pareamento zero-soma', async () => {
  const db = installFakeNeon((sql, p) => {
    const base = reportDb('ultimate')(sql, p);
    if (base) return base;
    if (sql.startsWith('SELECT email, nick, won, status FROM rtm_match_reports')) return []; // oponente ainda não reportou
    if (/community/.test(sql)) return [{ target: 1000, total: 1, matches: 1 }];
    if (sql.startsWith('SELECT mmr, wins, losses, peak, season_games FROM rtm_ranking')) return [{ mmr: 1000, wins: 0, losses: 0, peak: 1000, season_games: 0 }];
    if (sql.startsWith('SELECT count(*)::int AS n FROM rtm_ranking')) return [{ n: 0 }];
    return [];
  });
  try {
    const res = captureRes();
    await handler({ method: 'POST', body: { action: 'report', token: tokenFor('foo@x.com'), won: true, code: 'ABCDE', lobbyNick: 'Foo' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { pending?: boolean }).pending, true, 'sem o report do rival nada é aplicado');
    assert.ok(db.queries.some((q) => q.sql.startsWith('INSERT INTO rtm_match_reports')));
    assert.ok(!db.queries.some((q) => q.sql.startsWith('UPDATE rtm_ranking SET mmr')));
  } finally { db.restore(); }
});

test('erro do banco no ladder: 500 genérico com id, sem a mensagem do Postgres', async () => {
  const db = installFakeNeon((sql) => {
    if (/^(CREATE|ALTER)/.test(sql)) return [];
    throw new Error('column "season_games" does not exist');
  });
  const origErr = console.error;
  console.error = () => {};
  try {
    const res = captureRes();
    await handler({ method: 'GET', query: { action: 'ladder' } }, res);
    assert.equal(res.statusCode, 500);
    const body = res.body as { error: string; id: string };
    assert.equal(body.error, INTERNAL_ERROR_MSG);
    assert.match(body.id, /^[0-9a-f]{10}$/);
    assert.ok(!JSON.stringify(body).includes('season_games'));
  } finally { console.error = origErr; db.restore(); }
});
