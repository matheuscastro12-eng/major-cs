// Rotas públicas com o Postgres quebrando (O0-43): o 500 não pode levar a
// mensagem do driver (nome de tabela, trecho de query) pro visitante.
import assert from 'node:assert/strict';
import test from 'node:test';
import donors from '../api/donors.js';
import hall from '../api/hall.js';
import { INTERNAL_ERROR_MSG, internalError } from './internalError.js';
import { FakeNeonHttp } from './neon-fetch.mock.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

const PG_ERROR = 'relation "donors_secret_table" does not exist at SELECT email FROM rtm_accounts';

type Out = { code: number; body: Record<string, unknown> };
function mkRes() {
  const out: Out = { code: 0, body: {} };
  const res = {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: () => {},
  };
  return { out, res };
}

// console.error silenciado no teste, mas guardado pra conferir que o erro real foi pro log
function captureLog() {
  const lines: string[] = [];
  const prev = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  return { lines, restore: () => { console.error = prev; } };
}

test('internalError: resposta genérica com id; o erro real vai só pro log', () => {
  const log = captureLog();
  try {
    const { out, res } = mkRes();
    const id = internalError(res, 'x', new Error(PG_ERROR));
    assert.equal(out.code, 500);
    assert.deepEqual(out.body, { error: INTERNAL_ERROR_MSG, id });
    assert.match(id, /^[0-9a-f]{10}$/);
    assert.ok(log.lines.some((l) => l.includes(id) && l.includes('donors_secret_table')));
  } finally { log.restore(); }
});

for (const [name, route] of [['donors', donors], ['hall', hall]] as const) {
  test(`GET /api/${name} com o banco quebrado: 500 sem vazar a mensagem do Postgres`, async () => {
    const db = new FakeNeonHttp(() => { throw new Error(PG_ERROR); });
    const uninstall = db.install();
    const log = captureLog();
    try {
      const { out, res } = mkRes();
      await route({ method: 'GET', headers: {} }, res);
      assert.equal(out.code, 500);
      assert.equal(out.body.error, INTERNAL_ERROR_MSG);
      assert.equal(typeof out.body.id, 'string');
      assert.ok(!JSON.stringify(out.body).includes('donors_secret_table'));
      assert.ok(!JSON.stringify(out.body).includes('rtm_accounts'));
    } finally { log.restore(); uninstall(); }
  });
}
