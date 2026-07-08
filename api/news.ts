// Proxy do feed público da DRAFT5 (GET /external/roadtomajor).
//   - GET /api/news?page=1&amount=6
//   - Cache em memória por combinação page/amount (15 min — mesmo TTL do
//     upstream, combinado com a Draft5: nunca bater na API deles a cada request).
//   - Resposta enxuta: só os campos que o jogo usa (título, linha fina, imagem,
//     data, slug, autor). Cacheável na borda (max-age=900).
interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }

const UPSTREAM = 'https://api.draft5.gg/external/roadtomajor';
const CACHE_TTL_MS = 15 * 60_000; // 15 min, igual ao cache do lado da Draft5

interface FeedItem {
  title: string; excerpt: string; image: string; imageCredit: string;
  date: string; slug: string; category: string; author: string;
}
interface FeedPayload { link: string; logo: string; totalPages: number; news: FeedItem[] }

const feedCache = new Map<string, { payload: FeedPayload; expiresAt: number }>();

const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (rlBuckets.size > 5000) rlBuckets.clear();
  const current = rlBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rlBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function clientIp(headers?: Record<string, string | string[] | undefined>): string {
  const raw = headers?.['x-forwarded-for'] ?? headers?.['x-real-ip'] ?? '';
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  return value.split(',')[0].trim() || 'unknown';
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

// achata a resposta da Draft5 pro formato mínimo do jogo
function slimUpstream(raw: unknown): FeedPayload | null {
  const data = (raw as { data?: Record<string, unknown> } | null)?.data;
  if (!data || !Array.isArray(data.news)) return null;
  const meta = (data.d5Meta ?? {}) as { link?: string; logo?: string };
  return {
    link: String(meta.link ?? 'https://draft5.gg'),
    logo: String(meta.logo ?? ''),
    totalPages: Number(data.totalPages ?? 0),
    news: (data.news as Record<string, unknown>[]).map((n) => ({
      title: String(n.postTitle ?? ''),
      excerpt: String(n.postExcerpt ?? ''),
      image: String(n.postImage ?? ''),
      imageCredit: Array.isArray(n.postImageCredit) ? String(n.postImageCredit[0] ?? '') : '',
      date: String(n.postDate ?? ''),
      slug: String(n.postSlug ?? ''),
      category: Array.isArray(n.postCategory) ? String(n.postCategory[0] ?? '') : '',
      author: String((n.author as { name?: string } | undefined)?.name ?? ''),
    })),
  };
}

export default async function handler(
  req: { method?: string; query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const ip = clientIp(req.headers);
  if (rateLimited(`ip:${ip}`, 60)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  const page = clampInt(req.query?.page, 1, 200, 1);
  const amount = clampInt(req.query?.amount, 1, 20, 6);
  const key = `${page}:${amount}`;

  const now = Date.now();
  const cached = feedCache.get(key);
  if (cached && cached.expiresAt > now) {
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.setHeader('X-News-Cache', 'hit');
    res.status(200).json(cached.payload);
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}?page=${page}&amount=${amount}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const payload = slimUpstream(await upstream.json());
    if (!payload) throw new Error('formato inesperado do upstream');
    if (feedCache.size > 500) feedCache.clear();
    feedCache.set(key, { payload, expiresAt: now + CACHE_TTL_MS });
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.setHeader('X-News-Cache', 'miss');
    res.status(200).json(payload);
  } catch {
    // upstream fora do ar: serve o cache vencido se existir (melhor notícia velha
    // que painel vazio); senão 502 e o cliente esconde a seção.
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.setHeader('X-News-Cache', 'stale');
      res.status(200).json(cached.payload);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'feed indisponível' });
  }
}
