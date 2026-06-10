import { BASE_TEAMS } from '../data/teams';
import type { TeamSeason } from '../types';

const STORAGE_KEY = 'major-cs-dataset-v2';

// dados salvos por versões antigas podem não ter coach — normaliza
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

// Fonte primária remota: banco Neon servido por /api/teams (Vercel).
// Retorna null se indisponível (dev local sem backend, offline, erro) —
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
