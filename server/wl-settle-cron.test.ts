// [O0-22] Fecho automático do Major da Semana: janela fechada certa no horário
// do cron, prêmio do settle visível no status até ser coletado (1x, pelo
// ledger) e a rota api/cron.ts protegida por CRON_SECRET.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { FakeDb, type PendingQuery } from './ultimate-economy.mock.js';
import { applyUltTransaction } from './ultimate-economy.js';
import { parseWindowId } from './weekend-league.js';
import { lastClosedWindowId, wlLastSettleFor, wlSettleAck, WL_SETTLE_CRON } from './wlSettleCron.js';
import cronHandler, { cronAuthorized } from '../api/cron.js';
import { captureRes, FAKE_DATABASE_URL, installFakeNeon } from './neon-http.mock.js';

const CRON_AT = new Date('2026-09-20T03:05:00Z'); // domingo 00:05 em -03
const SAT_NOON = new Date('2026-09-19T15:00:00Z'); // janela wl-2026-09-16 aberta
const TUE = new Date('2026-09-22T15:00:00Z');

// FakeDb da economia + a query do settleRow (ledger por email/op_id com o EXISTS do ack)
class SettleFakeDb extends FakeDb {
  override run(q: PendingQuery) {
    if (q.text.startsWith('SELECT l.credits_delta, l.meta, l.created_at')) {
      const [ack, email, op] = q.params as string[];
      const row = this.ledger.find((l) => l.email === email && l.opId === op);
      if (!row) return [];
      return [{ credits_delta: row.delta, meta: row.meta, created_at: row.createdAt, acked: this.ledger.some((l) => l.email === email && l.opId === ack) }];
    }
    return super.run(q);
  }
}

test('cron: domingo 00:05 de Brasília, logo depois do fim da janela', () => {
  assert.equal(WL_SETTLE_CRON, '5 3 * * 0');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { crons?: { path: string; schedule: string }[] };
  assert.deepEqual(vercel.crons?.find((c) => c.path.startsWith('/api/cron?job=wl-settle')), { path: '/api/cron?job=wl-settle', schedule: WL_SETTLE_CRON });
  const id = lastClosedWindowId(CRON_AT);
  assert.equal(id, 'wl-2026-09-16');
  const b = parseWindowId(id)!;
  assert.ok(b.endsAt.getTime() <= CRON_AT.getTime(), 'no horário do cron a janela já fechou (settle não dá window_still_open)');
  assert.ok(CRON_AT.getTime() - b.endsAt.getTime() <= 10 * 60_000);
});

test('lastClosedWindowId: janela aberta aponta a da semana anterior; dom–ter, a que acabou', () => {
  assert.equal(lastClosedWindowId(SAT_NOON), 'wl-2026-09-09');
  assert.equal(lastClosedWindowId(TUE), 'wl-2026-09-16');
  assert.equal(lastClosedWindowId(new Date('2026-09-23T03:00:00Z')), 'wl-2026-09-16'); // quarta 00:00 -03: nova janela abriu
});

test('prêmio do settle: aparece no status, coleta 1x pelo ledger e some', async () => {
  const db = new SettleFakeDb();
  const WID = 'wl-2026-09-16';
  await applyUltTransaction(db.sql, 'a@x', { opId: `wl:${WID}`, kind: 'reward', creditsDelta: 40000, cards: [], meta: { source: 'weekend-league-settle', windowId: WID, rank: 2 } });
  const last = await wlLastSettleFor(db.sql, 'a@x', TUE);
  assert.deepEqual({ ...last, at: undefined }, { windowId: WID, rank: 2, prize: 40000, at: undefined });
  assert.equal(await wlLastSettleFor(db.sql, 'b@x', TUE), null, 'fora do top 10: nada');

  const first = await wlSettleAck(db.sql, 'a@x', WID, TUE);
  assert.deepEqual(first, { ok: true, replayed: false, windowId: WID, rank: 2, prize: 40000 });
  const again = await wlSettleAck(db.sql, 'a@x', WID, TUE);
  assert.ok(again.ok && again.replayed, 'segundo aparelho: já coletado, não credita de novo');
  assert.equal(await wlLastSettleFor(db.sql, 'a@x', TUE), null);
  // o ack não mexe em coins
  assert.equal(db.wallets.get('a@x'), 40000);

  assert.deepEqual(await wlSettleAck(db.sql, 'a@x', 'wl-2026-09-09', TUE), { ok: false, error: 'bad_window' });
  assert.deepEqual(await wlSettleAck(db.sql, 'b@x', WID, TUE), { ok: false, error: 'no_prize' });
});

test('claim legado por faixa (mesmo op_id, sem rank) não vira banner de colocação', async () => {
  const db = new SettleFakeDb();
  const WID = 'wl-2026-09-16';
  await applyUltTransaction(db.sql, 'a@x', { opId: `wl:${WID}`, kind: 'reward', creditsDelta: 7500, cards: [], meta: { source: 'weekend-league', windowId: WID, wins: 3 } });
  assert.equal(await wlLastSettleFor(db.sql, 'a@x', TUE), null);
});

test('api/cron: sem CRON_SECRET recusa tudo; header errado = 401; janela vazia = 200', async () => {
  assert.equal(cronAuthorized('Bearer s3cr3t', 's3cr3t'), true);
  assert.equal(cronAuthorized('Bearer errado', 's3cr3t'), false);
  assert.equal(cronAuthorized(undefined, 's3cr3t'), false);
  assert.equal(cronAuthorized('Bearer ', undefined), false);

  process.env.DATABASE_URL = FAKE_DATABASE_URL;
  delete process.env.CRON_SECRET;
  const off = captureRes();
  await cronHandler({ method: 'GET', query: { job: 'wl-settle' }, headers: { authorization: 'Bearer x' } }, off);
  assert.equal(off.statusCode, 503);

  process.env.CRON_SECRET = 's3cr3t';
  const bad = captureRes();
  await cronHandler({ method: 'GET', query: { job: 'wl-settle' }, headers: { authorization: 'Bearer x' } }, bad);
  assert.equal(bad.statusCode, 401);

  const db = installFakeNeon((sql) => (/^(CREATE|ALTER|SELECT e\.email)/.test(sql) ? [] : undefined));
  try {
    const ok = captureRes();
    const log = console.log;
    console.log = () => {};
    try { await cronHandler({ method: 'GET', query: { job: 'wl-settle' }, headers: { authorization: 'Bearer s3cr3t' } }, ok); } finally { console.log = log; }
    assert.equal(ok.statusCode, 200);
    assert.equal((ok.body as { skipped?: string }).skipped, 'empty');
    assert.match(String((ok.body as { windowId?: string }).windowId), /^wl-\d{4}-\d{2}-\d{2}$/);
  } finally { db.restore(); delete process.env.CRON_SECRET; }
});
