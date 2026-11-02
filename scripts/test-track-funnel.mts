// Medição do Modo Major e da ativação: todo evento que o cliente envia existe na
// allowlist do servidor, o dedupe é por superfície, o paywall_view diz o que
// disparou a oferta e o first_match_done mede o tempo até o 1º valor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstMatchPayload, onceKey, paywallTrigger } from '../src/state/track.ts';

const ROOT = new URL('..', import.meta.url).pathname;
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
