// [W6] ERA ANUAL — o Road to Pro tem ritmo de ANO. Cada temporada é uma ERA
// nomeada ("Era 2026", "Era 2027"…) que fecha com o Major REAL do ano. Na virada
// do ano (última etapa fechada — ponto único em circuit.concludeCircuitRound) o
// save ganha um CARIMBO permanente da era (EraStamp) e a tela de fechamento
// (RtpEraClose) é mostrada uma vez.
//
// Tudo PURO e determinístico: nada de RNG, nada de relógio. A tela deriva o que
// mostra do carimbo (eraCloseOf) — fonte única, nada copiado.

import { hashStr } from '../../state/hash';
import { seasonTally } from './records';
import type { CareerLog, EraEvent, EraStamp, MajorPlacementCode, RoadToProSave, Tier } from './types';

// A primeira temporada de todo save é a Era 2026 (o dataset do mundo real é o
// CS2_REAL_2026). Season N → ano 2026 + N − 1, pra qualquer season.
export const ERA_BASE_YEAR = 2026;

// ── Calendário de Majors (um por ERA) ────────────────────────────────────────
// 2026 é o Major real conhecido do calendário do CS2. Os anos seguintes ainda
// não têm sede anunciada: rotação plausível de organizadoras/sedes reais —
// CONSTANTE FÁCIL DE TROCAR quando a Valve anunciar. Mantém sempre a mesma sede
// pro mesmo ano (determinístico).
export interface MajorOfYear { name: string; city: string; country: string; }
export const MAJOR_CALENDAR: Record<number, MajorOfYear> = {
  2026: { name: 'IEM Cologne Major 2026', city: 'Colônia', country: 'Alemanha' },
};
const MAJOR_ROTATION: { org: string; city: string; country: string }[] = [
  { org: 'BLAST.tv Major', city: 'Austin', country: 'EUA' },
  { org: 'PGL Major', city: 'Copenhague', country: 'Dinamarca' },
  { org: 'IEM Major', city: 'Rio de Janeiro', country: 'Brasil' },
  { org: 'StarLadder Major', city: 'Budapeste', country: 'Hungria' },
  { org: 'ESL One Major', city: 'Colônia', country: 'Alemanha' },
];

export function majorOfYear(year: number): MajorOfYear {
  const fixed = MAJOR_CALENDAR[year];
  if (fixed) return fixed;
  const i = ((year - ERA_BASE_YEAR - 1) % MAJOR_ROTATION.length + MAJOR_ROTATION.length) % MAJOR_ROTATION.length;
  const r = MAJOR_ROTATION[i];
  return { name: `${r.org} ${year}`, city: r.city, country: r.country };
}

// ── A era corrente ───────────────────────────────────────────────────────────
export interface Era {
  year: number;
  season: number;
  name: string;        // "Era 2026"
  majorName: string;   // Major real do ano
  majorCity: string;
}

export function eraOfSeason(season: number): Era {
  const s = Math.max(1, Math.floor(season || 1));
  const year = ERA_BASE_YEAR + s - 1;
  const m = majorOfYear(year);
  return { year, season: s, name: `Era ${year}`, majorName: m.name, majorCity: m.city };
}

export function eraOf(save: Pick<RoadToProSave, 'world'>): Era {
  return eraOfSeason(save.world.season);
}

export const eraYearOfSeason = (season: number): number => ERA_BASE_YEAR + Math.max(1, season) - 1;

// ── Carimbo da era (gravado na virada do ano) ────────────────────────────────

const pickBy = <T,>(pool: readonly T[], key: string): T => pool[hashStr(key) % pool.length];

// Manchete da era: determinística pelo (ano, nick) e pelo que o ano rendeu.
function eraHeadline(nick: string, teamTag: string, year: number, ev: EraEvent[], tier: Tier, majorQualified: boolean): string {
  const titles = ev.filter((e) => e.place === 1).length;
  const finals = ev.filter((e) => e.place <= 2).length;
  const best = ev.length ? Math.min(...ev.map((e) => e.place)) : 7;
  const key = `era:${year}:${nick}:${teamTag}`;
  if (titles >= 2) return pickBy([
    `${year} foi o ano de ${nick}: ${titles} troféus e um ${teamTag} que ninguém segurou.`,
    `Dinastia em construção — ${nick} fecha ${year} com ${titles} títulos.`,
    `${nick} dominou ${year}. ${titles} taças, e a impressão de que ainda dá pra mais.`,
  ] as const, key);
  if (titles === 1) return pickBy([
    `${nick} levanta o troféu e carimba ${year} como o ano em que virou nome.`,
    `Um título, muita briga: ${year} coloca ${nick} no mapa.`,
    `${teamTag} campeão em ${year} — e ${nick} no centro da foto.`,
  ] as const, key);
  if (majorQualified) return pickBy([
    `Sem taça, mas com vaga: ${nick} fecha ${year} com o Major na mão.`,
    `${year} termina do jeito certo — ${teamTag} classificado pro Major.`,
  ] as const, key);
  if (finals >= 1) return pickBy([
    `Bateu na trave em ${year}: ${nick} chegou à final, faltou o último passo.`,
    `${year} deixou gosto de quase — final perdida, mas um ${nick} em ascensão.`,
  ] as const, key);
  if (best <= 3) return pickBy([
    `Playoffs sim, taça não: ${year} foi de aprendizado pra ${nick}.`,
    `${nick} rondou o topo em ${year} sem mordê-lo. O ano que vem cobra.`,
  ] as const, key);
  if (tier === 'academy') return pickBy([
    `${year} foi a base de tudo: ${nick} aprendeu o que é jogar por um elenco.`,
    `Ano de formação — ${nick} fecha ${year} ainda promessa, mas promessa de verdade.`,
  ] as const, key);
  return pickBy([
    `${year} foi duro pra ${nick}: sem playoffs, muita pergunta pra responder.`,
    `Ano pra esquecer — ou pra lembrar quando ${nick} der a volta por cima em ${year + 1}.`,
    `${teamTag} passou ${year} nadando contra a maré. ${nick} sobreviveu.`,
  ] as const, key);
}

export interface EraStampCtx {
  strongestTeam?: EraStamp['strongestTeam'];
  worldRank?: number;
  majorQualified: boolean;     // classificou pro Major do ano (placement chega depois)
}

// Monta o carimbo a partir do save NO MOMENTO DA VIRADA (season ainda a fechar)
// e do histórico já com a última etapa registrada. As séries/vitórias do ano
// vêm dos recordes vivos ANTES do reset de temporada (save.history.records).
export function buildEraStamp(save: RoadToProSave, historyEnd: CareerLog, ctx: EraStampCtx): EraStamp {
  const era = eraOf(save);
  const events: EraEvent[] = (historyEnd.timeline ?? [])
    .filter((t) => t.season === era.season && !t.major)
    .map((t) => ({ eventName: t.eventName, place: t.place, rating: t.rating, award: t.award }));
  const tally = seasonTally(save.history.records);
  return {
    year: era.year, season: era.season, tier: save.team.tier,
    teamTag: save.team.tag, teamName: save.team.teamName,
    events, series: tally.series, wins: tally.wins,
    strongestTeam: ctx.strongestTeam ?? null,
    headline: eraHeadline(save.player.nick, save.team.tag, era.year, events, save.team.tier, ctx.majorQualified),
    majorName: era.majorName, majorCity: era.majorCity,
    majorPlacement: ctx.majorQualified ? undefined : null,
    worldRank: ctx.worldRank,
  };
}

// Grava o carimbo no save + marca o fechamento como pendente (a UI mostra 1x).
export function stampEra(save: RoadToProSave, stamp: EraStamp): Pick<RoadToProSave, 'eras' | 'pendingEraYear'> {
  const eras = (save.eras ?? []).filter((e) => e.year !== stamp.year);
  return { eras: [...eras, stamp], pendingEraYear: stamp.year };
}

// Major do ano resolvido: carimba a colocação na era (aditivo; sem era = no-op).
export function stampMajorOnEra(save: RoadToProSave, eraYear: number, placement: MajorPlacementCode, award?: 'mvp' | 'evp' | null): RoadToProSave {
  const eras = save.eras;
  if (!eras || !eras.some((e) => e.year === eraYear)) return save;
  return { ...save, eras: eras.map((e) => (e.year === eraYear ? { ...e, majorPlacement: placement, majorAward: award ?? null } : e)) };
}

// A UI viu o fechamento: limpa a pendência (o carimbo fica pra sempre).
export function dismissEraClose(save: RoadToProSave): RoadToProSave {
  if (save.pendingEraYear == null) return save;
  const next = { ...save };
  delete next.pendingEraYear;
  return next;
}

export function pendingEraStamp(save: RoadToProSave): EraStamp | null {
  if (save.pendingEraYear == null) return null;
  return (save.eras ?? []).find((e) => e.year === save.pendingEraYear) ?? null;
}

// ── O fechamento (derivado do carimbo — fonte única) ─────────────────────────
export interface EraClose {
  stamp: EraStamp;
  name: string;                     // "Era 2026"
  titles: number;                   // títulos de etapa no ano
  finals: number;
  rating: number;                   // rating médio do ano (média das etapas)
  bestMoment: EraEvent | null;      // a etapa de maior rating (empate: melhor colocação)
  form: string;                     // 🟩🟥 por etapa (🟩 final/título, 🟨 playoff, 🟥 fora) + 🏆 no Major
  share: string;                    // texto pronto pra compartilhar
}

export const MAJOR_PLACE_LABEL: Record<MajorPlacementCode, string> = {
  champion: 'CAMPEÃO', runnerup: 'VICE', semi: 'SEMIFINAL', quarters: 'QUARTAS', top8: 'TOP 8', swiss: 'FASE SUÍÇA',
};

export function eraCloseOf(stamp: EraStamp): EraClose {
  const ev = stamp.events;
  const titles = ev.filter((e) => e.place === 1).length;
  const finals = ev.filter((e) => e.place <= 2).length;
  const rating = ev.length ? Math.round((ev.reduce((a, e) => a + e.rating, 0) / ev.length) * 100) / 100 : 0;
  const bestMoment = ev.length
    ? ev.reduce((b, e) => (e.rating > b.rating || (e.rating === b.rating && e.place < b.place) ? e : b))
    : null;
  const box = (p: number) => (p <= 2 ? '🟩' : p <= 3 ? '🟨' : '🟥');
  const majorBox = stamp.majorPlacement === 'champion' ? '🏆' : stamp.majorPlacement ? '⭐' : stamp.majorPlacement === null ? '' : '…';
  const form = `${ev.map((e) => box(e.place)).join('')}${majorBox}`;
  const majorLine = stamp.majorPlacement === undefined
    ? `${stamp.majorName}: em disputa`
    : stamp.majorPlacement === null
      ? `${stamp.majorName}: sem vaga`
      : `${stamp.majorName}: ${MAJOR_PLACE_LABEL[stamp.majorPlacement]}`;
  const share = [
    `ROAD//PRO · Era ${stamp.year} · ${stamp.teamTag}`,
    form,
    `${titles} título${titles === 1 ? '' : 's'} · ${stamp.wins}-${Math.max(0, stamp.series - stamp.wins)} em séries · rating ${rating.toFixed(2)}`,
    majorLine,
    stamp.headline,
  ].join('\n');
  return { stamp, name: `Era ${stamp.year}`, titles, finals, rating, bestMoment, form, share };
}
