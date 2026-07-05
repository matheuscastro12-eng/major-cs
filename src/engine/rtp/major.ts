// RTP v6 P5 — MAJOR: importa o motor de campeonato da carreira (engine/swiss):
// fase Suíça de 16 → 8 classificados → Champions Stage (QF/SF MD3, Final MD5).
//
// RISCO R-CHAMP-1 (do plano): os helpers do swiss (userPairing/userTeam/
// resolveRound) casam pelo id literal 'user'. Então o time do herói DENTRO do
// Tournament do Major usa id 'user' (namespace isolado — a liga usa 'rtp-user').
// O jogador do herói segue 'rtp-hero' (namespace de JOGADOR, não conflita).

import { makeRng } from '../rng';
import { hashStr } from '../../state/hash';
import {
  createSwissStage, stageAdvancers, createPlayoffStage, resolveRound,
  userPairing, getTeam, pairingBestOf, placementCode,
} from '../swiss';
import {
  buildUserTeam, conditionModifiers, assembleProResult, pickMaps, execBoostOvr,
  majorEffectiveAttrs, neutralMapPrefs, NEUTRAL_COACH, applyMatchOutcome, matchConfidence,
  simulateSeriesForPlay,
  type MatchPrep, type ProMatchResult, type MatchConsequence,
} from './matchSim';
import { resolveRoomSeries } from './roundModel';
import { generateMoments, summarizeMoments, type MomentOutcome } from './moments';
import { perkMatchFactors } from './perks';
import { scoutReport } from './meta';
import { isFacingRival, pushHeadline } from './media';
import { divisionPool, type WorldTeam } from './world';
import { computeWorldRank, deriveEventAward, makeAccolade } from './standing';
import { defaultRecords, recordsAtMajorEnd, applyRecordBreaks } from './records';
import { majorName } from '../../data/tournaments';
import type { MapId, Tournament, TTeam, SeriesResult } from '../../types';
import type { RoadToProSave, Tier, MajorState, MajorPlacementCode } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Qualificação + premiação (chaveadas na união real de Tier) ───────────────
// Academia NÃO tem Major: terminar a academia bem = promoção pro PROFISSIONAL +
// propostas (o "ir pro pro"), não um campeonato. Major é dos tiers profissionais.
export const MAJOR_CUT: Record<Tier, number> = { academy: 0, access: 2, challenger: 3, elite: 4 };
export function majorQualifies(placement: number, tier: Tier): boolean {
  return placement <= (MAJOR_CUT[tier] ?? 0);
}

const MAJOR_NAME_THEME: Record<Tier, string> = {
  academy: 'Copa das Promessas', access: 'Challenger Major',
  challenger: 'Intercontinental', elite: 'Major Mundial',
};
// Nome do Major: no elite é o Major REAL rotativo (PGL Copenhagen, IEM Rio…); nos
// tiers de baixo, o "major" temático do degrau.
const MAJOR_NAME = (tier: Tier, edition = 1): string => (tier === 'elite' ? majorName(edition) : MAJOR_NAME_THEME[tier]);
const PRIZE_BY_TIER: Record<Tier, number> = { academy: 20_000, access: 60_000, challenger: 180_000, elite: 600_000 };
const PRIZE_FRAC: Record<MajorPlacementCode, number> = { champion: 1, runnerup: 0.55, semi: 0.32, quarters: 0.18, top8: 0.1, swiss: 0.04 };
const FAME_BY_PLACE: Record<MajorPlacementCode, number> = { champion: 18, runnerup: 11, semi: 7, quarters: 4, top8: 2, swiss: 1 };

// career PlacementCode → MajorPlacementCode ('playoffs' = passou da suíça = top8)
function mapPlacement(code: string): MajorPlacementCode {
  if (code === 'champion') return 'champion';
  if (code === 'runnerup') return 'runnerup';
  if (code === 'semi') return 'semi';
  if (code === 'quarters') return 'quarters';
  if (code === 'playoffs') return 'top8';
  return 'swiss';
}

// ── Construção do field (16 times) ───────────────────────────────────────────
function worldTeamToTTeam(w: WorldTeam): TTeam {
  return {
    id: w.id, name: w.name, tag: w.tag, country: w.country, isUser: false, game: 'CS2',
    colors: w.colors, logoUrl: w.logoUrl, strength: w.strength,
    teamwork: clamp(58 + (hashStr(`tw:${w.id}`) % 18), 40, 90),
    mapPrefs: neutralMapPrefs(`opp:${w.tag}`), coach: NEUTRAL_COACH,
    players: w.players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  };
}

// ~15 rivais da região/tier (exclui o time do herói); completa com tiers
// vizinhos se o pool for fino, pra fechar um Major cheio.
function majorRivals(region: RoadToProSave['world']['region'], tier: Tier, season: number, excludeId: string): WorldTeam[] {
  const want = 15;
  const seen = new Set([excludeId]);
  const out: WorldTeam[] = [];
  // só times com elenco completo (5) — o motor de partida assume isso.
  const add = (ws: WorldTeam[]) => { for (const w of ws) { if (out.length >= want) break; if (!seen.has(w.id) && (w.players?.length ?? 0) >= 5) { seen.add(w.id); out.push(w); } } };
  add(divisionPool(region, tier, season, 24));
  const order: Tier[] = ['elite', 'challenger', 'access', 'academy'];
  for (const tt of order) { if (out.length >= want) break; if (tt !== tier) add(divisionPool(region, tt, season, 24)); }
  return out.slice(0, want);
}

export function buildMajor(save: RoadToProSave, tier: Tier, edition: number, seed: number): MajorState {
  const region = save.world.region;
  const season = save.world.season;
  const rng = makeRng(seed >>> 0);
  const rivals = majorRivals(region, tier, season, save.team.realTeamId).map(worldTeamToTTeam);
  const userTT = buildUserTeam(save, save.player.attrs, 0, 'user');
  const name = MAJOR_NAME(tier, edition);
  const tournament = createSwissStage([userTT, ...rivals], rng, name);
  return { name, edition, tier, tournament, phaseStage: 'swiss', userTeamId: 'user' };
}

// ── Preparação / resolução da SÉRIE do herói ─────────────────────────────────
export function prepareMajorMatch(save: RoadToProSave): MatchPrep | null {
  const major = save.world.major;
  if (!major) return null;
  const t = major.tournament;
  const up = userPairing(t);
  if (!up) return null;
  const userIdx = up.a === 'user' ? 0 : 1;
  const oppId = userIdx === 0 ? up.b : up.a;
  const opp = getTeam(t, oppId);
  const bestOf = pairingBestOf(t, up);
  // seed estável por (season, fase, swissRound) — nunca rng.tick (F5 não re-rola)
  const matchSeed = (save.rng.seed ^ (save.world.season * 0x9e3779b1) ^ (t.swissRound * 0x85ebca6b) ^ hashStr(`${t.phase}:${up.label}`)) >>> 0;
  const rng = makeRng(matchSeed);
  const maps = pickMaps(rng, bestOf);
  const { mod, factors } = conditionModifiers(save.life, save.setup);
  const facingRival = isFacingRival(save, oppId);
  const rivalFactors = facingRival ? [{ label: 'Rivalidade', delta: 5, good: true }] : [];
  return {
    matchSeed,
    opp: { name: opp.name, tag: opp.tag, colors: opp.colors, strength: opp.strength, players: opp.players, logoUrl: opp.logoUrl, mapPrefs: opp.mapPrefs },
    maps, bestOf, conditionMod: mod, factors: [...factors, ...perkMatchFactors(save), ...rivalFactors],
    effAttrs: majorEffectiveAttrs(save, mod),
    moments: generateMoments(save.player.role),
    scout: scoutReport(opp, save.player.ovr), grudge: facingRival ? 1 : 0,
    confidence: matchConfidence(save),
  };
}

// Inverte uma série pra orientá-la na ordem [a, b] do pairing quando o herói é o 'b'.
function flipSeries(s: SeriesResult): SeriesResult {
  const flip = (w: 0 | 1): 0 | 1 => (w === 0 ? 1 : 0);
  return {
    teamIds: [s.teamIds[1], s.teamIds[0]],
    winner: flip(s.winner),
    mapScore: [s.mapScore[1], s.mapScore[0]],
    maps: s.maps.map((m) => ({
      ...m,
      score: [m.score[1], m.score[0]],
      winner: flip(m.winner),
      pickedBy: m.pickedBy === 0 ? 1 : m.pickedBy === 1 ? 0 : -1,
      roundLog: m.roundLog.map((r) => flip(r)),
      killFeed: m.killFeed.map((k) => ({ ...k, killerTeam: flip(k.killerTeam), victimTeam: flip(k.victimTeam) })),
    })),
  };
}

// Resolve a série do herói (momentos já jogados). Devolve o ProMatchResult
// (orientado ao usuário, índice 0) + a série orientada ao pairing pra gravar.
export function finishMajorMatch(save: RoadToProSave, prep: MatchPrep, outcomes: MomentOutcome[], liveMaps?: { map: MapId; score: [number, number]; won: boolean }[]): { result: ProMatchResult; pairingResult: SeriesResult } {
  const t = save.world.major!.tournament;
  const up = userPairing(t)!;
  const userIdx = up.a === 'user' ? 0 : 1;
  const oppId = userIdx === 0 ? up.b : up.a;
  const oppStored = getTeam(t, oppId);
  const summary = summarizeMoments(outcomes);
  const momentBoost = (summary.score - 0.5) * 18 + execBoostOvr(summary.execAvg);
  const userTeam = buildUserTeam(save, prep.effAttrs, momentBoost, 'user');
  const oppTeam: TTeam = { ...oppStored, wins: 0, losses: 0, roundDiff: 0, status: 'alive', noEdge: true };
  // A JOGADA decide (mesma régua do circuito): placar natural da série pela sua
  // jogada mapa a mapa (resolveRoomSeries); o simulateSeries é forçado a bater.
  const room = resolveRoomSeries(save.player.role, outcomes, save.player.ovr - prep.opp.strength, prep.matchSeed, prep.maps.map((m) => m.map), prep.bestOf);
  const series = simulateSeriesForPlay((prep.matchSeed ^ 0x1234567) >>> 0, userTeam, oppTeam, prep.maps, prep.bestOf, { mapWins: room.mapWins, seriesWon: room.seriesWon });
  // v17: quando a partida foi JOGADA na Sala, o card usa os mapas COMO ELA
  // EXIBIU (fechamento fundido com o placar vivo) — Sala == card por
  // construção. Skip/sim (sem Sala) seguem no resolveRoomSeries puro.
  const displayMaps = liveMaps && liveMaps.length ? liveMaps : room.maps;
  const result = assembleProResult(userTeam, oppTeam, series, summary.score, summary.execAvg, displayMaps);
  const pairingResult = userIdx === 0 ? series : flipSeries(series);
  return { result, pairingResult };
}

// ── Conclusão da rodada do Major (avança o bracket; resolve no fim) ───────────
export interface MajorConclusion {
  save: RoadToProSave;
  resolved: boolean;     // o Major terminou pro herói nesta rodada?
  // resultado da série simulada (pra abrir o modal de resultado no skip do Major,
  // igual ao circuito). Ausente quando a rodada só adianta o bracket (idle).
  result?: ProMatchResult;
  consequence?: MatchConsequence;
}

// Colocação do Major → número de "place" no molde do circuito (pra derivar prêmio).
const MAJOR_PLACE_NUM: Record<MajorPlacementCode, number> = {
  champion: 1, runnerup: 2, semi: 3, quarters: 5, top8: 7, swiss: 7,
};

function resolveOutcome(save: RoadToProSave, t: Tournament, tier: Tier, name: string): NonNullable<MajorState['resolved']> {
  const place = mapPlacement(placementCode(t, 'user'));
  const prize = Math.round(PRIZE_BY_TIER[tier] * PRIZE_FRAC[place]);
  const fameDelta = FAME_BY_PLACE[place];
  const trophy = place === 'champion' ? name : undefined;
  // Prêmio individual do Major (RTP v13): rating médio acumulado no torneio +
  // colocação. Field de Major é forte (16 times) → afrouxa o limiar (stronger=3).
  const series = save.world.eventSeries ?? 0;
  const avg = series > 0 ? (save.world.eventRatingSum ?? 0) / series : 1.0;
  const award = deriveEventAward(MAJOR_PLACE_NUM[place], avg, 3);
  return { placement: place, prize, fameDelta, trophy, award };
}

function applyResolution(save: RoadToProSave, name: string, tier: Tier, res: NonNullable<MajorState['resolved']>): RoadToProSave {
  const trophies = res.trophy ? [...save.history.trophies, res.trophy] : save.history.trophies;
  const awards = res.placement === 'champion' || res.placement === 'runnerup'
    ? [...save.history.awards, `${name} — ${res.placement}`]
    : save.history.awards;
  // Prêmio individual estruturado (vitrine/legado/ranking). Usa o tier do MAJOR
  // (major.tier), não save.team.tier — que já pode ter promovido no fim da temporada.
  const series = save.world.eventSeries ?? 0;
  const avg = series > 0 ? (save.world.eventRatingSum ?? 0) / series : 1.0;
  const accolades = res.award
    ? [...(save.history.accolades ?? []), makeAccolade(res.award, `${name} (Major)`, save.world.season, avg, tier, save.rng.tick)]
    : (save.history.accolades ?? []);
  // Linha do tempo (RTP v14): o Major entra como registro próprio (event 0).
  const placeNum = MAJOR_PLACE_NUM[res.placement];
  const timeline = [...(save.history.timeline ?? []), {
    season: save.world.season, event: 0, eventName: name, tier, teamTag: save.team.tag,
    place: placeNum, rating: Math.round(avg * 100) / 100, award: res.award ?? undefined, major: true,
  }];
  // DINASTIA (RTP v15): Majors de elite consecutivos entram na sequência histórica.
  const records = recordsAtMajorEnd(save.history.records ?? defaultRecords(), { champion: res.placement === 'champion', elite: tier === 'elite' });
  const history = { ...save.history, trophies, awards, accolades, timeline, records };
  // Recalcula o ranking mundial pós-Major e zera o acumulador de rating.
  const prevRank = save.world.worldRank ?? computeWorldRank(save);
  const worldRank = computeWorldRank({ ...save, history });
  const peakRank = Math.min(save.world.peakRank ?? prevRank, worldRank);
  // Manchete do Major: campeão/finalista rende capa; MVP idem.
  let media = save.media;
  if (media && (res.placement === 'champion' || res.placement === 'runnerup')) {
    media = pushHeadline(media, res.placement === 'champion'
      ? `${save.player.nick} é CAMPEÃO do ${name}!`
      : `${save.team.tag} bate na trave: vice do ${name}.`,
      res.placement === 'champion' ? 'hype' : 'neutral', save.world.season, save.world.week);
  }
  if (media && res.award) {
    media = pushHeadline(media, `${save.player.nick} é o ${res.award.toUpperCase()} do ${name}.`, 'good', save.world.season, save.world.week);
  }
  // applyRecordBreaks: um marco de lenda quebrado NO Major (ex.: 3º seguido) sai
  // na imprensa junto com a manchete do título.
  return applyRecordBreaks({
    ...save,
    life: {
      ...save.life,
      money: save.life.money + res.prize,
      fame: clamp(save.life.fame + res.fameDelta, 0, 100),
    },
    history,
    media,
    world: { ...save.world, worldRank, peakRank, eventRatingSum: 0, eventSeries: 0 },
  });
}

export function concludeMajorRound(save: RoadToProSave, pairingResult: SeriesResult): MajorConclusion {
  const major = save.world.major!;
  const t: Tournament = JSON.parse(JSON.stringify(major.tournament));   // clone imutável
  const up = userPairing(t)!;
  up.result = pairingResult;
  // rng determinístico por (season, fase, swissRound) — nunca rng.tick
  const rng = makeRng((save.rng.seed ^ (save.world.season * 131) ^ (t.swissRound * 977) ^ hashStr(`maj:${t.phase}`)) >>> 0);
  resolveRound(t, rng);

  // Se o usuário fechou a vaga (3 vitórias) mas a suíça segue pros outros, ele
  // ficaria SEM série e a tela travaria. Adianta as rodadas de IA até o stage
  // fechar (determinístico) — aí a transição pro playoffs acontece de imediato.
  let guard = 0;
  while (!userPairing(t) && t.phase !== 'done' && getTeam(t, 'user').status === 'advanced' && guard++ < 24) {
    const r2 = makeRng((save.rng.seed ^ (save.world.season * 53) ^ (t.swissRound * 131) ^ (guard * 7919)) >>> 0);
    resolveRound(t, r2);
  }

  return settleMajor(save, major, t);
}

// Decide a transição de stage (suíça→playoffs) e a resolução do Major a partir
// do estado do Tournament. Compartilhado por concludeMajorRound e advanceMajorIdle.
function settleMajor(save: RoadToProSave, major: MajorState, t: Tournament): MajorConclusion {
  let phaseStage = major.phaseStage;
  let tournament = t;
  let resolved: MajorState['resolved'] | undefined;
  const userT = getTeam(t, 'user');

  if (phaseStage === 'swiss') {
    if (t.phase === 'done') {
      if (userT.status === 'advanced') {
        const seeds = stageAdvancers(t);
        if (seeds.some((s) => s.id === 'user')) {
          tournament = createPlayoffStage(seeds, major.name);
          phaseStage = 'playoffs';
        } else {
          resolved = resolveOutcome(save, t, major.tier, major.name);   // avançou mas ficou fora do top8
        }
      } else {
        resolved = resolveOutcome(save, t, major.tier, major.name);       // eliminado na suíça
      }
    } else if (userT.status === 'eliminated') {
      resolved = resolveOutcome(save, t, major.tier, major.name);
    }
  } else {
    // playoffs
    if (t.phase === 'done' || t.championId === 'user' || userT.status === 'eliminated') {
      resolved = resolveOutcome(save, t, major.tier, major.name);
    }
  }

  let next: RoadToProSave = {
    ...save,
    world: { ...save.world, major: { ...major, tournament, phaseStage, resolved } },
    rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
  };
  if (resolved) next = applyResolution(next, major.name, major.tier, resolved);
  return { save: next, resolved: !!resolved };
}

// Auto-sim da série do herói (botão "Simular"): joga no automático (momentScore
// neutro) e conclui a rodada — escreve a série no pairing ANTES do resolveRound.
// Se o herói NÃO tem série (já se classificou e a suíça segue), adianta a IA.
export function autoSimMajorRound(save: RoadToProSave): MajorConclusion | null {
  const prep = prepareMajorMatch(save);
  if (!prep) return advanceMajorIdle(save);
  const { result, pairingResult } = finishMajorMatch(save, prep, []);
  // credita a carreira no skip (sem prêmio por-série no Major — vem da resolução).
  const { save: afterOutcome, consequence } = applyMatchOutcome(save, result, { leaguePrize: false });
  const conclusion = concludeMajorRound(afterOutcome, pairingResult);
  // anexa result+consequence pra a UI abrir o modal de resultado (feedback no skip)
  return conclusion ? { ...conclusion, result, consequence } : conclusion;
}

// Adianta o torneio quando o herói está sem série (defensivo — o fast-forward do
// concludeMajorRound normalmente já evita esse estado).
export function advanceMajorIdle(save: RoadToProSave): MajorConclusion | null {
  const major = save.world.major;
  if (!major || major.resolved) return null;
  const t: Tournament = JSON.parse(JSON.stringify(major.tournament));
  if (userPairing(t)) return null;   // tem série → não é idle
  let guard = 0;
  while (!userPairing(t) && t.phase !== 'done' && guard++ < 24) {
    const r = makeRng((save.rng.seed ^ (save.world.season * 53) ^ (t.swissRound * 131) ^ (guard * 7919) ^ hashStr(`idle:${t.phase}`)) >>> 0);
    resolveRound(t, r);
  }
  return settleMajor(save, major, t);
}

// Encerra o Major (após a tela de resultado): limpa world.major e abre a janela
// de transferências que ficou diferida (se houver).
export function dismissMajor(save: RoadToProSave): RoadToProSave {
  const major = save.world.major;
  const deferred = major?.deferredOffers ?? [];
  return {
    ...save,
    world: { ...save.world, major: null, pendingOffers: deferred },
  };
}
