// Medição do Modo Major e da ativação: todo evento que o cliente envia existe na
// allowlist do servidor, o dedupe é por superfície, o paywall_view diz o que
// disparou a oferta e o first_match_done mede o tempo até o 1º valor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstMatchPayload, onceKey, paywallTrigger, pixStep, setPixStep, trackCheckoutAbandon, trackCheckoutOpen, trackPixCopy } from '../src/state/track.ts';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // fileURLToPath: pasta com espaço (test-paths-with-spaces)
const client = readFileSync(ROOT + 'src/state/track.ts', 'utf8');
const server = readFileSync(ROOT + 'api/track.ts', 'utf8');

function setLiteral(src: string, name: string): string[] {
  const at = src.indexOf(`const ${name} = new Set([`);
  assert.ok(at >= 0, `${name} não encontrado`);
  const body = src.slice(at, src.indexOf(']);', at));
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('todo tipo do funil do cliente está na allowlist do servidor (senão vira 400)', () => {
  const allowed = new Set(setLiteral(server, 'ALLOWED_TYPES'));
  const missing = setLiteral(client, 'FUNNEL_TYPES').filter((t) => !allowed.has(t));
  assert.deepEqual(missing, []);
});

test('os eventos novos do Major e da ativação estão liberados no cliente', () => {
  const funnel = new Set(setLiteral(client, 'FUNNEL_TYPES'));
  for (const t of ['major_sg_view', 'major_vitrine_click', 'major_pickem_submit', 'major_sg_campaign_done', 'first_match_done']) {
    assert.ok(funnel.has(t), t);
  }
});

test('dedupe por sessão separa as superfícies do mesmo evento', () => {
  assert.equal(onceKey('major_vitrine_click', { surface: 'sidebar' }), 'major_vitrine_click:sidebar');
  assert.notEqual(onceKey('major_vitrine_click', { surface: 'sidebar' }), onceKey('major_vitrine_click', { surface: 'palette' }));
  assert.equal(onceKey('major_sg_view', { shared: 1 }), 'major_sg_view');
});

test('paywall_view: trava, dentro do checkout ou vitrine', () => {
  assert.equal(paywallTrigger('rtp-demo-gate'), 'gate');
  assert.equal(paywallTrigger('mkt-lock'), 'gate');
  assert.equal(paywallTrigger('pix-wait-longo'), 'checkout');
  assert.equal(paywallTrigger('checkout-nudge'), 'checkout');
  assert.equal(paywallTrigger('upsell-nudge'), 'checkout'); // nudge do Pix no card de upsell (#89)
  assert.equal(paywallTrigger('landing'), 'surface');
  assert.equal(paywallTrigger('src-que-ainda-nao-existe'), 'surface');
});

test('first_match_done: segundos desde a 1ª visita, sem nada pessoal', () => {
  const t0 = Date.UTC(2026, 10, 2, 12);
  assert.deepEqual(firstMatchPayload('major', t0, t0 + 95_400), { mode: 'major', secs: 95 });
  assert.deepEqual(firstMatchPayload('draft', null, t0), { mode: 'draft', secs: null });
  assert.deepEqual(firstMatchPayload('draft', t0 + 1, t0), { mode: 'draft', secs: null }); // relógio voltou
  assert.deepEqual(Object.keys(firstMatchPayload('ultimate', t0, t0)).sort(), ['mode', 'secs']);
});

test('passo do Pix: a vista da PixPanel vira o step do abandono', () => {
  assert.equal(pixStep({ view: 'loading', error: false, waitLong: false }), 'gerando');
  assert.equal(pixStep({ view: 'ready', error: false, waitLong: false }), 'qr');
  assert.equal(pixStep({ view: 'ready', error: false, waitLong: true }), 'espera');
  assert.equal(pixStep({ view: 'expired', error: false, waitLong: true }), 'expirou');
  assert.equal(pixStep({ view: 'error', error: false, waitLong: false }), 'erro');
  assert.equal(pixStep({ view: 'loading', error: true, waitLong: false }), 'erro'); // "Tentar de novo" com a falha na tela
});

test('pix_copy_click 1x de cada por abertura e checkout_abandon com step/copied', async () => {
  const sent: { type: string; data: Record<string, unknown> }[] = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response('{}');
  }) as typeof fetch;
  try {
    trackCheckoutOpen('pix');
    setPixStep('qr');
    trackPixCopy(false);
    trackPixCopy(true);
    trackPixCopy(true); // 2º toque no mesmo QR não gera outro evento
    setPixStep('espera');
    trackCheckoutAbandon('pix', 41.6);
    trackCheckoutOpen('pix'); // abertura nova: o "copiou" da anterior não vaza
    setPixStep('expirou');
    trackCheckoutAbandon('pix', 900);
    trackCheckoutAbandon('stripe', 3); // só o Pix leva o passo
  } finally { globalThis.fetch = prev; }
  const types = sent.map((e) => e.type);
  assert.deepEqual(types, ['checkout_open', 'pix_copy_click', 'pix_copy_click', 'checkout_abandon', 'checkout_open', 'checkout_abandon', 'checkout_abandon']);
  assert.deepEqual(sent.filter((e) => e.type === 'pix_copy_click').map((e) => e.data.ok), [false, true]);
  const [a1, a2, a3] = sent.filter((e) => e.type === 'checkout_abandon').map((e) => e.data);
  assert.deepEqual({ step: a1.step, copied: a1.copied, copyFailed: a1.copyFailed, secondsOpen: a1.secondsOpen }, { step: 'espera', copied: true, copyFailed: true, secondsOpen: 42 });
  assert.deepEqual({ step: a2.step, copied: a2.copied, copyFailed: a2.copyFailed }, { step: 'expirou', copied: false, copyFailed: false });
  assert.equal(a3.step, undefined);
});

test('pix_copy_click está liberado no cliente e no servidor', () => {
  assert.ok(setLiteral(client, 'FUNNEL_TYPES').includes('pix_copy_click'));
  assert.ok(setLiteral(server, 'ALLOWED_TYPES').includes('pix_copy_click'));
});
