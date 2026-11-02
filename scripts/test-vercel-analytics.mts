// Vercel Web Analytics: a URL que sai para a Vercel leva só o caminho e a
// atribuição (ref/utm_*). Sessão do Stripe, palpite, liga e hash nunca saem;
// admin não é contado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactAnalyticsUrl } from '../src/state/vercelAnalytics.ts';

const O = 'https://roadtomajor.com.br';

test('mantém caminho e atribuição', () => {
  assert.equal(redactAnalyticsUrl(`${O}/major-singapore?ref=x-post&utm_source=x&utm_campaign=major`), `${O}/major-singapore?ref=x-post&utm_source=x&utm_campaign=major`);
  assert.equal(redactAnalyticsUrl(`${O}/jogar`), `${O}/jogar`);
});

test('tira sessão do Stripe, palpite, liga e hash', () => {
  assert.equal(redactAnalyticsUrl(`${O}/?cs=cs_live_abc123&ref=home`), `${O}/?ref=home`);
  assert.equal(redactAnalyticsUrl(`${O}/major-singapore?p=AbCdEf&liga=XYZ12#topo`), `${O}/major-singapore`);
});

test('admin e URL inválida não são enviados', () => {
  assert.equal(redactAnalyticsUrl(`${O}/admin`), null);
  assert.equal(redactAnalyticsUrl(`${O}/admin/receita?x=1`), null);
  assert.equal(redactAnalyticsUrl('não é url'), null);
});
