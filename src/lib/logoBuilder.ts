// Logo Builder — T7.2 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Versão aprimorada do `buildLogoDataUrl` original (que vive em CareerScreen).
// Mesmas 6 shapes, MAS:
//   - iniciais são input separado (1-3 chars), default = tag
//   - layout: 'centered' (texto no centro do emblema) ou 'lower' (texto na metade
//     inferior, deixando o emblema dominar a metade superior — padrão "varsity")
//   - opção 'outlined' adiciona contorno fino na cor secundária
//   - tamanho do texto auto-ajusta para 1/2/3 letras
//
// API estável pra reuso fora do FoundOrg (modal de "Editar logo" pós-fundação).

export type LogoShape = 'shield' | 'circle' | 'hexagon' | 'bolt' | 'star' | 'diamond';

export const LOGO_SHAPES: { id: LogoShape; label: string }[] = [
  { id: 'shield', label: 'Escudo' },
  { id: 'circle', label: 'Círculo' },
  { id: 'hexagon', label: 'Hexágono' },
  { id: 'bolt', label: 'Raio' },
  { id: 'star', label: 'Estrela' },
  { id: 'diamond', label: 'Losango' },
];

export interface LogoConfig {
  shape: LogoShape;
  /** Cor principal (preenchimento da forma) */
  primary: string;
  /** Cor secundária (texto + contorno opcional) */
  secondary: string;
  /** 1-3 caracteres exibidos sobre/sob a forma */
  initials: string;
  /** Posição do texto */
  layout: 'centered' | 'lower';
  /** Contorno fino na cor secundária ao redor da forma */
  outlined: boolean;
}

export const DEFAULT_LOGO_CONFIG: LogoConfig = {
  shape: 'shield',
  primary: '#101820',
  secondary: '#e8c170',
  initials: 'ORG',
  layout: 'centered',
  outlined: false,
};

function shapePath(id: LogoShape): string {
  switch (id) {
    case 'shield':  return 'M50 6 L90 20 V52 C90 76 72 90 50 96 C28 90 10 76 10 52 V20 Z';
    case 'circle':  return 'M50 6 A44 44 0 1 1 50 94 A44 44 0 1 1 50 6 Z';
    case 'hexagon': return 'M50 6 L88 28 V72 L50 94 L12 72 V28 Z';
    case 'bolt':    return 'M50 4 L18 54 H44 L38 96 L84 40 H56 Z';
    case 'star':    return 'M50 6 L61 38 H95 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 H39 Z';
    case 'diamond': return 'M50 4 L92 50 L50 96 L8 50 Z';
  }
}

/** Constrói SVG inline (string). Usado no preview ao vivo do builder. */
export function buildLogoSvg(cfg: LogoConfig): string {
  const text = (cfg.initials || 'ORG').slice(0, 3).toUpperCase();
  const len = text.length;
  const baseSize = len >= 3 ? 28 : len === 2 ? 36 : 48;
  // No layout 'lower', shrink um pouco e mande pra baixo
  const fontSize = cfg.layout === 'lower' ? Math.round(baseSize * 0.78) : baseSize;
  const y = cfg.layout === 'lower' ? 72 : 50;
  const path = shapePath(cfg.shape);
  const outline = cfg.outlined
    ? `<path d="${path}" fill="none" stroke="${cfg.secondary}" stroke-width="3" stroke-linejoin="round"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="${path}" fill="${cfg.primary}"/>` +
    outline +
    `<text x="50" y="${y}" dy="0.36em" text-anchor="middle" ` +
      `font-family="Arial Narrow, Arial, sans-serif" font-weight="800" ` +
      `font-size="${fontSize}" fill="${cfg.secondary}">${text}</text>` +
    `</svg>`
  );
}

/** Constrói data URL pronto pra ser usado em <img src=…> ou save.org.logo. */
export function buildLogoDataUrl(cfg: LogoConfig): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildLogoSvg(cfg))}`;
}
