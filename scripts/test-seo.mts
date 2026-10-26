// SEO/compartilhamento: HTML estático por página, metas og/twitter, sitemap e robots.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SEO_PAGES, OG_IMAGE } from '../src/seo/content.ts';
import { renderPage, robotsTxt, sitemapXml } from '../src/seo/render.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tpl = readFileSync(ROOT + 'index.html', 'utf8');
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8')) as { rewrites: { source: string; destination: string }[] };
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name); };

t('cada página tem metas únicas e texto no #root', () => {
  for (const p of SEO_PAGES) {
    const h = renderPage(tpl, p);
    for (const tag of ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"'])
      assert.equal(h.split(tag).length - 1, 1, `${p.path}: ${tag} deve aparecer 1x`);
    assert.ok(h.includes(`content="${OG_IMAGE}"`), 'og:image absoluto');
    assert.ok(h.includes('application/ld+json'));
    assert.match(h, /<div id="root"><main class="seo-prerender"><h1>/);
  }
});
t('landing traz o FAQ no HTML e no JSON-LD', () => {
  const h = renderPage(tpl, SEO_PAGES[0]);
  assert.ok(h.includes('Perguntas frequentes') && h.includes('"FAQPage"'));
});
t('escapa HTML', () => {
  const h = renderPage(tpl, { ...SEO_PAGES[1], h1: '<x>&', title: 'a"b' });
  assert.ok(h.includes('&lt;x&gt;&amp;') && h.includes('a&quot;b'));
});
t('rewrites apontam pros HTMLs gerados', () => {
  for (const p of SEO_PAGES.slice(1)) {
    const r = vercel.rewrites.find((x) => x.source === p.path);
    assert.ok(r, `rewrite de ${p.path}`);
    assert.equal(r.destination, '/' + p.file.replace(/\.html$/, '.html'));
  }
});
t('sitemap e robots', () => {
  const s = sitemapXml(SEO_PAGES, '2026-10-26');
  assert.equal(s.split('<url>').length - 1, SEO_PAGES.length);
  assert.ok(s.includes('<loc>https://roadtomajor.com.br</loc>') && s.includes('<loc>https://roadtomajor.com.br/ultimate</loc>'));
  assert.match(robotsTxt(), /Sitemap: https:\/\/roadtomajor\.com\.br\/sitemap\.xml/);
  assert.match(robotsTxt(), /Disallow: \/api\//);
});
console.log(`seo: ${n} testes ok`);
