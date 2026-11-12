import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePaywallGate, parseGate, readPaywallGate } from '../server/paywall-gate.ts';
import { rtpDemoLocked, majorPhaseLocked, pickemStageLocked, gateTag } from '../src/state/paywallGate.ts';

test('flag: padrão OFF, banco vence env', () => {
  assert.equal(resolvePaywallGate(null, undefined), false);
  assert.equal(resolvePaywallGate(null, 'on'), true);
  assert.equal(resolvePaywallGate('off', 'on'), false);
  assert.equal(resolvePaywallGate('on', 'off'), true);
  assert.equal(resolvePaywallGate('lixo', 'lixo'), false);
  assert.equal(parseGate(' TRUE '), 'on');
});

test('flag: tabela ausente não derruba (OFF)', async () => {
  const sql = (async () => { throw new Error('relation "rtm_settings" does not exist'); }) as never;
  assert.equal(await readPaywallGate(sql, undefined), false);
  const sqlOn = (async () => [{ value: 'on' }]) as never;
  assert.equal(await readPaywallGate(sqlOn, undefined), true);
});

test('RtP demo NÃO trava por partidas (paywall é o fim da semana 3), com ou sem flag', () => {
  for (const gate of [true, false]) for (const n of [0, 1, 2, 9, 50]) assert.equal(rtpDemoLocked(gate, true, n), false);
});

test('Major: Stage 1 grátis, resto trava para não pagante', () => {
  assert.equal(majorPhaseLocked(true, false, 1), false);
  assert.equal(majorPhaseLocked(true, false, 2), true);
  assert.equal(majorPhaseLocked(true, false, 4), true);
  assert.equal(majorPhaseLocked(true, true, 4), false);
  assert.equal(majorPhaseLocked(false, false, 4), false);
  // pick'em: nunca trava, nem com flag
  for (const st of [0, 1, 2, 3]) assert.equal(pickemStageLocked(true, false, st), false);
  assert.equal(gateTag(true), 'on');
});

import { renderReminderEmail, REMINDER_SEND_ENABLED, listReminderCandidates } from '../server/abandoned-checkout.ts';

test('lembrete: desligado, com preço recebido e escape de html', async () => {
  assert.equal(REMINDER_SEND_ENABLED, false);
  const m = renderReminderEmail({ nick: '<b>x</b>', price: 'R$ 9,99', link: 'https://x', unsubscribe: 'https://u' });
  assert.match(m.text, /R\$ 9,99/);
  assert.ok(!m.html.includes('<b>x</b>'));
  let calls = 0;
  const sql = (async () => { calls++; if (calls === 1) throw new Error('no rtm_checkout_reminders'); return [{ email: 'a@b.co', nick: 'A', created_at: 't' }, { email: 'lixo' }]; }) as never;
  const r = await listReminderCandidates(sql);
  assert.equal(r.reminderTable, false);
  assert.deepEqual(r.candidates.map((c) => c.email), ['a@b.co']);
});
