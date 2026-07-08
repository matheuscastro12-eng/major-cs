// DRAFT5 dentro do jogo — a plataforma de notícias do modo carreira.
//
// Duas fontes numa redação só:
//   1. Matérias GERADAS: os NewsItem que a carreira já produz (resultados,
//      mercado, diretoria, cenário) ganham assinatura de um redator fictício
//      da DRAFT5 e viram matéria da plataforma.
//   2. Feed REAL: /api/news (proxy com cache de 15 min sobre a API pública
//      https://api.draft5.gg/external/roadtomajor) traz as notícias reais do
//      cenário pra dar vida à redação.
import { ct } from '../../state/career-i18n';

export const DRAFT5_META = {
  name: 'DRAFT5',
  link: 'https://draft5.gg',
  tagline: ct('A cobertura completa do seu cenário competitivo'),
};

// redação fictícia da DRAFT5 in-game (determinística por manchete)
export interface Draft5Author { name: string; role: string }
const AUTHORS: Draft5Author[] = [
  { name: 'Rafa Siqueira', role: ct('Repórter de mercado') },
  { name: 'Duda Camargo', role: ct('Setorista da sua org') },
  { name: 'Théo Valente', role: ct('Analista tático') },
  { name: 'Bia Fontoura', role: ct('Cobertura de torneios') },
  { name: 'Iuri Sant’Anna', role: ct('Colunista') },
  { name: 'Malu Ribas', role: ct('Bastidores') },
];

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

export const draft5Author = (newsId: string): Draft5Author => AUTHORS[hash(newsId) % AUTHORS.length];

// rótulo editorial por categoria de manchete (chaves = NewsCat do CareerScreen;
// string solta de propósito pra não importar tipo de componente no engine)
const CAT_LABEL: Record<string, string> = {
  result: ct('Competitivo'),
  transfer: ct('Mercado'),
  board: ct('Bastidores'),
  scout: ct('Scouting'),
  scene: ct('Cenário'),
  social: 'Social',
};
export const draft5Category = (cat?: string) => CAT_LABEL[cat ?? 'scene'] ?? CAT_LABEL.scene;

// ---------------------------------------------------------------- feed real
export interface Draft5FeedItem {
  title: string; excerpt: string; image: string; imageCredit: string;
  date: string; slug: string; category: string; author: string;
}

// cache do lado do cliente também (evita refetch a cada troca de aba);
// o proxy já segura 15 min do lado do servidor.
let feedCache: { items: Draft5FeedItem[]; link: string; expiresAt: number } | null = null;
const FEED_TTL_MS = 15 * 60_000;

export const draft5ArticleUrl = (slug: string, link = DRAFT5_META.link) => `${link}/noticia/${slug}`;

export async function fetchDraft5Feed(amount = 5): Promise<{ items: Draft5FeedItem[]; link: string }> {
  const now = Date.now();
  if (feedCache && feedCache.expiresAt > now) return feedCache;
  try {
    const res = await fetch(`/api/news?page=1&amount=${amount}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { link?: string; news?: Draft5FeedItem[] };
    const items = Array.isArray(data.news) ? data.news.filter((n) => n.title && n.slug) : [];
    feedCache = { items, link: data.link || DRAFT5_META.link, expiresAt: now + FEED_TTL_MS };
    return feedCache;
  } catch {
    // sem rede/proxy (ex.: dev sem funções da Vercel): a seção some em silêncio
    return { items: [], link: DRAFT5_META.link };
  }
}
