// PNG 1200x630 do preview do link do pick'em (og:image de api/og-pickem-page.ts).
// O mesmo `p` sempre gera a mesma imagem: cache de 1 ano na borda. `p`
// inválido → redireciona pro card padrão (/og.png). Desenho em
// server/og-pickem-image.ts.
import { loadMajorData, pickemSummary } from '../server/og-pickem.js';
import { renderPickemPng } from '../server/og-pickem-image.js';

interface Res {
  status: (code: number) => { end: (body?: Uint8Array) => void };
  setHeader: (k: string, v: string) => void;
}

const fallback = (res: Res, cache: string) => {
  res.setHeader('Location', '/og.png');
  res.setHeader('Cache-Control', cache);
  res.status(302).end();
};

export default async function handler(
  req: { method?: string; query?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).end();
    return;
  }
  let summary: ReturnType<typeof pickemSummary>;
  try {
    summary = pickemSummary(loadMajorData(), req.query?.p);
  } catch (e) {
    console.error('og_pickem_data', e);
    fallback(res, 'no-store');
    return;
  }
  if (!summary) { fallback(res, 'public, s-maxage=86400'); return; }
  try {
    const png = await renderPickemPng(summary);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable');
    res.status(200).end(png);
  } catch (e) {
    console.error('og_pickem_render', e);
    fallback(res, 'no-store');
  }
}
