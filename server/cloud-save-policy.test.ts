// Save na nuvem (O0-29): updatedAt limitado, allowlist de slots e 409 quando o
// servidor tem versão mais nova (antes: ok:true e perda silenciosa).
import assert from 'node:assert/strict';
import test from 'node:test';
import cloudSave from '../api/cloud-save.js';
import { signAccountToken } from './auth.js';
import { CLOUD_MAX_FUTURE_MS, clampUpdatedAt, cloudSlotAllowed } from './cloud-save-policy.js';
import { FakeNeonHttp, type SeenQuery } from './neon-http.mock.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

test('clampUpdatedAt: futuro vira agora+5min; lixo vira agora', () => {
  const now = 1_700_000_000_000;
  assert.equal(clampUpdatedAt(9e15, now), now + CLOUD_MAX_FUTURE_MS);
  assert.equal(clampUpdatedAt(now - 1000, now), now - 1000);
  assert.equal(clampUpdatedAt('abc', now), now);
  assert.equal(clampUpdatedAt(-5, now), now);
  assert.equal(clampUpdatedAt(undefined, now), now);
});

test('cloudSlotAllowed: só os slots do jogo', () => {
  for (const ok of ['career', 'career-2', 'career-5', 'rtp', 'online', 'ultimate']) assert.ok(cloudSlotAllowed(ok), ok);
  for (const bad of ['career-6', 'career-99', 'lixo', 'career ', '', 'ultimate2', 'x'.repeat(40)]) assert.ok(!cloudSlotAllowed(bad), bad);
});

// banco de 1 linha por slot com a semântica do UPSERT condicional da rota
function setup(stored: { updatedAt: number } | null) {
  const inserts: SeenQuery[] = [];
  const row = stored ? { ...stored } : null;
  const db = new FakeNeonHttp((q) => {
    if (q.text.startsWith('SELECT paid FROM rtm_accounts')) return [{ paid: true }];
    if (q.text.startsWith('INSERT INTO rtm_saves')) {
      inserts.push(q);
      const incoming = Number(q.params[3]);
      const poisonedAfter = Number(q.params[4]);
      if (!row || incoming >= row.updatedAt || row.updatedAt > poisonedAfter) {
        if (row) row.updatedAt = incoming;
        return [{ updated_at: incoming }];
      }
      return [];
    }
    if (q.text.startsWith('SELECT updated_at FROM rtm_saves')) return row ? [{ updated_at: row.updatedAt }] : [];
    return [];
  });
  return { inserts, row, uninstall: db.install() };
}

let ipSeq = 0;
async function push(body: Record<string, unknown>) {
  const out = { code: 0, body: {} as Record<string, unknown> };
  ipSeq += 1;
  await cloudSave({ method: 'POST', body: { action: 'push', token: signAccountToken(`p${ipSeq}@example.com`), data: '', ...body }, headers: { 'x-forwarded-for': `198.51.100.${ipSeq}` } }, {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: () => {},
  });
  return out;
}

test('push com relógio adiantado grava no máximo agora+5min', async () => {
  const { inserts, uninstall } = setup(null);
  try {
    const before = Date.now();
    const r = await push({ slot: 'career', updatedAt: 9e15 });
    assert.equal(r.code, 200);
    assert.ok(Number(inserts[0].params[3]) <= before + CLOUD_MAX_FUTURE_MS + 5_000);
  } finally { uninstall(); }
});

test('push mais velho que o servidor dá 409 com o timestamp atual (não some em silêncio)', async () => {
  const serverTs = Date.now() - 1_000;
  const { uninstall } = setup({ updatedAt: serverTs });
  try {
    const r = await push({ slot: 'career-2', updatedAt: serverTs - 60_000 });
    assert.equal(r.code, 409);
    assert.equal(r.body.conflict, true);
    assert.equal(r.body.updatedAt, serverTs);
  } finally { uninstall(); }
});

test('linha envenenada (updated_at no futuro distante) aceita ser sobrescrita', async () => {
  const { row, uninstall } = setup({ updatedAt: 9e15 });
  try {
    const r = await push({ slot: 'ultimate', updatedAt: Date.now() });
    assert.equal(r.code, 200);
    assert.ok(row && row.updatedAt < 9e15);
  } finally { uninstall(); }
});

test('slot desconhecido dá 400 e não grava', async () => {
  const { inserts, uninstall } = setup(null);
  try {
    assert.equal((await push({ slot: 'meu-slot-infinito-123' })).code, 400);
    assert.equal(inserts.length, 0);
  } finally { uninstall(); }
});
