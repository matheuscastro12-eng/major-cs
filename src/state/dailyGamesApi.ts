// DIÁRIO — prova social: contadores agregados por jogo/dia (anônimo, sem PII).
// O ping dispara UMA vez, no fechamento do jogo (mesmo ponto do track de done);
// as stats alimentam o "N jogaram hoje" do hub (GET cacheado no edge).

export interface DailyGameStats { plays: number; wins: number }
export type DailyGamesStats = Record<string, DailyGameStats>;

export function pingDailyGame(game: string, day: number, won: boolean): void {
  // fire-and-forget — prova social nunca pode travar o jogo
  void fetch('/api/ranking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dailyGamesPing', game, day, won }),
  }).catch(() => { /* offline — o contador perde 1, o jogador não perde nada */ });
}

export async function fetchDailyGamesStats(day: number): Promise<DailyGamesStats | null> {
  try {
    const r = await fetch(`/api/ranking?action=dailyGamesStats&day=${day}`);
    if (!r.ok) return null;
    const j = await r.json() as { games?: DailyGamesStats };
    return j.games ?? null;
  } catch { return null; }
}
