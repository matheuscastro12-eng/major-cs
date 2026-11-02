// MAJOR COM AMIGOS — cliente da liga privada (api/major-league.ts).
// O id do membro anônimo e as ligas em que você entrou ficam no navegador
// (try/catch: sem storage, a liga funciona só nesta aba). Com conta, o token
// vai junto e identifica você.
import { getToken } from './account';

export interface LeagueInfo { code: string; name: string; seed: number; revealed: boolean; isOwner: boolean }
export interface LeagueEntry { nick: string; picks: string; complete: boolean; me: boolean }
export interface LeagueView { league: LeagueInfo; entries: LeagueEntry[] }

const ID_KEY = 'rtm-major-league-id-v1';
const LIST_KEY = 'rtm-major-leagues-v1';
let memId = '';

function memberId(): string {
  try {
    const got = localStorage.getItem(ID_KEY);
    if (got && /^[A-Za-z0-9_-]{16,64}$/.test(got)) return got;
  } catch { /* sem storage */ }
  if (!memId) {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    memId = Array.from(b, (x) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[x & 63]).join('');
  }
  try { localStorage.setItem(ID_KEY, memId); } catch { /* sem storage */ }
  return memId;
}

export interface SavedLeague { code: string; nick: string }

export function loadSavedLeagues(): SavedLeague[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x?.code === 'string' && typeof x?.nick === 'string').slice(0, 10) : [];
  } catch { return []; }
}

export function saveLeague(l: SavedLeague): void {
  try {
    const list = [l, ...loadSavedLeagues().filter((x) => x.code !== l.code)].slice(0, 10);
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch { /* sem storage */ }
}

export function forgetLeague(code: string): void {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(loadSavedLeagues().filter((x) => x.code !== code))); } catch { /* sem storage */ }
}

export type LeagueResult = { ok: true; view: LeagueView } | { ok: false; error: string };

async function call(body: Record<string, unknown>): Promise<LeagueResult> {
  try {
    const r = await fetch('/api/major-league', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, memberId: memberId(), token: getToken() ?? undefined }),
      signal: AbortSignal.timeout(9000),
    });
    const d = (await r.json().catch(() => ({}))) as Partial<LeagueView> & { error?: string };
    if (!r.ok) return { ok: false, error: d.error ?? '' };
    if (!d.league) return { ok: false, error: d.error ?? '' };
    return { ok: true, view: { league: d.league, entries: d.entries ?? [] } };
  } catch { return { ok: false, error: '' }; }
}

export const createLeague = (nick: string, name: string, picks?: string) => call({ action: 'create', nick, name, picks });
export const joinLeague = (code: string, nick: string) => call({ action: 'join', code, nick });
export const sendLeaguePicks = (code: string, nick: string, picks: string) => call({ action: 'picks', code, nick, picks });
export const getLeague = (code: string) => call({ action: 'get', code });
export async function revealLeague(code: string): Promise<LeagueResult> {
  try {
    const r = await fetch('/api/major-league', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reveal', code, memberId: memberId(), token: getToken() ?? undefined }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return { ok: false, error: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? '' };
  } catch { return { ok: false, error: '' }; }
  return getLeague(code);
}
