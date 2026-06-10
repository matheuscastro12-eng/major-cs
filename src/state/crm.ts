import { BASE_TEAMS } from '../data/teams';
import type { TeamSeason } from '../types';

// v3: invalida snapshots locais antigos (navegadores que guardaram lineups
// desatualizadas e por isso ignoravam a base corrigida do Neon/teams.json).
const STORAGE_KEY = 'major-cs-dataset-v3';
// limpa a chave antiga uma vez, para não deixar lixo no localStorage
try {
  localStorage.removeItem('major-cs-dataset-v2');
} catch {
  /* ambiente sem localStorage (SSR/testes) */
}

// dados salvos por versões antigas podem não ter coach - normaliza
export function normalizeTeams(teams: TeamSeason[]): TeamSeason[] {
  return teams.map((t) => ({
    ...t,
    coach: t.coach ?? {
      nick: 'coach',
      name: 'Coach Genérico',
      country: t.country,
      rating: 78,
      style: 'tactical' as const,
    },
  }));
}

export function loadDataset(): TeamSeason[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(BASE_TEAMS);
    const parsed = JSON.parse(raw) as TeamSeason[];
    if (!Array.isArray(parsed) || parsed.length === 0) return structuredClone(BASE_TEAMS);
    return normalizeTeams(parsed);
  } catch {
    return structuredClone(BASE_TEAMS);
  }
}

export function saveDataset(teams: TeamSeason[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

export function resetDataset(): TeamSeason[] {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(BASE_TEAMS);
}

export function isCustomized(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

// ---- exportar / importar a base (backup e migração entre domínios) ----
// localStorage é por domínio: exportar num domínio e importar em outro
// recupera edições feitas em outra URL (ex: vercel.app -> roadtomajor.com.br).
export function exportDataset(teams: TeamSeason[]): void {
  const blob = new Blob([JSON.stringify(teams, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `road-to-major-base-${teams.length}-times.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importDatasetFromFile(file: File): Promise<TeamSeason[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('falha ao ler o arquivo'));
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as TeamSeason[];
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('vazio');
        if (!parsed.every((t) => t && typeof t.id === 'string' && Array.isArray(t.players))) {
          throw new Error('formato inválido');
        }
        resolve(normalizeTeams(parsed));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('arquivo inválido'));
      }
    };
    reader.readAsText(file);
  });
}

// ---- imagens customizadas de mapas (upload no CRM) ----
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
    alert('Não foi possível salvar a imagem (limite de armazenamento do navegador). Use uma imagem menor.');
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

// Fonte primária remota: banco Neon servido por /api/teams (Vercel).
// Retorna null se indisponível (dev local sem backend, offline, erro) -
// nesse caso o app segue com o dataset embutido/localStorage.
export async function fetchRemoteDataset(): Promise<TeamSeason[] | null> {
  try {
    const res = await fetch('/api/teams', { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as TeamSeason[];
    if (!Array.isArray(data) || data.length < 16) return null;
    if (!data.every((t) => t && Array.isArray(t.players) && t.players.length >= 5)) return null;
    return normalizeTeams(data);
  } catch {
    return null;
  }
}
