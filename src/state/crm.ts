import { BASE_TEAMS, BASE_REV } from '../data/teams';
import type { TeamSeason } from '../types';
import { ct } from './career-i18n';

// v3: invalida snapshots locais antigos (navegadores que guardaram lineups
// desatualizadas e por isso ignoravam a base corrigida do Neon/teams.json).
const STORAGE_KEY = 'major-cs-dataset-v3';
// rev do build com que o cache local foi gravado. Se o build novo tem um rev
// diferente (qualquer att de elenco), o cache antigo é descartado sozinho.
const REV_KEY = 'major-cs-dataset-rev';
// Última combinação build + versão remota sincronizada. Evita baixar a base
// completa em cada F5; uma consulta pequena de versão decide se houve mudança.
const REMOTE_SYNC_KEY = 'major-cs-dataset-remote-sync-v1';
// marca quando há edições LOCAIS ainda não enviadas ao banco. Só nesse caso o
// app mantém a cópia local; senão sempre adota a base do servidor (verdade
// compartilhada), garantindo que o "Salvar no banco" do admin chegue a todos.
const DIRTY_KEY = 'major-cs-dataset-dirty-v1';
// limpa a chave antiga uma vez, para não deixar lixo no localStorage
try {
  localStorage.removeItem('major-cs-dataset-v2');
} catch {
  /* ambiente sem localStorage (SSR/testes) */
}

export function markDirty(): void {
  try {
    localStorage.setItem(DIRTY_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearDirty(): void {
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ignore */
  }
}

// true quando o usuário tem edições locais ainda não salvas no banco
export function hasUnsavedEdits(): boolean {
  return localStorage.getItem(DIRTY_KEY) === '1';
}

// dados salvos por versões antigas podem não ter coach - normaliza
export function normalizeTeams(teams: TeamSeason[]): TeamSeason[] {
  return teams.map((t) => ({
    ...t,
    coach: t.coach ?? {
      nick: 'coach',
      name: ct('Coach Genérico'),
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
    // deploy novo (rev do build mudou) e sem edições locais pendentes: descarta
    // o cache antigo e adota a base fresca. É isto que faz a att chegar ao
    // jogador SEM ele precisar limpar o localStorage.
    if (localStorage.getItem(REV_KEY) !== BASE_REV && !hasUnsavedEdits()) {
      const fresh = structuredClone(BASE_TEAMS);
      saveDataset(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as TeamSeason[];
    if (!Array.isArray(parsed) || parsed.length === 0) return structuredClone(BASE_TEAMS);
    return normalizeTeams(parsed);
  } catch {
    return structuredClone(BASE_TEAMS);
  }
}

export function saveDataset(teams: TeamSeason[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  // carimba o cache com o rev do build atual (controle de "está atualizado?")
  try {
    localStorage.setItem(REV_KEY, BASE_REV);
  } catch {
    /* ignore */
  }
}

export function resetDataset(): TeamSeason[] {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REMOTE_SYNC_KEY);
  clearDirty();
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

// Fonte primária remota: banco Neon servido por /api/teams (Vercel).
// Retorna null se indisponível (dev local sem backend, offline, erro) -
// nesse caso o app segue com o dataset embutido/localStorage.
// Salva a base inteira no banco Neon (admin). Passa a valer para TODOS os
// usuários e para qualquer build/campanha nova (o app lê /api/teams na carga).
export async function saveDatasetToServer(
  teams: TeamSeason[],
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, teams, deleteIds: getDeletedTeamIds(), rev: BASE_REV }),
      signal: AbortSignal.timeout(30000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: string };
    if (res.ok && data.ok) {
      if (data.version) {
        try {
          localStorage.setItem(REMOTE_SYNC_KEY, `${BASE_REV}:${data.version}`);
        } catch {
          /* armazenamento indisponível */
        }
      }
      return { ok: true };
    }
    return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---- deleções explícitas (tombstones) ----
// O POST /api/teams agora é MERGE: só apaga ids enviados em deleteIds. O CRM
// registra aqui cada exclusão feita pelo admin; a lista persiste (não é limpa
// após salvar) para o merge de pendentes do build não ressuscitar o time.
const DELETED_KEY = 'major-cs-deleted-v1';

export function recordDeletedTeam(id: string): void {
  try {
    const a = JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]') as string[];
    if (!a.includes(id)) {
      a.push(id);
      localStorage.setItem(DELETED_KEY, JSON.stringify(a));
    }
  } catch {
    /* sem storage */
  }
}

export function getDeletedTeamIds(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]');
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Garante que times PENDENTES novos do build (teams.json) apareçam sempre no
// CRM para aprovação, mesmo que o banco ainda não os tenha (evita "time some").
// Para os jogadores não muda nada: pendentes são filtrados do draft.
export function mergePendingBaseTeams(teams: TeamSeason[]): TeamSeason[] {
  const have = new Set(teams.map((t) => t.id));
  const deleted = new Set(getDeletedTeamIds());
  const extras = BASE_TEAMS.filter((t) => t.pending && !have.has(t.id) && !deleted.has(t.id));
  return extras.length ? [...teams, ...extras] : teams;
}

// Retorna a base do banco + o rev do build com que ela foi salva (header
// X-Dataset-Rev). O rev permite saber se o banco está atrás do build atual.
export async function fetchRemoteDataset(): Promise<{ teams: TeamSeason[]; rev: string } | null> {
  try {
    let version = '';
    try {
      const metaRes = await fetch('/api/teams?meta=1', { signal: AbortSignal.timeout(4000) });
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { version?: string };
        version = String(meta.version ?? '').slice(0, 96);
        const token = version ? `${BASE_REV}:${version}` : '';
        if (token && localStorage.getItem(STORAGE_KEY) && localStorage.getItem(REMOTE_SYNC_KEY) === token) {
          return null;
        }
      }
    } catch {
      // Backend antigo/indisponível: tenta a rota completa para manter compatibilidade.
    }

    const query = version ? `?version=${encodeURIComponent(version)}` : '';
    const res = await fetch(`/api/teams${query}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as TeamSeason[];
    if (!Array.isArray(data) || data.length < 16) return null;
    if (!data.every((t) => t && Array.isArray(t.players) && t.players.length >= 5)) return null;
    const responseVersion = res.headers.get('X-Dataset-Version') ?? version;
    if (responseVersion) {
      try {
        localStorage.setItem(REMOTE_SYNC_KEY, `${BASE_REV}:${responseVersion}`);
      } catch {
        /* armazenamento indisponível */
      }
    }
    return { teams: normalizeTeams(data), rev: res.headers.get('X-Dataset-Rev') ?? '' };
  } catch {
    return null;
  }
}
