// Cabeçalhos de segurança do vercel.json e o coletor da CSP Report-Only (O1-11).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import errorRoute from '../api/error.js';
import { __resetCspDedupeForTests, cspReportToError, cspSeenRecently } from './csp-report.js';
import { FakeNeonHttp } from './neon-fetch.mock.js';

process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

interface HeaderRule { source: string; headers: { key: string; value: string }[] }
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { headers: HeaderRule[] };

function globalHeaders(): Map<string, string> {
  const rule = vercel.headers.find((h) => h.source === '/(.*)');
  assert.ok(rule, 'regra de cabeçalhos pra todas as rotas');
  return new Map(rule.headers.map((h) => [h.key, h.value]));
}

test('vercel.json: nosniff, Referrer-Policy e anti-clickjacking valem de verdade', () => {
  const h = globalHeaders();
  assert.equal(h.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(h.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  // frame-ancestors é ignorado em Report-Only: o X-Frame-Options é quem bloqueia o iframe hoje
  assert.equal(h.get('X-Frame-Options'), 'DENY');
  assert.match(h.get('Permissions-Policy') ?? '', /camera=\(\)/);
});

test('vercel.json: CSP ainda em Report-Only, estrita e com report-uri', () => {
  const h = globalHeaders();
  // trocar pra Content-Security-Policy é decisão consciente, depois de ler os relatórios
  assert.equal(h.has('Content-Security-Policy'), false);
  const csp = h.get('Content-Security-Policy-Report-Only') ?? '';
  const dirs = new Map(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...vals] = d.split(/\s+/);
    return [name, vals] as const;
  }));
  assert.deepEqual(dirs.get('default-src'), ["'self'"]);
  assert.deepEqual(dirs.get('object-src'), ["'none'"]);
  assert.deepEqual(dirs.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(dirs.get('base-uri'), ["'self'"]);
  const script = dirs.get('script-src') ?? [];
  assert.ok(script.includes("'self'"));
  assert.ok(!script.includes("'unsafe-inline'") && !script.includes("'unsafe-eval'"), 'script sem inline/eval');
  assert.ok(script.includes('https://platform.twitter.com'), 'embed do X');
  assert.ok((dirs.get('style-src') ?? []).includes('https://fonts.googleapis.com'));
  assert.ok((dirs.get('font-src') ?? []).includes('https://fonts.gstatic.com'));
  assert.ok((dirs.get('connect-src') ?? []).includes('data:'), 'share cards fazem fetch de data: URL');
  assert.deepEqual(dirs.get('report-uri'), ['/api/error?csp=1']);
});

test('cspReportToError: diretiva + origem bloqueada; ignora corpo que não é relatório', () => {
  const r = cspReportToError({ 'csp-report': {
    'document-uri': 'https://roadtomajor.com.br/ultimate?x=1',
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://evil.example/x.js?token=abc',
    'source-file': 'https://roadtomajor.com.br/assets/index.js', 'line-number': 12,
  } });
  assert.ok(r);
  assert.equal(r.message, 'CSP script-src-elem bloquearia https://evil.example');
  assert.equal(r.page, 'https://roadtomajor.com.br/ultimate');
  assert.equal(cspReportToError({ message: 'erro comum' }), null);
  assert.equal(cspReportToError({ 'csp-report': 'x' }), null);
});

test('dedupe: a mesma violação grava 1x a cada 6h por instância', () => {
  __resetCspDedupeForTests();
  const t0 = 1_000_000;
  assert.equal(cspSeenRecently('CSP a', t0), false);
  assert.equal(cspSeenRecently('CSP a', t0 + 60_000), true);
  assert.equal(cspSeenRecently('CSP b', t0 + 60_000), false);
  assert.equal(cspSeenRecently('CSP a', t0 + 7 * 60 * 60_000), false);
});

test('POST /api/error com application/csp-report (Buffer) grava kind csp uma vez', async () => {
  __resetCspDedupeForTests();
  const db = new FakeNeonHttp();
  const uninstall = db.install();
  try {
    const report = Buffer.from(JSON.stringify({ 'csp-report': { 'document-uri': 'https://roadtomajor.com.br/', 'violated-directive': 'img-src', 'blocked-uri': 'http://inseguro.example/a.png' } }));
    const send = async () => {
      const out = { code: 0, body: {} as Record<string, unknown> };
      await errorRoute({ method: 'POST', body: report, headers: { 'x-forwarded-for': '198.51.100.7', 'user-agent': 'UA' } }, {
        status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
        setHeader: () => {},
      });
      return out;
    };
    const first = await send();
    assert.equal(first.code, 200);
    const insert = db.seen.find((q) => q.text.startsWith('INSERT INTO client_errors'));
    assert.ok(insert);
    assert.equal(insert.params[1], 'csp');
    assert.equal(insert.params[2], 'CSP img-src bloquearia http://inseguro.example');
    const second = await send();
    assert.equal(second.body.dedup, true);
    assert.equal(db.seen.filter((q) => q.text.startsWith('INSERT INTO client_errors')).length, 1);
  } finally { uninstall(); }
});
