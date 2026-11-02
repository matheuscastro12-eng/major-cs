// Tela do QR Pix da vitalícia (PixPanel): qual vista mostrar, o prazo do Woovi,
// a contagem regressiva e o tipo de erro ao gerar a cobrança.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPixCountdown, pixCanRegenerate, pixErrorKind, pixExpiresAt, pixPanelView, type PixPanelInput,
} from '../src/state/pixView.ts';

const T0 = Date.UTC(2026, 9, 30, 15, 0, 0);
const base: PixPanelInput = { hasCharge: true, hasCode: true, generating: false, error: false, expiresAt: null, now: T0 };

test('prazo: segundos do Woovi viram instante; sem prazo válido é null', () => {
  assert.equal(pixExpiresAt(T0, 900), T0 + 900_000);
  assert.equal(pixExpiresAt(T0, 86_400), T0 + 86_400_000);
  assert.equal(pixExpiresAt(T0, null), null);
  assert.equal(pixExpiresAt(T0, undefined), null);
  assert.equal(pixExpiresAt(T0, 0), null);
  assert.equal(pixExpiresAt(T0, -5), null);
  assert.equal(pixExpiresAt(T0, Number.NaN), null);
});

test('contagem: m:ss abaixo de 1h, XhMM acima, arredonda pra cima', () => {
  assert.equal(formatPixCountdown(14 * 60_000 + 32_000), '14:32');
  assert.equal(formatPixCountdown(14 * 60_000 + 31_200), '14:32'); // 14:31,2 ainda mostra 14:32
  assert.equal(formatPixCountdown(61_000), '1:01');
  assert.equal(formatPixCountdown(9_000), '0:09');
  assert.equal(formatPixCountdown(500), '0:01');               // ainda não expirou
  assert.equal(formatPixCountdown(0), '0:00');
  assert.equal(formatPixCountdown(-3_000), '0:00');
  assert.equal(formatPixCountdown(59 * 60_000 + 59_000), '59:59');
  assert.equal(formatPixCountdown(3_600_000), '1h00');
  assert.equal(formatPixCountdown(23 * 3_600_000 + 59 * 60_000 + 30_000), '23h59');
  assert.equal(formatPixCountdown(86_400_000), '24h00');
});

test('erro ao gerar: rede, sessão e o resto (Woovi/servidor)', () => {
  assert.equal(pixErrorKind(0), 'offline');
  assert.equal(pixErrorKind(401), 'session');
  assert.equal(pixErrorKind(500), 'provider');
  assert.equal(pixErrorKind(502), 'provider');
  assert.equal(pixErrorKind(429), 'provider');
});

test('vista: gerando a 1ª vez é loading; falhou sem cobrança é erro', () => {
  assert.equal(pixPanelView({ ...base, hasCharge: false, generating: true }), 'loading');
  assert.equal(pixPanelView({ ...base, hasCharge: false }), 'loading'); // auto-Pix ainda não saiu
  assert.equal(pixPanelView({ ...base, hasCharge: false, error: true }), 'error');
  // "Tentar de novo" depois do erro: volta pro loading enquanto gera
  assert.equal(pixPanelView({ ...base, hasCharge: false, error: true, generating: true }), 'loading');
});

test('vista: cobrança sem copia-e-cola nem QR é erro', () => {
  assert.equal(pixPanelView({ ...base, hasCode: false }), 'error');
});

test('vista: pronta até o prazo e expirada a partir dele', () => {
  const expiresAt = T0 + 900_000;
  assert.equal(pixPanelView({ ...base }), 'ready'); // sem prazo do Woovi: nunca expira na tela
  assert.equal(pixPanelView({ ...base, expiresAt, now: expiresAt - 1 }), 'ready');
  assert.equal(pixPanelView({ ...base, expiresAt, now: expiresAt }), 'expired');
  // gerando de novo: o código vencido fica até o novo chegar
  assert.equal(pixPanelView({ ...base, expiresAt, now: expiresAt + 5_000, generating: true }), 'expired');
});

test('gerar de novo só com o código expirado ou com erro', () => {
  assert.equal(pixCanRegenerate('ready', false), false);
  assert.equal(pixCanRegenerate('loading', false), false);
  assert.equal(pixCanRegenerate('expired', false), true);
  assert.equal(pixCanRegenerate('error', false), true);
  assert.equal(pixCanRegenerate('expired', true), true);
  assert.equal(pixCanRegenerate('loading', true), true);
});
