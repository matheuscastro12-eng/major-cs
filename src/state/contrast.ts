// Contraste de texto sobre a cor do time (selo com a sigla, TeamBadge).
// As cores vêm dos dados dos times e muitas vezes não passam do mínimo de
// leitura (Lighthouse no /major-singapore, 30/10: 2,97 a 4,04 contra 4,5).
// Quando a cor do texto não passa, troca por quase branco ou quase preto, o
// que contrastar mais com o fundo. Puro (testado em scripts/test-contrast.mts).

const LIGHT = '#f4f6fa';
const DARK = '#0b0f17';
export const MIN_CONTRAST = 4.5;

/** #rgb, #rrggbb ou rgb(r, g, b) → [r, g, b]; null se não der pra ler (ex.: var(--…)) */
export function parseColor(c: string): [number, number, number] | null {
  const s = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** razão de contraste WCAG entre duas cores (1 a 21) */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** a cor do texto se ela já for legível sobre o fundo; senão, quase branco ou quase preto */
export function readableInk(bg: string, fg: string): string {
  const b = parseColor(bg), f = parseColor(fg);
  if (!b || !f) return fg; // var(--…) ou formato desconhecido: fica como está
  if (contrastRatio(b, f) >= MIN_CONTRAST) return fg;
  return contrastRatio(b, parseColor(LIGHT)!) >= contrastRatio(b, parseColor(DARK)!) ? LIGHT : DARK;
}
