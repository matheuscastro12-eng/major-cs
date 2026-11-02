import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  adminPasswordMatches,
  appSecret,
  AppSecretMissingError,
  respondMissingSecret,
  signAccountToken,
  signAdminSession,
  verifyAccountToken,
  verifyAdminSession,
} from './auth.js';
import { accountReference } from './payments.js';
import cloudSave from '../api/cloud-save.js';

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } };
  try {
    const r = fn();
    if (r instanceof Promise) return r.finally(restore);
    restore();
  } catch (e) { restore(); throw e; }
}

function fakeRes() {
  const out = { code: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  return {
    out,
    res: {
      status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b; } }),
      setHeader: (k: string, v: string) => { out.headers[k] = v; },
    },
  };
}

test('sem APP_SECRET e sem DATABASE_URL: nada é assinado nem aceito (falha fechada)', () => withEnv(
  { APP_SECRET: undefined, DATABASE_URL: undefined },
  () => {
    assert.throws(() => appSecret(), AppSecretMissingError);
    assert.throws(() => signAccountToken('a@b.com'), AppSecretMissingError);
    assert.throws(() => accountReference('a@b.com'), AppSecretMissingError);
    assert.equal(verifyAccountToken('YUBiLmNvbXw5OTk5OTk5OTk5.qualquer'), null);
    assert.equal(verifyAdminSession('adm.x.y'), null);
  },
));

test('HOTFIX: sem APP_SECRET, usa o reserva legado e aceita os tokens já em circulação', () => withEnv(
  { APP_SECRET: undefined, DATABASE_URL: 'postgresql://prod' },
  () => {
    assert.equal(appSecret(), 'fallback:postgresql://prod');
    // token assinado do jeito antigo (api/account.ts em 7e4fba8) continua valendo
    const body = `jogador@example.com|${Math.floor(Date.now() / 1000) + 3600}`;
    const sig = createHmac('sha256', 'fallback:postgresql://prod').update(body).digest('base64url');
    assert.equal(verifyAccountToken(`${Buffer.from(body).toString('base64url')}.${sig}`), 'jogador@example.com');
    // e com APP_SECRET configurada ela vence o reserva
    process.env.APP_SECRET = 'novo';
    assert.equal(appSecret(), 'novo');
    assert.equal(verifyAccountToken(`${Buffer.from(body).toString('base64url')}.${sig}`), null);
  },
));

test('respondMissingSecret responde 500 sem APP_SECRET e deixa passar com ela', () => {
  withEnv({ APP_SECRET: undefined, DATABASE_URL: undefined }, () => {
    const { out, res } = fakeRes();
    assert.equal(respondMissingSecret(res), true);
    assert.equal(out.code, 500);
  });
  withEnv({ APP_SECRET: 's3cret' }, () => {
    const { out, res } = fakeRes();
    assert.equal(respondMissingSecret(res), false);
    assert.equal(out.code, 0);
  });
});

test('rota com token (cloud-save) responde 500 sem APP_SECRET e sem reserva, antes de tocar no banco', () => withEnv(
  { APP_SECRET: undefined, DATABASE_URL: undefined },
  async () => {
    const { out, res } = fakeRes();
    await cloudSave({ method: 'POST', body: { action: 'pull', token: 'x.y' }, headers: {} }, res);
    assert.equal(out.code, 500);
  },
));

test('token de conta: roundtrip, adulteração, expiração e troca de segredo', () => withEnv({ APP_SECRET: 'segredo-1' }, () => {
  const t = signAccountToken('player@example.com');
  assert.equal(verifyAccountToken(t), 'player@example.com');
  const [b64, sig] = t.split('.');
  const forged = Buffer.from('admin@example.com|9999999999').toString('base64url');
  assert.equal(verifyAccountToken(`${forged}.${sig}`), null);
  assert.equal(verifyAccountToken(`${b64}.${sig}x`), null);
  assert.equal(verifyAccountToken(signAccountToken('old@example.com', -10)), null);
  assert.equal(verifyAccountToken(''), null);
  process.env.APP_SECRET = 'segredo-2';
  assert.equal(verifyAccountToken(t), null);
}));

test('sessão de admin não se confunde com token de conta', () => withEnv({ APP_SECRET: 'segredo' }, () => {
  const adm = signAdminSession('boss@example.com');
  assert.ok(adm.startsWith('adm.'));
  assert.equal(verifyAdminSession(adm), 'boss@example.com');
  // token de conta comum nunca vale como sessão de admin
  assert.equal(verifyAdminSession(signAccountToken('boss@example.com')), null);
  assert.equal(verifyAdminSession(`adm.${signAccountToken('boss@example.com')}`), null);
  // e a sessão de admin não vale como token de conta
  assert.equal(verifyAccountToken(adm), null);
  assert.equal(verifyAdminSession(signAdminSession('boss@example.com', -1)), null);
}));

test('senha mestra: comparação exata, sem aceitar vazio nem env ausente', () => {
  withEnv({ ADMIN_PASSWORD: 'correct horse' }, () => {
    assert.equal(adminPasswordMatches('correct horse'), true);
    assert.equal(adminPasswordMatches('  correct horse  '), true);
    assert.equal(adminPasswordMatches('correct hors'), false);
    assert.equal(adminPasswordMatches(''), false);
    assert.equal(adminPasswordMatches(undefined), false);
  });
  withEnv({ ADMIN_PASSWORD: undefined }, () => {
    assert.equal(adminPasswordMatches(''), false);
    assert.equal(adminPasswordMatches('undefined'), false);
  });
});
