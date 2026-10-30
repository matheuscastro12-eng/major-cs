// Paywall sem repetição (state/paywallPolicy.ts + trackPaywallView): a oferta
// que aparece sozinha só vem depois do 1º valor e no máximo 1x por sessão; o
// paywall_view conta cada superfície 1x por sessão do navegador.
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage/sessionStorage de mentira (o Node não tem)
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const g = globalThis as unknown as { localStorage: MemStorage; sessionStorage: MemStorage; fetch: unknown };
g.localStorage = new MemStorage();
g.sessionStorage = new MemStorage();
const sent: { type: string; data: Record<string, unknown> }[] = [];
g.fetch = async (_url: string, init?: { body?: string }) => {
  try { const b = JSON.parse(init?.body ?? '{}'); sent.push({ type: b.type, data: b.data ?? {} }); } catch { /* ignora */ }
  return { ok: true, json: async () => ({}) };
};

const { autoOfferAllowed, hasFirstValue, markFirstValue, autoOfferUsed, markAutoOfferUsed } = await import('../src/state/paywallPolicy.ts');

const base = { force: false, firstValue: true, usedThisSession: false, msSinceLast: 60 * 60_000, cooldownMs: 45 * 60_000 };

test('oferta automática: só depois do 1º valor, 1x por sessão e fora do cooldown', () => {
  assert.equal(autoOfferAllowed(base), true);
  assert.equal(autoOfferAllowed({ ...base, firstValue: false }), false, 'antes da 1ª partida não abre sozinha');
  assert.equal(autoOfferAllowed({ ...base, usedThisSession: true }), false, 'segunda interrupção na mesma sessão');
  assert.equal(autoOfferAllowed({ ...base, msSinceLast: 10 * 60_000 }), false, 'dentro dos 45 min');
});

test('clique explícito (force) abre sempre', () => {
  assert.equal(autoOfferAllowed({ force: true, firstValue: false, usedThisSession: true, msSinceLast: 0, cooldownMs: 45 * 60_000 }), true);
});

test('1º valor: pick\'em, pacote ou a 1ª série (flag do first_match_done)', () => {
  g.localStorage.clear();
  assert.equal(hasFirstValue(), false);
  g.localStorage.setItem('rtm-first-match', '1');
  assert.equal(hasFirstValue(), true, 'quem já concluiu uma série');
  g.localStorage.clear();
  markFirstValue('pickem');
  assert.equal(g.localStorage.getItem('rtm-first-value'), 'pickem');
  markFirstValue('pack');
  assert.equal(g.localStorage.getItem('rtm-first-value'), 'pickem', 'só o primeiro fica gravado');
  assert.equal(hasFirstValue(), true);
});

test('a interrupção automática da sessão fica marcada', () => {
  assert.equal(autoOfferUsed(), false);
  markAutoOfferUsed();
  assert.equal(autoOfferUsed(), true);
  assert.equal(g.sessionStorage.getItem('rtm-paywall-auto'), '1');
});

test('paywall_view: cada superfície 1x por sessão, mantendo {src, surface, trigger}', async () => {
  const { trackPaywallView } = await import('../src/state/track.ts');
  sent.length = 0;
  trackPaywallView('home-rtp');
  trackPaywallView('home-rtp');
  trackPaywallView('rtp-demo-gate');
  await new Promise((r) => setTimeout(r, 0));
  const views = sent.filter((e) => e.type === 'paywall_view');
  assert.deepEqual(views.map((e) => e.data.src), ['home-rtp', 'rtp-demo-gate']);
  assert.deepEqual(views[0].data, { ...views[0].data, src: 'home-rtp', surface: 'home-rtp', trigger: 'surface' });
  assert.equal(views[1].data.trigger, 'gate');
  // a sessão guarda o dedupe (F5 não conta de novo)
  assert.ok((g.sessionStorage.getItem('rtm-once') ?? '').includes('paywall_view:home-rtp'));
});
