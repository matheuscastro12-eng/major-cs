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
  | 'breakout';

export interface AwardWinner {
  kind: AwardKind;
  /** Nick do jogador vencedor (não preenchido pra coachOfYear) */
  playerNick?: string;
  /** Nick do coach vencedor (só pra coachOfYear) */
  coachNick?: string;
  /** Label localizado curto: "MVP do Ano" / "Coach do Ano" */
  label: string;
  /** Narrativa de 1 linha: "Subiu OVR de 78 → 85 e foi campeão do circuito tier 2" */
  reason: string;
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

  // ───── MVP ───── squad player com maior peakOvr
  const mvp = pickBestBy(s.squad, (sg) => s.peakOvr?.[sg.playerId] ?? 0);
  if (mvp.best && mvp.bestValue >= 75) {
    const nick = lookups.nickById(mvp.best.playerId) ?? '—';
    winners.push({
      kind: 'mvp',
      playerNick: nick,
      label: 'MVP do Ano',
      reason: `Alcançou pico de OVR ${mvp.bestValue} e foi a referência do elenco.`,
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

  // ───── Rookie ───── jovem (<22) com maior peakOvr
  const rookies = s.squad.filter((sg) => {
    const age = lookups.ageById(sg.playerId);
    return age != null && age < ROOKIE_MAX_AGE;
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

  // ───── Breakout ───── novo no squad com peakOvr alto
  const breakouts = s.squad.filter(
    (sg) => lookups.joinedThisYear(sg.playerId) && (s.peakOvr?.[sg.playerId] ?? 0) >= BREAKOUT_MIN_PEAK,
  );
  if (breakouts.length > 0) {
    const br = pickBestBy(breakouts, (sg) => s.peakOvr?.[sg.playerId] ?? 0);
    if (br.best && br.best.playerId !== mvp.best?.playerId) {
      // não duplica com MVP
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
