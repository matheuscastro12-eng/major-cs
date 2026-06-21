import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import stripeWebhook from '../api/stripe-webhook.js';
import {
  accountReference,
  checkoutBelongsToAccount,
  checkoutHasExpectedPrice,
  checkoutIsPaid,
  checkoutUrl,
  DEFAULT_PRICE_ID,
  findPaidCheckoutForEmail,
} from './payments.js';

const session = (overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session => ({
  id: 'cs_test_123',
  mode: 'payment',
  payment_status: 'paid',
  line_items: {
    object: 'list',
    data: [{ price: { id: DEFAULT_PRICE_ID } } as Stripe.LineItem],
    has_more: false,
    url: '/v1/checkout/sessions/cs_test_123/line_items',
  },
  ...overrides,
} as Stripe.Checkout.Session);

test('account reference is deterministic and accepted by Payment Links', () => {
  const ref = accountReference(' Player@Example.COM ');
  assert.equal(ref, accountReference('player@example.com'));
  assert.match(ref, /^acct_[a-f0-9]{64}$/);
});

test('checkout URL carries an opaque account reference', () => {
  const url = new URL(checkoutUrl('player@example.com'));
  assert.equal(url.searchParams.get('prefilled_email'), 'player@example.com');
  assert.equal(url.searchParams.get('client_reference_id'), accountReference('player@example.com'));
  assert.doesNotMatch(url.searchParams.get('client_reference_id') ?? '', /@/);
});

test('only paid one-time checkout sessions are fulfillable', () => {
  assert.equal(checkoutIsPaid(session()), true);
  assert.equal(checkoutIsPaid(session({ payment_status: 'unpaid' })), false);
  assert.equal(checkoutIsPaid(session({ mode: 'subscription' })), false);
});

test('checkout must contain the account price', () => {
  assert.equal(checkoutHasExpectedPrice(session()), true);
  assert.equal(checkoutHasExpectedPrice(session({ line_items: undefined })), false);
  assert.equal(checkoutHasExpectedPrice(session({
    line_items: {
      object: 'list', data: [{ price: { id: 'price_other' } } as Stripe.LineItem], has_more: false, url: '',
    },
  })), false);
});

test('checkout must belong to the authenticated account', () => {
  assert.equal(checkoutBelongsToAccount(session({
    client_reference_id: accountReference('account@example.com'),
    customer_details: { email: 'receipt@example.com' } as NonNullable<Stripe.Checkout.Session['customer_details']>,
  }), 'account@example.com'), true);
  assert.equal(checkoutBelongsToAccount(session({
    client_reference_id: 'legacy_nick',
    customer_details: { email: 'account@example.com' } as NonNullable<Stripe.Checkout.Session['customer_details']>,
  }), 'account@example.com'), true);
  assert.equal(checkoutBelongsToAccount(session({
    client_reference_id: 'legacy_nick',
    customer_details: { email: 'other@example.com' } as NonNullable<Stripe.Checkout.Session['customer_details']>,
  }), 'account@example.com'), false);
});

test('reconciliation filters by email and returns only the account product', async () => {
  const wrongProduct = session({
    id: 'cs_wrong',
    line_items: { object: 'list', data: [{ price: { id: 'price_other' } } as Stripe.LineItem], has_more: false, url: '' },
  });
  const expected = session({ id: 'cs_expected' });
  const stripe = {
    checkout: {
      sessions: {
        list: async (params: Stripe.Checkout.SessionListParams) => {
          assert.equal(params.customer_details?.email, 'account@example.com');
          assert.equal(params.status, 'complete');
          return { data: [wrongProduct, expected] };
        },
      },
    },
  } as unknown as Stripe;
  assert.equal((await findPaidCheckoutForEmail(stripe, ' Account@Example.com '))?.id, 'cs_expected');
});

test('webhook rejects altered payloads and accepts a valid Stripe signature', async () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    stripeKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
  process.env.DATABASE_URL = 'postgresql://unused-for-this-event';
  process.env.STRIPE_SECRET_KEY = 'sk_test_signature_only';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

  try {
    const payload = JSON.stringify({
      id: 'evt_test_123',
      object: 'event',
      type: 'customer.created',
      data: { object: { id: 'cus_test_123', object: 'customer' } },
    });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const valid = await stripeWebhook.fetch(new Request('https://example.com/api/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: payload,
    }));
    assert.equal(valid.status, 200);

    const altered = await stripeWebhook.fetch(new Request('https://example.com/api/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: `${payload} `,
    }));
    assert.equal(altered.status, 400);
  } finally {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.stripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous.stripeKey;
    if (previous.webhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous.webhookSecret;
  }
});
