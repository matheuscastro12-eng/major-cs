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

const { autoOfferAllowed, hasFirstValue, markFirstValue, autoOffersShown, markAutoOfferShown, variantOf, PAYWALL_VARIANTS } = await import('../src/state/paywallPolicy.ts');

const base = { force: false, firstValue: true, moment: 'draft-win', shown: [] as string[], cap: 1, msSinceLast: 60 * 60_000, cooldownMs: 45 * 60_000 };

test('oferta automática: depois do 1º valor, 1x por momento, até o teto e fora do intervalo', () => {
  assert.equal(autoOfferAllowed(base), true);
  assert.equal(autoOfferAllowed({ ...base, firstValue: false }), false, 'antes do 1º valor não abre sozinha');
  assert.equal(autoOfferAllowed({ ...base, shown: ['draft-win'], cap: 3 }), false, 'o mesmo momento não repete');
  assert.equal(autoOfferAllowed({ ...base, shown: ['return'], cap: 1 }), false, 'variante a: teto de 1 por sessão');
  assert.equal(autoOfferAllowed({ ...base, shown: ['return'], cap: 3, cooldownMs: 10 * 60_000, msSinceLast: 11 * 60_000 }), true, 'variante b: outro momento');
  assert.equal(autoOfferAllowed({ ...base, shown: ['return', 'pickem', 'major'], cap: 3, cooldownMs: 0 }), false, 'variante b: teto de 3');
  assert.equal(autoOfferAllowed({ ...base, msSinceLast: 10 * 60_000 }), false, 'dentro do intervalo');
});

test('clique explícito (force) abre sempre', () => {
  assert.equal(autoOfferAllowed({ ...base, force: true, firstValue: false, shown: ['draft-win'], msSinceLast: 0 }), true);
});

test('variante do teto: estável pelo sid, metade/metade, ?pw força', () => {
  assert.equal(variantOf('abc123'), variantOf('abc123'));
  const n = Array.from({ length: 400 }, (_, i) => variantOf(`sid${i}x${i * 7}`)).filter((v) => v === 'a').length;
  assert.ok(n > 140 && n < 260, `a=${n}`);
  assert.equal(variantOf('qualquer', 'b'), 'b');
  assert.deepEqual(PAYWALL_VARIANTS.a.cap, 1);
  assert.deepEqual(PAYWALL_VARIANTS.b.cap, 3);
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

test('momentos já mostrados ficam na sessão', () => {
  assert.deepEqual(autoOffersShown(), []);
  markAutoOfferShown('return');
  markAutoOfferShown('return');
  markAutoOfferShown('pickem');
  assert.deepEqual(autoOffersShown(), ['return', 'pickem']);
  assert.equal(g.sessionStorage.getItem('rtm-paywall-moments'), JSON.stringify(['return', 'pickem']));
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

// [paywall] o Início mostrava várias vitrines e cada uma contava um paywall_view
// (convidado que já jogou: home-rtp + acct-chip-guest na mesma visita).
test('Início: 1 visita = 1 paywall_view (src = vitrine principal, surfaces = todas)', async () => {
  const { trackHomePaywallView } = await import('../src/state/track.ts');
  const { homePaywallSurfaces } = await import('../src/state/paywallPolicy.ts');
  const guest = homePaywallSurfaces({ rtpLocked: true, ultimateLocked: false, freeAccount: false, guest: true });
  assert.deepEqual(guest, ['home-rtp', 'acct-chip-guest']);
  assert.deepEqual(homePaywallSurfaces({ rtpLocked: false, ultimateLocked: false, freeAccount: false, guest: false }), []);
  sent.length = 0;
  trackHomePaywallView([]); // nada na tela: não conta nem queima o dedupe
  trackHomePaywallView(guest);
  trackHomePaywallView(guest); // re-render / StrictMode
  trackHomePaywallView(['home-pill']); // conta carregou no meio da visita
  await new Promise((r) => setTimeout(r, 0));
  const views = sent.filter((e) => e.type === 'paywall_view');
  assert.equal(views.length, 1);
  assert.equal(views[0].data.src, 'home-rtp');
  assert.equal(views[0].data.surfaces, 'home-rtp,acct-chip-guest');
});
