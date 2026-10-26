// Gera o HTML estático de cada página (metas + texto) a partir do index.html do
// build. Puro (sem fs) pra ser testado; scripts/prerender.mts grava os arquivos.
import { OG_IMAGE, SEO_PAGES, SITE_NAME, SITE_URL, X_HANDLE, type SeoPage } from './content';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const absUrl = (path: string) => `${SITE_URL}${path === '/' ? '' : path}`;

export function headTags(p: SeoPage): string {
  const url = absUrl(p.path);
  const t = esc(p.title), d = esc(p.description);
  const ld: Record<string, unknown>[] = [{
    '@context': 'https://schema.org', '@type': 'VideoGame', name: SITE_NAME, url: SITE_URL, description: p.description,
    genre: ['Simulação', 'Esportes', 'Manager'], gamePlatform: ['Web browser'], applicationCategory: 'Game', inLanguage: 'pt-BR',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
  }];
  if (p.faq?.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(SITE_NAME)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="${X_HANDLE}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    ...ld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
}

/** Conteúdo legível dentro do #root. O React (createRoot) troca tudo no mount. */
export function bodyHtml(p: SeoPage): string {
  const nav = SEO_PAGES.filter((x) => x.priority >= 0.5 && x.path !== p.path).map((x) => `<a href="${x.path}">${esc(x.h1)}</a>`).join(' · ');
  const faq = p.faq?.length ? `<h2>Perguntas frequentes</h2>${p.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}` : '';
  return `<main class="seo-prerender"><h1>${esc(p.h1)}</h1>${p.body.map((b) => `<p>${esc(b)}</p>`).join('')}<p><a href="/jogar">Jogar agora, de graça</a></p>${faq}<nav>${nav}</nav></main>`;
}

const STRIP = [
  /<title>[\s\S]*?<\/title>\s*/g,
  /<meta\s+name="description"[^>]*>\s*/g,
  /<meta\s+property="og:[^"]*"[^>]*>\s*/g,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/g,
  /<link\s+rel="canonical"[^>]*>\s*/g,
];

export function renderPage(template: string, p: SeoPage): string {
  let html = template;
  for (const re of STRIP) html = html.replace(re, '');
  if (!html.includes('</head>') || !html.includes('<div id="root"></div>')) throw new Error('index.html sem </head> ou <div id="root"></div>');
  html = html.replace('</head>', `    ${headTags(p)}\n  </head>`);
  return html.replace('<div id="root"></div>', `<div id="root">${bodyHtml(p)}</div>`);
}

export function sitemapXml(pages: SeoPage[] = SEO_PAGES, lastmod = new Date().toISOString().slice(0, 10)): string {
  const urls = pages.map((p) => `  <url><loc>${absUrl(p.path) || SITE_URL}</loc><lastmod>${lastmod}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority.toFixed(1)}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin', '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n');
}
