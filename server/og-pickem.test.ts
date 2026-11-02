// Preview do link do pick'em (loop viral): matcher de robô, validação do `p`,
// HTML com og:*/twitter:* (escapado), o rewrite/includeFiles do vercel.json e
// os dois handlers (HTML e PNG 1200x630).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import pageRoute from '../api/og-pickem-page.js';
import imageRoute from '../api/og-pickem.js';
import {
  bracketSides, emptyPicks, encodePicks, normalizePicks, pickPool, picksComplete, type MajorData, type MajorPicks,
} from '../src/engine/majorSingapore.js';
import { SITE } from '../src/state/shareLink.js';
import { MAJOR_LOGOS, championLines, fitFont, pickemCardTree, type OgNode } from './og-pickem-image.js';
import {
  DEFAULT_IMAGE, PICK_CODE_MAX, PREVIEW_BOT_UA, buildPickemHtml, escapeHtml, imageOrigin, isPreviewBot, loadMajorData,
  ogVersion, pickemMeta, pickemSummary, readPickCode,
} from './og-pickem.js';

const D = loadMajorData();
const ROOT = new URL('../', import.meta.url);

/** palpite completo: favoritos por rating, com `champ` levado até o título */
function picksWith(d: MajorData, champ: string): MajorPicks {
  let p = emptyPicks();
  const top = (st: 1 | 2 | 3) => {
    const pool = pickPool(d, p, st).sort((a, b) => b.rating - a.rating).map((t) => t.id);
    const ids = pool.slice(0, 8);
    if (pool.includes(champ) && !ids.includes(champ)) ids[7] = champ;
    return ids;
  };
  p.s1 = top(1);
  p.s2 = top(2);
  p.s3 = top(3);
  const rating = new Map(d.teams.map((t) => [t.id, t.rating]));
  for (let i = 0; i < 7; i++) {
    const [a, b] = bracketSides(d, p)[i];
    p.bracket[i] = a === champ || b === champ ? champ : rating.get(a)! >= rating.get(b)! ? a : b;
  }
  p = normalizePicks(d, p);
  assert.ok(picksComplete(p));
  return p;
}

const FURIA_CODE = encodePicks(D, picksWith(D, 'furia'));

// ------------------------------------------------------------ robôs

const BOTS = [
  'Twitterbot/1.0',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'WhatsApp/2.23.20.0 A',
  'WhatsApp/2.2335.6 W',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'TelegramBot (like TwitterBot)',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
  'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
  // iMessage
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
];
const HUMANS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
];

test('matcher: robôs de preview sim; Chrome, Safari, Firefox e Googlebot não', () => {
  for (const ua of BOTS) assert.equal(isPreviewBot(ua), true, ua);
  for (const ua of HUMANS) assert.equal(isPreviewBot(ua), false, ua);
  assert.equal(isPreviewBot(undefined), false);
  assert.equal(isPreviewBot(''), false);
  assert.equal(isPreviewBot(`Twitterbot/1.0 ${'x'.repeat(2000)}`), false, 'UA gigante não passa');
});

// ------------------------------------------------------------ vercel.json

interface Has { type: string; key: string; value?: string }
interface Rewrite { source: string; destination: string; has?: Has[] }
interface Fn { includeFiles?: string; memory?: number; maxDuration?: number }
const vercel = JSON.parse(readFileSync(new URL('vercel.json', ROOT), 'utf8')) as { rewrites: Rewrite[]; functions: Record<string, Fn> };

test('vercel.json: robô com ?p vai pro HTML do preview ANTES da regra da SPA', () => {
  const bot = vercel.rewrites.findIndex((r) => r.destination === '/api/og-pickem-page');
  const spa = vercel.rewrites.findIndex((r) => r.source === '/major-singapore' && !r.has);
  assert.ok(bot >= 0 && spa >= 0 && bot < spa, 'a regra com `has` precisa vir antes (a 1ª que casa vence)');
  const rule = vercel.rewrites[bot];
  assert.equal(rule.source, '/major-singapore');
  const ua = rule.has?.find((h) => h.type === 'header' && h.key === 'user-agent');
  assert.equal(ua?.value, PREVIEW_BOT_UA, 'o regex do vercel.json é o mesmo do código');
  assert.ok(rule.has?.some((h) => h.type === 'query' && h.key === 'p'), 'sem ?p o robô continua vendo o index.html');
  // a Vercel compara o valor inteiro: o mesmo regex, ancorado, sem flags
  const re = new RegExp(`^(?:${ua!.value})$`);
  for (const b of BOTS) assert.ok(re.test(b), b);
  for (const h of HUMANS) assert.ok(!re.test(h), h);
});

/** glob mínimo do formato usado no includeFiles: {a,b}, *, ** */
function globMatches(pattern: string, file: string): boolean {
  const alts = pattern.startsWith('{') && pattern.endsWith('}') ? pattern.slice(1, -1).split(',') : [pattern];
  const toRe = (g: string) => g.split('**').map((part) => part.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*');
  return alts.some((g) => new RegExp(`^${toRe(g)}$`).test(file));
}

test('vercel.json: includeFiles leva tudo o que as funções leem do disco', () => {
  const img = vercel.functions['api/og-pickem.ts'];
  const page = vercel.functions['api/og-pickem-page.ts'];
  assert.ok(img?.includeFiles && page?.includeFiles);
  const needImg = [
    'server/og-assets/Oswald-700.ttf',
    'server/og-assets/Oswald-500.ttf',
    'server/og-assets/BarlowCondensed-600.ttf',
    'src/data/major-singapore-2026.json',
    // o nft não rastreia esses dois .wasm (lidos por caminho montado em runtime)
    'node_modules/harfbuzzjs/hb.wasm',
    'node_modules/@resvg/resvg-wasm/index_bg.wasm',
    ...Object.values(MAJOR_LOGOS).map((f) => `public/logos/${f}`),
  ];
  for (const f of needImg) {
    assert.ok(existsSync(new URL(f, ROOT)), `arquivo existe: ${f}`);
    assert.ok(globMatches(img.includeFiles!, f), `includeFiles do PNG cobre ${f}`);
  }
  assert.ok(globMatches(page.includeFiles!, 'src/data/major-singapore-2026.json'));
  assert.ok((img.memory ?? 0) >= 256, 'render precisa de mais que 128 MB');
});

test('logos: só arquivos locais e só de times do Major', () => {
  const ids = new Set(D.teams.map((t) => t.id));
  for (const [id, file] of Object.entries(MAJOR_LOGOS)) {
    assert.ok(ids.has(id), `time do Major: ${id}`);
    assert.match(file, /^[a-z0-9-]+\.(png|jpg)$/);
    assert.ok(existsSync(new URL(`public/logos/${file}`, ROOT)), file);
  }
});

// ------------------------------------------------------------ o `p`

test('readPickCode: formato do encodePicks, normaliza caixa/espaço, limita o tamanho', () => {
  assert.equal(readPickCode(FURIA_CODE), FURIA_CODE);
  assert.equal(readPickCode(` ${FURIA_CODE.toUpperCase()} `), FURIA_CODE);
  assert.equal(readPickCode([FURIA_CODE, 'lixo']), FURIA_CODE, 'query repetida: vale a 1ª');
  const withExtremes = `${FURIA_CODE.split('.').slice(0, 2).join('.')}.0123456789ab`;
  assert.equal(readPickCode(withExtremes), withExtremes, 'trecho opcional de 3-0/0-3');
  for (const bad of [undefined, null, 42, {}, '', 'lixo', '<script>alert(1)</script>', `${FURIA_CODE}x`, FURIA_CODE.replace('.', '-'), FURIA_CODE.slice(0, -1) + 'z']) {
    assert.equal(readPickCode(bad), null, String(bad));
  }
  assert.equal(readPickCode(`${FURIA_CODE}${' '.repeat(PICK_CODE_MAX)}`), null, 'acima do limite nem decodifica');
});

test('pickemSummary: campeão, vice e semis do palpite; lista antiga ou incompleto → null', () => {
  const s = pickemSummary(D, FURIA_CODE);
  assert.ok(s);
  assert.equal(s.champion.id, 'furia');
  assert.notEqual(s.runnerUp.id, 'furia');
  const ids = [s.champion.id, s.runnerUp.id, ...s.semis.map((t) => t.id)];
  assert.equal(new Set(ids).size, 4, 'quatro times diferentes');
  assert.equal(s.code, FURIA_CODE);
  assert.equal(pickemSummary(D, `zzzz.${FURIA_CODE.slice(5)}`), null, 'outra lista de times');
  const incomplete = `${FURIA_CODE.slice(0, -1)}_`;
  assert.equal(pickemSummary(D, incomplete), null, 'sem campeão');
  assert.equal(pickemSummary(D, undefined), null);
});

// ------------------------------------------------------------ HTML

const metaContent = (html: string, attr: 'property' | 'name', key: string): string | undefined =>
  new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)" />`).exec(html)?.[1];

test('HTML: título com o campeão, og:image com o mesmo p, canônica e summary_large_image', () => {
  const s = pickemSummary(D, FURIA_CODE)!;
  const html = buildPickemHtml(pickemMeta(s, SITE, ogVersion(D)));
  assert.equal(metaContent(html, 'property', 'og:title'), 'Meu campeão do PGL Major Singapore: FURIA');
  assert.match(html, /<title>Meu campeão do PGL Major Singapore: FURIA<\/title>/);
  assert.equal(metaContent(html, 'property', 'og:url'), `${SITE}/major-singapore?p=${FURIA_CODE}`);
  const img = metaContent(html, 'property', 'og:image')!.replace(/&amp;/g, '&');
  const u = new URL(img);
  assert.equal(u.origin, SITE);
  assert.equal(u.pathname, '/api/og-pickem');
  assert.equal(u.searchParams.get('p'), FURIA_CODE);
  assert.equal(u.searchParams.get('v'), ogVersion(D));
  assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
  assert.equal(metaContent(html, 'name', 'twitter:image'), metaContent(html, 'property', 'og:image'));
  assert.equal(metaContent(html, 'property', 'og:image:width'), '1200');
  assert.equal(metaContent(html, 'property', 'og:image:height'), '630');
  assert.ok(!/<script/i.test(html));
});

test('HTML: todo texto é escapado (nome de time hostil não quebra o atributo)', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  // mesmos ids (o código continua válido), nomes hostis
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>&\'';
  const d: MajorData = { ...D, event: { ...D.event, name: `${evil} 2026` }, teams: D.teams.map((t) => ({ ...t, name: `${evil}${t.id}` })) };
  const s = pickemSummary(d, FURIA_CODE)!;
  const html = buildPickemHtml(pickemMeta(s, SITE, ogVersion(d)));
  assert.ok(!html.includes('<script'), 'sem <script> cru');
  assert.ok(!html.includes('<img'), 'sem <img> cru');
  assert.ok(html.includes('&lt;script&gt;'));
  // cada meta tem exatamente um atributo content bem fechado
  for (const line of html.split('\n').filter((l) => l.startsWith('<meta '))) {
    assert.match(line, /^<meta (property|name|charset)="[^"]*"( content="[^"]*")? \/>$/, line);
  }
});

test('HTML: p inválido ou ausente → card padrão do site, sem quebrar', () => {
  for (const p of [undefined, 'lixo', `zzzz.${FURIA_CODE.slice(5)}`, 'x'.repeat(5000)]) {
    const html = buildPickemHtml(pickemMeta(pickemSummary(D, p), SITE, ogVersion(D)));
    assert.equal(metaContent(html, 'property', 'og:image'), DEFAULT_IMAGE);
    assert.equal(metaContent(html, 'property', 'og:title'), 'Road to Major');
    assert.equal(metaContent(html, 'property', 'og:url'), `${SITE}/major-singapore`);
    assert.ok(!html.includes('/api/og-pickem'));
  }
});

test('imageOrigin: produção sempre no domínio oficial; preview no próprio deploy; host estranho → oficial', () => {
  const h = (host: string) => ({ host });
  assert.equal(imageOrigin(h('roadtomajor.com.br'), { VERCEL_ENV: 'production' }), SITE);
  assert.equal(imageOrigin(h('www.roadtomajor.com.br'), { VERCEL_ENV: 'production' }), SITE);
  assert.equal(imageOrigin(h('rtm-git-feat-og.vercel.app'), { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'rtm-git-feat-og.vercel.app' }), 'https://rtm-git-feat-og.vercel.app');
  assert.equal(imageOrigin(h('evil.example'), { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'rtm-git-feat-og.vercel.app' }), SITE);
  assert.equal(imageOrigin(h('evil.example"><x'), { VERCEL_ENV: 'preview' }), SITE);
  assert.equal(imageOrigin(h('localhost:3000'), {}), 'http://localhost:3000');
  assert.equal(imageOrigin(undefined, {}), SITE);
});

// ------------------------------------------------------------ desenho

function texts(n: OgNode | string): string[] {
  if (typeof n === 'string') return [n];
  const c = n.props.children;
  return (Array.isArray(c) ? c : c === undefined ? [] : [c]).flatMap(texts);
}

test('card: campeão, final, semis e rodapé; nome longo cabe (quebra ou encolhe)', () => {
  const s = pickemSummary(D, FURIA_CODE)!;
  const all = texts(pickemCardTree(s, () => undefined));
  for (const t of ['MEU CAMPEÃO', 'FURIA', s.runnerUp.name.toUpperCase(), s.semis[0].name.toUpperCase(), s.semis[1].name.toUpperCase(), 'roadtomajor.com.br']) {
    assert.ok(all.includes(t), t);
  }
  assert.deepEqual(championLines('FURIA'), { lines: ['FURIA'], size: 124 });
  const tdd = championLines('THUNDER DOWNUNDER');
  assert.deepEqual(tdd.lines, ['THUNDER', 'DOWNUNDER']);
  assert.ok(tdd.size >= 56 && tdd.size <= 84);
  assert.ok(fitFont('X'.repeat(80), 360, 38, 24) === 24, 'piso de legibilidade');
});

// ------------------------------------------------------------ handlers

interface Captured { status: number; headers: Record<string, string>; body?: string | Uint8Array }
function fakeRes(): { res: { status: (c: number) => { end: (b?: string | Uint8Array) => void }; setHeader: (k: string, v: string) => void }; out: Captured } {
  const out: Captured = { status: 0, headers: {} };
  return {
    out,
    res: {
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      status: (c) => { out.status = c; return { end: (b) => { out.body = b; } }; },
    },
  };
}

test('api/og-pickem-page: 200 text/html com as metas do palpite; sem cache na borda', () => {
  const { res, out } = fakeRes();
  pageRoute({ query: { p: FURIA_CODE, ref: 'major-pickem' }, headers: { host: 'roadtomajor.com.br' } }, res);
  assert.equal(out.status, 200);
  assert.match(out.headers['content-type'], /^text\/html; charset=utf-8$/);
  assert.equal(out.headers['cdn-cache-control'], 'no-store');
  assert.match(String(out.body), /Meu campeão do PGL Major Singapore: FURIA/);
  const bad = fakeRes();
  pageRoute({ query: { p: '<x>' } }, bad.res);
  assert.equal(bad.out.status, 200);
  assert.ok(String(bad.out.body).includes(DEFAULT_IMAGE));
});

test('api/og-pickem: PNG 1200x630 imutável; p inválido → /og.png', async () => {
  const { res, out } = fakeRes();
  await imageRoute({ method: 'GET', query: { p: FURIA_CODE } }, res);
  assert.equal(out.status, 200);
  assert.equal(out.headers['content-type'], 'image/png');
  assert.equal(out.headers['cache-control'], 'public, s-maxage=31536000, immutable');
  const png = Buffer.from(out.body as Uint8Array);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'assinatura PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.equal(out.headers['content-length'], String(png.length));

  const bad = fakeRes();
  await imageRoute({ method: 'GET', query: { p: 'lixo' } }, bad.res);
  assert.equal(bad.out.status, 302);
  assert.equal(bad.out.headers.location, '/og.png');

  const post = fakeRes();
  await imageRoute({ method: 'POST', query: { p: FURIA_CODE } }, post.res);
  assert.equal(post.out.status, 405);
});
