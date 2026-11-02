// Links de compartilhamento com atribuição (?ref + utm) e intent do X.
//
// TS PURO: sem React, sem window/document — testado em server/share-link.test.ts.
// O lado DOM (abrir a aba do X, disparar telemetria) fica em state/shareX.ts.
//
// Por quê: até aqui todo card/grade apontava pra roadtomajor.com.br "seco" e o
// evento visit só sabia o referrer. Não dava pra saber se um post no X ou a
// grade do Diário no grupo gerou visita, nem se a visita virou vitalícia.
// Com ?ref, o trackVisit grava a origem e o checkout_open/signup_done herdam.

export const SITE = 'https://roadtomajor.com.br';

/** refs conhecidos (kebab-case). string livre também passa pelo saneamento. */
export type ShareRef =
  | 'daily' | 'marathon' | 'rtp-series' | 'ult-card' | 'career-card'
  | 'legado' | 'final' | 'weekly' | 'decision';

/** kebab-case seguro pra query: [a-z0-9-], até 40 chars. */
export function cleanRef(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * URL pública com atribuição: `{base}{path}?ref={ref}&utm_source=share&utm_medium={ref}`.
 * Não duplica `?` se o path já tiver query; preserva `#hash` no fim.
 */
export function shareUrl(path: string, ref: string, extra: Record<string, string> = {}, base: string = SITE): string {
  const r = cleanRef(ref) || 'share';
  let p = path.startsWith('/') ? path : `/${path}`;
  let hash = '';
  const hashAt = p.indexOf('#');
  if (hashAt >= 0) { hash = p.slice(hashAt); p = p.slice(0, hashAt); }
  const qs = new URLSearchParams({ ref: r, utm_source: 'share', utm_medium: r, ...extra }).toString();
  const sep = p.includes('?') ? (p.endsWith('?') || p.endsWith('&') ? '' : '&') : '?';
  return `${base.replace(/\/+$/, '')}${p}${sep}${qs}${hash}`;
}

/** No máximo 2 hashtags — mais que isso derruba o alcance no X. */
export function shareHashtags(kind?: string): string {
  void kind; // reservado: hoje todo kind usa o mesmo par
  return '#CS2 #RoadToMajor';
}

// O X conta todo link como 23 chars (t.co) e pesa caracteres fora do bloco
// latino (emoji, CJK) como 2 — mesma tabela do twitter-text.
export const X_URL_WEIGHT = 23;
export const X_TEXT_LIMIT = 270;

function charWeight(cp: number): number {
  if (cp <= 4351) return 1;
  if ((cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1;
  return 2;
}

/** Peso de um texto no contador do X (sem considerar links dentro dele). */
export function xWeight(text: string): number {
  let w = 0;
  for (const ch of text) w += charWeight(ch.codePointAt(0) ?? 0);
  return w;
}

const ELLIPSIS_WEIGHT = charWeight(0x2026); // '…' fora das faixas leves: pesa 2

/** Corta o texto até `max` de peso, terminando em reticências. */
export function truncateForX(text: string, max: number): string {
  if (xWeight(text) <= max) return text;
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cw = charWeight(ch.codePointAt(0) ?? 0);
    if (w + cw > max - ELLIPSIS_WEIGHT) break; // reserva o peso do '…'
    out += ch;
    w += cw;
  }
  return `${out.trimEnd()}…`;
}

/** Remove a URL (e o que sobrar de espaço/quebra) do texto, pra mandá-la via `&url=`. */
export function stripUrl(text: string, url: string): string {
  let t = text;
  for (const u of [url, url.replace(/^https?:\/\//, '')]) t = t.split(u).join('');
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Intent de post do X. O link vai separado em `&url=` (vira card/preview) e o
 * texto é limitado a 270 contando a URL como 23 — o link nunca é cortado.
 */
export function xIntentUrl(text: string, url?: string): string {
  const budget = X_TEXT_LIMIT - (url ? X_URL_WEIGHT + 1 : 0); // +1 do espaço antes do link
  const params = new URLSearchParams({ text: truncateForX(text.trim(), budget) });
  if (url) params.set('url', url);
  // URLSearchParams usa '+' pra espaço; o intent do X aceita, mas %20 é o
  // formato canônico e não ambíguo em qualquer cliente.
  return `https://x.com/intent/post?${params.toString().replace(/\+/g, '%20')}`;
}
