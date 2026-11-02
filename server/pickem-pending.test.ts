// Pick'em oficial vale para conta paga E cadastro pendente (Matheus, 02/11):
// paga e pendente salvam, sem cadastro dá 401, o ranking público não leva
// e-mail e editar antes da trava não muda o horário do 1º envio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import handler from '../api/pickem.js';
import { signAccountToken } from './auth.js';
import { FakeNeonHttp, type SeenQuery } from './neon-fetch.mock.js';
import { publicBoard } from './pickem.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

const T = Array.from({ length: 16 }, (_, i) => `t${i}`);
const PICK = { threeZero: ['t0', 't1'], zeroThree: ['t14', 't15'], advance: ['t2', 't3', 't4', 't5', 't6', 't7'] };

function run(body: Record<string, unknown>, who: { paid?: string[]; pending?: string[] }) {
  const inserts: SeenQuery[] = [];
  const fake = new FakeNeonHttp((q) => {
    const t = q.text;
    if (t.includes('rtm_rate_limits')) return [{ count: 1, reset_at: new Date(Date.now() + 3600e3).toISOString() }];
    if (t.startsWith('SELECT nick FROM rtm_accounts')) return (who.paid ?? []).includes(String(q.params[0])) ? [{ nick: 'Pago' }] : [];
    if (t.startsWith('SELECT nick FROM rtm_pending_signups')) return (who.pending ?? []).includes(String(q.params[0])) ? [{ nick: 'Pendente' }] : [];
    if (t.includes('INSERT INTO rtm_pickem_picks')) { inserts.push(q); return [{ saved_at: new Date().toISOString() }]; }
    if (t.includes('FROM rtm_pickem_stages WHERE stage')) return [{ teams: T, locks_at: new Date(Date.now() + 864e5).toISOString(), server_now: new Date().toISOString() }];
    return [];
  });
  const uninstall = fake.install();
  const out: { code: number; body: Record<string, unknown> } = { code: 0, body: {} };
  const res = { status: (c: number) => ({ json: (b: unknown) => { out.code = c; out.body = b as Record<string, unknown>; } }), setHeader: () => {} };
  return handler({ method: 'POST', body, headers: { 'x-forwarded-for': '1.2.3.4' } }, res).then(() => { uninstall(); return { out, inserts }; });
}

test('conta paga salva o palpite', async () => {
  const { out, inserts } = await run({ action: 'save', token: signAccountToken('p@x.com'), stage: 's1', pick: PICK }, { paid: ['p@x.com'] });
  assert.equal(out.code, 200, JSON.stringify(out.body));
  assert.ok(inserts.length, JSON.stringify(out.body)); assert.equal(inserts[0].params.includes('Pago'), true);
});

test('cadastro pendente salva o palpite com o nick do cadastro', async () => {
  const { out, inserts } = await run({ action: 'save', token: signAccountToken('n@x.com'), stage: 's1', pick: PICK }, { pending: ['n@x.com'] });
  assert.equal(out.code, 200, JSON.stringify(out.body));
  assert.equal(inserts[0].params.includes('Pendente'), true);
});

test('sem conta nem cadastro: 401 e nada gravado', async () => {
  const { out, inserts } = await run({ action: 'save', token: signAccountToken('x@x.com'), stage: 's1', pick: PICK }, {});
  assert.equal(out.code, 401);
  assert.equal(inserts.length, 0);
});

test('o rate limit continua antes de gravar', () => {
  const src = readFileSync(new URL('../api/pickem.ts', import.meta.url), 'utf8');
  const save = src.slice(src.indexOf("if (action === 'save')"));
  assert.ok(save.indexOf('rateLimitHit') < save.indexOf('rtm_pending_signups'));
  assert.match(save, /pickem:email:\$\{email\}/);
});

test('ranking público sai só com nick, sem e-mail', () => {
  const pub = publicBoard([{ email: 'n@x.com', nick: 'Pendente', points: 3, savedAt: '2026-11-20T00:00:00Z' } as never]);
  assert.doesNotMatch(JSON.stringify(pub), /@/);
});

test('1 palpite por e-mail e Stage; editar não muda o horário do 1º envio (desempate)', () => {
  const src = readFileSync(new URL('./pickem.ts', import.meta.url), 'utf8');
  assert.match(src, /PRIMARY KEY \(email, stage\)/);
  const upsert = src.slice(src.indexOf('ON CONFLICT (email, stage) DO UPDATE'), src.indexOf('RETURNING saved_at'));
  assert.doesNotMatch(upsert, /saved_at\s*=/);
});
