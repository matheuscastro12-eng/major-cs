// Fonte automática de resultados do Pick'em: API pública do bo3.gg (a mesma da
// base de elencos; scripts/lib/bo3-client.mts). Busca as séries TERMINADAS do
// torneio de cada Stage e deriva 3-0 / 0-3 / avançam. O resultado entra como
// PROPOSTO — só vale depois do "confirmar" no admin (fallback: digitar à mão).
// Ids: o jogo usa `bo3_team_<id do bo3.gg>`, então o mapeamento é direto.
// ATENÇÃO: os campos de /matches foram lidos da API em uso pelos scripts; o
// torneio do Major ainda não tem partidas — conferir no ensaio de 20/11.
import { deriveSwissResult, type PlayoffResult, type SeriesResult, type SwissResult } from '../src/engine/majorPickem.js';

export const BO3_API = 'https://api.bo3.gg/api/v1';

export interface Bo3Match { team1_id?: number | null; team2_id?: number | null; winner_team_id?: number | null; status?: string; round_name?: string | null }

export const bo3TeamId = (n: number | null | undefined) => (n == null ? '' : `bo3_team_${n}`);

export function seriesFromBo3(matches: Bo3Match[]): SeriesResult[] {
  return matches
    .filter((m) => m.status === 'finished' && m.team1_id && m.team2_id && m.winner_team_id)
    .map((m) => ({ a: bo3TeamId(m.team1_id), b: bo3TeamId(m.team2_id), winner: bo3TeamId(m.winner_team_id) }));
}

export function swissFromBo3(matches: Bo3Match[]): SwissResult & { complete: boolean } {
  return deriveSwissResult(seriesFromBo3(matches));
}

/** Playoffs: semis = vencedores das quartas, final = vencedores das semis. */
export function playoffsFromBo3(matches: Bo3Match[]): PlayoffResult {
  const s = seriesFromBo3(matches);
  const wins = new Map<string, number>();
  for (const m of s) wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1);
  const semis = [...wins.entries()].filter(([, n]) => n >= 1).map(([t]) => t).sort();
  const final = [...wins.entries()].filter(([, n]) => n >= 2).map(([t]) => t).sort();
  const champ = [...wins.entries()].find(([, n]) => n >= 3)?.[0] ?? null;
  return { semis, final, champion: champ };
}

export async function fetchBo3Matches(tournamentSlug: string, fetchImpl: typeof fetch = fetch): Promise<Bo3Match[]> {
  if (!/^[a-z0-9-]{3,120}$/.test(tournamentSlug)) throw new Error('slug inválido');
  const u = `${BO3_API}/matches?filter[tournament.slug][eq]=${encodeURIComponent(tournamentSlug)}&filter[matches.status][eq]=finished&page[limit]=100`;
  const r = await fetchImpl(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`bo3.gg ${r.status}`);
  const j = (await r.json()) as { results?: Bo3Match[] } | Bo3Match[];
  return Array.isArray(j) ? j : j.results ?? [];
}
