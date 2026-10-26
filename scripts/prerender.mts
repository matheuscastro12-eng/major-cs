// Pós-build (npm run build): grava em dist/ o HTML estático de cada página
// pública (texto + og:* + twitter:card + JSON-LD), sitemap.xml e robots.txt.
// O SPA continua igual: o React substitui o conteúdo do #root ao montar.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_PAGES } from '../src/seo/content.ts';
import { renderPage, robotsTxt, sitemapXml } from '../src/seo/render.ts';

const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const template = readFileSync(join(DIST, 'index.html'), 'utf8');
for (const p of SEO_PAGES) {
  const out = join(DIST, p.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPage(template, p));
}
writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml());
writeFileSync(join(DIST, 'robots.txt'), robotsTxt());
console.log(`prerender: ${SEO_PAGES.length} páginas + sitemap.xml + robots.txt`);
