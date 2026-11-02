import { ct } from './career-i18n';

// Imagens customizadas de mapas (upload no CRM). Ficam fora do state/crm.ts de
// propósito: o components/ui.tsx (carga inicial) lê estas imagens, e o crm.ts
// importa a base histórica inteira (teams.json + atributos), que só baixa com
// as telas de jogo (ver state/baseDataset.ts).
const MAPIMG_KEY = 'major-map-images-v1';
let mapImgCache: Record<string, string> | null = null;

export function loadMapImages(): Record<string, string> {
  if (mapImgCache) return mapImgCache;
  try {
    mapImgCache = JSON.parse(localStorage.getItem(MAPIMG_KEY) ?? '{}') as Record<string, string>;
  } catch {
    mapImgCache = {};
  }
  return mapImgCache;
}

export function saveMapImage(map: string, dataUrl: string | null): Record<string, string> {
  const imgs = { ...loadMapImages() };
  if (dataUrl) imgs[map] = dataUrl;
  else delete imgs[map];
  mapImgCache = imgs;
  try {
    localStorage.setItem(MAPIMG_KEY, JSON.stringify(imgs));
  } catch {
    alert(ct('Não foi possível salvar a imagem (limite de armazenamento do navegador). Use uma imagem menor.'));
  }
  return imgs;
}

// redimensiona um arquivo de imagem para dataURL (mantém proporção)
export function fileToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('falha ao ler arquivo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('arquivo não é uma imagem'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
