// SEO: depois do `vite build` (plugin rtm-seo-prerender em vite.config.ts, então
// roda na Vercel, no CI e local), grava em dist/:
//   - app.html: o index.html do Vite como saiu, a casca do SPA para as rotas do
//     jogo (/jogar, /perfil, /carreira/..., /jogo/..., /admin...), igual a antes;
//   - index.html (landing) e p/*.html (páginas públicas): o mesmo index.html com
//     title/description/canonical/og/twitter/JSON-LD da página e o texto dentro do
//     #root, que o React (createRoot) troca ao montar;
//   - sitemap.xml (o robots.txt é estático, public/robots.txt).
// No fim confere que todo destino .html dos rewrites do vercel.json existe: um
// rewrite pra arquivo que não foi gerado daria 404 no jogo, então o build falha.
// Manual (refaz em cima de um dist/ existente): `npx tsx scripts/prerender.mts`.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSeoPages } from '../src/seo/pages.ts';
import { renderPage, sitemapXml } from '../src/seo/render.ts';

export const APP_SHELL = 'app.html';

/** destinos que são arquivo (.html) nos rewrites do vercel.json */
export function rewriteFiles(vercelJson: string): string[] {
  const v = JSON.parse(vercelJson) as { rewrites?: { destination: string }[] };
  return [...new Set((v.rewrites ?? []).map((r) => r.destination).filter((d) => /^\/[^?#]*\.html$/.test(d)))];
}

export function prerender({ root, outDir, now = Date.now() }: { root: string; outDir: string; now?: number }): string {
  const shell = join(outDir, APP_SHELL);
  // o template é o index.html que o Vite acabou de gerar; numa 2ª rodada manual o
  // index.html já é a landing, então vale a cópia intacta (app.html)
  const template = readFileSync(existsSync(shell) ? shell : join(outDir, 'index.html'), 'utf8');
  writeFileSync(shell, template);
  const pages = buildSeoPages(now);
  const sizes: string[] = [];
  for (const p of pages) {
    const out = join(outDir, p.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderPage(template, p, pages));
    sizes.push(`${p.path} ${(statSync(out).size / 1024).toFixed(1)} kB`);
  }
  writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(pages));
  const missing = rewriteFiles(readFileSync(join(root, 'vercel.json'), 'utf8')).filter((f) => !existsSync(join(outDir, f)));
  if (missing.length) throw new Error(`vercel.json reescreve para arquivo que o build não gerou: ${missing.join(', ')}`);
  return `prerender: ${pages.length} páginas + ${APP_SHELL} + sitemap.xml (${sizes.join(' · ')})`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  console.log(prerender({ root, outDir: join(root, 'dist') }));
}
