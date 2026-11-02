// Vercel Web Analytics: pageviews agregados (visitas, páginas, países,
// referrers) no painel da Vercel, sem cookie. Complementa o /api/track, que é
// o funil fino (paywall → checkout) e grava no Neon.
//
// Privacidade: o beforeSend tira da URL tudo que não é caminho ou atribuição.
// Fica só ref/utm_*; sai o resto (cs = sessão do Stripe na volta do checkout,
// p = palpite codificado, liga = código da liga, duelo…) e o hash. Telas de
// admin não são contadas.
import { inject, type BeforeSendEvent } from '@vercel/analytics';

const KEEP_PARAMS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign'];

/** URL sem nada além do caminho e dos parâmetros de atribuição; null = não enviar. Puro (testado). */
export function redactAnalyticsUrl(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return null;
  const kept = new URLSearchParams();
  for (const k of KEEP_PARAMS) {
    const v = url.searchParams.get(k);
    if (v) kept.set(k, v.slice(0, 60));
  }
  const qs = kept.toString();
  return `${url.origin}${url.pathname}${qs ? `?${qs}` : ''}`;
}

export function installVercelAnalytics(): void {
  // só no build de produção: em dev o pacote carregaria o script de debug de
  // um CDN externo, fora da CSP
  if (!import.meta.env.PROD) return;
  try {
    inject({
      mode: 'production',
      beforeSend: (event: BeforeSendEvent) => {
        const url = redactAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      },
    });
  } catch { /* analytics nunca derruba o jogo */ }
}
