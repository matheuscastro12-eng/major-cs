// Lado DOM do compartilhamento: abre o intent do X e conta o clique.
// A montagem de URL/texto é pura e mora em shareLink.ts (testável).
import { shareHashtags, stripUrl, xIntentUrl } from './shareLink';
import { dataUrlBytes, inviteMessage } from './shareInvite';
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

/**
 * "Postar o card": com share sheet que aceita arquivo (celular), manda o PNG +
 * texto + link ('native'). Sem isso, abre o X com o texto e o link ('x') e
 * baixa o PNG para anexar, a não ser que o link já mostre o card no preview
 * (`preview`, o OG dinâmico do pick'em). Cancelar o share sheet não faz nada (null).
 * O arquivo sai do dataURL sem await antes do share: o toque ainda vale como gesto.
 */
export async function shareCard(kind: string, o: {
  /** PNG do card ('' = canvas indisponível: vai só o texto + link pro X) */
  dataUrl: string; filename: string; text: string; url: string; preview?: boolean;
}): Promise<'native' | 'x' | null> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const raw = dataUrlBytes(o.dataUrl);
  if (raw && typeof nav.share === 'function' && typeof File === 'function') {
    const file = new File([raw.bytes], o.filename, { type: raw.type });
    let ok: boolean;
    try { ok = !!nav.canShare?.({ files: [file] }); } catch { ok = false; }
    if (ok) {
      try {
        await nav.share({ files: [file], text: inviteMessage(o.text, o.url) });
        trackShare(kind, 'native');
        return 'native';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return null; // fechou o share sheet
        // outro erro (gesto expirado, alvo recusou o arquivo): segue pro X
      }
    }
  }
  if (!o.preview && o.dataUrl) {
    const a = document.createElement('a');
    a.href = o.dataUrl;
    a.download = o.filename;
    a.click();
  }
  postOnX(kind, o.text, o.url);
  return 'x';
}
