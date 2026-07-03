// Cliente do ranking online (MMR/ladder/temporadas). O ranking SALVO é da conta paga;
// jogador grátis joga online normal, mas não persiste pontos.
import { getToken } from './account';

export interface SeasonInfo { season: number; endsAt: string; startsAt: string; }
export interface RankRow { rank: number; nick: string; mmr: number; division: string; wins: number; losses: number; placing?: boolean; }
export interface MyRank extends SeasonInfo { mmr: number; wins: number; losses: number; peak: number; division: string; rank: number; games: number; placing: boolean; placementLeft: number; }
export interface ReportResult {
  delta: number; before: number; after: number; division: string; divisionBefore: string;
  promoted: boolean; demoted: boolean; placing: boolean; placementLeft: number; placedNow: boolean; me: MyRank | null;
}
export interface Champion { place: number; nick: string; mmr: number; division: string; }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/ranking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'erro');
  return data as Record<string, unknown>;
}

// ladder/champions via GET: assim o s-maxage do servidor vale no edge (a Vercel
// não cacheia POST). Reduz o Fast Origin Transfer desses públicos.
async function getPublic(action: string): Promise<Record<string, unknown>> {
  const r = await fetch(`/api/ranking?action=${action}`, { signal: AbortSignal.timeout(9000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof (data as { error?: unknown })?.error === 'string' ? (data as { error: string }).error : 'erro');
  return data as Record<string, unknown>;
}
export async function getLadder(): Promise<{ total: number; ladder: RankRow[]; season: number; endsAt: string }> {
  try {
    const d = await getPublic('ladder');
    return { total: Number(d.total ?? 0), ladder: (d.ladder as RankRow[]) ?? [], season: Number(d.season ?? 0), endsAt: String(d.endsAt ?? '') };
  } catch { return { total: 0, ladder: [], season: 0, endsAt: '' }; }
}
export async function getChampions(): Promise<{ season: number; champions: Champion[] }> {
  try { const d = await getPublic('champions'); return { season: Number(d.season ?? 0), champions: (d.champions as Champion[]) ?? [] }; }
  catch { return { season: 0, champions: [] }; }
}
export async function fetchMyRank(nick?: string): Promise<MyRank | null> {
  if (!getToken()) return null;
  try { return (await post({ action: 'me', token: getToken(), nick })) as unknown as MyRank; } catch { return null; }
}
// `code` = lobby da partida: o servidor agora só pontua reports POR PARTIDA
// (1 por jogador) e aplica o MMR quando os dois lados batem (anti-fraude).
export async function reportResult(won: boolean, nick?: string, code?: string): Promise<ReportResult | null> {
  if (!getToken()) return null;
  try { return (await post({ action: 'report', token: getToken(), won, nick, code })) as unknown as ReportResult; } catch { return null; }
}
