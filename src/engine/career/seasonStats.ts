// STATS POR TEMPORADA (#13 do gap Brasval) + colocação final (#29). Puro.
//
// O careerStats acumula a carreira INTEIRA num número só — não dá pra perguntar
// "como o X foi no split 3?" nem "quantas vezes ele foi campeão?". Aqui cada
// EVENTO fechado grava uma linha por jogador (K/D/A/dano/KAST/rounds/mapas +
// colocação do time e troféu), consultável pra sempre: é o insumo de perfil
// (#26), prêmios reais e lendas.
//
// Shape: Record<playerId, SeasonEventLine[]> — append-only, uma linha por
// evento jogado. Linhas são pequenas (~10 números); uma carreira longa de 40
// splits × 3 eventos ≈ 120 linhas por jogador do elenco. Aceitável no save.

import type { League } from '../league';

export interface SeasonEventLine {
  split: number;
  event: number;             // etapa dentro do split (1..EVENTS_PER_SPLIT)
  eventName: string;
  tier: number;
  k: number; d: number; a: number;
  dmg: number; kast: number; rounds: number; maps: number;
  placement: number | null;  // #29 — colocação do TIME do jogador (1=campeão); null = desconhecida
  champion: boolean;
}

export type SeasonStats = Record<string, SeasonEventLine[]>;

export interface BankEventMeta {
  split: number;
  event: number;
  eventName: string;
  tier: number;
  // colocação por TIME (id do time na liga → posição final). Times ausentes
  // ficam com placement null — pro circuito do usuário, basta passar o seu.
  placements?: Record<string, number>;
  championTeamId?: string | null;
}

// Extrai a linha DESTE evento pra cada jogador da liga e apensa no histórico.
// Dedupe é responsabilidade do caller (o CareerScreen já guarda careerStatsEvent
// e só banca uma vez por evento — usamos o MESMO gate).
export function bankSeasonEvent(prev: SeasonStats | undefined, league: League, meta: BankEventMeta): SeasonStats {
  const out: SeasonStats = { ...(prev ?? {}) };
  // jogador → time (pra colocação): varre os rosters da liga
  const teamOf = new Map<string, string>();
  for (const t of league.teams) for (const p of t.players) teamOf.set(p.id, t.id);

  const acc = new Map<string, SeasonEventLine>();
  for (const round of league.rounds) {
    for (const m of round) {
      if (!m.result) continue;
      for (const map of m.result.maps) {
        for (const [id, st] of Object.entries(map.stats)) {
          const cur = acc.get(id) ?? {
            split: meta.split, event: meta.event, eventName: meta.eventName, tier: meta.tier,
            k: 0, d: 0, a: 0, dmg: 0, kast: 0, rounds: 0, maps: 0,
            placement: null, champion: false,
          };
          cur.k += st.both.kills; cur.d += st.both.deaths; cur.a += st.both.assists;
          cur.dmg += st.both.dmg; cur.kast += st.both.kastRounds; cur.rounds += st.both.rounds;
          cur.maps += 1;
          acc.set(id, cur);
        }
      }
    }
  }
  for (const [id, line] of acc) {
    const teamId = teamOf.get(id);
    const placement = teamId != null ? (meta.placements?.[teamId] ?? null) : null;
    line.placement = placement;
    line.champion = teamId != null && meta.championTeamId != null && teamId === meta.championTeamId;
    out[id] = [...(out[id] ?? []), line];
  }
  return out;
}

// Linhas de um jogador (mais recente primeiro, pra tabela de perfil).
export function seasonLinesOf(stats: SeasonStats | undefined, playerId: string): SeasonEventLine[] {
  return [...(stats?.[playerId] ?? [])].reverse();
}

// Conquistas contáveis (#29): "campeão 3x, vice 2x, N eventos".
export function placementSummary(stats: SeasonStats | undefined, playerId: string): { titles: number; runnerUp: number; top4: number; events: number } {
  const lines = stats?.[playerId] ?? [];
  return {
    titles: lines.filter((l) => l.champion || l.placement === 1).length,
    runnerUp: lines.filter((l) => l.placement === 2).length,
    top4: lines.filter((l) => l.placement != null && l.placement <= 4).length,
    events: lines.length,
  };
}

// Rating HLTV 2.0 da linha — MESMOS coeficientes do deriveCareer (CareerScreen);
// replicado aqui porque engine não importa componente. Mudou lá, muda aqui.
export function deriveEventLine(s: SeasonEventLine): { rating: number; kd: number; adr: number; kastPct: number } | null {
  if (s.rounds < 1) return null;
  const kpr = s.k / s.rounds, dpr = s.d / s.rounds, apr = s.a / s.rounds;
  const kast = s.kast / s.rounds, adr = s.dmg / s.rounds;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  const rating = Math.max(0, 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
  return { rating, kd: s.d ? s.k / s.d : s.k, adr, kastPct: kast * 100 };
}
