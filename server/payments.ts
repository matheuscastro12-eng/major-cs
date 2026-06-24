import { createHmac } from 'node:crypto';
import Stripe from 'stripe';

const DEFAULT_PAYMENT_LINK = 'https://buy.stripe.com/4gM3cv4zGa2Vfcx5jQ1RC01';
export const DEFAULT_PRICE_ID = 'price_1Tkp7NEHvCNyCbcUcYzHFZvK';

export const cleanEnv = (value?: string): string => value?.replace(/^\uFEFF/, '').trim() ?? '';

// teto do selo de Fundador (numerados; o resto paga e joga, s\u00F3 n\u00E3o ganha n\u00FAmero).
export const founderLimit = (): number => Number(cleanEnv(process.env.FOUNDER_LIMIT) || '500') || 500;

// cliente sql do neon usado como template tag (basta a forma de tagged template).
type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

// Numera\u00E7\u00E3o de FUNDADOR por ORDEM DE PAGAMENTO: #001 = primeiro a pagar no Stripe.
// Ordena pelo momento em que o e-mail virou pago (rtm_paid_emails.created_at, com
// fallback no created_at da conta). Determin\u00EDstico e idempotente: s\u00F3 atualiza as
// linhas que mudam, ent\u00E3o \u00E9 barato rodar a cada pagamento E como backfill do que
// j\u00E1 existe. Antes os pagantes do webhook n\u00E3o recebiam n\u00FAmero nenhum.
export async function renumberFounders(sql: SqlTag, limit = founderLimit()): Promise<void> {
  await sql`
    WITH ordered AS (
      SELECT a.email,
             row_number() OVER (
               ORDER BY COALESCE(pe.created_at, a.created_at), a.created_at, a.email
             ) AS rn
      FROM rtm_accounts a
      LEFT JOIN rtm_paid_emails pe ON pe.email = a.email
      WHERE a.paid
    )
    UPDATE rtm_accounts a
    SET is_founder = (o.rn <= ${limit}),
        founder_no = CASE WHEN o.rn <= ${limit} THEN o.rn::int ELSE NULL END
    FROM ordered o
    WHERE a.email = o.email
      AND (a.founder_no IS DISTINCT FROM (CASE WHEN o.rn <= ${limit} THEN o.rn::int ELSE NULL END)
           OR a.is_founder IS DISTINCT FROM (o.rn <= ${limit}))`;
}

export function appSecret(): string {
  return cleanEnv(process.env.APP_SECRET) || `fallback:${cleanEnv(process.env.DATABASE_URL) || 'dev'}`;
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().slice(0, 200);
}

export function accountReference(email: string): string {
  const digest = createHmac('sha256', appSecret()).update(normalizeEmail(email)).digest('hex');
  return `acct_${digest}`;
}

export function checkoutUrl(email: string): string {
  const url = new URL(cleanEnv(process.env.STRIPE_PAYMENT_LINK_URL) || DEFAULT_PAYMENT_LINK);
  url.searchParams.set('prefilled_email', normalizeEmail(email));
  url.searchParams.set('client_reference_id', accountReference(email));
  return url.toString();
}

export function stripeClient(): Stripe {
  const key = cleanEnv(process.env.STRIPE_SECRET_KEY) || cleanEnv(process.env.STRIPE);
  if (!key) throw new Error('STRIPE_SECRET_KEY/STRIPE não configurada');
  return new Stripe(key);
}

export function checkoutEmail(session: Stripe.Checkout.Session): string {
  return normalizeEmail(session.customer_details?.email ?? session.customer_email);
}

export function checkoutBelongsToAccount(session: Stripe.Checkout.Session, email: string): boolean {
  const normalizedEmail = normalizeEmail(email);
  return session.client_reference_id === accountReference(normalizedEmail)
    || checkoutEmail(session) === normalizedEmail;
}

export function checkoutIsPaid(session: Stripe.Checkout.Session): boolean {
  return session.mode === 'payment'
    && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
}

export function checkoutHasExpectedPrice(session: Stripe.Checkout.Session): boolean {
  const expectedPrice = cleanEnv(process.env.STRIPE_ACCOUNT_PRICE_ID) || DEFAULT_PRICE_ID;
  return session.line_items?.data.some((item) => item.price?.id === expectedPrice) ?? false;
}

export async function retrieveCheckout(stripe: Stripe, sessionId: string): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
}

export async function findPaidCheckoutForEmail(
  stripe: Stripe,
  email: string,
): Promise<Stripe.Checkout.Session | null> {
  const sessions = await stripe.checkout.sessions.list({
    customer_details: { email: normalizeEmail(email) },
    status: 'complete',
    limit: 100,
    expand: ['data.line_items'],
  });
  return sessions.data.find((session) => checkoutIsPaid(session) && checkoutHasExpectedPrice(session)) ?? null;
}
