// Baixa de pedido pago (coins e Passe Premium) pelos webhooks do Woovi e do
// Stripe (O0-24 e O0-41). Antes cada webhook tinha sua cópia do UPDATE e da
// "rede de segurança", sem conferir valor e sem olhar se o passe da temporada
// já tinha sido pago por outro pedido.
//
// Regras:
// - o valor pago tem de ser IGUAL ao cents do pedido (ECON-07). Divergente vira
//   status 'value_mismatch' (não credita nada; aparece no CRM pra conferir);
// - passe da mesma temporada já pago/claimado por outro pedido: o novo vira
//   'duplicate' (ECON-12). O passClaim/coinsClaim só coletam 'paid', então o
//   jogador não recebe nada em dobro e o CRM lista o pedido pra reembolso;
// - o advisory lock por (e-mail, tier) serializa dois webhooks de passe do mesmo
//   jogador chegando juntos (Pix + cartão em abas diferentes).
import type { NeonQueryFunction } from '@neondatabase/serverless';

export type SettleSql = NeonQueryFunction<false, false>;
export type OrderMethod = 'pix' | 'stripe';
// already = webhook repetido (o pedido já tinha saído de pending)
export type SettleStatus = 'paid' | 'duplicate' | 'value_mismatch' | 'already' | 'not_found';

// status de pedido que o CRM precisa olhar (dinheiro entrou, nada foi creditado)
export const ATTENTION_STATUSES = ['duplicate', 'value_mismatch'] as const;

export interface SettleResult { status: SettleStatus; email?: string; tier?: string }

// Pedido que o webhook reconstrói quando o pagamento chega sem pedido gravado
// (falha entre criar a cobrança e gravar o pedido).
export interface OrphanOrder { email: string; tier: string; coins: number; cents: number }

const isPassTier = (tier: string) => /^pass-s\d+$/.test(tier);

// centavos inteiros; valor ausente/NaN vira -1 (nunca bate com pedido nenhum e
// não quebra o cast ::int no Postgres)
const cents = (v: number) => (Number.isFinite(v) ? Math.round(v) : -1);

export async function settleOrder(
  sql: SettleSql,
  corr: string,
  paidRaw: number,
  method: OrderMethod,
  orphanRaw?: OrphanOrder,
): Promise<SettleResult> {
  const paidCents = cents(paidRaw);
  const orphan = orphanRaw && { ...orphanRaw, cents: cents(orphanRaw.cents), coins: Math.max(0, Math.floor(Number(orphanRaw.coins) || 0)) };
  // lock pelo (e-mail, tier) do pedido; sem pedido, pelo do órfão (ou pelo corr).
  const lockKey = orphan ? `${orphan.email}|${orphan.tier}` : corr;
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_order_settle'), hashtext(COALESCE(
          (SELECT email || '|' || tier FROM rtm_coin_orders WHERE correlation_id=${corr}), ${lockKey})))`,
    sql`UPDATE rtm_coin_orders o SET
          status = CASE
            WHEN o.cents <> ${paidCents} THEN 'value_mismatch'
            WHEN o.tier LIKE 'pass-s%' AND EXISTS (
              SELECT 1 FROM rtm_coin_orders d
              WHERE d.email = o.email AND d.tier = o.tier AND d.correlation_id <> o.correlation_id
                AND d.status IN ('paid', 'claimed')) THEN 'duplicate'
            ELSE 'paid' END,
          paid_at = now(), method = ${method}
        WHERE o.correlation_id = ${corr} AND o.status = 'pending'
        RETURNING o.status, o.email, o.tier`,
  ]);
  const hit = (rows as Record<string, unknown>[])[0];
  if (hit) return { status: String(hit.status) as SettleStatus, email: String(hit.email), tier: String(hit.tier) };

  // pedido já baixado (webhook repetido) ou inexistente
  const existing = await sql`SELECT status, email, tier FROM rtm_coin_orders WHERE correlation_id=${corr}`;
  if (existing.length) return { status: 'already', email: String(existing[0].email), tier: String(existing[0].tier) };
  if (!orphan || !/\S+@\S+\.\S+/.test(orphan.email) || !(orphan.coins > 0 || isPassTier(orphan.tier))) return { status: 'not_found' };

  // rede de segurança: reconstrói o pedido com a MESMA regra de valor e de passe
  // duplicado. ON CONFLICT DO NOTHING: webhook repetido não recria nem paga 2×.
  const [, inserted] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_order_settle'), hashtext(${lockKey}))`,
    sql`INSERT INTO rtm_coin_orders (correlation_id, email, tier, coins, cents, status, paid_at, method)
        SELECT ${corr}, ${orphan.email}, ${orphan.tier}, ${orphan.coins}, ${orphan.cents},
          CASE
            WHEN ${orphan.cents}::int <> ${paidCents}::int THEN 'value_mismatch'
            WHEN ${orphan.tier} LIKE 'pass-s%' AND EXISTS (
              SELECT 1 FROM rtm_coin_orders d WHERE d.email = ${orphan.email} AND d.tier = ${orphan.tier}
                AND d.status IN ('paid', 'claimed')) THEN 'duplicate'
            ELSE 'paid' END,
          now(), ${method}
        ON CONFLICT (correlation_id) DO NOTHING
        RETURNING status`,
  ]);
  const ins = (inserted as Record<string, unknown>[])[0];
  return ins ? { status: String(ins.status) as SettleStatus, email: orphan.email, tier: orphan.tier } : { status: 'not_found' };
}

// Log de atenção: dinheiro entrou mas nada foi creditado. console.error pra cair
// como erro no log da Vercel; o CRM (aba Pedidos) lista os pedidos pelo status.
export function logSettleAttention(provider: string, corr: string, paidCents: number, r: SettleResult): void {
  if (r.status !== 'duplicate' && r.status !== 'value_mismatch') return;
  console.error(`[${provider}] pedido ${r.status}: ${corr} (${r.email ?? '?'}, ${r.tier ?? '?'}, pago ${paidCents} centavos) — conferir e reembolsar no CRM`);
}

// ── Cobrança pendente reaproveitada (O0-41/ECON-12) ─────────────────────────
// Cada clique em "comprar passe" criava pedido e cobrança novos: com dois Pix
// abertos (ou Pix + cartão em abas diferentes) dava pra pagar o passe 2×. Agora
// o pedido pendente guarda a cobrança (pay_ref) e a validade; o próximo clique
// da mesma temporada e do mesmo método devolve a MESMA cobrança.
export interface ReusableCharge { correlationID: string; ref: Record<string, unknown>; expiresIn: number }

// margem: cobrança que expira em menos de 2 min não é devolvida (o jogador não
// daria tempo de pagar e ficaria com um QR morto)
export async function findReusableCharge(sql: SettleSql, email: string, tier: string, method: OrderMethod): Promise<ReusableCharge | null> {
  const rows = await sql`
    SELECT correlation_id, pay_ref, GREATEST(0, EXTRACT(EPOCH FROM pay_expires_at - now()))::int AS left_sec
    FROM rtm_coin_orders
    WHERE email=${email} AND tier=${tier} AND status='pending' AND COALESCE(method, 'pix')=${method}
      AND pay_ref IS NOT NULL AND pay_expires_at > now() + interval '2 minutes'
    ORDER BY created_at DESC LIMIT 1`;
  if (!rows.length) return null;
  try {
    const ref = JSON.parse(String(rows[0].pay_ref)) as Record<string, unknown>;
    return { correlationID: String(rows[0].correlation_id), ref, expiresIn: Number(rows[0].left_sec) || 0 };
  } catch { return null; }
}

export async function rememberCharge(sql: SettleSql, corr: string, ref: Record<string, unknown>, expiresInSec: number): Promise<void> {
  const secs = Number.isFinite(expiresInSec) && expiresInSec > 0 ? Math.floor(expiresInSec) : 3600;
  await sql`UPDATE rtm_coin_orders SET pay_ref=${JSON.stringify(ref)}, pay_expires_at=now() + make_interval(secs => ${secs}) WHERE correlation_id=${corr} AND status='pending'`;
}
