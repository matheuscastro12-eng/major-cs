// Walkable mask derivada do radar PNG. T2.5+ — evita agents atravessando parede.
//
// Como funciona:
//   1) Carrega a Image do radar
//   2) Desenha em canvas off-screen
//   3) Pra cada pixel: walkable = (alpha > 100) AND (brilho > LUMA_THRESHOLD)
//      - alpha 0 = transparente = fora do mapa = parede
//      - brilho baixo = preto/sombra do PNG = parede
//      - brilho alto = corredor/chão = andável
//   4) Aplica erosão (~5px) pra os agents (raio 10) não ficarem 50% no nada
//   5) Armazena Uint8Array (0 = wall, 1 = walkable)
//
// Custo: 1024² = 1MB de RAM por mapa. Carregamento ~50-100ms (uma vez por mapa).
// Cache global pra que trocar de mapa e voltar não re-processe.
//
// A escolha do LUMA_THRESHOLD depende da paleta do radar. CS2 atual usa
// radares com chão ~#aaa-#eee e paredes ~#222-#444. Threshold 90 dá boa
// separação. Mapas com paleta diferente podem precisar override per-map.

interface WalkableMaskData {
  width: number;
  height: number;
  data: Uint8Array; // length = width * height; 0 = wall, 1 = walkable
}

export interface WalkableMask extends WalkableMaskData {
  walkable: (x: number, y: number) => boolean;
}

// Threshold de brilho (0-255). Pixels mais escuros que isso viram parede.
// Calibrado conservador: o radar CS2 tem corredores em tons médios (~120-180),
// e queremos NÃO catalogar essas áreas como parede. Threshold alto demais
// (ex.: 90) acabava com áreas legítimas pretas-mas-andáveis.
const LUMA_THRESHOLD = 70;
// Raio de erosão das paredes (pixels). Engrossa pra dar margem aos agents
// (raio ~11). Valor alto = mais áreas viram parede. Hoje 2: mantém a maioria
// dos corredores abertos. Calibrado pra que SPAWNS nunca virem parede.
const EROSION_RADIUS = 2;

const cache = new Map<string, WalkableMask>();
const loading = new Map<string, Promise<WalkableMask>>();

// API pública: pega ou inicia o load. Devolve null síncrono quando ainda não
// carregou (consumer deve chamar de novo nos próximos frames).
export function getMaskSync(url: string): WalkableMask | null {
  return cache.get(url) ?? null;
}

export function ensureMask(url: string): Promise<WalkableMask> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = loading.get(url);
  if (inflight) return inflight;
  const p = loadMaskFromUrl(url).then((mask) => {
    cache.set(url, mask);
    loading.delete(url);
    return mask;
  });
  loading.set(url, p);
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carregamento

async function loadMaskFromUrl(url: string): Promise<WalkableMask> {
  const img = await loadImage(url);
  const w = img.width;
  const h = img.height;
  // canvas offscreen
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('walkableMask: failed to get canvas 2d context');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h).data;

  // Primeira passada: brilho + alpha
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = pixels[o + 3];
    if (a < 100) {
      raw[i] = 0;
      continue;
    }
    const luma = (pixels[o] + pixels[o + 1] + pixels[o + 2]) / 3;
    raw[i] = luma >= LUMA_THRESHOLD ? 1 : 0;
  }

  // Erosão: pra cada pixel walkable, vira wall se algum vizinho em raio R é wall.
  // Forma quadrado (rápido vs círculo) — diferença visual mínima nesse raio.
  const data = erodeWalkable(raw, w, h, EROSION_RADIUS);

  return makeMask({ width: w, height: h, data });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`walkableMask: image load failed ${url} (${String(e)})`));
    img.src = url;
  });
}

// Erosão quadrada: pra cada pixel, walkable só se TODOS os pixels num quadrado
// de lado (2*radius+1) ao redor também forem walkable. Implementação ingênua
// O(w*h*r²). Pra 1024² + r=5: ~30M ops, ~50-100ms. Aceitável (cached).
function erodeWalkable(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Edge → wall (não tenta erodir além das bordas)
      if (x < radius || x >= w - radius || y < radius || y >= h - radius) {
        out[y * w + x] = 0;
        continue;
      }
      let ok = 1;
      // varre a vizinhança; sai assim que achar 1 wall
      for (let dy = -radius; dy <= radius && ok; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (src[(y + dy) * w + (x + dx)] === 0) {
            ok = 0;
            break;
          }
        }
      }
      out[y * w + x] = ok;
    }
  }
  return out;
}

function makeMask(d: WalkableMaskData): WalkableMask {
  const walkable = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= d.width || iy < 0 || iy >= d.height) return false;
    return d.data[iy * d.width + ix] === 1;
  };
  return { ...d, walkable };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper de movimento com slide ao colidir
//
// Tenta avançar em `dir * step`. Se a próxima posição é parede, tenta deslizar
// 70% nas perpendiculares (esquerda/direita). Se ainda assim parede, fica.
// Não é A*, mas em corredores normais resolve.

import type { Vec2 } from '../data/mapGeometry';

export function stepWithMask(pos: Vec2, dir: Vec2, step: number, mask: WalkableMask | null): Vec2 {
  if (!mask) {
    return { x: pos.x + dir.x * step, y: pos.y + dir.y * step };
  }
  // Try straight
  const ahead = { x: pos.x + dir.x * step, y: pos.y + dir.y * step };
  if (mask.walkable(ahead.x, ahead.y)) return ahead;

  // Try slide perpendicular (right hand)
  const right = { x: -dir.y, y: dir.x };
  const slideR = { x: pos.x + right.x * step * 0.75, y: pos.y + right.y * step * 0.75 };
  if (mask.walkable(slideR.x, slideR.y)) return slideR;

  // Try slide perpendicular (left hand)
  const left = { x: dir.y, y: -dir.x };
  const slideL = { x: pos.x + left.x * step * 0.75, y: pos.y + left.y * step * 0.75 };
  if (mask.walkable(slideL.x, slideL.y)) return slideL;

  // Try shorter steps along original direction (50%, 25%) — caso o passo
  // tenha sido grande demais (alta velocidade + dt grande)
  for (const frac of [0.5, 0.25]) {
    const tiny = { x: pos.x + dir.x * step * frac, y: pos.y + dir.y * step * frac };
    if (mask.walkable(tiny.x, tiny.y)) return tiny;
  }

  // Last-resort fallback: se NADA é walkable em volta, ignora a mask e anda
  // em linha reta mesmo. Atravessar uma parede esporadicamente é MUITO melhor
  // que ficar parado pra sempre (causava agents inertes + rounds nunca
  // acabando). Acontece em mapas onde a calibração spawn/site caiu dentro de
  // uma "ilha" de wall após erosão.
  return { x: pos.x + dir.x * step, y: pos.y + dir.y * step };
}
