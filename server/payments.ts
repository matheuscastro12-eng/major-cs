import type { NeonQueryFunction } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import { appSecret } from './auth.js';

const DEFAULT_PAYMENT_LINK = 'https://buy.stripe.com/4gM3cv4zGa2Vfcx5jQ1RC01';
export const DEFAULT_PRICE_ID = 'price_1Tkp7NEHvCNyCbcUcYzHFZvK';

export const cleanEnv = (value?: string): string => value?.replace(/^\uFEFF/, '').trim() ?? '';

// teto do selo de Fundador (numerados; o resto paga e joga, s\u00F3 n\u00E3o ganha n\u00FAmero).
export const founderLimit = (): number => Number(cleanEnv(process.env.FOUNDER_LIMIT) || '500') || 500;

// cliente sql do neon (template tag + transaction), o mesmo das rotas.
type FounderSql = NeonQueryFunction<false, false>;

// Numeração de FUNDADOR estável (O0-42/ECON-13). Antes o renumber reordenava
// TODOS os pagos a cada pagamento, revogação ou grant: um revoke deslocava todo
// mundo depois dele e podia tirar o selo do #500, que é o que foi vendido.
// Agora:
// - founder_no é atribuído UMA vez (MAX+1 sob advisory lock), na ordem do
//   pagamento, só pra quem ainda não tem número; número dado nunca muda;
// - o teto vale pro MAIOR número emitido: número de conta revogada fica
//   aposentado (não volta pra fila) e o #500 é o último pra sempre;
// - conta concedida pelo admin (payment_method 'admin') não consome vaga;
// - quem tem número e voltou a ser pago recupera o selo (is_founder).
// Idempotente e barato quando não há ninguém sem número (UPDATE de 0 linhas).
export async function assignFounderNumbers(sql: FounderSql, limit = founderLimit()): Promise<void> {
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('rtm_founder_no'))`,
    sql`
      WITH base AS (SELECT COALESCE(MAX(founder_no), 0) AS top FROM rtm_accounts),
      queue AS (
        SELECT a.email,
               row_number() OVER (ORDER BY COALESCE(pe.created_at, a.created_at), a.created_at, a.email) AS rn
        FROM rtm_accounts a
        LEFT JOIN rtm_paid_emails pe ON pe.email = a.email
        WHERE a.paid AND a.founder_no IS NULL AND COALESCE(a.payment_method, '') <> 'admin'
      )
      UPDATE rtm_accounts a
      SET founder_no = (base.top + q.rn)::int, is_founder = true
      FROM queue q, base
      WHERE a.email = q.email AND base.top + q.rn <= ${limit}`,
    sql`UPDATE rtm_accounts SET is_founder = true WHERE paid AND founder_no IS NOT NULL AND NOT COALESCE(is_founder, false)`,
  ]);
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().slice(0, 200);
}

// assinado com o segredo de server/auth.ts (falha fechada: sem APP_SECRET, lança).
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

// ── Passe Premium do Ultimate (dinheiro real, R$ 30,00) ──────────────────────
// O pedido REUSA rtm_coin_orders com tier "pass-s<N>" (coins=0, cents=3000):
// o ciclo pending → paid (webhook) → claimed é idêntico ao de coins, e o N do
// tier grava a TEMPORADA comprada (o premium do passe vale só naquela season).
// O correlationID mantém o prefixo "ultcoins:" — é ele que roteia os webhooks
// (Stripe/Woovi) pro caminho de pedidos sem NENHUMA mudança no caminho feliz.
// Stripe usa Checkout Session dinâmica (price_data em BRL) igual aos coins —
// não há price id pra configurar no dashboard.
export const PASS_PRICE_CENTS = 3000; // R$ 30,00

export function passTier(season: number): string {
  return `pass-s${Math.floor(season)}`;
}

// temporada de um tier de passe ("pass-s3" → 3), ou null se não for de passe.
export function parsePassTier(tier: string): number | null {
  const m = /^pass-s(\d+)$/.exec(tier ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Tiers de coins do Ultimate (Pix via Woovi ou cartão via Stripe). Valor cresce
// por real gasto pra recompensar o tier maior: R$10 → 30k, R$15 → 50k (+11%),
// R$30 → 120k (+33%). Fonte única: api/account.ts cobra e o woovi-webhook
// reconstrói pedido órfão com os MESMOS valores (antes era uma cópia à mão).
export const COIN_TIERS: Record<string, { cents: number; coins: number; label: string }> = {
  p10: { cents: 1000, coins: 30000, label: 'Pacote Arsenal' },
  p15: { cents: 1500, coins: 50000, label: 'Pacote Elite' },
  p30: { cents: 3000, coins: 120000, label: 'Pacote Lendário' },
};

// preço da conta vitalícia no Pix, em CENTAVOS (R$20 = 2000). Editável por
// PIX_PRICE_CENTS; a action 'pix' cobra isso e o webhook exige pelo menos isso.
export const pixAccountPriceCents = (): number => Number(cleanEnv(process.env.PIX_PRICE_CENTS) || '2000') || 2000;

// Base do success_url/cancel_url do checkout (O0-40/ECON-11). Antes qualquer
// origin https do body servia: um link de golpe criava um checkout legítimo da
// Stripe que, depois do pagamento, mandava a vítima pro domínio do golpista.
// Agora só o domínio oficial, o próprio deploy (VERCEL_URL/VERCEL_BRANCH_URL,
// que a Vercel injeta — cobre os previews), os de APP_ORIGINS (lista separada
// por vírgula) e localhost fora de produção; o resto cai no oficial.
export const OFFICIAL_ORIGIN = 'https://roadtomajor.com.br';
export function checkoutBase(origin: unknown): string {
  const raw = String(origin ?? '').trim().replace(/\/+$/, '');
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return OFFICIAL_ORIGIN; }
  // só a origem (sem path, query, user:senha@) — e comparada por igualdade exata
  const clean = parsed.origin;
  const allowed = new Set([
    OFFICIAL_ORIGIN,
    'https://www.roadtomajor.com.br',
    ...[process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].map(cleanEnv).filter(Boolean).map((h) => `https://${h}`),
    ...cleanEnv(process.env.APP_ORIGINS).split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
  ]);
  if (allowed.has(clean)) return clean;
  if (process.env.VERCEL_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return clean;
  return OFFICIAL_ORIGIN;
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
