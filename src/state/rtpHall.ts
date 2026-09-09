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
import {
  iconFromLegacy, legacyFromHall, legacyPoolEntry, type LegacyCoach, type LegacyProfile, type RtpHeir,
} from '../engine/bridge/legacyBridge';
import type { UltCard } from '../engine/ultimate/cards';
import type { Player, TeamSeason } from '../types';

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
  peakOvr?: number;     // [W2] pico de OVR (reconstrói o card do legado sem o save)
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
    peakOvr: Math.max(save.history.peakOvr, save.player.ovr),   // [W2]
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

// ─────────────────────────────────────────────────────────────────────────────
// [W2] LEGADO — a ponte entre os modos. Perfis completos dos aposentados
// (`rtm-rtp-legacy-v1`, cap = HALL_CAP, idempotente por id) + os "pendentes"
// que uma tela deixa pra outra ler (treinador → ManagerSetup; herdeiro →
// RTPCreate). Tudo local, sem cloud (é memorabilia, como o hall).

const LEGACY_KEY = 'rtm-rtp-legacy-v1';
const PENDING_COACH_KEY = 'rtm-legacy-coach-pending-v1';
const PENDING_HEIR_KEY = 'rtm-rtp-heir-pending-v1';

function readJson<T>(key: string, tag: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    captureError(e, tag);
    return null;
  }
}
function writeJson(key: string, value: unknown, tag: string): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { captureError(e, tag); }
}

export function loadLegacyProfiles(): LegacyProfile[] {
  const arr = readJson<unknown>(LEGACY_KEY, 'rtp-legacy-load');
  return Array.isArray(arr)
    ? (arr as LegacyProfile[]).filter((p) => p && typeof p.id === 'string' && typeof p.nick === 'string' && p.core)
    : [];
}

// Grava (ou re-grava — idempotente por id) o perfil de legado. Mais recente primeiro.
export function saveLegacyProfile(p: LegacyProfile): LegacyProfile[] {
  const list = [p, ...loadLegacyProfiles().filter((x) => x.id !== p.id)].slice(0, HALL_CAP);
  writeJson(LEGACY_KEY, list, 'rtp-legacy-save');
  return list;
}

export function legacyProfileById(id: string): LegacyProfile | null {
  const full = loadLegacyProfiles().find((p) => p.id === id);
  if (full) return full;
  // save já apagado e perfil nunca gravado (aposentadoria anterior ao W2): o
  // resumo do hall ainda reconstrói um perfil utilizável.
  const h = loadHall().find((c) => c.id === id);
  return h ? legacyFromHall(h) : null;
}

// Cards do legado (um por aposentado) — entram no ÍNDICE do catálogo do
// Ultimate (state/ultimate.ts), nunca no pool de packs/SBC/draft.
export function legacyCards(): UltCard[] {
  return loadLegacyProfiles().map(iconFromLegacy);
}
// …e materializados como Player + TeamSeason pro pool de partidas online.
export function legacyPoolPlayers(): { player: Player; from: TeamSeason; ovr: number }[] {
  return loadLegacyProfiles().map(legacyPoolEntry);
}
// Chave curta que muda quando a lista de legados muda (memo do catálogo).
export function legacyCatalogKey(): string {
  return loadLegacyProfiles().map((p) => p.id).join(',');
}

// Pendentes: uma tela deixa, a próxima consome (take = lê e apaga).
export function setPendingLegacyCoach(c: LegacyCoach): void { writeJson(PENDING_COACH_KEY, c, 'legacy-coach-pending'); }
export function peekPendingLegacyCoach(): LegacyCoach | null {
  const c = readJson<LegacyCoach>(PENDING_COACH_KEY, 'legacy-coach-pending');
  return c && c.origin?.kind === 'rtp-legacy' ? c : null;
}
export function clearPendingLegacyCoach(): void { try { localStorage.removeItem(PENDING_COACH_KEY); } catch { /* sem storage */ } }

export interface PendingHeir { country: string; heir: RtpHeir }
export function setPendingHeir(h: PendingHeir): void { writeJson(PENDING_HEIR_KEY, h, 'rtp-heir-pending'); }
export function peekPendingHeir(): PendingHeir | null {
  const h = readJson<PendingHeir>(PENDING_HEIR_KEY, 'rtp-heir-pending');
  return h && h.heir && typeof h.heir.mentorId === 'string' && typeof h.heir.mentorNick === 'string' ? h : null;
}
export function clearPendingHeir(): void { try { localStorage.removeItem(PENDING_HEIR_KEY); } catch { /* sem storage */ } }
