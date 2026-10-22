import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  adminPasswordMatches,
  appSecret,
  appSecretConfigured,
  AppSecretMissingError,
  parseAccountToken,
  respondMissingSecret,
  signAccountToken,
  signAdminSession,
  verifyAccountSession,
  verifyAccountToken,
  verifyAdminSession,
  type TokenSql,
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

test('[SEC] sem APP_SECRET o reserva `fallback:${DATABASE_URL}` NÃO vale mais (nem com DATABASE_URL)', () => withEnv(
  { APP_SECRET: undefined, DATABASE_URL: 'postgresql://prod' },
  () => {
    assert.equal(appSecretConfigured(), false);
    assert.throws(() => appSecret(), AppSecretMissingError);
    // token forjado com o reserva legado (quem viu a DATABASE_URL) é recusado
    const body = `admin@example.com|${Math.floor(Date.now() / 1000) + 3600}`;
    const sig = createHmac('sha256', 'fallback:postgresql://prod').update(body).digest('base64url');
    assert.equal(verifyAccountToken(`${Buffer.from(body).toString('base64url')}.${sig}`), null);
    // e com APP_SECRET configurada o token do reserva continua recusado
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

// SQL falso: versão por e-mail (null = sem conta nem cadastro pendente)
const versionSql = (versions: Record<string, number>): TokenSql => (async (_s: TemplateStringsArray, ...vals: unknown[]) => {
  const em = String(vals[0]);
  return em in versions ? [{ v: versions[em], k: 0 }] : [];
}) as TokenSql;

test('[SEC] token_version: token velho morre quando a versão do banco sobe (reset/ativação)', () => withEnv({ APP_SECRET: 'segredo' }, async () => {
  const v0 = signAccountToken('vitima@example.com');
  assert.deepEqual(parseAccountToken(v0), { email: 'vitima@example.com', version: 0 });
  assert.equal(await verifyAccountSession(versionSql({ 'vitima@example.com': 0 }), v0), 'vitima@example.com');
  // ativação/reset subiu a versão: o token do cadastro pendente (do atacante) não vale mais
  assert.equal(await verifyAccountSession(versionSql({ 'vitima@example.com': 1761100000 }), v0), null);
  const fresh = signAccountToken('vitima@example.com', 3600, 1761100000);
  assert.equal(await verifyAccountSession(versionSql({ 'vitima@example.com': 1761100000 }), fresh), 'vitima@example.com');
  // token legado (email|exp, sem versão) = versão 0
  const body = `velho@example.com|${Math.floor(Date.now() / 1000) + 3600}`;
  const legacy = `${Buffer.from(body).toString('base64url')}.${createHmac('sha256', 'segredo').update(body).digest('base64url')}`;
  assert.deepEqual(parseAccountToken(legacy), { email: 'velho@example.com', version: 0 });
  assert.equal(await verifyAccountSession(versionSql({ 'velho@example.com': 5 }), legacy), null);
  // adulterar a versão quebra a assinatura
  const [b64, sig] = fresh.split('.');
  const forged = Buffer.from(Buffer.from(b64, 'base64url').toString().replace(/\|\d+$/, '|0')).toString('base64url');
  assert.equal(parseAccountToken(`${forged}.${sig}`), null);
}));
