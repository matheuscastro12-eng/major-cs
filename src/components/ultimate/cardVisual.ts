// Visual das cartas do Ultimate: paletas, pele por raridade e boost de evolução.
// Puro (sem React) pra ser testável e reusável fora da UltimateSquadScreen.
import { EVO_MAX } from '../../engine/ultimate/state';
import { rarityInfo } from '../../engine/ultimate/rarities';
import type { UltCard } from '../../engine/ultimate/cards';

// As paletas de rank/raridade/química/título foram feitas pra fundo ESCURO.
// Sobre branco (placa clara das cartas comuns, tema claro opcional) usar essas
// cores como TEXTO fica ilegível (contraste ~1.5:1). inkOnLight escurece
// qualquer hex preservando o matiz até uma luminância legível (~4:1 no branco).
// Usar só onde a cor vira TEXTO.
export function inkOnLight(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  let r = parseInt(m[1].slice(0, 2), 16);
  let g = parseInt(m[1].slice(2, 4), 16);
  let b = parseInt(m[1].slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.2) {
    const f = 0.2 / lum;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  const h = (x: number) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Texto colorido sobre a SUPERFÍCIE da tela: o Ultimate agora é escuro (UX-02),
// então a cor da paleta vale como está; só escurece se o jogador ligou o tema
// claro do app (data-theme no <html>, ver career-theme.ts).
export function inkOnSurface(hex: string): string {
  const light = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  return light ? inkOnLight(hex) : hex;
}

// carta visual compacta, moldura/glow pela raridade.
export const ROLE_CODE: Record<string, string> = { AWP: 'AWP', Entry: 'ENT', Rifler: 'RIF', Lurker: 'LUR', Support: 'SUP', IGL: 'IGL' };
export const STAT_ROWS: [keyof UltCard['stats'], string][][] = [
  [['tiro', 'TIR'], ['mira', 'MIR'], ['reflexo', 'REF']],
  [['visao', 'VIS'], ['clutch', 'CLU'], ['util', 'UTI']],
];
export const FOIL_RARITIES = new Set(['legendary', 'icon', 'tots', 'major', 'promo']);
export const REGION_CODE: Record<string, string> = { samerica: 'SA', namerica: 'NA', europe: 'EU', cis: 'CIS', asia: 'AS', oceania: 'OCE', africa: 'AF', global: 'GLB' };

// tiers "especiais" ganham fundo ESCURO com brilho + foil; os comuns viram uma
// placa metálica CLARA. Dá hierarquia visual (comum → especial) estilo FUT.
export const DARK_TIERS =new Set(['elite', 'legendary', 'icon', 'tots', 'major', 'promo']);
export function cardSkin(rarity: UltCard['rarity']) {
  const c = rarityInfo(rarity).color;
  if (DARK_TIERS.has(rarity)) {
    return {
      dark: true, frame: c,
      bg: `linear-gradient(162deg, color-mix(in srgb, ${c} 80%, transparent) 0%, #1d2029 46%, #101118 100%)`,
      sheen: `radial-gradient(130% 62% at 50% -10%, color-mix(in srgb, ${c} 40%, transparent), transparent 60%)`,
      ink: '#fdf6e6', sub: 'rgba(253,246,230,0.6)', line: `color-mix(in srgb, ${c} 33%, transparent)`,
      plate: 'rgba(0,0,0,0.30)', label: c, inner: 'rgba(255,255,255,0.10)',
      glow: `0 8px 24px color-mix(in srgb, ${c} 33%, transparent)`, mark: 'rgba(253,246,230,0.32)', markSlash: 'color-mix(in srgb, var(--c-loss) 60%, transparent)',
    };
  }
  return {
    dark: false, frame: c,
    bg: `linear-gradient(158deg, #ffffff 0%, color-mix(in srgb, ${c} 15%, transparent) 44%, color-mix(in srgb, ${c} 27%, transparent) 100%)`,
    sheen: 'radial-gradient(130% 58% at 50% -8%, rgba(255,255,255,0.9), transparent 55%)',
    ink: '#20242e', sub: '#6b7280', line: `color-mix(in srgb, ${c} 40%, transparent)`,
    plate: `color-mix(in srgb, ${c} 15%, transparent)`, label: inkOnLight(c), inner: 'rgba(0,0,0,0.06)',
    glow: `0 5px 16px color-mix(in srgb, ${c} 23%, transparent)`, mark: 'rgba(32,36,46,0.26)', markSlash: 'color-mix(in srgb, var(--c-loss) 45%, transparent)',
  };
}

// aplica o nível de evolução (boost) no OVR e nos 6 atributos (clamp 99).
// Mantém key/rarity/playerId — só sobe os números. Base intacta se boost=0.
export function boostCard(base: UltCard, boost: number | undefined): UltCard {
  const b = Math.max(0, Math.min(EVO_MAX, Math.floor(boost ?? 0)));
  if (!b) return base;
  const up = (v: number) => Math.min(99, v + b);
  return {
    ...base,
    ovr: Math.min(99, base.ovr + b),
    stats: { tiro: up(base.stats.tiro), mira: up(base.stats.mira), reflexo: up(base.stats.reflexo), visao: up(base.stats.visao), clutch: up(base.stats.clutch), util: up(base.stats.util) },
  };
}

// [URG-1] selo de edição da temporada: em forma (S3, laranja, +OVR) ou Legado S3 (cinza, OVR base)
export type EditionBadge = { n: number; current: boolean } | null;
