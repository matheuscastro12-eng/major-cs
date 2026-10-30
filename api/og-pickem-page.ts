// HTML do preview do link do pick'em, SÓ para robô de preview (X, WhatsApp,
// Discord, Telegram, Slack…). Chega aqui pelo rewrite de /major-singapore com
// `has` de user-agent + ?p no vercel.json; gente de verdade recebe a SPA.
// `p` inválido/ausente → card padrão do site, nunca erro. Lógica em
// server/og-pickem.ts.
import { buildPickemHtml, imageOrigin, loadMajorData, ogVersion, pickemMeta, pickemSummary } from '../server/og-pickem.js';

interface Res {
  status: (code: number) => { end: (body?: string) => void };
  setHeader: (k: string, v: string) => void;
}

export default function handler(
  req: { query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  let html: string;
  try {
    const d = loadMajorData();
    html = buildPickemHtml(pickemMeta(pickemSummary(d, req.query?.p), imageOrigin(req.headers), ogVersion(d)));
  } catch (e) {
    console.error('og_pickem_page', e);
    html = buildPickemHtml(pickemMeta(null, '', ''));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // HTML barato (sem render): o robô guarda o card do lado dele; a borda não
  // cacheia pra nunca misturar a resposta do robô com a SPA da mesma URL.
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.status(200).end(html);
}
