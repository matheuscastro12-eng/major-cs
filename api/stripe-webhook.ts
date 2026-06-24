import { neon } from '@neondatabase/serverless';
import type Stripe from 'stripe';
import {
  accountReference,
  checkoutEmail,
  checkoutHasExpectedPrice,
  checkoutIsPaid,
  cleanEnv,
  renumberFounders,
  retrieveCheckout,
  stripeClient,
} from '../server/payments.js';

const PAYMENT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

async function fetchHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });

  const webhookSecret = cleanEnv(process.env.STRIPE_WEBHOOK_SECRET);
  const databaseUrl = cleanEnv(process.env.DATABASE_URL);
  if (!webhookSecret || !databaseUrl) {
    return Response.json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: 'Assinatura ausente' }, { status: 400 });

  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ error: 'Assinatura inválida' }, { status: 400 });
  }

  if (!PAYMENT_EVENTS.has(event.type)) return Response.json({ received: true, processed: false });

  const eventSession = event.data.object as Stripe.Checkout.Session;
  const session = await retrieveCheckout(stripe, eventSession.id);
  if (!checkoutIsPaid(session) || !checkoutHasExpectedPrice(session)) {
    return Response.json({ received: true, processed: false });
  }

  const sql = neon(databaseUrl);
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS founder_no INT`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS rtm_accounts_stripe_ref_idx ON rtm_accounts (stripe_ref) WHERE stripe_ref IS NOT NULL`,
    sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_payment_sessions (session_id TEXT PRIMARY KEY, email TEXT NOT NULL, stripe_event_id TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
  ]);

  let email = '';
  if (session.client_reference_id) {
    const account = await sql`SELECT email FROM rtm_accounts WHERE stripe_ref=${session.client_reference_id} LIMIT 1`;
    email = account.length ? String(account[0].email) : '';
  }
  if (!email) email = checkoutEmail(session);
  if (!/\S+@\S+\.\S+/.test(email)) {
    return Response.json({ received: true, processed: false });
  }

  await sql.transaction([
    sql`INSERT INTO rtm_payment_sessions (session_id, email, stripe_event_id) VALUES (${session.id}, ${email}, ${event.id}) ON CONFLICT (session_id) DO NOTHING`,
    sql`INSERT INTO rtm_paid_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`,
    // promove o cadastro pendente em conta paga (só pago tem conta)
    sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref)
        SELECT email, nick, pass_hash, true, ${accountReference(email)} FROM rtm_pending_signups WHERE email=${email}
        ON CONFLICT (email) DO UPDATE SET paid=true`,
    sql`UPDATE rtm_accounts SET paid=true, stripe_ref=COALESCE(stripe_ref, ${accountReference(email)}) WHERE email=${email}`,
    sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
  ]);

  // numera o fundador por ordem de pagamento (#001 = primeiro a pagar). Backfilla
  // quem ainda não tinha número e encaixa este pagante na posição certa.
  await renumberFounders(sql);

  return Response.json({ received: true, processed: true });
}

export default { fetch: fetchHandler };
