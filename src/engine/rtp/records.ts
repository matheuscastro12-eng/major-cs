// RTP v15 — RECORDES VIVOS: as sequências que transformam títulos em DINASTIA.
//
// Rastreia no save (history.records) o que uma carreira de topo persegue depois
// do primeiro título: títulos de elite consecutivos, Majors seguidos, semanas
// seguidas em #1 e a temporada invicta. Ao superar um marco do panteão
// (LEGEND_MARKS, legends.ts), a imprensa celebra — manchete única por marco.
//
// Tudo PURO e imutável. Pontos de atualização (um por fato, nunca duplica):
//   - recordsAfterSeries    → cada série (applyMatchOutcome)
//   - recordsAtEventEnd     → cada campeonato fechado (concludeCircuitRound)
//   - recordsAtMajorEnd     → resolução do Major (applyResolution)
//   - recordsWeekTick       → cada virada de semana do circuito (withWeekStart)
//   - applyRecordBreaks     → confere marcos quebrados e gera as manchetes

import { pushHeadline } from './media';
import { LEGEND_MARKS } from './legends';
import type { CareerLog, CareerRecords, RoadToProSave, TimelineEntry } from './types';

export function defaultRecords(): CareerRecords {
  return {
    titleStreak: 0, bestTitleStreak: 0,
    majorStreak: 0, bestMajorStreak: 0,
    weeksAtOne: 0, bestWeeksAtOne: 0, totalWeeksAtOne: 0,
    seasonSeries: 0, seasonLosses: 0, perfectSeasons: 0,
    broken: [],
  };
}

// Backfill de migração (v14→v15): reconstrói as sequências de título/Major da
// timeline (ordem cronológica). Semanas em #1 e temporada invicta não têm
// histórico pra reconstruir — começam do zero (conservador, nunca infla).
export function deriveRecords(h: Partial<CareerLog>): CareerRecords {
  const r = defaultRecords();
  const tl: TimelineEntry[] = Array.isArray(h.timeline) ? h.timeline : [];
  for (const t of tl) {
    if (t.tier !== 'elite') { r.titleStreak = 0; continue; }   // saiu do elite = quebra a série
    if (t.major) {
      r.majorStreak = t.place === 1 ? r.majorStreak + 1 : 0;
      r.bestMajorStreak = Math.max(r.bestMajorStreak, r.majorStreak);
    } else {
      r.titleStreak = t.place === 1 ? r.titleStreak + 1 : 0;
      r.bestTitleStreak = Math.max(r.bestTitleStreak, r.titleStreak);
    }
  }
  return r;
}

// Cada série jogada alimenta o placar da temporada corrente (invicta = fechar o
// ano com 0 derrotas). Séries do Major contam — invicta de verdade não perde nunca.
export function recordsAfterSeries(r: CareerRecords, won: boolean): CareerRecords {
  return { ...r, seasonSeries: r.seasonSeries + 1, seasonLosses: r.seasonLosses + (won ? 0 : 1) };
}

// Campeonato (etapa) fechado. A série de títulos é coisa de ELITE: vencer no
// elite estende; qualquer etapa fora do elite (ou sem título) zera. No fim da
// temporada, avalia a invicta (só elite) e resete os contadores do ano.
export function recordsAtEventEnd(
  r: CareerRecords, ctx: { won: boolean; elite: boolean; seasonEnd: boolean },
): CareerRecords {
  const titleStreak = ctx.won && ctx.elite ? r.titleStreak + 1 : 0;
  let out: CareerRecords = { ...r, titleStreak, bestTitleStreak: Math.max(r.bestTitleStreak, titleStreak) };
  if (ctx.seasonEnd) {
    const perfect = ctx.elite && out.seasonSeries > 0 && out.seasonLosses === 0;
    out = { ...out, perfectSeasons: out.perfectSeasons + (perfect ? 1 : 0), seasonSeries: 0, seasonLosses: 0 };
  }
  return out;
}

// Major resolvido. Só o Major DE ELITE conta pra sequência histórica (os "majors"
// temáticos dos tiers de baixo não entram no panteão).
export function recordsAtMajorEnd(r: CareerRecords, ctx: { champion: boolean; elite: boolean }): CareerRecords {
  if (!ctx.elite) return r;
  const majorStreak = ctx.champion ? r.majorStreak + 1 : 0;
  return { ...r, majorStreak, bestMajorStreak: Math.max(r.bestMajorStreak, majorStreak) };
}

// Virada de semana: reinando (#1 do mundo) a sequência cresce; fora do topo, zera.
export function recordsWeekTick(r: CareerRecords, atNumberOne: boolean): CareerRecords {
  const weeksAtOne = atNumberOne ? r.weeksAtOne + 1 : 0;
  return {
    ...r, weeksAtOne,
    bestWeeksAtOne: Math.max(r.bestWeeksAtOne, weeksAtOne),
    totalWeeksAtOne: r.totalWeeksAtOne + (atNumberOne ? 1 : 0),
  };
}

// Confere os marcos de lenda recém-quebrados: marca em `broken` (manchete única +
// pontos de legado) e celebra na imprensa. Puro — devolve o save intacto se nada quebrou.
export function applyRecordBreaks(save: RoadToProSave): RoadToProSave {
  const r = save.history.records;
  if (!r) return save;
  const fresh = LEGEND_MARKS.filter((m) => !r.broken.includes(m.id) && m.value(r) >= m.at);
  if (fresh.length === 0) return save;
  let media = save.media;
  if (media) {
    for (const m of fresh) media = pushHeadline(media, m.headline(save.player.nick), 'hype', save.world.season, save.world.week);
  }
  return {
    ...save,
    media,
    history: { ...save.history, records: { ...r, broken: [...r.broken, ...fresh.map((m) => m.id)] } },
  };
}
