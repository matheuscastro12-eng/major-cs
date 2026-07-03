// RTP v15 — DINASTIA & LENDAS: o endgame de quem já chegou ao topo.
//
// Depois de ser campeão elite e #1 do mundo, o que falta? Entrar pra HISTÓRIA.
// Este módulo define o PANTEÃO: ~10 lendas fictícias (carreiras completas, valores
// determinísticos) contra as quais a SUA carreira é comparada ao vivo — Majors,
// títulos de elite, semanas em #1, prêmios de MVP. Subir nesse placar é a meta de
// longo prazo que o loop pós-título não tinha.
//
// Também vivem aqui os MARCOS DE LENDA (LEGEND_MARKS): recordes históricos que,
// quando quebrados pelos seus CareerRecords (records.ts), rendem manchete e pontos
// de legado. Tudo constante e puro — zero estado, zero RNG.

import type { CareerRecords, RoadToProSave } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// O panteão

export interface Legend {
  id: string;
  nick: string;
  name: string;
  country: string;    // ISO-3166 alpha-2, lowercase (mesma convenção do ProPlayer)
  era: string;        // janela da carreira (ex.: "2013–2022")
  majors: number;     // Majors (elite) vencidos
  titles: number;     // títulos de elite (tier 1)
  weeksAtOne: number; // semanas no #1 do ranking mundial
  mvps: number;       // prêmios de MVP de campeonato
  peakRank: number;   // melhor ranking mundial da carreira
}

// Carreiras inventadas, mas calibradas na régua do jogo (3 etapas de elite +
// 1 Major por temporada; carreira longa ≈ 15-19 anos). Ordem livre — o placar
// ordena por pontos.
export const LEGENDS: Legend[] = [
  { id: 'lg_zoren', nick: 'zoren', name: 'Viktor Zorenko', country: 'ua', era: '2016–2024', majors: 1, titles: 16, weeksAtOne: 88, mvps: 20, peakRank: 1 },
  { id: 'lg_nordik', nick: 'nordik', name: 'Mikkel Dahl', country: 'dk', era: '2013–2022', majors: 4, titles: 22, weeksAtOne: 58, mvps: 12, peakRank: 1 },
  { id: 'lg_karrig', nick: 'karrig', name: 'Anders Krogh', country: 'dk', era: '2014–2023', majors: 4, titles: 24, weeksAtOne: 0, mvps: 2, peakRank: 4 },
  { id: 'lg_lumen', nick: 'lumen', name: 'Théo Marchand', country: 'fr', era: '2018–2026', majors: 1, titles: 13, weeksAtOne: 52, mvps: 16, peakRank: 1 },
  { id: 'lg_gelo', nick: 'gelo', name: 'Marcelo Prado', country: 'br', era: '2015–2023', majors: 2, titles: 10, weeksAtOne: 41, mvps: 11, peakRank: 1 },
  { id: 'lg_bolt', nick: 'bolt', name: 'Erik Lindqvist', country: 'se', era: '2012–2019', majors: 2, titles: 18, weeksAtOne: 30, mvps: 9, peakRank: 1 },
  { id: 'lg_rezn', nick: 'rezn', name: 'Artem Reznik', country: 'ru', era: '2017–2025', majors: 1, titles: 9, weeksAtOne: 12, mvps: 8, peakRank: 2 },
  { id: 'lg_maddex', nick: 'maddex', name: 'Jake Maddox', country: 'us', era: '2015–2024', majors: 1, titles: 8, weeksAtOne: 6, mvps: 5, peakRank: 3 },
  { id: 'lg_snax', nick: 'sn4x', name: 'Tomasz Wilk', country: 'pl', era: '2011–2018', majors: 2, titles: 7, weeksAtOne: 4, mvps: 6, peakRank: 5 },
  { id: 'lg_kensu', nick: 'kensu', name: 'Aleksi Kettunen', country: 'fi', era: '2014–2021', majors: 0, titles: 6, weeksAtOne: 0, mvps: 4, peakRank: 6 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Métricas comparáveis + placar

export interface LegendMetrics {
  majors: number;
  titles: number;      // títulos de elite (Major fora — conta na própria coluna)
  weeksAtOne: number;
  mvps: number;
}

// Sua carreira na MESMA régua das lendas. Majors/títulos vêm da timeline (v14),
// semanas em #1 dos recordes vivos (v15), MVPs dos accolades (v13).
export function heroLegendMetrics(save: RoadToProSave): LegendMetrics {
  const tl = save.history.timeline ?? [];
  return {
    majors: tl.filter((t) => t.major && t.tier === 'elite' && t.place === 1).length,
    titles: tl.filter((t) => !t.major && t.tier === 'elite' && t.place === 1).length,
    weeksAtOne: save.history.records?.totalWeeksAtOne ?? 0,
    mvps: (save.history.accolades ?? []).filter((a) => a.kind === 'mvp').length,
  };
}

// Pontuação do placar: Major é o troféu máximo; semanas em #1 pesam devagar
// (constância vale, mas não compra um Major).
export function legendPoints(m: LegendMetrics): number {
  return Math.round(m.majors * 100 + m.titles * 40 + m.mvps * 25 + m.weeksAtOne * 1.5);
}

export interface LegendRow {
  nick: string;
  country: string;
  era?: string;
  isHero?: boolean;
  m: LegendMetrics;
  pts: number;
}

// Placar completo (lendas + você), ordenado por pontos, com a sua posição.
export function legendBoard(save: RoadToProSave): { rows: LegendRow[]; heroPos: number } {
  const heroM = heroLegendMetrics(save);
  const rows: LegendRow[] = LEGENDS.map((l) => ({
    nick: l.nick, country: l.country, era: l.era,
    m: { majors: l.majors, titles: l.titles, weeksAtOne: l.weeksAtOne, mvps: l.mvps },
    pts: legendPoints(l),
  }));
  rows.push({ nick: save.player.nick, country: save.player.country, isHero: true, m: heroM, pts: legendPoints(heroM) });
  // desempate a seu favor: pontos iguais = você já alcançou a lenda
  rows.sort((a, b) => b.pts - a.pts || (a.isHero ? -1 : b.isHero ? 1 : 0));
  return { rows, heroPos: rows.findIndex((r) => r.isHero) + 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marcos de lenda — recordes históricos que os seus CareerRecords podem quebrar.
// `value` lê a marca atual dos recordes; quebrado quando value >= at (uma vez;
// records.broken evita manchete repetida).

export interface LegendMark {
  id: string;
  label: string;                            // rótulo curto pra UI (card de recordes)
  holder: string;                           // quem detém a marca no panteão
  at: number;                               // valor que quebra o recorde
  value: (r: CareerRecords) => number;
  headline: (nick: string) => string;       // manchete ao quebrar
}

export const LEGEND_MARKS: LegendMark[] = [
  {
    id: 'mk_titles5', label: '5 títulos de elite seguidos', holder: 'karrig', at: 5,
    value: (r) => r.bestTitleStreak,
    headline: (nick) => `DINASTIA: ${nick} quebra o recorde do karrig com 5 títulos de elite seguidos!`,
  },
  {
    id: 'mk_majors3', label: '3 Majors consecutivos', holder: 'nordik', at: 3,
    value: (r) => r.bestMajorStreak,
    headline: (nick) => `HISTÓRICO: ${nick} vence o 3º Major seguido e apaga a marca de nordik!`,
  },
  {
    id: 'mk_weeks89', label: '89 semanas seguidas em #1', holder: 'zoren', at: 89,
    value: (r) => r.bestWeeksAtOne,
    headline: (nick) => `${nick} supera zoren: ninguém jamais reinou tanto no topo do ranking mundial.`,
  },
  {
    id: 'mk_perfect', label: 'Temporada de elite invicta', holder: 'ninguém', at: 1,
    value: (r) => r.perfectSeasons,
    headline: (nick) => `PERFEIÇÃO: ${nick} fecha uma temporada de elite INVICTO — nenhuma lenda conseguiu.`,
  },
];
