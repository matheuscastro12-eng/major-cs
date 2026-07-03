// HALL DA FAMA ENTRE CARREIRAS (RTP v15 — Dinastia & Lendas).
//
// Arquivo SEPARADO do save (`rtm-rtp-hall-v1`): guarda o RESUMO de cada carreira
// aposentada do Road to Pro. Apagar/recomeçar o save NÃO apaga o hall — suas
// carreiras anteriores viram história permanente (RtpLegacy lista; RTPCreate
// mostra a melhor como meta a bater). Sem cloud sync (é memorabilia local).

import { captureError } from './errlog';
import { legacyScore, legacyTier } from '../engine/rtp/perks';
import { heroLegendMetrics } from '../engine/rtp/legends';
import type { RoadToProSave } from '../engine/rtp/types';

const HALL_KEY = 'rtm-rtp-hall-v1';
const HALL_CAP = 20;   // carreiras guardadas (as melhores por legado)

export interface HallCareer {
  id: string;           // derivado do createdAt do save — dedupe entre re-renders
  nick: string;
  country: string;      // ISO alpha-2 lowercase
  role: string;
  seasons: number;
  ageRetired: number;
  titles: number;       // total de títulos (todas as divisões)
  majors: number;       // Majors de elite vencidos
  mvpAwards: number;    // prêmios de MVP de campeonato
  peakRank?: number;    // melhor ranking mundial
  legacy: number;       // pontuação de legado (perks.legacyScore)
  tierLabel: string;    // veredito (Lenda/Estrela/…)
  retiredAt: number;    // timestamp da entrada no hall
}

export function loadHall(): HallCareer[] {
  try {
    const raw = localStorage.getItem(HALL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? (arr as HallCareer[]).filter((e) => e && typeof e.id === 'string' && typeof e.legacy === 'number')
      : [];
  } catch (e) {
    captureError(e, 'rtp-hall-load');
    return [];
  }
}

// Registra (ou re-registra — idempotente por id) uma carreira aposentada no hall.
// Devolve o hall atualizado, ordenado por legado (melhor primeiro).
export function recordCareerInHall(save: RoadToProSave): HallCareer[] {
  const id = `hof-${save.createdAt || save.rng.seed}`;
  const prev = loadHall();
  const m = heroLegendMetrics(save);
  const legacy = legacyScore(save);
  const entry: HallCareer = {
    id,
    nick: save.player.nick,
    country: save.player.country,
    role: save.player.role,
    seasons: save.world.season,
    ageRetired: save.player.age,
    titles: save.history.trophies.length,
    majors: m.majors,
    mvpAwards: m.mvps,
    peakRank: save.world.peakRank,
    legacy,
    tierLabel: legacyTier(legacy),
    // re-registro mantém a data original (senão o mount da tela "renovaria" o hall)
    retiredAt: prev.find((e) => e.id === id)?.retiredAt ?? Date.now(),
  };
  const hall = [entry, ...prev.filter((e) => e.id !== id)]
    .sort((a, b) => b.legacy - a.legacy)
    .slice(0, HALL_CAP);
  try {
    localStorage.setItem(HALL_KEY, JSON.stringify(hall));
  } catch (e) {
    captureError(e, 'rtp-hall-save');   // sem espaço: o hall em memória ainda serve pra UI
  }
  return hall;
}

// A melhor carreira já jogada (hall é ordenado por legado — é a primeira).
export function bestHallCareer(): HallCareer | null {
  return loadHall()[0] ?? null;
}
