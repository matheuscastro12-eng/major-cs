// [O0-46] Crédito PAGO gravado pelo SERVIDOR no ledger do Ultimate.
//
// Antes: coinsClaim/passClaim só marcavam o pedido 'claimed' e o CLIENTE
// creditava no save (addCredits) + espelhava um 'grant' pela rota `tx`. Com a
// `tx` fechada (O0-02) esse grant não chega mais ao servidor — então o crédito
// pago passa a nascer aqui, com opId DETERMINÍSTICO por pedido:
//   - coins: `coins:<correlationID>` (kind 'grant', delta = coins do pedido);
//   - passe: `pass:<season>`         (kind 'grant', delta 0 — registra o
//     desbloqueio do premium daquela temporada).
// O UNIQUE (email, op_id) do ledger garante 1 crédito por pedido pra sempre,
// mesmo com duas abas, retry ou crash no meio. Vale pra QUALQUER token válido
// (conta sem cloud-save inclusive): o ledger é por e-mail, não depende de
// rtm_accounts nem do cloud-save.
//
// Ordem pay-first (mesmo racional do wlClaim antigo): grava o ledger ANTES de
// marcar o pedido 'claimed'. Crash entre os dois → o próximo claim re-aplica
// (replay no-op) e marca. O inverso (marcar e não creditar) perdia dinheiro.
//
// O cliente NÃO soma mais nada por conta própria: ele recebe os VOUCHERS
// (entradas coins:/pass: do ledger) e absorve no save só os que ainda não viu
// (src/state/paidClaim.ts). Resposta perdida na rede? O próximo claim devolve
// a lista de novo — nenhum crédito pago depende de o componente estar montado.
import { parsePassTier } from './payments.js';
import { applyUltTransaction, type SqlTag } from './ultimate-economy.js';

export type PaidOrderKind = 'coins' | 'pass';

export interface PaidVoucher {
  opId: string;       // coins:<corr> | pass:<season>
  kind: PaidOrderKind;
  credits: number;    // coins creditados (0 no passe)
  season?: number;    // só no passe
  orderId: string;    // correlationID do pedido
}

export interface ClaimedOrder { orderId: string; coins: number; season?: number }

export interface PaidClaimResult {
  claimed: ClaimedOrder[];   // pedidos que viraram 'claimed' NESTA chamada (funil purchase_fulfilled)
  vouchers: PaidVoucher[];   // créditos pagos da conta no ledger (o cliente absorve os que não viu)
  credits: number;           // saldo da carteira do servidor depois do claim
}

export const PAID_VOUCHER_LIMIT = 50;

export const coinsOpId = (orderId: string): string => `coins:${orderId}`;
export const passOpId = (season: number): string => `pass:${season}`;

// Coleta os pedidos 'paid' da conta (coins OU passe), credita cada um no
// ledger e marca 'claimed'. Idempotente e seguro sob concorrência.
export async function claimPaidOrders(sql: SqlTag, email: string, kind: PaidOrderKind): Promise<PaidClaimResult> {
  const rows = kind === 'coins'
    ? await sql`SELECT correlation_id, tier, coins FROM rtm_coin_orders WHERE email=${email} AND status='paid' AND tier NOT LIKE 'pass-s%'`
    : await sql`SELECT correlation_id, tier, coins FROM rtm_coin_orders WHERE email=${email} AND status='paid' AND tier LIKE 'pass-s%'`;
  const credited: string[] = [];
  for (const r of rows) {
    const orderId = String(r.correlation_id ?? '');
    const tier = String(r.tier ?? '');
    if (!orderId) continue;
    if (kind === 'coins') {
      const coins = Math.max(0, Math.trunc(Number(r.coins) || 0));
      const pay = await applyUltTransaction(sql, email, {
        opId: coinsOpId(orderId), kind: 'grant', creditsDelta: coins, cards: [],
        meta: { src: 'coins', orderId, tier },
      });
      if (pay.ok) credited.push(orderId);
    } else {
      const season = parsePassTier(tier);
      if (!season) continue; // tier corrompido: fica 'paid' pra triagem no CRM
      const pay = await applyUltTransaction(sql, email, {
        opId: passOpId(season), kind: 'grant', creditsDelta: 0, cards: [],
        meta: { src: 'pass-premium-paid', orderId, season },
      });
      if (pay.ok) credited.push(orderId);
    }
  }
  const claimedRows = credited.length
    ? await sql`UPDATE rtm_coin_orders SET status='claimed', claimed_at=now() WHERE email=${email} AND status='paid' AND correlation_id = ANY(${credited}::text[]) RETURNING correlation_id, tier, coins`
    : [];
  const claimed: ClaimedOrder[] = claimedRows.map((r) => {
    const season = parsePassTier(String(r.tier ?? ''));
    return { orderId: String(r.correlation_id ?? ''), coins: Number(r.coins) || 0, ...(season ? { season } : {}) };
  });
  const [vouchers, credits] = await Promise.all([listPaidVouchers(sql, email), walletCredits(sql, email)]);
  return { claimed, vouchers, credits };
}

// Créditos pagos da conta no ledger (mais novos primeiro, capado). É a lista
// que o cliente reconcilia contra os vouchers que o save já absorveu.
export async function listPaidVouchers(sql: SqlTag, email: string): Promise<PaidVoucher[]> {
  const rows = await sql`SELECT op_id, credits_delta, meta FROM rtm_ult_ledger WHERE email=${email} AND (op_id LIKE 'coins:%' OR op_id LIKE 'pass:%') ORDER BY id DESC LIMIT ${PAID_VOUCHER_LIMIT}`;
  const out: PaidVoucher[] = [];
  for (const r of rows) {
    const opId = String(r.op_id ?? '');
    const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
    const orderId = typeof meta.orderId === 'string' ? meta.orderId : '';
    if (opId.startsWith('coins:')) {
      out.push({ opId, kind: 'coins', credits: Math.max(0, Number(r.credits_delta) || 0), orderId: orderId || opId.slice(6) });
    } else if (opId.startsWith('pass:')) {
      const season = Number(opId.slice(5));
      if (Number.isInteger(season) && season > 0) out.push({ opId, kind: 'pass', credits: 0, season, orderId });
    }
  }
  return out;
}

async function walletCredits(sql: SqlTag, email: string): Promise<number> {
  const rows = await sql`SELECT credits FROM rtm_ult_wallet WHERE email=${email}`;
  return rows.length ? Number(rows[0].credits ?? 0) : 0;
}
