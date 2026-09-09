// LEGADO — a PONTE entre os três modos (W2).
//
// Um pro aposentado do Road to Pro não some: vira um LegacyProfile determinístico
// que (1) pode ser o TREINADOR da Carreira (coachFromLegacy → Manager-like),
// (2) vira um CARD do Ultimate gerado dos stats reais (iconFromLegacy → UltCard)
// e (3) deixa um DISCÍPULO no próprio RtP (heirFromLegacy → parte do
// CreateRtpInput, com o bônus aplicado em createRtpSave).
//
// Engine PURO: sem Math.random/Date.now. Tudo deriva do save aposentado (ou do
// resumo no hall) — mesma entrada, mesmo perfil, mesmo card.
import type { Coach, Player, Role, TeamSeason } from '../../types';
import type { PlayerPersonality } from '../career/personality';
import type { HallCareer } from '../../state/rtpHall';
import { hashStr } from '../../state/hash';
import { ROLE_FOCUS, type CreateRtpInput } from '../rtp/createSave';
import { coreStatsFromAttrs, type CoreStats } from '../rtp/coreStats';
import { heroLegendMetrics } from '../rtp/legends';
import { legacyScore, legacyTier } from '../rtp/perks';
import type { RoadToProSave } from '../rtp/types';
import { deriveStats, type UltCard } from '../ultimate/cards';
import type { AttrKey } from '../attributes';

// O RtP começa em 2026 (dataset real); cada temporada = 1 ano de idade.
export const RTP_EPOCH_YEAR = 2026;

// Prefixos estáveis: o card do legado NUNCA colide com o dataset real (`hist_*`
// é das lendas curadas; `rtp_legacy_*` é seu).
export const LEGACY_PLAYER_PREFIX = 'rtp_legacy_';
export const LEGACY_TEAM_ORIGIN = 'rtp-legacy';
export const LEGACY_TEAM_ORIGIN_NAME = 'Legado do RtP';

export interface LegacyRival {
  orgName: string;
  tag: string;
  playerNick: string;
  h2h: { w: number; l: number };
}

export interface LegacyProfile {
  id: string;                 // mesmo id do hall (`hof-<createdAt|seed>`) — idempotência
  nick: string;
  name: string;
  country: string;            // ISO alpha-2 lowercase
  role: Role;
  role2?: Role;
  personality: PlayerPersonality;
  archetype: string;
  peakOvr: number;
  finalOvr: number;
  ageRetired: number;
  seasons: number;
  retiredYear: number;        // "ano" da aposentadoria (RTP_EPOCH_YEAR + temporadas - 1)
  titles: number;             // títulos de qualquer divisão
  majors: number;             // Majors de elite
  mvps: number;
  peakRank?: number;
  legacy: number;             // pontos de legado (perks.legacyScore)
  tierLabel: string;          // Lenda/Estrela/…
  traits: string[];           // TraitId[] que o pro construiu
  core: CoreStats;            // os 5 stats legados no momento da aposentadoria (0-100)
  lastTeam: { realTeamId: string; name: string; tag: string };
  rival: LegacyRival | null;  // arqui-rival da carreira (media.ts), se houve
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Save aposentado → perfil

export function legacyFromSave(save: RoadToProSave): LegacyProfile {
  const m = heroLegendMetrics(save);
  const seasons = Math.max(1, save.world.season);
  const rv = save.media?.rival ?? null;
  return {
    id: `hof-${save.createdAt || save.rng.seed}`,
    nick: save.player.nick,
    name: save.player.name,
    country: save.player.country,
    role: save.player.role,
    role2: save.player.role2,
    personality: save.player.personality,
    archetype: save.player.archetype,
    peakOvr: Math.max(save.history.peakOvr, save.player.ovr),
    finalOvr: save.player.ovr,
    ageRetired: save.player.age,
    seasons,
    retiredYear: RTP_EPOCH_YEAR + seasons - 1,
    titles: save.history.trophies.length,
    majors: m.majors,
    mvps: m.mvps,
    peakRank: save.world.peakRank,
    legacy: legacyScore(save),
    tierLabel: legacyTier(legacyScore(save)),
    traits: [...(save.player.progression?.traits ?? [])],
    core: coreStatsFromAttrs(save.player.attrs),
    lastTeam: { realTeamId: save.team.realTeamId, name: save.team.teamName, tag: save.team.tag },
    rival: rv ? { orgName: rv.orgName, tag: rv.tag, playerNick: rv.playerNick, h2h: { ...rv.h2h } } : null,
  };
}

// Do RESUMO do hall (save já apagado): o que dá pra reconstruir sem os
// atributos. Os 5 stats saem do OVR de pico com o formato da função.
export function legacyFromHall(h: HallCareer): LegacyProfile {
  const role = (h.role as Role) || 'Rifler';
  const o = Math.round(h.peakOvr ?? 60);
  return {
    id: h.id,
    nick: h.nick,
    name: h.nick,
    country: h.country,
    role,
    personality: 'resilient',
    archetype: 'allrounder',
    peakOvr: o,
    finalOvr: o,
    ageRetired: h.ageRetired,
    seasons: h.seasons,
    retiredYear: RTP_EPOCH_YEAR + Math.max(1, h.seasons) - 1,
    titles: h.titles,
    majors: h.majors,
    mvps: h.mvpAwards,
    peakRank: h.peakRank,
    legacy: h.legacy,
    tierLabel: h.tierLabel,
    traits: [],
    core: {
      aim: role === 'AWP' ? o - 4 : o,
      clutch: o - 3,
      consistency: o - 2,
      awp: role === 'AWP' ? o + 2 : o - 20,
      igl: role === 'IGL' ? o + 2 : o - 15,
    },
    lastTeam: { realTeamId: '', name: '', tag: '' },
    rival: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Perfil → TREINADOR da Carreira (Manager-like)

export interface LegacyOrigin {
  kind: 'rtp-legacy';
  legacyId: string;
  role: Role;
  peakOvr: number;
  titles: number;
  majors: number;
  legacy: number;
  tierLabel: string;
  retiredYear: number;
  // Bônus INICIAL de reputação do técnico (0..2 degraus) — documentado; a Carreira
  // ainda não consome (ver worker_done). Mantido aqui pra ser lido onde couber.
  repBonus: number;
}

export interface LegacyCoach {
  nick: string;
  name: string;
  age: number;
  country: string;
  accent: string;
  org: string;
  origin: LegacyOrigin;
}

// Cor da org derivada do nick (determinística). ACCENTS vive em state/manager;
// aqui repetimos a paleta pra manter o engine puro e sem import de UI/state.
const ACCENT_PALETTE = ['#4382b6', '#d8a943', '#6fd06f', '#c792ea', '#e25a5a', '#6fc3df'];

export function coachFromLegacy(p: LegacyProfile, org = ''): LegacyCoach {
  return {
    nick: p.nick,
    name: p.name || p.nick,
    age: p.ageRetired,
    country: p.country,
    accent: ACCENT_PALETTE[hashStr(`coach:${p.id}`) % ACCENT_PALETTE.length],
    org,
    origin: {
      kind: 'rtp-legacy',
      legacyId: p.id,
      role: p.role,
      peakOvr: p.peakOvr,
      titles: p.titles,
      majors: p.majors,
      legacy: p.legacy,
      tierLabel: p.tierLabel,
      retiredYear: p.retiredYear,
      repBonus: p.majors > 0 ? 2 : p.titles > 0 ? 1 : 0,
    },
  };
}

// Rótulo curto do chip "Ex-pro · …" (UI do ManagerSetup).
export function legacyChipLabel(o: Pick<LegacyOrigin, 'titles' | 'majors' | 'tierLabel'>): string {
  const parts = [`Ex-pro · ${o.tierLabel}`];
  if (o.majors > 0) parts.push(`${o.majors} Major${o.majors > 1 ? 's' : ''}`);
  if (o.titles > 0) parts.push(`${o.titles} título${o.titles > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Perfil → CARD do Ultimate
//
// Reusa a raridade `histIcon` (moldura de lenda) com identidade própria:
// playerId `rtp_legacy_*` + teamOrigin `rtp-legacy`. Assim o card cai nos
// mesmos filtros/sinergias das lendas sem raridade nova (packs/SBC/draft nunca
// o sorteiam: ele entra só no ÍNDICE do catálogo, não no pool — ver
// state/ultimate.ts). OVR = pico da carreira, com piso pra não sair um card
// abaixo do que a moldura promete.
export const LEGACY_CARD_MIN_OVR = 78;

export function legacyCardKey(profileId: string): string {
  return `${LEGACY_PLAYER_PREFIX}${profileId}:histIcon`;
}

export function isLegacyCard(card: Pick<UltCard, 'playerId'> | null | undefined): boolean {
  return !!card && card.playerId.startsWith(LEGACY_PLAYER_PREFIX);
}

export function iconFromLegacy(p: LegacyProfile): UltCard {
  const ovr = Math.max(LEGACY_CARD_MIN_OVR, Math.min(99, Math.round(p.peakOvr)));
  // stats reais da carreira (0-100), com piso alinhado ao OVR do card — quem se
  // aposentou com pico 90 não pode ter tiro 40.
  const floor = ovr - 12;
  const lift = (v: number) => Math.max(floor, Math.min(99, Math.round(v)));
  const playerId = `${LEGACY_PLAYER_PREFIX}${p.id}`;
  return {
    key: legacyCardKey(p.id),
    playerId,
    nick: p.nick,
    country: p.country,
    region: 'global',
    role: p.role,
    teamOrigin: LEGACY_TEAM_ORIGIN,
    teamOriginName: LEGACY_TEAM_ORIGIN_NAME,
    rarity: 'histIcon',
    ovr,
    stats: deriveStats({
      aim: lift(p.core.aim),
      clutch: lift(p.core.clutch),
      consistency: lift(p.core.consistency),
      awp: p.role === 'AWP' || p.role2 === 'AWP' ? lift(p.core.awp) : Math.min(99, Math.round(p.core.awp)),
      igl: p.role === 'IGL' || p.role2 === 'IGL' ? lift(p.core.igl) : Math.min(99, Math.round(p.core.igl)),
      role: p.role,
      role2: p.role2,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Perfil → HERDEIRO (new game+ do RtP)

export interface RtpHeir {
  mentorId: string;
  mentorNick: string;
  mentorRole: Role;
  mentorTeamId: string;       // realTeamId do último time do mentor ('' se desconhecido)
  mentorTeamTag: string;
  generation: number;         // 2 = discípulo direto; 3 = discípulo do discípulo…
  rival: LegacyRival | null;  // rivalidade herdada (só texto de intro)
}

// 2 atributos-chave da função do MENTOR ganham +1 (determinístico, sem RNG).
export function heirBonusAttrs(role: Role): AttrKey[] {
  return ROLE_FOCUS[role].slice(0, 2);
}

export function heirFromLegacy(p: LegacyProfile, generation = 2): Pick<CreateRtpInput, 'country' | 'heir'> {
  return {
    country: p.country,
    heir: {
      mentorId: p.id,
      mentorNick: p.nick,
      mentorRole: p.role,
      mentorTeamId: p.lastTeam.realTeamId,
      mentorTeamTag: p.lastTeam.tag,
      generation,
      rival: p.rival,
    },
  };
}

// Texto de intro da rivalidade herdada (manchete de estreia, media.headlines).
export function heirIntroHeadline(heir: RtpHeir, heirNick: string): string {
  if (heir.rival) {
    const r = heir.rival;
    const lead = r.h2h.w > r.h2h.l ? 'perdeu mais do que ganhou' : r.h2h.w < r.h2h.l ? 'levou a melhor' : 'dividiu o retrospecto';
    return `${heirNick} chega como discípulo de ${heir.mentorNick}. ${r.playerNick} (${r.tag}) ${lead} contra o mestre — e já avisou que a rixa continua.`;
  }
  return `${heirNick} chega como discípulo de ${heir.mentorNick}. A pressão de carregar o nome vem junto.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Card do legado no POOL de partidas do Ultimate
//
// Mesma classe de bug das lendas (icons.ts): o pool online monta times a partir
// de {player, from} — um card cujo playerId não existe lá trava squadComplete.
// Materializa o legado como Player + TeamSeason "Legado do RtP".

const LEGACY_COACH: Coach = { nick: 'legacy-coach', name: 'Técnico', country: 'br', rating: 76, style: 'tactical' };

export function legacyTeamSeason(): TeamSeason {
  return {
    id: LEGACY_TEAM_ORIGIN, team: LEGACY_TEAM_ORIGIN_NAME, tag: 'LEGD', era: 'legado', game: 'CS2', country: 'br',
    teamwork: 84, honors: 'Aposentados do Road to Pro', colors: ['#f3cf6b', '#141821'], mapPrefs: {}, coach: LEGACY_COACH, players: [],
  };
}

export function legacyPoolEntry(p: LegacyProfile): { player: Player; from: TeamSeason; ovr: number } {
  const card = iconFromLegacy(p);
  const floor = card.ovr - 12;
  const lift = (v: number) => Math.max(floor, Math.min(99, Math.round(v)));
  return {
    player: {
      id: card.playerId, nick: p.nick, name: p.name || p.nick, country: p.country, role: p.role, role2: p.role2,
      aim: lift(p.core.aim), clutch: lift(p.core.clutch), consistency: lift(p.core.consistency),
      awp: Math.min(99, Math.round(p.core.awp)), igl: Math.min(99, Math.round(p.core.igl)),
    },
    from: legacyTeamSeason(),
    ovr: card.ovr,
  };
}
