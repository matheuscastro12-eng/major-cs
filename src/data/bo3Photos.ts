// Fotos de jogadores do bo3.gg — LIGADAS por padrão (aprovado pelo Matheus em 26/10/2026).
// Desligar: VITE_FF_BO3_PHOTOS=0. Os termos do bo3.gg (bo3.gg/wiki/use-of-services)
// permitem reproduzir o conteúdo com LINK ATIVO pro site: toda tela com fotos mostra
// "Fotos: bo3.gg" como <a href="https://bo3.gg">, e os cards em imagem (sem link
// clicável) escrevem o crédito + a URL bo3.gg visível.
// As fotos VÁLIDAS ficam commitadas em public/players/bo3/ (servidas pelo nosso domínio,
// same-origin, sem hotlink): o build na Vercel não depende de rede nem do CDN do bo3.gg.
// bo3-photos.json só lista as que existem em disco; as quebradas (404 no CDN) ficam em
// bo3-photos-missing.json → placeholder com iniciais. Atualizar: npm run photos:bo3.
import photos from './bo3-photos.json';

export const BO3_PHOTOS_ON = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FF_BO3_PHOTOS !== '0';
export const BO3_PHOTO_CREDIT = 'Fotos: bo3.gg';
export const BO3_PHOTO_CREDIT_URL = 'https://bo3.gg';
/** Crédito pros cards em imagem: texto + URL visível (imagem não tem link clicável). */
export const BO3_PHOTO_CREDIT_CARD = 'Fotos: bo3.gg · https://bo3.gg';

const MAP = photos as Record<string, string>;
export const photoSlug = (nick: string) => nick.toLowerCase().replace(/[^a-z0-9_-]/g, '');

/** Caminho local (same-origin) da foto, ou null se não houver / flag OFF. */
export function bo3PhotoPath(nick: string, on = BO3_PHOTOS_ON): string | null {
  const k = photoSlug(nick);
  return on && MAP[k] ? `/players/bo3/${k}.webp` : null;
}

export function initials(nick: string): string {
  const s = nick.replace(/[^A-Za-z0-9]/g, '');
  return (s.slice(0, 2) || '?').toUpperCase();
}

// cache de <img> pros cards em canvas (desenho síncrono: usa o que já carregou)
const cache = new Map<string, HTMLImageElement>();
export function preloadPhotos(nicks: string[]): void {
  if (typeof Image === 'undefined') return;
  for (const n of nicks) {
    const p = bo3PhotoPath(n);
    if (!p || cache.has(p)) continue;
    const img = new Image(); img.decoding = 'async'; img.src = p; cache.set(p, img);
  }
}
export function loadedPhoto(nick: string): HTMLImageElement | null {
  const p = bo3PhotoPath(nick);
  const img = p ? cache.get(p) : undefined;
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Avatar circular no canvas: foto (same-origin, não suja o canvas) ou iniciais. */
export function drawAvatar(ctx: CanvasRenderingContext2D, nick: string, x: number, y: number, r: number, color: string, font: string): void {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  const img = loadedPhoto(nick);
  if (img) {
    ctx.clip();
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, 0, s, s, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 0.8)}px ${font}`; ctx.fillText(initials(nick), x, y + 1);
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}
