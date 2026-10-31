// Gera o HTML estático de cada página (metas + texto) a partir do index.html do
// build. Puro (sem fs) pra ser testado; scripts/prerender.mts grava os arquivos.
import { LANDING, OG_IMAGE, SITE_NAME, SITE_URL, X_HANDLE, type SeoBlock, type SeoItem, type SeoPage } from './content';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** URL absoluta canônica (a raiz com barra, as outras sem) */
export const absUrl = (path: string) => `${SITE_URL}${path}`;

/** og:image absoluto do index.html (se houver), senão o padrão: quem trocar a capa no index.html troca aqui também */
export function templateImage(template: string): string {
  const m = /<meta\s+property="og:image"\s+content="(https:\/\/[^"]+)"/.exec(template);
  return m ? m[1] : OG_IMAGE;
}

const GAME = { '@type': 'VideoGame', name: SITE_NAME, url: absUrl('/') };

export function jsonLd(p: SeoPage): Record<string, unknown>[] {
  const url = absUrl(p.path);
  const out: Record<string, unknown>[] = [];
  if (p.schema === 'home') {
    out.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url, inLanguage: 'pt-BR' });
    out.push({
      '@context': 'https://schema.org', ...GAME, description: p.description,
      genre: ['Simulação', 'Esportes', 'Manager'], gamePlatform: ['Web browser'], applicationCategory: 'Game', inLanguage: 'pt-BR',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
    });
  } else {
    out.push({
      '@context': 'https://schema.org', '@type': 'WebPage', '@id': url, url, name: p.title, description: p.description, inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: absUrl('/') },
      about: p.about ? { '@type': 'Thing', name: p.about } : GAME,
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absUrl('/') },
          { '@type': 'ListItem', position: 2, name: p.nav, item: url },
        ],
      },
    });
  }
  if (p.faq?.length) {
    out.push({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  return out;
}

// O conteúdo pré-renderizado só aparece se o JS demorar mais de 1s: quem tem o
// jogo em cache vê o mesmo de antes (o React troca o #root antes disso). Só
// tokens do design system (src/styles/tokens.css, que o CSS do build já carregou).
const STYLE = '<style>'
  + '.seo-prerender{max-width:48rem;margin:0 auto;padding:var(--sp-6) var(--sp-4) var(--sp-16);line-height:var(--lh-body);opacity:0;animation:seo-in .2s ease-out 1s forwards}'
  + '.seo-prerender h1{font-family:var(--font-display);font-size:var(--fs-6);line-height:var(--lh-tight);margin:var(--sp-2) 0 var(--sp-4)}'
  + '.seo-prerender section{margin-top:var(--sp-8)}'
  + '.seo-prerender h2{font-family:var(--font-title);font-size:var(--fs-5);margin:0 0 var(--sp-2)}'
  + '.seo-prerender h3{font-size:var(--fs-4);margin:var(--sp-4) 0 var(--sp-1)}'
  + '.seo-prerender a{color:var(--c-brand)}'
  + '.seo-prerender .seo-kicker,.seo-prerender small{color:var(--c-ink-faint)}'
  + '.seo-prerender .seo-kicker{margin:0 0 var(--sp-1)}'
  + '.seo-prerender .seo-links a{display:inline-flex;align-items:center;min-height:44px;padding:0 var(--sp-2)}'
  + '@media (min-width:960px){.seo-prerender h1{font-size:var(--fs-7)}}'
  + '@media (prefers-reduced-motion:reduce){.seo-prerender{animation-duration:0s}}'
  + '@keyframes seo-in{to{opacity:1}}'
  + '</style>';

export function headTags(p: SeoPage, image: string = OG_IMAGE): string {
  const url = absUrl(p.path);
  const t = esc(p.title), d = esc(p.description), img = esc(image);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:locale" content="pt_BR" />',
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(SITE_NAME)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:site" content="${X_HANDLE}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    ...jsonLd(p).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
    STYLE,
  ].join('\n    ');
}

const link = (href: string, label: string) => `<a href="${esc(href)}">${esc(label)}</a>`;

function itemHtml(x: SeoItem): string {
  const title = x.title ? `<b>${x.href ? link(x.href, x.title) : esc(x.title)}</b>: ` : '';
  return `<li>${title}${esc(x.text)}${x.meta ? ` <small>(${esc(x.meta)})</small>` : ''}</li>`;
}

function blockHtml(b: SeoBlock): string {
  if (b.kind === 'p') return `<p>${esc(b.text)}</p>`;
  if (b.kind === 'h3') return `<h3>${esc(b.text)}</h3>`;
  const tag = b.ordered ? 'ol' : 'ul';
  const start = b.ordered && b.start && b.start !== 1 ? ` start="${b.start}"` : '';
  return `<${tag}${start}>${b.items.map(itemHtml).join('')}</${tag}>`;
}

/** Conteúdo legível dentro do #root. O React (createRoot) troca tudo no mount. */
export function bodyHtml(p: SeoPage, pages: SeoPage[]): string {
  const kicker = p.kicker ? `<p class="seo-kicker">${esc(p.kicker)}</p>` : '';
  const ctas = p.ctas?.length ? `<p class="seo-links">${p.ctas.map((c) => link(c.href, c.label)).join(' ')}</p>` : '';
  const sections = (p.sections ?? []).map((s) => `<section id="${esc(s.id)}">${s.kicker ? `<p class="seo-kicker">${esc(s.kicker)}</p>` : ''}<h2>${esc(s.title)}</h2>${s.blocks.map(blockHtml).join('')}</section>`).join('');
  const faq = p.faq?.length ? `<section id="faq"><h2>${esc(LANDING.faqTitle)}</h2>${p.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}</section>` : '';
  const nav = pages.filter((x) => x.path !== p.path).map((x) => link(x.path, x.nav)).join(' ');
  const notes = [p.footnote, LANDING.footer].filter(Boolean).map((n) => `<p><small>${esc(n!)}</small></p>`).join('');
  return '<div class="seo-prerender">'
    + `<header class="seo-links">${link('/', SITE_NAME)}</header>`
    + `<main>${kicker}<h1>${esc(p.h1)}</h1>${p.lead.map((x) => `<p>${esc(x)}</p>`).join('')}${ctas}${sections}${faq}</main>`
    + `<footer><nav class="seo-links" aria-label="Páginas do Road to Major">${nav}</nav>${notes}</footer>`
    + '</div>';
}

const STRIP = [
  /<title>[\s\S]*?<\/title>\s*/g,
  /<meta\s+name="description"[^>]*>\s*/g,
  /<meta\s+name="robots"[^>]*>\s*/g,
  /<meta\s+property="og:[^"]*"[^>]*>\s*/g,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/g,
  /<link\s+rel="canonical"[^>]*>\s*/g,
];

export function renderPage(template: string, p: SeoPage, pages: SeoPage[] = [p]): string {
  if (!template.includes('</head>') || !template.includes('<div id="root"></div>')) throw new Error('index.html sem </head> ou <div id="root"></div>');
  const image = templateImage(template);
  let html = template;
  for (const re of STRIP) html = html.replace(re, '');
  html = html.replace('</head>', `    ${headTags(p, image)}\n  </head>`);
  return html.replace('<div id="root"></div>', `<div id="root">${bodyHtml(p, pages)}</div>`);
}

export function sitemapXml(pages: SeoPage[]): string {
  const urls = pages.map((p) => `  <url><loc>${absUrl(p.path)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}<changefreq>${p.changefreq}</changefreq><priority>${p.priority.toFixed(1)}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
