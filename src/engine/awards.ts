// Year-end awards — T3.10 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Detecta awards no fim do ano (a cada 4 splits) com critérios determinísticos
// baseados no estado atual do save. Saves não guardam season stats por ano
// (só cumulative em `careerStats`), então usamos PROXIES:
//
//   - MVP do Ano:           squad player com maior peakOvr atualizado no ano.
//   - Most Improved:         maior `evo[id]` acumulado (delta cumulativo de OVR).
//   - Rookie of the Year:    squad player com idade < 22 e maior peakOvr.
//   - Coach of the Year:    coach atual se titles >= 1 desde o último ano.
//   - Breakout:              squad player que entrou ao longo do ano e tem peakOvr > 78.
//
// Awards não-aplicáveis (sem candidato qualificado) ficam de fora.

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export type AwardKind =
  | 'mvp'
  | 'rookie'
  | 'mostImproved'
  | 'coachOfYear'
  | 'breakout'
  | 'teamOfSeason';

/** Uma linha do Time da Temporada (1 dos 5 jogadores). */
export interface TeamOfSeasonSlot {
  nick: string;
  role: string;
  rating: number;
  mine: boolean;
}

export interface AwardWinner {
  kind: AwardKind;
  /** Nick do jogador vencedor (não preenchido pra coachOfYear/teamOfSeason) */
  playerNick?: string;
  /** Nick do coach vencedor (só pra coachOfYear) */
  coachNick?: string;
  /** Label localizado curto: "MVP do Ano" / "Coach do Ano" */
  label: string;
  /** Narrativa de 1 linha: "Subiu OVR de 78 → 85 e foi campeão do circuito tier 2" */
  reason: string;
  /** Só pra teamOfSeason: os 5 jogadores escolhidos por desempenho. */
  lineup?: TeamOfSeasonSlot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance do ano (prêmios por DESEMPENHO, não por OVR)
//
// Uma linha por jogador com o que ele REALMENTE produziu no ano (rating/kd/adr
// derivados do delta de careerStats no período). É a base do POTY, da Revelação
// e do Time da Temporada — quem JOGOU melhor, não quem tem OVR alto.

export interface PlayerYearLine {
  playerId: string;
  nick: string;
  role: string;        // AWP | Entry | Rifler | Lurker | Support | IGL
  age?: number;
  mine: boolean;       // está no SEU elenco
  rating: number;
  kd: number;
  adr: number;
  impact: number;
  maps: number;        // mapas jogados no ano (volume)
}

/** Amostra mínima de mapas no ano pra concorrer a prêmio (evita 1 mapa de sorte). */
export const AWARD_MIN_MAPS = 6;

/**
 * Score de desempenho do ano. Rating manda; kd/adr/impact refinam; o volume de
 * mapas dá um leve bônus com retorno decrescente (mais jogos = mais credível),
 * com piso pra não zerar quem jogou pouco mas muito bem.
 */
export function scorePlayerYear(l: PlayerYearLine): number {
  const perf = l.rating * 100 + l.kd * 6 + l.adr * 0.12 + l.impact * 18;
  const volume = Math.max(0.5, Math.min(1.15, l.maps / 20));
  return perf * volume;
}

// ordena por score, com desempate: score → rating → kd → mapas
function byPerf(a: PlayerYearLine, b: PlayerYearLine): number {
  return (
    scorePlayerYear(b) - scorePlayerYear(a) ||
    b.rating - a.rating ||
    b.kd - a.kd ||
    b.maps - a.maps
  );
}

// Time da Temporada: 5 jogadores por DESEMPENHO, cobrindo AWP + IGL quando
// possível e completando pelos melhores restantes (modelo "melhor por função +
// melhor restante"). Retorna [] se não houver 5 elegíveis.
function pickTeamOfSeason(eligible: PlayerYearLine[]): PlayerYearLine[] {
  if (eligible.length < 5) return [];
  const sorted = [...eligible].sort(byPerf);
  const picked = new Set<string>();
  const lineup: PlayerYearLine[] = [];
  const takeRole = (role: string) => {
    const c = sorted.find((l) => !picked.has(l.playerId) && l.role === role);
    if (c) { picked.add(c.playerId); lineup.push(c); }
  };
  takeRole('AWP');
  takeRole('IGL');
  for (const l of sorted) {
    if (lineup.length >= 5) break;
    if (!picked.has(l.playerId)) { picked.add(l.playerId); lineup.push(l); }
  }
  return lineup.sort(byPerf);
}

export interface YearAwards {
  /** Numero do ano (1, 2, 3...). Calculado como Math.ceil(split/4). */
  year: number;
  /** Range de splits que cobre o ano */
  startSplit: number;
  endSplit: number;
  winners: AwardWinner[];
}

// ─────────────────────────────────────────────────────────────────────────────
// State shape mínimo (subset do CareerSave)

export interface AwardsState {
  split: number;
  titles: number;
  squad: { playerId: string }[]; // só ids — engine não precisa do shape completo
  evo?: Record<string, number>;
  peakOvr?: Record<string, number>;
  youth?: Record<string, { age?: number; nick?: string; ovr?: number }>;
  yearAwardsHistory?: YearAwards[];
  pendingYearAwards?: YearAwards | null;
  coach?: { nick?: string };
}

/** Lookup pra dados externos (age/nick por playerId) — fornecido pelo consumer
 *  porque o engine de awards não tem acesso direto ao dataset de bo3-ages,
 *  ao squad com ages etc. Cada função olha o que precisa. */
export interface AwardsLookups {
  /** Nick por playerId. Cobre tanto base (`bo3` players) quanto jovens do save. */
  nickById: (playerId: string) => string | undefined;
  /** Idade do jogador no split atual. */
  ageById: (playerId: string) => number | undefined;
  /** Boolean: o jogador foi adicionado ao squad NO ÚLTIMO ANO (4 splits)? */
  joinedThisYear: (playerId: string) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Critérios

const ROOKIE_MAX_AGE = 22;
const BREAKOUT_MIN_PEAK = 78;

/**
 * Detecta awards do ano que ACABOU. Chama quando `save.split % 4 === 0`
 * (ou seja, quando split avançou pra 5, 9, 13... — virada de ano).
 *
 * Devolve null se:
 *   - É o primeiro ano (split <= 4) e não há histórico suficiente
 *   - Ano já foi detectado (yearAwardsHistory contém este year)
 *   - Squad está vazio
 */
export function detectYearAwards(
  s: AwardsState,
  lookups: AwardsLookups,
  yearLines?: PlayerYearLine[],
): YearAwards | null {
  // Ano corrente: 1, 2, 3, ... — começa em 1, vira 2 quando split=5, etc.
  const yearJustEnded = Math.floor((s.split - 1) / 4);
  if (yearJustEnded < 1) return null; // primeiro ano não tem awards (precisa terminar)

  // Já detectado?
  const history = s.yearAwardsHistory ?? [];
  if (history.some((y) => y.year === yearJustEnded)) return null;

  const startSplit = (yearJustEnded - 1) * 4 + 1;
  const endSplit = yearJustEnded * 4;

  if (!s.squad || s.squad.length === 0) return null;

  const winners: AwardWinner[] = [];

  // pool de DESEMPENHO do ano (quem realmente jogou bem), com amostra mínima
  const perfEligible = (yearLines ?? []).filter((l) => l.maps >= AWARD_MIN_MAPS);
  const perfRanked = [...perfEligible].sort(byPerf);

  // ───── Jogador do Ano (POTY) ───── melhor DESEMPENHO do ano (rating real).
  // Fallback no proxy de peakOvr só quando não há nenhuma partida contabilizada.
  // `potyId` guarda o vencedor (perf OU proxy) pra nenhum outro prêmio repetir.
  let potyId: string | undefined;
  if (perfRanked.length > 0) {
    const top = perfRanked[0];
    potyId = top.playerId;
    winners.push({
      kind: 'mvp',
      playerNick: top.nick,
      label: 'Jogador do Ano',
      reason: `Rating ${top.rating.toFixed(2)} em ${top.maps} mapas — o melhor desempenho da temporada${top.mine ? ' (e é do SEU elenco!)' : ''}.`,
    });
  } else {
    const mvp = pickBestBy(s.squad, (sg) => s.peakOvr?.[sg.playerId] ?? 0);
    if (mvp.best && mvp.bestValue >= 75) {
      potyId = mvp.best.playerId;
      winners.push({
        kind: 'mvp',
        playerNick: lookups.nickById(mvp.best.playerId) ?? '—',
        label: 'Jogador do Ano',
        reason: `Alcançou pico de OVR ${mvp.bestValue} e foi a referência do elenco.`,
      });
    }
  }

  // ───── Time da Temporada ───── 5 melhores por desempenho (POTY-style por função)
  const tos = pickTeamOfSeason(perfEligible);
  if (tos.length === 5) {
    winners.push({
      kind: 'teamOfSeason',
      label: 'Time da Temporada',
      reason: 'Os cinco melhores desempenhos do ano, escolhidos por função.',
      lineup: tos.map((l) => ({ nick: l.nick, role: l.role, rating: l.rating, mine: l.mine })),
    });
  }

  // ───── Most Improved ───── maior evo[id] positivo
  const evos = Object.entries(s.evo ?? {});
  if (evos.length > 0) {
    const [bestEvoId, bestEvoVal] = evos.reduce(
      (acc, cur) => (cur[1] > acc[1] ? cur : acc),
      ['', 0] as [string, number],
    );
    if (bestEvoVal >= 3 && bestEvoId) {
      const nick = lookups.nickById(bestEvoId) ?? '—';
      winners.push({
        kind: 'mostImproved',
        playerNick: nick,
        label: 'Maior Evolução',
        reason: `Subiu ${bestEvoVal.toFixed(1)} pontos de OVR ao longo do ano.`,
      });
    }
  }

  // ───── Revelação do Ano ───── melhor DESEMPENHO entre os jovens (<22),
  // excluindo o POTY pra não premiar o mesmo jogador duas vezes. Fallback proxy.
  const rookiePerf = perfRanked.filter(
    (l) => l.age != null && l.age < ROOKIE_MAX_AGE && l.playerId !== potyId,
  );
  if (rookiePerf.length > 0) {
    const rk = rookiePerf[0];
    winners.push({
      kind: 'rookie',
      playerNick: rk.nick,
      label: 'Revelação do Ano',
      reason: `Aos ${rk.age} anos, rating ${rk.rating.toFixed(2)} em ${rk.maps} mapas — o melhor jovem do ano.`,
    });
  } else {
    const rookies = s.squad.filter((sg) => {
      const age = lookups.ageById(sg.playerId);
      return age != null && age < ROOKIE_MAX_AGE && sg.playerId !== potyId;
    });
    if (rookies.length > 0) {
      const rk = pickBestBy(rookies, (sg) => s.peakOvr?.[sg.playerId] ?? 0);
      if (rk.best) {
        const nick = lookups.nickById(rk.best.playerId) ?? '—';
        const age = lookups.ageById(rk.best.playerId);
        winners.push({
          kind: 'rookie',
          playerNick: nick,
          label: 'Revelação do Ano',
          reason: `Aos ${age ?? '?'} anos, atingiu pico de OVR ${rk.bestValue} no elenco.`,
        });
      }
    }
  }

  // ───── Breakout ───── novo no squad com peakOvr alto
  const breakouts = s.squad.filter(
    (sg) => lookups.joinedThisYear(sg.playerId) && (s.peakOvr?.[sg.playerId] ?? 0) >= BREAKOUT_MIN_PEAK,
  );
  if (breakouts.length > 0) {
    const br = pickBestBy(breakouts, (sg) => s.peakOvr?.[sg.playerId] ?? 0);
    if (br.best && br.best.playerId !== potyId) {
      // não duplica com o Jogador do Ano
      const nick = lookups.nickById(br.best.playerId) ?? '—';
      winners.push({
        kind: 'breakout',
        playerNick: nick,
        label: 'Surpresa do Ano',
        reason: `Chegou no ano e já bateu OVR ${br.bestValue}, virou peça-chave.`,
      });
    }
  }

  // ───── Coach of the Year ───── coach atual + título neste ano
  const titlesAtYearStart = history.reduce(
    (sum, y) => sum + y.winners.filter((w) => w.kind === 'mvp').length,
    0,
  ); // proxy fraco (não temos title-by-year). Usamos titles atuais.
  const titlesThisYear = Math.max(0, s.titles - titlesAtYearStart);
  if (titlesThisYear >= 1 && s.coach?.nick) {
    winners.push({
      kind: 'coachOfYear',
      coachNick: s.coach.nick,
      label: 'Técnico do Ano',
      reason: `Conduziu o time ao título no ano. Trabalho reconhecido pelo circuito.`,
    });
  }

  if (winners.length === 0) return null;

  // ordem da cerimônia: prêmios menores primeiro, clímax no Time da Temporada e
  // no Jogador do Ano (o último slide).
  const CEREMONY_ORDER: Record<AwardKind, number> = {
    breakout: 1,
    mostImproved: 2,
    coachOfYear: 3,
    rookie: 4,
    teamOfSeason: 5,
    mvp: 6,
  };
  winners.sort((a, b) => CEREMONY_ORDER[a.kind] - CEREMONY_ORDER[b.kind]);

  return {
    year: yearJustEnded,
    startSplit,
    endSplit,
    winners,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function pickBestBy<T>(
  items: T[],
  scorer: (item: T) => number,
): { best: T | null; bestValue: number } {
  let best: T | null = null;
  let bestValue = -Infinity;
  for (const it of items) {
    const v = scorer(it);
    if (v > bestValue) {
      bestValue = v;
      best = it;
    }
  }
  return { best, bestValue };
}

// Re-export pro consumer
export { pickBestBy };
