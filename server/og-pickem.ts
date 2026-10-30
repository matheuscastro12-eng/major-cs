// PREVIEW DO LINK DO PICK'EM (o loop viral do Modo Major).
//
// Quem compartilha roadtomajor.com.br/major-singapore?p=<código> no X,
// WhatsApp, Discord, Telegram ou Slack deve ver no card o PALPITE ("Meu campeão
// do PGL Major Singapore: <TIME>" + imagem com campeão, final e semis), não o
// card genérico. O site é uma SPA estática, então:
//   - vercel.json manda o robô de preview (rewrite com `has` de user-agent E de
//     ?p) para api/og-pickem-page.ts, que devolve só o HTML com og:*/twitter:*;
//   - a imagem é api/og-pickem.ts (PNG 1200x630, server/og-pickem-image.ts);
//   - gente de verdade continua recebendo a SPA (a regra sem `has`).
//
// Aqui fica a lógica PURA: matcher de UA, validação do `p`, resumo do palpite
// e o HTML (todo texto escapado). Testado em server/og-pickem.test.ts.
import { readFileSync } from 'node:fs';
import {
  bracketSides, bySeed, decodePicks, encodePicks, picksComplete, type MajorData, type MajorTeam,
} from '../src/engine/majorSingapore.js';
import { SITE } from '../src/state/shareLink.js';
import { allowedOrigins } from './origin.js';

export const MAJOR_PATH = '/major-singapore';

// ------------------------------------------------------------ robôs de preview

/**
 * User-agents dos robôs que montam o card do link. É O MESMO texto do `has`
 * do vercel.json (o teste confere): sem flag de regex, então cada letra que
 * varia de caixa vai em classe ([Tt]). A Vercel compara o valor inteiro, daí
 * o `.*` nas pontas. Googlebot fica de fora de propósito (conteúdo diferente
 * para o buscador seria cloaking). iMessage usa facebookexternalhit/Twitterbot.
 */
export const PREVIEW_BOT_UA =
  '.*([Tt]witter[Bb]ot|[Ff]acebook[Ee]xternal[Hh]it|[Ww]hats[Aa]pp|[Dd]iscord[Bb]ot|[Tt]elegram[Bb]ot|[Ss]lack[Bb]ot|[Ll]inked[Ii]n[Bb]ot|[Ee]mbedly|[Ss]kype[Uu]ri[Pp]review).*';
const PREVIEW_BOT_RE = new RegExp(`^(?:${PREVIEW_BOT_UA})$`);

export function isPreviewBot(ua: string | null | undefined): boolean {
  return typeof ua === 'string' && ua.length <= 1024 && PREVIEW_BOT_RE.test(ua);
}

// ------------------------------------------------------------ o código `p`

/** encodePicks gera 36 ou 49 chars; acima disso nem tenta decodificar */
export const PICK_CODE_MAX = 64;
// mesmo formato de decodePicks (engine/majorSingapore.ts) e de server/major-league.ts
const PICK_CODE_RE = /^[0-9a-z]{4}\.[0-9a-v_]{31}(?:\.[0-9a-v_]{12})?$/;

/** `p` da query (string ou array) → código normalizado, ou null se não tem o formato */
export function readPickCode(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !v || v.length > PICK_CODE_MAX) return null;
  const code = v.trim().toLowerCase();
  return PICK_CODE_RE.test(code) ? code : null;
}

// ------------------------------------------------------------ dados

let cachedData: MajorData | null = null;

/**
 * A lista de times (a mesma do cliente). Lida do disco na 1ª chamada, nunca no
 * import: o teste de ESM carrega o handler sem os arquivos de dados. Na Vercel
 * o JSON entra por `functions.includeFiles` do vercel.json.
 */
export function loadMajorData(): MajorData {
  if (!cachedData) {
    cachedData = JSON.parse(readFileSync(new URL('../src/data/major-singapore-2026.json', import.meta.url), 'utf8')) as MajorData;
  }
  return cachedData;
}

// ------------------------------------------------------------ resumo do palpite

export interface PickemSummary {
  /** código canônico (re-encodado depois de normalizar) */
  code: string;
  event: MajorData['event'];
  champion: MajorTeam;
  runnerUp: MajorTeam;
  /** os dois que caíram nas semifinais do palpite */
  semis: [MajorTeam, MajorTeam];
}

/** null = `p` ausente, malformado, de outra lista de times ou palpite incompleto */
export function pickemSummary(d: MajorData, rawCode: unknown): PickemSummary | null {
  const code = readPickCode(rawCode);
  if (!code) return null;
  const picks = decodePicks(d, code);
  if (!picks || !picksComplete(picks)) return null;
  const team = new Map(d.teams.map((t) => [t.id, t]));
  const sides = bracketSides(d, picks);
  const loser = (g: number) => team.get(sides[g].find((id) => id && id !== picks.bracket[g]) ?? '');
  const champion = team.get(picks.bracket[6]);
  const runnerUp = loser(6);
  const semiA = loser(4);
  const semiB = loser(5);
  if (!champion || !runnerUp || !semiA || !semiB) return null;
  return { code: encodePicks(d, picks), event: d.event, champion, runnerUp, semis: [semiA, semiB] };
}

/** "PGL Major Singapore 2026" → "PGL Major Singapore" (o título do card) */
export const eventShortName = (name: string): string => name.replace(/\s+\d{4}$/, '');

// ------------------------------------------------------------ versão da imagem

// Suba quando o desenho do PNG mudar: a imagem é cacheada por 1 ano na borda
// (immutable) e a versão vai na URL do og:image.
export const OG_DESIGN = 1;

/** muda quando o desenho ou os times (nome, sigla, cor) mudam */
export function ogVersion(d: MajorData): string {
  let h = 0;
  const src = `${OG_DESIGN}|${bySeed(d).map((t) => `${t.id}:${t.name}:${t.tag}:${(t.colors ?? []).join('/')}`).join(',')}`;
  for (let i = 0; i < src.length; i++) h = (Math.imul(h, 31) + src.charCodeAt(i)) >>> 0;
  return `${OG_DESIGN}${h.toString(36)}`;
}

// ------------------------------------------------------------ HTML

type Headers = Record<string, string | string[] | undefined> | undefined;
type Env = Record<string, string | undefined>;

const header = (h: Headers, k: string): string => {
  const v = h?.[k];
  return (Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase();
};

/**
 * Origem da URL da imagem. Produção: sempre o domínio oficial (URL estável =
 * cache bom). Preview: o próprio deploy (VERCEL_URL/VERCEL_BRANCH_URL, injetadas
 * pela Vercel), pra dar pra testar antes do merge. Host desconhecido → oficial.
 */
export function imageOrigin(headers: Headers, env: Env = process.env): string {
  if (env.VERCEL_ENV === 'production') return SITE;
  const host = header(headers, 'x-forwarded-host') || header(headers, 'host');
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return SITE;
  if (allowedOrigins(env).has(`https://${host}`)) return `https://${host}`;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  return SITE;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PickemMeta {
  title: string;
  description: string;
  /** canônica, sem ref/utm */
  url: string;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
}

// card padrão do site (o mesmo texto do index.html) quando o `p` não serve
const DEFAULT_TITLE = 'Road to Major';
const DEFAULT_DESCRIPTION = 'Monte o time dos sonhos com lendas de todas as eras do Counter-Strike e vença o Major.';
export const DEFAULT_IMAGE = `${SITE}/og.png`;

export function pickemMeta(s: PickemSummary | null, origin: string, version: string): PickemMeta {
  if (!s) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      url: `${SITE}${MAJOR_PATH}`,
      image: DEFAULT_IMAGE,
      imageAlt: 'Road to Major',
      imageWidth: 1200,
      imageHeight: 630,
    };
  }
  const event = eventShortName(s.event.name);
  const q = `p=${encodeURIComponent(s.code)}`;
  return {
    title: `Meu campeão do ${event}: ${s.champion.name}`,
    description: `Na minha final, ${s.champion.name} vence ${s.runnerUp.name}. Semifinalistas: ${s.semis[0].name} e ${s.semis[1].name}. Faça o seu pick'em no Road to Major.`,
    url: `${SITE}${MAJOR_PATH}?${q}`,
    image: `${origin}/api/og-pickem?${q}&v=${encodeURIComponent(version)}`,
    imageAlt: `Pick'em do ${s.event.name}: campeão ${s.champion.name}, final contra ${s.runnerUp.name}, semifinalistas ${s.semis[0].name} e ${s.semis[1].name}.`,
    imageWidth: 1200,
    imageHeight: 630,
  };
}

/** HTML mínimo para o robô: só metas + um link de volta (sem script, sem CSS) */
export function buildPickemHtml(m: PickemMeta): string {
  const e = escapeHtml;
  const prop = (k: string, v: string | number) => `<meta property="${k}" content="${e(String(v))}" />`;
  const name = (k: string, v: string) => `<meta name="${k}" content="${e(v)}" />`;
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${e(m.title)}</title>`,
    name('description', m.description),
    `<link rel="canonical" href="${e(m.url)}" />`,
    prop('og:type', 'website'),
    prop('og:site_name', 'Road to Major'),
    prop('og:locale', 'pt_BR'),
    prop('og:url', m.url),
    prop('og:title', m.title),
    prop('og:description', m.description),
    prop('og:image', m.image),
    prop('og:image:secure_url', m.image),
    prop('og:image:type', 'image/png'),
    prop('og:image:width', m.imageWidth),
    prop('og:image:height', m.imageHeight),
    prop('og:image:alt', m.imageAlt),
    name('twitter:card', 'summary_large_image'),
    name('twitter:title', m.title),
    name('twitter:description', m.description),
    name('twitter:image', m.image),
    name('twitter:image:alt', m.imageAlt),
    name('theme-color', '#e8b64a'), // faixa lateral do embed no Discord
    '</head>',
    '<body>',
    `<h1>${e(m.title)}</h1>`,
    `<p>${e(m.description)}</p>`,
    `<p><a href="${e(m.url)}">Abrir no Road to Major</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
