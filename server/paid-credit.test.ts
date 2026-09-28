// [O0-46] Crédito pago pelo servidor: coinsClaim/passClaim gravam no ledger
// (opId coins:<corr> / pass:<season>) ANTES de marcar o pedido, e isso vale
// com a rota `tx` do cliente já fechada (O0-02) — o grant do cliente morre com
// 400, o crédito pago continua entrando.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeDb, type PendingQuery } from './ultimate-economy.mock.js';
import { claimPaidOrders, coinsOpId, listPaidVouchers, passOpId } from './paid-credit.js';
import { applyClientUltTx } from './ultimate-economy.js';

type Row = Record<string, unknown>;

interface OrderRow { correlationId: string; email: string; tier: string; coins: number; status: string }

// Estende o FakeDb da economia com rtm_coin_orders e a leitura dos vouchers.
class PaidFakeDb extends FakeDb {
  orders: OrderRow[] = [];
  failNextUpdate = false; // simula crash entre creditar e marcar 'claimed'

  run(q: PendingQuery): Row[] {
    const { text, params } = q;
    if (text.startsWith('SELECT correlation_id, tier, coins FROM rtm_coin_orders')) {
      const email = String(params[0]);
      const pass = text.includes("AND tier LIKE 'pass-s%'");
      return this.orders
        .filter((o) => o.email === email && o.status === 'paid' && o.tier.startsWith('pass-s') === pass)
        .map((o) => ({ correlation_id: o.correlationId, tier: o.tier, coins: o.coins }));
    }
    if (text.startsWith("UPDATE rtm_coin_orders SET status='claimed'")) {
      if (this.failNextUpdate) { this.failNextUpdate = false; throw new Error('conexão caiu'); }
      const email = String(params[0]);
      const ids = params[1] as string[];
      const hit = this.orders.filter((o) => o.email === email && o.status === 'paid' && ids.includes(o.correlationId));
      for (const o of hit) o.status = 'claimed';
      return hit.map((o) => ({ correlation_id: o.correlationId, tier: o.tier, coins: o.coins }));
    }
    if (text.includes("op_id LIKE 'coins:%'")) {
      const email = String(params[0]);
      const limit = Number(params[1]);
      return this.ledger
        .filter((l) => l.email === email && (l.opId.startsWith('coins:') || l.opId.startsWith('pass:')))
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((l) => ({ op_id: l.opId, credits_delta: l.delta, meta: l.meta }));
    }
    return super.run(q);
  }
}

const CORR = 'ultcoins:p10:mabc123:x1y2z3';

test('coinsClaim credita o pedido no ledger com opId coins:<corr> e marca claimed', async () => {
  const db = new PaidFakeDb();
  db.orders.push({ correlationId: CORR, email: 'a@x', tier: 'p10', coins: 30_000, status: 'paid' });
  const r = await claimPaidOrders(db.sql, 'a@x', 'coins');
  assert.deepEqual(r.claimed, [{ orderId: CORR, coins: 30_000 }]);
  assert.equal(r.credits, 30_000);
  const row = db.ledger.find((l) => l.opId === coinsOpId(CORR));
  assert.ok(row, 'compra aparece no ledger');
  assert.equal(row.kind, 'grant');
  assert.equal(row.delta, 30_000);
  assert.equal(row.meta.orderId, CORR);
  assert.deepEqual(r.vouchers, [{ opId: coinsOpId(CORR), kind: 'coins', credits: 30_000, orderId: CORR }]);
  assert.equal(db.orders[0].status, 'claimed');
});

test('compra entra no ledger com a tx do cliente já fechada (grant do cliente → 400)', async () => {
  const db = new PaidFakeDb();
  // o caminho antigo (addCredits + grant espelhado) agora morre na rota…
  const legacy = await applyClientUltTx(db.sql, 'a@x', { opId: 'sh-1', kind: 'grant', creditsDelta: 30_000, meta: { src: 'credit' } }, async () => null);
  assert.equal(legacy.status, 400);
  assert.equal(db.ledger.length, 0);
  // …e o crédito pago continua chegando, agora pelo servidor.
  db.orders.push({ correlationId: CORR, email: 'a@x', tier: 'p10', coins: 30_000, status: 'paid' });
  const r = await claimPaidOrders(db.sql, 'a@x', 'coins');
  assert.equal(r.credits, 30_000);
  assert.equal(db.ledger.length, 1);
  assert.equal(db.ledger[0].opId, coinsOpId(CORR));
  // e o jogador consegue gastar esse saldo pela tx fechada (spend ≤ 0)
  const spend = await applyClientUltTx(db.sql, 'a@x', { opId: 'sp-1', kind: 'spend', creditsDelta: -12_000 }, async () => null);
  assert.equal(spend.status, 200);
  assert.equal(spend.body.credits, 18_000);
});

test('claim é idempotente: duas abas / retry nunca creditam 2x', async () => {
  const db = new PaidFakeDb();
  db.orders.push({ correlationId: CORR, email: 'a@x', tier: 'p10', coins: 30_000, status: 'paid' });
  const [a, b] = await Promise.all([claimPaidOrders(db.sql, 'a@x', 'coins'), claimPaidOrders(db.sql, 'a@x', 'coins')]);
  assert.equal(db.wallets.get('a@x'), 30_000);
  assert.equal(a.claimed.length + b.claimed.length, 1);
  const again = await claimPaidOrders(db.sql, 'a@x', 'coins');
  assert.equal(again.claimed.length, 0);
  assert.equal(again.credits, 30_000);
  assert.equal(again.vouchers.length, 1, 'o voucher continua visível pro cliente absorver');
});

test('crash entre creditar e marcar: o próximo claim só marca (sem crédito duplo)', async () => {
  const db = new PaidFakeDb();
  db.orders.push({ correlationId: CORR, email: 'a@x', tier: 'p10', coins: 30_000, status: 'paid' });
  db.failNextUpdate = true;
  await assert.rejects(claimPaidOrders(db.sql, 'a@x', 'coins'));
  assert.equal(db.wallets.get('a@x'), 30_000, 'pay-first: o crédito já está no ledger');
  assert.equal(db.orders[0].status, 'paid');
  const r = await claimPaidOrders(db.sql, 'a@x', 'coins');
  assert.equal(r.claimed.length, 1);
  assert.equal(db.wallets.get('a@x'), 30_000);
  assert.equal(db.ledger.filter((l) => l.opId === coinsOpId(CORR)).length, 1);
});

test('passClaim grava pass:<season> (delta 0) e não mistura com coins', async () => {
  const db = new PaidFakeDb();
  db.orders.push({ correlationId: 'ultcoins:pass-s3:m1:aa', email: 'a@x', tier: 'pass-s3', coins: 0, status: 'paid' });
  db.orders.push({ correlationId: CORR, email: 'a@x', tier: 'p10', coins: 30_000, status: 'paid' });
  const p = await claimPaidOrders(db.sql, 'a@x', 'pass');
  assert.deepEqual(p.claimed, [{ orderId: 'ultcoins:pass-s3:m1:aa', coins: 0, season: 3 }]);
  assert.equal(p.credits, 0);
  const row = db.ledger.find((l) => l.opId === passOpId(3));
  assert.ok(row);
  assert.equal(row.delta, 0);
  assert.equal(db.orders[1].status, 'paid', 'pedido de coins fica pro coinsClaim');
  const vouchers = await listPaidVouchers(db.sql, 'a@x');
  assert.deepEqual(vouchers, [{ opId: 'pass:3', kind: 'pass', credits: 0, season: 3, orderId: 'ultcoins:pass-s3:m1:aa' }]);
});

test('conta sem cloud-save (só token, sem carteira prévia) também recebe o crédito', async () => {
  const db = new PaidFakeDb();
  db.orders.push({ correlationId: CORR, email: 'pendente@x', tier: 'p10', coins: 30_000, status: 'paid' });
  const r = await claimPaidOrders(db.sql, 'pendente@x', 'coins');
  assert.equal(r.credits, 30_000);
  assert.equal(db.wallets.get('pendente@x'), 30_000);
});
