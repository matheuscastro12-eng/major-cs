// Webhook do Woovi (Pix): ativa a conta vitalícia quando a cobrança é paga e dá
// baixa nos pedidos de coins/passe. Valida o header x-webhook-signature com a
// chave PÚBLICA do Woovi (RSA-SHA256), então só um webhook real do Woovi chega
// aqui. Endurecimento O0-24 (SEGU-06/ECON-07): vitalícia só com correlationID
// "rtm-" e valor >= preço, e-mail tirado do correlationID (não do pagador),
// pedido só com valor igual ao do pedido e idempotência por pagamento.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { createVerify } from 'node:crypto';
import { logSettleAttention, settleOrder } from '../server/order-settle.js';
import {
  accountReference,
  assignFounderNumbers,
  cleanEnv,
  COIN_TIERS,
  parsePassTier,
  PASS_PRICE_CENTS,
  pixAccountPriceCents,
} from '../server/payments.js';
import { isPaidEvent, rtmEmailFromCorrelation, wooviCorrelation, wooviPaidCents, wooviPayerEmail, wooviPaymentKey } from '../server/woovi.js';

// chave pública do Woovi (https://developers.woovi.com/docs/webhook/seguranca).
// Override por env WOOVI_PUBLIC_KEY caso o Woovi rotacione a chave.
const WOOVI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/+NtIkjzevvqD+I3MMv3bLXDt
pvxBjY4BsRrSdca3rtAwMcRYYvxSnd7jagVLpctMiOxQO8ieUCKLSWHpsMAjO/zZ
WMKbqoG8MNpi/u3fp6zz0mcHCOSqYsPUUG19buW8bis5ZZ2IZgBObWSpTvJ0cnj6
HKBAA82Jln+lGwS1MwIDAQAB
-----END PUBLIC KEY-----`;

function verifyWoovi(raw: string, signature: string): boolean {
  try {
    const key = cleanEnv(process.env.WOOVI_PUBLIC_KEY) || WOOVI_PUBLIC_KEY;
    const v = createVerify('sha256');
    v.update(raw);
    v.end();
    return v.verify(key, signature, 'base64');
  } catch { return false; }
}

// Idempotência por PAGAMENTO (O0-24): o mesmo Pix chega em CHARGE_COMPLETED e
// TRANSACTION_RECEIVED, e o Woovi re-entrega quando a resposta demora. A chave
// é gravada ANTES de processar e apagada se o processamento falhar (o Woovi
// re-tenta e a gente processa de novo).
let schemaReady = false;
async function ensureWebhookSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (schemaReady) return;
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_webhook_events (provider TEXT NOT NULL, event_key TEXT NOT NULL, correlation_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (provider, event_key))`,
    sql`CREATE TABLE IF NOT EXISTS rtm_coin_orders (correlation_id TEXT PRIMARY KEY, email TEXT NOT NULL, tier TEXT NOT NULL, coins INT NOT NULL, cents INT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ, method TEXT DEFAULT 'pix')`,
    sql`ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'pix'`,
    sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS founder_no INT`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS payment_method TEXT`,
    sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
  ]);
  schemaReady = true;
}

// handled: o pagamento foi resolvido (creditado, já baixado antes ou marcado pra
// revisão). false = nada aconteceu, e a chave de idempotência é liberada pra um
// evento mais completo do mesmo Pix (ex.: TRANSACTION_RECEIVED sem a cobrança
// antes do CHARGE_COMPLETED) ainda poder processar.
type Outcome = { handled: boolean; body: Record<string, unknown> };

async function processPaid(sql: NeonQueryFunction<false, false>, body: Record<string, unknown>, corr: string, paid: number): Promise<Outcome> {
  // compra de coins do Ultimate OU do Passe Premium (correlationID
  // "ultcoins:..."; o passe reusa rtm_coin_orders com tier "pass-s<N>",
  // coins=0): baixa o pedido e PARA aqui — não ativa conta vitalícia.
  if (corr.startsWith('ultcoins:')) {
    // órfão (Pix pago sem pedido gravado): reconstrói pelo tier do correlationID
    // e pelo e-mail da cobrança, com o preço da tabela única de payments.ts.
    const tier = corr.split(':')[1] ?? '';
    const pack = COIN_TIERS[tier] ?? (parsePassTier(tier) ? { cents: PASS_PRICE_CENTS, coins: 0 } : undefined);
    const orphan = pack ? { email: wooviPayerEmail(body), tier, coins: pack.coins, cents: pack.cents } : undefined;
    const r = await settleOrder(sql, corr, paid, 'pix', orphan);
    logSettleAttention('woovi', corr, paid, r);
    return { handled: r.status !== 'not_found', body: { received: true, processed: r.status === 'paid' || r.status === 'already', coins: true, status: r.status } };
  }

  // Conta vitalícia: só cobrança NOSSA ("rtm-<email>-<ts>", action 'pix') e com
  // valor >= preço. O e-mail vem do correlationID — a conta que gerou a
  // cobrança —, nunca do pagador (ECON-07).
  const email = rtmEmailFromCorrelation(corr);
  if (!email) {
    console.warn('[woovi] Pix pago sem cobrança conhecida, ignorado:', corr || '(sem correlationID)', paid);
    return { handled: false, body: { received: true, processed: false, reason: 'cobrança desconhecida' } };
  }
  if (!(paid >= pixAccountPriceCents())) {
    console.error(`[woovi] vitalícia com valor abaixo do preço: ${corr} pagou ${paid} centavos — conferir no CRM`);
    return { handled: true, body: { received: true, processed: false, reason: 'valor abaixo do preço' } };
  }

  await sql.transaction([
    sql`INSERT INTO rtm_paid_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`,
    // promove o cadastro pendente em conta paga (regra: só pago tem conta)
    sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref)
        SELECT email, nick, pass_hash, true, ${accountReference(email)} FROM rtm_pending_signups WHERE email=${email}
        ON CONFLICT (email) DO UPDATE SET paid=true`,
    // método real vence o 'admin' de um grant antigo (senão a conta nunca entraria na fila de Fundador)
    sql`UPDATE rtm_accounts SET paid=true, stripe_ref=COALESCE(stripe_ref, ${accountReference(email)}),
        payment_method=CASE WHEN payment_method IS NULL OR payment_method='admin' THEN 'pix' ELSE payment_method END
        WHERE email=${email}`,
    sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
  ]);
  await assignFounderNumbers(sql); // número de Fundador na ordem do pagamento, uma vez só

  return { handled: true, body: { received: true, processed: true } };
}

async function fetchHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  const databaseUrl = cleanEnv(process.env.DATABASE_URL);
  if (!databaseUrl) return Response.json({ error: 'DATABASE_URL não configurada' }, { status: 500 });

  const raw = await request.text();
  const signature = request.headers.get('x-webhook-signature') ?? '';
  // Woovi dispara um ping de teste (sem corpo/assinatura) ao cadastrar o webhook.
  if (!signature || raw.length < 2) return Response.json({ received: true, test: true });
  if (!verifyWoovi(raw, signature)) return Response.json({ error: 'assinatura inválida' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return Response.json({ received: true, processed: false }); }
  if (!isPaidEvent(body)) return Response.json({ received: true, processed: false });

  const corr = wooviCorrelation(body);
  const paid = wooviPaidCents(body);
  const sql = neon(databaseUrl);
  await ensureWebhookSchema(sql);

  const key = wooviPaymentKey(body);
  if (key) {
    const fresh = await sql`INSERT INTO rtm_webhook_events (provider, event_key, correlation_id) VALUES ('woovi', ${key}, ${corr}) ON CONFLICT DO NOTHING RETURNING event_key`;
    if (!fresh.length) return Response.json({ received: true, processed: false, duplicate: true });
  }
  const release = async () => {
    if (key) await sql`DELETE FROM rtm_webhook_events WHERE provider='woovi' AND event_key=${key}`.catch(() => undefined);
  };
  let out: Outcome;
  try {
    out = await processPaid(sql, body, corr, paid);
  } catch (error) {
    await release(); // a re-entrega do Woovi processa de novo
    throw error;
  }
  if (!out.handled) await release();
  return Response.json(out.body);
}

export default { fetch: fetchHandler };
