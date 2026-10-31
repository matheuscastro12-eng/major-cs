// SEO: HTML pré-renderizado das páginas públicas (src/seo/*, scripts/prerender.mts),
// a página do Modo Major (/major-singapore), sitemap, robots e a ordem dos
// rewrites do vercel.json (incluindo o rewrite de preview do pick'em, #147).
// Roda `tsx --test scripts/test-seo.mts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import data from '../src/data/major-singapore-2026.json' with { type: 'json' };
import { titleOdds, type MajorData } from '../src/engine/majorSingapore.ts';
import { MAJOR_FAVORITES } from '../src/data/majorLanding.ts';
import { LANDING, OG_IMAGE, SITE_URL, type SeoPage } from '../src/seo/content.ts';
import { MAJOR_FAV_COUNT, MAJOR_SIM_RUNS } from '../src/seo/major.ts';
import { buildSeoPages } from '../src/seo/pages.ts';
import { absUrl, esc, renderPage, sitemapXml, templateImage } from '../src/seo/render.ts';
import { APP_SHELL, prerender, rewriteFiles } from './prerender.mts';

const D = data as unknown as MajorData;
const ROOT = new URL('..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const TPL = read('index.html');
const DURING = Date.UTC(2026, 9, 30, 15);   // 30/10/2026: vitrine do Major no ar
const AFTER = Date.UTC(2027, 0, 10, 15);    // depois da janela do Major
const PAGES = buildSeoPages(DURING);
const page = (path: string) => PAGES.find((p) => p.path === path)!;
const html = (p: SeoPage, tpl = TPL) => renderPage(tpl, p, PAGES);
const count = (h: string, s: string) => h.split(s).length - 1;
// a capa: og:image absoluto do index.html ou, se ele for relativo, o padrão
const IMAGE = templateImage(TPL);

/** os blocos JSON-LD da página, já parseados (JSON.parse falha = JSON-LD inválido) */
function ld(h: string): Record<string, unknown>[] {
  return [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
/** todos os @type de um JSON-LD, em qualquer nível */
function types(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((y) => types(y, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (k === '@type') out.push(...(Array.isArray(v) ? v : [v]).map(String));
      else types(v, out);
    }
  }
  return out;
}
const rootHtml = (h: string) => h.slice(h.indexOf('<div id="root">'), h.lastIndexOf('</div>') + 6);
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// ───────────────────────────────────────────────────────────── todas as páginas
test('cada página: metas 1x, canonical/og:url absolutos, og:image absoluto, JSON-LD válido e texto no #root', () => {
  for (const p of PAGES) {
    const h = html(p);
    for (const tag of ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:url"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'name="twitter:image"'])
      assert.equal(count(h, tag), 1, `${p.path}: ${tag} deve aparecer 1x`);
    const url = absUrl(p.path);
    assert.ok(url.startsWith(`${SITE_URL}/`), url);
    assert.ok(h.includes(`<link rel="canonical" href="${url}" />`), `${p.path}: canonical`);
    assert.ok(h.includes(`<meta property="og:url" content="${url}" />`), `${p.path}: og:url`);
    assert.match(IMAGE, /^https:\/\//);
    assert.ok(h.includes(`property="og:image" content="${IMAGE}"`) && h.includes(`name="twitter:image" content="${IMAGE}"`), `${p.path}: og:image absoluto`);
    const blocks = ld(h);
    assert.ok(blocks.length >= 1 && blocks.every((b) => b['@context'] === 'https://schema.org'), `${p.path}: JSON-LD`);
    assert.match(h, /<div id="root"><div class="seo-prerender"><header/);
    assert.equal(count(h, '<h1>'), 1, `${p.path}: um h1`);
    assert.ok(!h.includes('{preço}'), `${p.path}: marcador de preço trocado`);
    // pequeno: a casca do Vite (~4 kB) + metas + texto
    assert.ok(h.length < 20_000, `${p.path}: ${h.length} bytes`);
  }
});

test('títulos, descrições e canônicos únicos; tamanhos que cabem no resultado de busca', () => {
  for (const k of ['title', 'description', 'path', 'file'] as const) assert.equal(new Set(PAGES.map((p) => p[k])).size, PAGES.length, k);
  for (const p of PAGES) {
    assert.ok(p.title.length <= 75, `${p.path}: title com ${p.title.length}`);
    assert.ok(p.description.length <= 165, `${p.path}: description com ${p.description.length}`);
  }
});

test('o arquivo gerado nunca fica no caminho da URL (na Vercel o arquivo vence o rewrite)', () => {
  for (const p of PAGES) {
    if (p.path === '/') { assert.equal(p.file, 'index.html'); continue; }
    assert.match(p.file, /^p\/[a-z-]+\.html$/, p.file);
    const route = p.path.slice(1);
    for (const f of [route, `${route}.html`, `${route}/index.html`]) assert.ok(!existsSync(join(ROOT, 'public', f)), `public/${f} engoliria o rewrite de ${p.path}`);
  }
});

test('escapa HTML no texto e nas metas', () => {
  const h = renderPage(TPL, { ...page('/hall'), h1: '<x>&', title: 'a"b', lead: ['<script>'] }, PAGES);
  assert.ok(h.includes('<h1>&lt;x&gt;&amp;</h1>') && h.includes('<title>a&quot;b</title>') && h.includes('<p>&lt;script&gt;</p>'));
  assert.equal(esc(`'"<>&`), `'&quot;&lt;&gt;&amp;`);
});

test('og:image absoluto do index.html vale para todas as páginas; relativo cai no padrão', () => {
  const relative = TPL.replace(/<meta property="og:image" content="[^"]*" \/>/, '<meta property="og:image" content="/og.png" />');
  assert.equal(templateImage(relative), OG_IMAGE);
  const tpl = TPL.replace(/<meta property="og:image" content="[^"]*" \/>/, '<meta property="og:image" content="https://roadtomajor.com.br/og/capa.jpg" />');
  assert.equal(templateImage(tpl), 'https://roadtomajor.com.br/og/capa.jpg');
  const h = renderPage(tpl, page('/major-singapore'), PAGES);
  assert.ok(h.includes('property="og:image" content="https://roadtomajor.com.br/og/capa.jpg"') && h.includes('name="twitter:image" content="https://roadtomajor.com.br/og/capa.jpg"'));
  assert.equal(count(h, 'property="og:image"'), 1);
});

// ───────────────────────────────────────────────────────────── /major-singapore
test('Major: h1, datas, formato, title/description e canonical', () => {
  const p = page('/major-singapore');
  const h = html(p);
  assert.equal(p.file, 'p/major-singapore.html');
  assert.match(h, /<h1>PGL Major Singapore 2026: faça seu pick'em<\/h1>/);
  assert.match(p.title, /PGL Major Singapore 2026/);
  assert.match(p.title, /pick'em/);
  assert.match(p.title, /quem vai ganhar/);
  assert.match(p.description, /24\/11 a 13\/12, em Singapura/);
  assert.ok(h.includes('24 nov – 13 dez 2026 · Singapura') && h.includes('Playoffs de 10 a 13 de dezembro'), 'datas do evento e dos playoffs');
  assert.ok(h.includes('De 24 de novembro a 13 de dezembro de 2026, em Singapura.'), 'datas por extenso a partir do JSON');
  assert.equal(D.event.start, '2026-11-24');
  assert.equal(D.event.end, '2026-12-13');
  assert.equal(D.event.playoffsStart, '2026-12-10');
  for (const s of ['Stage 1 · seeds 17–32 · suíço, 8 avançam', 'Stage 2 · 8 do Stage 1 + seeds 9–16', 'Stage 3 · 8 do Stage 2 + seeds 1–8', 'Playoffs · 8 times, MD3, final MD5', 'Suíço: 3 vitórias classifica'])
    assert.ok(h.includes(esc(s)), `formato: ${s}`);
  assert.ok(h.includes('<link rel="canonical" href="https://roadtomajor.com.br/major-singapore" />'));
});

test('Major: os 32 times do JSON, por stage, com a nota de lista provisória', () => {
  const h = rootHtml(html(page('/major-singapore')));
  assert.equal(D.teams.length, 32);
  for (const t of D.teams) assert.ok(h.includes(`<li>${esc(t.name)}</li>`), `time ${t.name}`);
  assert.ok(h.includes('<ol start="9">') && h.includes('<ol start="17">'));
  if (D.event.status === 'projecao') assert.match(h, /Lista provisória até a lista oficial, que sai em 02\/11/);
  else assert.match(h, /Lista oficial de times\./);
});

test('Major: favoritos = o painel do jogo (titleOdds(D, 1000), seed 1), ditos como simulação', () => {
  const screen = read('src/components/major/MajorSingaporeScreen.tsx');
  assert.ok(screen.includes(`titleOdds(D, ${MAJOR_SIM_RUNS})`), 'o painel do Modo Major usa o mesmo número de simulações');
  const odds = titleOdds(D, MAJOR_SIM_RUNS);
  const top = [...D.teams].sort((a, b) => (odds.get(b.id) ?? 0) - (odds.get(a.id) ?? 0)).slice(0, MAJOR_FAV_COUNT);
  const h = rootHtml(html(page('/major-singapore')));
  const fav = h.slice(h.indexOf('<section id="favoritos">'), h.indexOf('</section>', h.indexOf('<section id="favoritos">')));
  const listed = [...fav.matchAll(/<li><b>([^<]+)<\/b>: ([\d,]+)%<\/li>/g)].map((m) => [decode(m[1]), m[2]]);
  assert.deepEqual(listed, top.map((t) => [t.name, ((odds.get(t.id) ?? 0) * 100).toFixed(1).replace('.', ',')]));
  assert.match(fav, /É simulação do jogo, não previsão oficial\./);
  // a landing copia os 4 primeiros (data/majorLanding.ts): os dois batem
  assert.deepEqual(MAJOR_FAVORITES.teams.map((t) => t.name), top.slice(0, MAJOR_FAVORITES.teams.length).map((t) => t.name));
});

test('Major: JSON-LD = WebPage (com breadcrumb) + FAQPage, sem Event/SportsEvent; FAQ igual ao HTML', () => {
  const h = html(page('/major-singapore'));
  const blocks = ld(h);
  assert.deepEqual(blocks.map((b) => b['@type']), ['WebPage', 'FAQPage']);
  const all = types(blocks);
  assert.ok(!all.some((t) => /Event/.test(t)), `sem schema de evento: ${all.join(', ')}`);
  const [web, faq] = blocks as [Record<string, unknown>, { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }];
  assert.equal(web.url, 'https://roadtomajor.com.br/major-singapore');
  assert.deepEqual(web.about, { '@type': 'Thing', name: 'PGL Major Singapore 2026' });
  const crumbs = (web.breadcrumb as { itemListElement: { item: string; position: number }[] }).itemListElement;
  assert.deepEqual(crumbs.map((c) => [c.position, c.item]), [[1, 'https://roadtomajor.com.br/'], [2, 'https://roadtomajor.com.br/major-singapore']]);
  const section = rootHtml(h).slice(rootHtml(h).indexOf('<section id="faq">'));
  const qs = [...section.matchAll(/<h3>([^<]+)<\/h3><p>([^<]+)<\/p>/g)].map((m) => [decode(m[1]), decode(m[2])]);
  assert.ok(qs.length >= 4 && qs.length <= 6, `FAQ curto (${qs.length})`);
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), qs);
  assert.deepEqual(qs[0], LANDING.faqMajor, 'a 1ª pergunta é a mesma da landing');
  assert.ok(qs.some(([q]) => /favorito/.test(q)) && qs.some(([, a]) => /simulação do Road to Major/.test(a)));
});

test('Major: aviso de que não somos os organizadores; links internos absolutos-relativos para as outras páginas', () => {
  const h = rootHtml(html(page('/major-singapore')));
  assert.match(h, /não organiza o torneio nem tem ligação com a PGL ou a Valve/);
  assert.ok(h.includes('<a href="/">Início</a>') && h.includes('<a href="/ultimate">Ultimate</a>'));
  assert.ok(!h.includes('href="/major-singapore"'), 'sem link pra ela mesma');
});

// ───────────────────────────────────────────────────────────── landing
/** todas as strings de LANDING (o espelho da landing) */
function leaves(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => leaves(y, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((y) => leaves(y, out));
  return out;
}

test('o espelho da landing (content.ts) só tem frases que existem na Landing.tsx', () => {
  const src = read('src/components/Landing.tsx');
  const missing = leaves(LANDING).filter((s) => !src.includes(s));
  assert.deepEqual(missing, [], 'a landing mudou: alinhe src/seo/content.ts (LANDING) com src/components/Landing.tsx');
});

test('landing durante o Major: hero do Major, link pro Modo Major, FAQ do Major primeiro e preço resolvido', () => {
  const p = page('/');
  const h = html(p);
  assert.equal(p.file, 'index.html');
  assert.ok(h.includes("<h1>Faça seu pick'em do Major de Singapura</h1>"));
  assert.ok(h.includes(`<a href="/major-singapore">Fazer meu pick'em do Major</a>`));
  assert.ok(h.includes('<link rel="canonical" href="https://roadtomajor.com.br/" />'));
  const blocks = ld(h);
  assert.deepEqual(blocks.map((b) => b['@type']), ['WebSite', 'VideoGame', 'FAQPage']);
  const faq = blocks[2] as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
  assert.equal(faq.mainEntity[0].name, LANDING.faqMajor[0]);
  assert.equal(faq.mainEntity.length, LANDING.faq.length + 1);
  assert.ok(faq.mainEntity.some((q) => /R\$\s?20,00/.test(q.name)), 'Como pago os R$ 20,00?');
});

test('landing depois do Major: hero geral, sem a pergunta do Major', () => {
  const p = buildSeoPages(AFTER).find((x) => x.path === '/')!;
  assert.equal(p.h1, 'Seu time de CS rumo ao Major');
  assert.ok(!p.faq!.some(([q]) => q === LANDING.faqMajor[0]));
  assert.ok(!(p.sections ?? []).some((s) => s.id === 'major'));
});

// ───────────────────────────────────────────────────────────── sitemap e robots
test('sitemap: uma URL absoluta por página pública, /major-singapore com a data do JSON', () => {
  const s = sitemapXml(PAGES);
  assert.ok(s.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, PAGES.map((p) => absUrl(p.path)));
  assert.ok(locs.includes('https://roadtomajor.com.br/') && locs.includes('https://roadtomajor.com.br/major-singapore'));
  for (const app of ['/jogar', '/perfil', '/online', '/admin', '/criar-manager']) assert.ok(!locs.includes(absUrl(app)), `rota do app fora do sitemap: ${app}`);
  assert.match(s, new RegExp(`<loc>https://roadtomajor\\.com\\.br/major-singapore</loc><lastmod>${D.event.updatedAt}</lastmod>`));
  assert.equal(count(s, '<url>'), count(s, '</url>'));
});

test('robots.txt (estático, public/): Sitemap absoluto, sem bloquear as páginas públicas', () => {
  const r = read('public/robots.txt');
  assert.match(r, /^Sitemap: https:\/\/roadtomajor\.com\.br\/sitemap\.xml$/m);
  assert.match(r, /^Disallow: \/api\/$/m);
  const disallow = [...r.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1]);
  for (const p of PAGES) assert.ok(!disallow.some((d) => p.path.startsWith(d)), `robots bloqueia ${p.path}`);
  assert.ok(!disallow.some((d) => '/p/'.startsWith(d) && d !== '/'), 'robots não bloqueia /p/');
});

// ───────────────────────────────────────────────────────────── vercel.json
interface Has { type: 'header' | 'query' | 'cookie' | 'host'; key: string; value?: string }
interface Rewrite { source: string; destination: string; has?: Has[] }
const VERCEL = read('vercel.json');
const REWRITES = (JSON.parse(VERCEL) as { rewrites: Rewrite[] }).rewrites;

/** `source` da Vercel (path-to-regexp) → RegExp, o suficiente pros formatos do vercel.json */
function sourceRe(source: string): RegExp {
  let re = '';
  for (const seg of source.split('/').slice(1)) {
    if (/^:\w+\*$/.test(seg)) re += '(?:/.*)?';
    else if (/^:\w+$/.test(seg)) re += '/[^/]+';
    else re += '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re || '/'}$`, 'i');
}
/** Roteador da Vercel para os rewrites: o 1º que casa (path + todos os `has`) vence. */
function route(rewrites: Rewrite[], path: string, req: { ua?: string; query?: Record<string, string> } = {}): string | null {
  for (const r of rewrites) {
    if (!sourceRe(r.source).test(path)) continue;
    const ok = (r.has ?? []).every((h) => {
      const v = h.type === 'header' && h.key === 'user-agent' ? req.ua : h.type === 'query' ? req.query?.[h.key] : undefined;
      if (v === undefined) return false;
      return h.value === undefined || new RegExp(`^(?:${h.value})$`).test(v); // a Vercel compara o valor inteiro
    });
    if (ok) return r.destination;
  }
  return null;
}
const UA = {
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/604.1',
  twitter: 'Twitterbot/1.0',
  whatsapp: 'WhatsApp/2.23.20.0 A',
};
const P = { p: '7q2r.kgljmqruacekdbgl012a3457a312a1a' };

test('rewrites: /major-singapore → página pré-renderizada; robô de preview com ?p → /api/og-pickem-page (#147)', () => {
  const MS = '/major-singapore';
  assert.equal(route(REWRITES, MS, { ua: UA.google }), '/p/major-singapore.html', 'Googlebot');
  assert.equal(route(REWRITES, MS, { ua: UA.google, query: P }), '/p/major-singapore.html', 'Googlebot com ?p não é robô de preview');
  assert.equal(route(REWRITES, MS, { ua: UA.chrome }), '/p/major-singapore.html', 'humano');
  assert.equal(route(REWRITES, MS, { ua: UA.chrome, query: P }), '/p/major-singapore.html', 'humano com ?p (link de palpite)');
  assert.equal(route(REWRITES, MS, { ua: UA.twitter }), '/p/major-singapore.html', 'robô sem ?p');
  const bot = REWRITES.some((r) => r.destination === '/api/og-pickem-page');
  if (bot) {
    assert.equal(route(REWRITES, MS, { ua: UA.twitter, query: P }), '/api/og-pickem-page', 'X com ?p');
    assert.equal(route(REWRITES, MS, { ua: UA.whatsapp, query: P }), '/api/og-pickem-page', 'WhatsApp com ?p');
  }
});

test('rewrites: toda regra com `has` de uma rota vem antes da regra sem `has` da mesma rota', () => {
  REWRITES.forEach((r, i) => {
    if (!r.has) return;
    const plain = REWRITES.findIndex((x) => x.source === r.source && !x.has);
    assert.ok(plain === -1 || i < plain, `${r.source}: a regra com has (#${i}) precisa vir antes da sem has (#${plain})`);
  });
});

test('rewrites: cada página pública aponta pro seu HTML; as rotas do jogo pra casca do SPA (app.html)', () => {
  for (const p of PAGES.filter((x) => x.path !== '/')) assert.equal(route(REWRITES, p.path), `/${p.file}`, p.path);
  const app = ['/jogar', '/criar-manager', '/perfil', '/online', '/online/lobby', '/ultimateteam', '/ultimate-team', '/carreira/saves', '/carreira/jogador/abc', '/editor', '/banners', '/design', '/jogo/draft', '/jogo/partida/detalhes', '/admin', '/admin/lab'];
  for (const path of app) assert.equal(route(REWRITES, path, { ua: UA.chrome }), `/${APP_SHELL}`, path);
  for (const path of ['/api/ranking', '/assets/index.js', '/sitemap.xml', '/robots.txt', '/p/major-singapore.html']) assert.equal(route(REWRITES, path), null, `sem rewrite: ${path}`);
});

test('rewrites: destino é a casca (/app.html), uma página gerada (/p/*.html) ou uma função (/api/*)', () => {
  const files = new Set([`/${APP_SHELL}`, ...PAGES.map((p) => `/${p.file}`)]);
  for (const r of REWRITES) {
    assert.ok(files.has(r.destination) || r.destination.startsWith('/api/'),
      `${r.source} → ${r.destination}: rota do jogo usa "/app.html"; página pública ganha entrada em src/seo/pages.ts e "/p/<nome>.html"`);
  }
  assert.deepEqual(rewriteFiles(VERCEL).filter((f) => !files.has(f)), []);
});

// ───────────────────────────────────────────────────────────── prerender (fs)
test('prerender grava app.html intacto, as páginas e o sitemap; 2ª rodada dá o mesmo resultado', () => {
  const out = mkdtempSync(join(tmpdir(), 'rtm-seo-'));
  try {
    writeFileSync(join(out, 'index.html'), TPL);
    const msg = prerender({ root: ROOT, outDir: out, now: DURING });
    assert.match(msg, new RegExp(`${PAGES.length} páginas`));
    assert.equal(readFileSync(join(out, APP_SHELL), 'utf8'), TPL, 'a casca do SPA é o index.html do Vite sem mudança');
    for (const p of PAGES) assert.ok(existsSync(join(out, p.file)), p.file);
    assert.ok(existsSync(join(out, 'sitemap.xml')));
    const first = readFileSync(join(out, 'index.html'), 'utf8');
    assert.notEqual(first, TPL);
    prerender({ root: ROOT, outDir: out, now: DURING });
    assert.equal(readFileSync(join(out, APP_SHELL), 'utf8'), TPL);
    assert.equal(readFileSync(join(out, 'index.html'), 'utf8'), first);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('prerender falha se um rewrite aponta pra .html que o build não gerou', () => {
  const out = mkdtempSync(join(tmpdir(), 'rtm-seo-'));
  const root = mkdtempSync(join(tmpdir(), 'rtm-seo-root-'));
  try {
    writeFileSync(join(out, 'index.html'), TPL);
    const v = JSON.parse(VERCEL) as { rewrites: Rewrite[] };
    v.rewrites.push({ source: '/nova', destination: '/p/nova.html' });
    writeFileSync(join(root, 'vercel.json'), JSON.stringify(v));
    assert.throws(() => prerender({ root, outDir: out, now: DURING }), /p\/nova\.html/);
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
