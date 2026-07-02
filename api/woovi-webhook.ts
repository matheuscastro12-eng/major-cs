// Webhook do Woovi (Pix): ativa a conta vitalícia quando a cobrança é paga.
// Casa pelo E-MAIL do pagador (o checkout do Woovi coleta e-mail) com o cadastro
// pendente / conta. Seguro: valida o header x-webhook-signature com a chave PÚBLICA
// do Woovi (RSA-SHA256), então só um webhook real do Woovi consegue marcar pago.
import { neon } from '@neondatabase/serverless';
import { createVerify } from 'node:crypto';
import { accountReference, cleanEnv, renumberFounders } from '../server/payments.js';

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

const norm = (e?: unknown) => String(e ?? '').trim().toLowerCase();

// eventos de pagamento confirmado do Woovi/OpenPix
function isPaidEvent(b: Record<string, unknown>): boolean {
  const ev = String(b.event ?? '');
  if (ev.includes('CHARGE_COMPLETED') || ev.includes('TRANSACTION_RECEIVED')) return true;
  const charge = b.charge as Record<string, unknown> | undefined;
  const st = String(charge?.status ?? '');
  return st === 'COMPLETED' || st === 'CONFIRMED';
}

function payerEmail(b: Record<string, unknown>): string {
  const charge = b.charge as Record<string, unknown> | undefined;
  const chargeCustomer = charge?.customer as Record<string, unknown> | undefined;
  const customer = b.customer as Record<string, unknown> | undefined;
  const pix = b.pix as Record<string, unknown> | undefined;
  const payer = pix?.payer as Record<string, unknown> | undefined;
  return norm(chargeCustomer?.email ?? customer?.email ?? payer?.email);
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

  // compra de coins do Ultimate (correlationID "ultcoins:..."): marca o pedido
  // pago e PARA aqui — coins não podem ativar conta vitalícia.
  const chargeObj = body.charge as Record<string, unknown> | undefined;
  const corr = String(chargeObj?.correlationID ?? (body.correlationID as string | undefined) ?? '');
  if (corr.startsWith('ultcoins:')) {
    const coinSql = neon(databaseUrl);
    await coinSql`CREATE TABLE IF NOT EXISTS rtm_coin_orders (correlation_id TEXT PRIMARY KEY, email TEXT NOT NULL, tier TEXT NOT NULL, coins INT NOT NULL, cents INT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ)`;
    const updated = await coinSql`UPDATE rtm_coin_orders SET status='paid', paid_at=now() WHERE correlation_id=${corr} AND status='pending' RETURNING correlation_id`;
    if (updated.length === 0) {
      // rede de segurança: Pix pago sem pedido registrado (falha entre criar a
      // cobrança e gravar o pedido). Reconstrói pelo correlationID + e-mail do
      // pagador. Tiers espelham COIN_TIERS em api/account.ts — manter em sincronia.
      const ULT_COIN_TIERS: Record<string, { cents: number; coins: number }> = {
        p10: { cents: 1000, coins: 30000 }, p15: { cents: 1500, coins: 50000 }, p30: { cents: 3000, coins: 120000 },
      };
      const tier = corr.split(':')[1] ?? '';
      const pack = ULT_COIN_TIERS[tier];
      const buyer = payerEmail(body);
      if (pack && /\S+@\S+\.\S+/.test(buyer)) {
        // ON CONFLICT DO NOTHING: se o pedido existe como paid/claimed (webhook
        // duplicado), não recria nem paga duas vezes.
        await coinSql`INSERT INTO rtm_coin_orders (correlation_id, email, tier, coins, cents, status, paid_at) VALUES (${corr}, ${buyer}, ${tier}, ${pack.coins}, ${pack.cents}, 'paid', now()) ON CONFLICT (correlation_id) DO NOTHING`;
      }
    }
    return Response.json({ received: true, processed: true, coins: true });
  }

  const email = payerEmail(body);
  if (!/\S+@\S+\.\S+/.test(email)) return Response.json({ received: true, processed: false, reason: 'sem email do pagador' });

  const sql = neon(databaseUrl);
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS founder_no INT`,
    sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
  ]);
  await sql.transaction([
    sql`INSERT INTO rtm_paid_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`,
    // promove o cadastro pendente em conta paga (regra: só pago tem conta)
    sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref)
        SELECT email, nick, pass_hash, true, ${accountReference(email)} FROM rtm_pending_signups WHERE email=${email}
        ON CONFLICT (email) DO UPDATE SET paid=true`,
    sql`UPDATE rtm_accounts SET paid=true, stripe_ref=COALESCE(stripe_ref, ${accountReference(email)}) WHERE email=${email}`,
    sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
  ]);
  await renumberFounders(sql); // numera o fundador por ordem de pagamento

  return Response.json({ received: true, processed: true });
}

export default { fetch: fetchHandler };
