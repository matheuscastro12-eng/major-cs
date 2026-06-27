// Coach Career — T3.11 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// O coach (técnico) acumula HISTÓRICO ao longo da carreira: cada passagem por
// uma org vira um "stint" com período, vitórias, derrotas, troféus e tier do
// clube. Soma desses stints vira a REPUTAÇÃO do coach (0-100) — desbloqueia
// achievements e (futuro) afeta ofertas externas.
//
// Modelo:
//   - 1 stint = coach treinando UMA org durante um intervalo de splits contínuo
//   - Trocar de coach FECHA o stint atual + cria novo (futuro: oferta externa)
//   - Trocar de org/manager preserva os stints (é o histórico DO COACH)
//
// Storage: `save.coachStints: CoachStint[]` (mais antigo primeiro).

export interface CoachStint {
  /** Id do coach (= coachFromId). */
  coachId: string;
  /** Nome do coach (cache pra exibir mesmo se sair do catálogo) */
  coachNick: string;
  /** Org onde treinou */
  orgName: string;
  orgTag?: string;
  /** Tier do clube no MOMENTO de cada split (cache mais recente). 1 = elite */
  tier: number;
  /** Split em que começou (inclusivo) */
  startSplit: number;
  /** Split em que terminou. undefined = stint ATIVO */
  endSplit?: number;
  /** Vitórias e derrotas do user-team durante o stint */
  wins: number;
  losses: number;
  /** Troféus conquistados no stint (label livre, ex.: "VCT Americas Stage 1") */
  trophies: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

/** Devolve o stint ATIVO (último item sem endSplit). null se nenhum. */
export function activeStint(stints: CoachStint[]): CoachStint | null {
  if (stints.length === 0) return null;
  const last = stints[stints.length - 1];
  return last.endSplit == null ? last : null;
}

/** Cria nova stint. Se já há stint ativo, fecha primeiro. Devolve array NOVO. */
export function startStint(
  stints: CoachStint[],
  ctx: { coachId: string; coachNick: string; orgName: string; orgTag?: string; tier: number; startSplit: number },
): CoachStint[] {
  const out = closeActiveStint(stints, ctx.startSplit);
  out.push({
    coachId: ctx.coachId,
    coachNick: ctx.coachNick,
    orgName: ctx.orgName,
    orgTag: ctx.orgTag,
    tier: ctx.tier,
    startSplit: ctx.startSplit,
    wins: 0,
    losses: 0,
    trophies: [],
  });
  return out;
}

/** Fecha o stint ativo (estampa endSplit). Devolve array NOVO. No-op se não há ativo. */
export function closeActiveStint(stints: CoachStint[], endSplit: number): CoachStint[] {
  if (stints.length === 0) return [];
  const out = stints.map((s, i) => {
    if (i === stints.length - 1 && s.endSplit == null) {
      return { ...s, endSplit };
    }
    return s;
  });
  return out;
}

/** Adiciona um troféu ao stint ativo. Devolve array NOVO. No-op se não há ativo. */
export function appendTrophy(stints: CoachStint[], trophy: string): CoachStint[] {
  if (!activeStint(stints)) return stints;
  return stints.map((s, i) => {
    if (i === stints.length - 1 && s.endSplit == null) {
      return { ...s, trophies: [...s.trophies, trophy] };
    }
    return s;
  });
}

/** Registra resultado de partida (win/loss) no stint ativo. */
export function recordStintMatch(stints: CoachStint[], won: boolean): CoachStint[] {
  if (!activeStint(stints)) return stints;
  return stints.map((s, i) => {
    if (i === stints.length - 1 && s.endSplit == null) {
      return { ...s, wins: s.wins + (won ? 1 : 0), losses: s.losses + (won ? 0 : 1) };
    }
    return s;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas agregadas

export interface CoachSummary {
  totalStints: number;
  totalTrophies: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;       // 0-1
  /** Reputação 0-100 derivada de troféus + win-rate + tier dos clubes */
  reputation: number;
  /** Tier MÉDIO dos clubes treinados (proxy de "topo dos topos") */
  averageTier: number;
}

export function summarizeCoach(stints: CoachStint[]): CoachSummary {
  const totalStints = stints.length;
  const totalTrophies = stints.reduce((a, s) => a + s.trophies.length, 0);
  const totalWins = stints.reduce((a, s) => a + s.wins, 0);
  const totalLosses = stints.reduce((a, s) => a + s.losses, 0);
  const totalMatches = totalWins + totalLosses;
  const winRate = totalMatches > 0 ? totalWins / totalMatches : 0;
  const averageTier = stints.length > 0
    ? stints.reduce((a, s) => a + s.tier, 0) / stints.length
    : 4;

  // Reputação: troféus pesam mais; win rate sobre tier alto vale mais.
  // Calibrada pra que coach com 3-4 troféus em tier 1 chegue a ~75-85.
  const trophyScore = Math.min(50, totalTrophies * 12);
  const tierBonus = Math.max(0, 4 - averageTier) * 8; // tier 1 dá +24, tier 4 = 0
  const winScore = winRate * 25;
  const longevityScore = Math.min(10, totalStints * 2);
  const reputation = Math.round(
    Math.max(20, Math.min(99, 25 + trophyScore + tierBonus + winScore + longevityScore)),
  );

  return {
    totalStints,
    totalTrophies,
    totalWins,
    totalLosses,
    winRate,
    reputation,
    averageTier,
  };
}

/** Label humanizado pra reputação. */
export function reputationLabel(rep: number): string {
  if (rep >= 90) return 'Lendário';
  if (rep >= 80) return 'Elite';
  if (rep >= 70) return 'Top regional';
  if (rep >= 55) return 'Sólido';
  if (rep >= 40) return 'Mediano';
  return 'Iniciante';
}

/** Cor accent pra reputação. */
export function reputationColor(rep: number): string {
  if (rep >= 80) return '#e8a93b';
  if (rep >= 70) return '#5ed88a';
  if (rep >= 55) return '#a3d860';
  if (rep >= 40) return '#d8a943';
  return '#8a8a8a';
}
