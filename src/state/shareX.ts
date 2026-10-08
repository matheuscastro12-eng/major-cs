// Lado DOM do compartilhamento: abre o intent do X e conta o clique.
// A montagem de URL/texto é pura e mora em shareLink.ts (testável).
import { shareHashtags, stripUrl, xIntentUrl } from './shareLink';
import { trackShare, type ShareChannel } from './track';

/**
 * Abre o compositor do X numa aba nova com o texto pronto e o link em `&url=`.
 * Se o texto já trouxer o link (texto pensado pro share nativo/clipboard), ele
 * é removido do corpo pra não aparecer duas vezes.
 */
export function postOnX(kind: string, text: string, url: string): void {
  trackShare(kind, 'x');
  const body = `${stripUrl(text, url)}\n\n${shareHashtags(kind)}`;
  try { window.open(xIntentUrl(body, url), '_blank', 'noopener'); } catch { /* popup bloqueado */ }
}

/**
 * Share padrão de TEXTO: navigator.share (mobile) e, sem ele ou cancelado,
 * clipboard. Devolve o canal usado (ou null se nada funcionou) pra UI dar feedback.
 */
export async function shareText(kind: string, text: string): Promise<ShareChannel | null> {
  try {
    if (navigator.share) { await navigator.share({ text }); trackShare(kind, 'native'); return 'native'; }
  } catch { /* cancelado — cai pro clipboard */ }
  try { await navigator.clipboard.writeText(text); trackShare(kind, 'copy'); return 'copy'; } catch { return null; }
}
