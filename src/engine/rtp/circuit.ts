// RTP v6 P7 — CIRCUITO: a "liga" de cada temporada é um BRACKET de campeonato
// (igual aos campeonatos reais), em todos os tiers:
//   Fase de grupos GSL (8 times → 2 grupos de 4, DUPLA ELIMINAÇÃO: Abertura →
//   Vencedores/Eliminação → Decisão) → 4 classificados → Playoff (SF + Final).
// Reusa o motor da carreira: gsl.ts (grupos) + swiss.ts (mata-mata). O time do
// herói usa id 'user' (contrato dos helpers userLeagueMatch/userPairing).
//
// Substitui o antigo league.ts (pontos corridos). Mantém TIER_NAME/squadRoleFor.

import { makeRng, shuffle } from '../rng';
import { hashStr } from '../../state/hash';
import { createGSLStage, resolveGSLRound, gslDone, gslQualifiers, gslUserPlace } from '../gsl';
import { userLeagueMatch, leagueTeam, type League as GslLeague } from '../league';
import { userPairing, getTeam, pairingBestOf, placementCode, resolveRound } from '../swiss';
import {
  buildUserTeam, conditionModifiers, assembleProResult, pickMaps, majorEffectiveAttrs, execBoostOvr,
  neutralMapPrefs, NEUTRAL_COACH, applyMatchOutcome, matchConfidence,
  simulateSeriesForPlay,
  type MatchPrep, type ProMatchResult, type MatchConsequence,
} from './matchSim';
import { resolveRoomSeries } from './roundModel';
import { generateMoments, summarizeMoments, type MomentOutcome } from './moments';
import { perkMatchFactors } from './perks';
import { scoutReport } from './meta';
import { isFacingRival, pushHeadline } from './media';
import { divisionPool, allAcademyTeams, joinTeam, worldTeamById, type WorldTeam } from './world';
import { TIER_NAME, TIER_ORDER, tierUp, tierDown, squadRoleFor, circuitEventName, type SeasonEndResult } from './league';
import { buildMajor, majorQualifies } from './major';
import { generateOffers, weakestClubContext } from './transfers';
import { weeklyTick, ageUp, RETIRE_AGE } from './weekly';
import { generateLifeEvent } from './lifeEvents';
import { ACTIONS_PER_WEEK } from './createSave';
import { computeWorldRank, deriveEventAward, makeAccolade } from './standing';
import { defaultRecords, recordsAtEventEnd, recordsWeekTick, applyRecordBreaks } from './records';
import { MAP_LABELS } from '../../types';
import type { Tournament, TTeam, SeriesResult } from '../../types';
import type { RoadToProSave, Tier, CircuitState, MajorState, TransferOffer, TeamContext, SeasonObjective, CareerLog, ProPlayer, Accolade, MediaState } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Field (8 times: você + 7 rivais → 2 grupos GSL) ──────────────────────────
function worldToTTeam(w: WorldTeam): TTeam {
  return {
    id: w.id, name: w.name, tag: w.tag, country: w.country, isUser: false, game: 'CS2',
    colors: w.colors, logoUrl: w.logoUrl, strength: w.strength,
    teamwork: clamp(58 + (hashStr(`tw:${w.id}`) % 18), 40, 90),
    mapPrefs: neutralMapPrefs(`opp:${w.tag}`), coach: NEUTRAL_COACH,
    players: w.players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  };
}

// 7 rivais (8 times = 2 grupos GSL de 4). Completa com tiers vizinhos quando o
// pool é fino (academia tem poucos times — sem isso o GSL faz grupos de 2-3 e
// quebra). Mesma estratégia do Major.
function circuitRivals(region: RoadToProSave['world']['region'], tier: Tier, season: number, excludeId: string, seed: number): WorldTeam[] {
  const want = 7;
  const seen = new Set([excludeId]);
  const out: WorldTeam[] = [];
  // só times com 5 jogadores (o motor de partida assume elenco completo; o
  // dataset real tem alguns rosters incompletos que travariam a simulação).
  const add = (ws: WorldTeam[]) => { for (const w of ws) { if (out.length >= want) break; if (!seen.has(w.id) && (w.players?.length ?? 0) >= 5) { seen.add(w.id); out.push(w); } } };
  // O seed (distinto por ETAPA) embaralha o recorte do pool — cada campeonato da
  // temporada tem um field diferente, não um replay do anterior.
  if (tier === 'academy') {
    // ACADEMY É ACADEMY-ONLY e GLOBAL: sorteia entre TODOS os clubes de academia
    // do mundo (não só a região do jogador).
    add(shuffle(makeRng((hashStr(`acad:${season}`) ^ seed) >>> 0), allAcademyTeams(season)));
  } else {
    // tiers PROFISSIONAIS: time real da divisão, completando com tiers profissionais
    // vizinhos (NUNCA cai pra academia). Junta os candidatos e embaralha por etapa.
    const pool: WorldTeam[] = [...divisionPool(region, tier, season, 14)];
    const order: Tier[] = ['access', 'challenger', 'elite'];
    for (const tt of order) { if (tt !== tier) pool.push(...divisionPool(region, tt, season, 14)); }
    // dedup preservando a ordem tier-próprio-primeiro, depois embaralha só o
    // recorte do PRÓPRIO tier (a “vizinhança” continua sendo reserva de emergência)
    const ownTier = pool.filter((w) => w.tier === tier);
    const neighbors = pool.filter((w) => w.tier !== tier);
    add(shuffle(makeRng(seed >>> 0), ownTier));
    add(neighbors);
  }
  return out.slice(0, want);
}

// Cada temporada tem VÁRIOS campeonatos (etapas) com nomes reais — o mundo (idade,
// mercado, promoção, Major) só mexe ao fechar a última etapa.
export const EVENTS_PER_SEASON = 3;

export function buildCircuit(save: RoadToProSave, tier: Tier, seed: number, event = 1): CircuitState {
  const region = save.world.region;
  const season = save.world.season;
  const rivals = circuitRivals(region, tier, season, save.team.realTeamId, seed).map(worldToTTeam);
  const user = buildUserTeam(save, save.player.attrs, 0, 'user');
  const name = circuitEventName(tier, region, season, event);   // nome REAL do campeonato
  const gsl = createGSLStage(name, [user, ...rivals]);
  return { tier, name, event, phase: 'gsl', gsl };
}

// ── Meta da diretoria (RTP v12) ──────────────────────────────────────────────
// Escala pela sua força RELATIVA no field: favorito → cobram título; azarão → só
// não fazer feio. Colocações: 1=título, 2=vice, 3=semi(playoff), 5=3º grupo, 7=4º.
export function computeObjective(circuit: CircuitState): SeasonObjective {
  const teams = (circuit.gsl as GslLeague).teams;
  const user = teams.find((t) => t.id === 'user');
  if (!user) return { targetPlace: 3, label: 'Chegar aos playoffs' };
  const stronger = teams.filter((t) => t.id !== 'user' && t.strength > user.strength).length;
  if (stronger === 0) return { targetPlace: 1, label: 'Ganhar o título — vocês são favoritos' };
  if (stronger <= 1) return { targetPlace: 2, label: 'Chegar à grande final' };
  if (stronger <= 4) return { targetPlace: 3, label: 'Chegar aos playoffs' };
  return { targetPlace: 5, label: 'Não ficar em último no grupo' };
}

// Status AO VIVO da meta (RTP v14): o jogador vê durante o campeonato se a meta
// está garantida, viva ou por um fio — não só o veredito no fim.
export function objectiveStatus(save: RoadToProSave): { state: 'secured' | 'alive' | 'edge'; note: string } | null {
  const obj = save.world.objective;
  const c = save.world.league;
  if (!obj || !c || c.phase === 'done') return null;
  if (c.phase === 'playoffs') {
    if (obj.targetPlace >= 3) return { state: 'secured', note: 'Playoffs alcançados — meta cumprida. Agora é bônus.' };
    const inFinal = c.playoff ? c.playoff.pairings.some((p) => p.label === 'Final' && (p.a === 'user' || p.b === 'user')) : false;
    if (obj.targetPlace === 2) {
      return inFinal
        ? { state: 'secured', note: 'Final alcançada — meta cumprida.' }
        : { state: 'edge', note: 'Vença a semi e a meta está cumprida.' };
    }
    return inFinal
      ? { state: 'edge', note: 'A diretoria só aceita o troféu — vença a final.' }
      : { state: 'alive', note: 'Só o título serve. Faltam dois passos.' };
  }
  // Fase de grupos: a rodada 3 (Decisão) é mata-mata pro objetivo de playoffs.
  const inDecider = ((c.gsl as GslLeague).current ?? 0) >= 2;
  if (obj.targetPlace <= 3 && inDecider) return { state: 'edge', note: 'Rodada decisiva: perder aqui enterra a meta.' };
  if (obj.targetPlace >= 5) return { state: 'alive', note: 'Evite o último lugar do grupo e a diretoria sossega.' };
  return { state: 'alive', note: 'Meta em jogo — avance de fase.' };
}

export interface ObjectiveVerdict { met: boolean; exceeded: boolean; confDelta: number; note: string; }
export function evaluateObjective(obj: SeasonObjective, place: number): ObjectiveVerdict {
  if (place < obj.targetPlace) return { met: true, exceeded: true, confDelta: 12, note: 'Superou a meta da diretoria!' };
  if (place <= obj.targetPlace) return { met: true, exceeded: false, confDelta: 6, note: 'Meta cumprida.' };
  const gap = place - obj.targetPlace;
  return { met: false, exceeded: false, confDelta: gap >= 3 ? -13 : -7, note: 'Meta não cumprida — a diretoria cobrou.' };
}

// ── Playoff dos 4 classificados (SF + Final) via swiss.ts ────────────────────
function buildSemisPlayoff(seeds: TTeam[], name: string): Tournament {
  const s = seeds.map((t) => ({ ...t, wins: 0, losses: 0, roundDiff: 0, status: 'alive' as const }));
  const at = (i: number) => s[i] ?? s[i % s.length] ?? s[0];
  return {
    name, teams: s, phase: 'semis', swissRound: 4,
    pairings: [
      { a: at(0).id, b: at(3).id, label: 'SF1', bestOf: 3 },   // 1A x 2B
      { a: at(1).id, b: at(2).id, label: 'SF2', bestOf: 3 },   // 1B x 2A
    ],
    history: [],
  };
}

// ── Match do herói no circuito (GSL ou playoff) ──────────────────────────────
interface UserMatch { a: string; b: string; bestOf: 1 | 3 | 5; }
function userMatch(c: CircuitState): UserMatch | null {
  if (c.phase === 'gsl') {
    const m = userLeagueMatch(c.gsl as GslLeague);
    return m ? { a: m.a, b: m.b, bestOf: (m.bo ?? 3) } : null;
  }
  if (c.phase === 'playoffs' && c.playoff) {
    const p = userPairing(c.playoff);
    return p ? { a: p.a, b: p.b, bestOf: pairingBestOf(c.playoff, p) } : null;
  }
  return null;
}

function oppTeamOf(c: CircuitState, oppId: string): TTeam {
  return c.phase === 'gsl' ? leagueTeam(c.gsl as GslLeague, oppId) : getTeam(c.playoff!, oppId);
}

// Adversário da próxima série (pro card "próxima partida" + prepare).
export function circuitOpponent(save: RoadToProSave): { team: TTeam; bestOf: 1 | 3 | 5; stage: string } | null {
  const c = save.world.league;
  if (!c) return null;
  const um = userMatch(c);
  if (!um) return null;
  const oppId = um.a === 'user' ? um.b : um.a;
  return { team: oppTeamOf(c, oppId), bestOf: um.bestOf, stage: stageLabel(c) };
}

export function stageLabel(c: CircuitState): string {
  if (c.phase === 'playoffs' && c.playoff) {
    const ph = c.playoff.phase;
    return ph === 'final' ? 'GRANDE FINAL' : ph === 'semis' ? 'Semifinal' : 'Playoffs';
  }
  if (c.phase === 'done') return 'Encerrado';
  const cur = (c.gsl as GslLeague).current;
  return cur === 0 ? 'Grupos · Abertura' : cur === 1 ? 'Grupos · Vencedores/Eliminação' : 'Grupos · Decisão';
}

function roundKey(c: CircuitState): string {
  return c.phase === 'gsl' ? `g${(c.gsl as GslLeague).current}` : `p${c.playoff?.phase ?? '?'}`;
}

// ── Prepare / finish da série do herói (espelha o Major) ─────────────────────
export function prepareCircuitMatch(save: RoadToProSave): MatchPrep | null {
  const c = save.world.league;
  if (!c) return null;
  const um = userMatch(c);
  if (!um) return null;
  const oppId = um.a === 'user' ? um.b : um.a;
  const opp = oppTeamOf(c, oppId);
  // Mistura a ETAPA no seed — sem isso, a mesma fase vs o mesmo rival em etapas
  // diferentes da temporada re-rolaria a série idêntica (mapas e sim iguais).
  const matchSeed = (save.rng.seed ^ (save.world.season * 0x9e3779b1) ^ ((c.event ?? 1) * 0x27d4eb2f) ^ hashStr(`${roundKey(c)}:${oppId}`)) >>> 0;
  const rng = makeRng(matchSeed);
  const maps = pickMaps(rng, um.bestOf);
  const { mod, factors } = conditionModifiers(save.life, save.setup);
  const facingRival = isFacingRival(save, oppId);
  const rivalFactors = facingRival ? [{ label: 'Rivalidade', delta: 5, good: true }] : [];
  return {
    matchSeed,
    opp: { name: opp.name, tag: opp.tag, colors: opp.colors, strength: opp.strength, players: opp.players, logoUrl: opp.logoUrl, mapPrefs: opp.mapPrefs },
    maps, bestOf: um.bestOf, conditionMod: mod, factors: [...factors, ...perkMatchFactors(save), ...rivalFactors],
    effAttrs: majorEffectiveAttrs(save, mod),
    moments: generateMoments(save.player.role),
    scout: scoutReport(opp, save.player.ovr), grudge: facingRival ? 1 : 0,
    confidence: matchConfidence(save),
  };
}

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

export function finishCircuitMatch(save: RoadToProSave, prep: MatchPrep, outcomes: MomentOutcome[]): { result: ProMatchResult; matchResult: SeriesResult } {
  const c = save.world.league!;
  const um = userMatch(c)!;
  const userIdx = um.a === 'user' ? 0 : 1;
  const oppId = userIdx === 0 ? um.b : um.a;
  const oppStored = oppTeamOf(c, oppId);
  const summary = summarizeMoments(outcomes);
  // Decisões (±9) + EXECUÇÃO nos minigames (±4.5/−1.5) movem o herói no sim de
  // verdade — jogou bem os momentos-chave, o rating sobe; jogou mal, cai.
  const momentBoost = (summary.score - 0.5) * 18 + execBoostOvr(summary.execAvg);
  const userTeam = buildUserTeam(save, prep.effAttrs, momentBoost, 'user');
  const oppTeam: TTeam = { ...oppStored, wins: 0, losses: 0, roundDiff: 0, status: 'alive', noEdge: true };
  // A JOGADA decide: o placar da série sai da SUA jogada mapa a mapa (resolveRoomSeries
  // — placar NATURAL 2-0/2-1/etc., a série para quando decide); o simulateSeries é
  // re-semeado até bater esse placar, gerando só o scoreboard/stats. É a MESMA fonte
  // que a Sala usa → o card nunca contradiz o que você jogou.
  const room = resolveRoomSeries(save.player.role, outcomes, save.player.ovr - prep.opp.strength, prep.matchSeed, prep.maps.map((m) => m.map), prep.bestOf);
  const series = simulateSeriesForPlay((prep.matchSeed ^ 0x1234567) >>> 0, userTeam, oppTeam, prep.maps, prep.bestOf, { mapWins: room.mapWins, seriesWon: room.seriesWon });
  const result = assembleProResult(userTeam, oppTeam, series, summary.score, summary.execAvg, room.maps);
  const matchResult = userIdx === 0 ? series : flipSeries(series);
  return { result, matchResult };
}

// ── Avança o circuito após a série do herói (GSL round / playoff / idle ff) ───
interface AdvanceResult { circuit: CircuitState; done: boolean; place: number; }

function advanceCircuit(save: RoadToProSave, matchResult: SeriesResult | null): AdvanceResult {
  const c0 = save.world.league!;
  const c: CircuitState = JSON.parse(JSON.stringify(c0));
  // Etapa no seed: resultados de IA distintos em cada campeonato da temporada.
  const seedBase = save.rng.seed ^ (save.world.season * 131) ^ ((c0.event ?? 1) * 0x1f123bb5);

  if (c.phase === 'gsl') {
    const gsl = c.gsl as GslLeague;
    if (matchResult) { const m = userLeagueMatch(gsl); if (m) m.result = matchResult; }
    resolveGSLRound(gsl, makeRng((seedBase ^ (gsl.current * 977) ^ hashStr('circ:gsl')) >>> 0));
    // adianta rodadas onde o herói não tem jogo (ele já 1º/4º do grupo)
    let g = 0;
    while (!gslDone(gsl) && !userLeagueMatch(gsl) && g++ < 6) {
      resolveGSLRound(gsl, makeRng((seedBase ^ (gsl.current * 5381) ^ (g * 7919)) >>> 0));
    }
    if (gslDone(gsl)) {
      const quals = gslQualifiers(gsl).map((id) => leagueTeam(gsl, id));
      if (quals.some((t) => t.id === 'user')) {
        c.playoff = buildSemisPlayoff(quals, c.name);
        c.phase = 'playoffs';
        return { circuit: c, done: false, place: 0 };
      }
      c.phase = 'done';
      return { circuit: c, done: true, place: gslUserPlace(gsl) === 3 ? 5 : 7 }; // não classificou
    }
    return { circuit: c, done: false, place: 0 };
  }

  // playoffs
  const p = c.playoff!;
  if (matchResult) { const up = userPairing(p); if (up) up.result = matchResult; }
  resolveRound(p, makeRng((seedBase ^ hashStr(`circ:po:${p.phase}`)) >>> 0));
  const userT = getTeam(p, 'user');
  if (p.phase === 'done' || p.championId === 'user' || userT.status === 'eliminated') {
    c.phase = 'done';
    c.champion = p.championId;
    const code = placementCode(p, 'user');
    return { circuit: c, done: true, place: code === 'champion' ? 1 : code === 'runnerup' ? 2 : 3 };
  }
  return { circuit: c, done: false, place: 0 };
}

// ── Conclusão da rodada do circuito (espelha o concludeRound antigo) ──────────
export interface EventEnd { name: string; place: number; won: boolean; nextName: string; objLabel?: string; objMet?: boolean; conf?: number; sacked?: boolean; newTeamName?: string; award?: 'mvp' | 'evp' | null; eventRating?: number; worldRank?: number; worldRankDelta?: number; }

// RTP v13 — recalcula o ranking mundial a partir de um snapshot pós-campeonato
// (histórico atualizado, jogador/tier possivelmente novos) e reporta o pulo.
function updateStanding(save: RoadToProSave, history: CareerLog, player: ProPlayer, tier: Tier): { worldRank: number; peakRank: number; delta: number } {
  const snap: RoadToProSave = { ...save, history, player, team: { ...save.team, tier } };
  const prev = save.world.worldRank ?? computeWorldRank(save);
  const worldRank = computeWorldRank(snap);
  const peakRank = Math.min(save.world.peakRank ?? prev, worldRank);
  return { worldRank, peakRank, delta: prev - worldRank };   // delta>0 = subiu no ranking
}
export interface RoundConclusion { save: RoadToProSave; seasonEnd?: SeasonEndResult; eventEnd?: EventEnd; }

// Início de semana: renda de patrocínio + rola um evento de vida pro inbox.
function withWeekStart(save: RoadToProSave): RoadToProSave {
  let money = save.life.money;
  const sponsors: typeof save.sponsors = [];
  for (const sp of save.sponsors) {
    money += sp.perWeek;
    const weeksLeft = sp.weeksLeft - 1;
    if (weeksLeft > 0) sponsors.push({ ...sp, weeksLeft });
  }
  let s: RoadToProSave = { ...save, life: { ...save.life, money }, sponsors };
  // Histórico de caixa (RTP v14): alimenta o gráfico REAL de finanças do overview.
  s = { ...s, world: { ...s.world, cashHist: [...(s.world.cashHist ?? []), money].slice(-12) } };
  // Etapa no seed: a semana reseta pra 1 a cada campeonato — sem a etapa, os
  // rolls de evento de vida da semana N se repetiriam nas 3 etapas do ano.
  const erng = makeRng((s.rng.seed ^ (s.world.season * 7717) ^ ((s.world.seasonEvent ?? 1) * 2749) ^ (s.world.week * 5381)) >>> 0);
  const ev = generateLifeEvent(s, erng);
  if (ev) s = { ...s, inbox: [...s.inbox, ev] };
  // DINASTIA (RTP v15): semana no topo alimenta o reinado (semanas em #1); marcos
  // de lenda quebrados nesta virada viram manchete (única — records.broken).
  const rec = recordsWeekTick(s.history.records ?? defaultRecords(), s.world.worldRank === 1);
  return applyRecordBreaks({ ...s, history: { ...s.history, records: rec } });
}

// Manchetes de CARREIRA (RTP v14): a imprensa reage a título, prêmio individual,
// corte, promoção/rebaixamento, salto no ranking e vaga no Major — não só a partidas.
interface BeatCtx {
  eventName: string; title?: string | null; award?: 'mvp' | 'evp' | null; sackedTo?: string;
  rankDelta?: number; rank?: number; promotedTo?: Tier; relegatedTo?: Tier; majorName?: string;
}
function beatHeadlines(save: RoadToProSave, ctx: BeatCtx): MediaState | undefined {
  let media = save.media;
  if (!media) return media;
  const { season, week } = save.world;
  const nick = save.player.nick;
  if (ctx.title) media = pushHeadline(media, `${nick} levanta o troféu do ${ctx.eventName}!`, 'hype', season, week);
  if (ctx.award) media = pushHeadline(media, `${nick} é eleito ${ctx.award.toUpperCase()} do ${ctx.eventName}.`, 'good', season, week);
  if (ctx.sackedTo) media = pushHeadline(media, `${save.team.teamName} dispensa ${nick}; ${ctx.sackedTo} aposta na recuperação.`, 'bad', season, week);
  if (ctx.promotedTo) media = pushHeadline(media, `${nick} sobe pra ${TIER_NAME[ctx.promotedTo]} após grande campanha.`, 'hype', season, week);
  if (ctx.relegatedTo) media = pushHeadline(media, `Campanha ruim rebaixa ${nick} pra ${TIER_NAME[ctx.relegatedTo]}.`, 'bad', season, week);
  if (ctx.majorName) media = pushHeadline(media, `${save.team.tag} carimba vaga no ${ctx.majorName}!`, 'hype', season, week);
  if ((ctx.rankDelta ?? 0) >= 15 && ctx.rank != null) media = pushHeadline(media, `${nick} dispara no ranking mundial: agora é o #${ctx.rank}.`, 'good', season, week);
  return media;
}

export function concludeCircuitRound(save: RoadToProSave, matchResult: SeriesResult): RoundConclusion {
  // Contrato EXPIRADO (0 semanas) = salário congelado até renovar/assinar. A
  // renovação forçada (life event) segue nagando; agora ignorá-la custa o bolso.
  const wage = save.team.contract.weeksLeft > 0 ? save.team.contract.wage : 0;
  const life = weeklyTick(save.life, wage, save.setup);
  const contract = { ...save.team.contract, weeksLeft: Math.max(0, save.team.contract.weeksLeft - 1) };

  const adv = advanceCircuit(save, matchResult);

  if (!adv.done) {
    // circuito continua: próxima série, +ações, +1 semana.
    return {
      save: withWeekStart({
        ...save,
        life,
        team: { ...save.team, contract },
        world: { ...save.world, week: save.world.week + 1, league: adv.circuit, actionsLeft: ACTIONS_PER_WEEK },
        rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
      }),
    };
  }

  // ── Campeonato (etapa) resolvido ──
  // Colocação (1=campeão, 2=vice, 3=semifinalista, 5=3º do grupo, 7=4º do grupo).
  const place = adv.place;
  const finishedName = save.world.league?.name ?? TIER_NAME[save.team.tier];
  const wonEvent = place === 1;
  const eventTrophy = wonEvent ? finishedName : null;
  // A etapa da temporada vive no WORLD (não no circuito) — sobrevive a transferências:
  // o ano fecha na última etapa, não importa por quantos times você passou.
  const seasonEvent = save.world.seasonEvent ?? (save.world.league?.event ?? 1);

  // META DA DIRETORIA: avalia o campeonato que fechou e mexe na confiança (emprego).
  const obj = save.world.objective;
  const verdict = obj ? evaluateObjective(obj, place) : null;
  const boardConfidence = clamp((save.world.boardConfidence ?? 55) + (verdict?.confDelta ?? 0), 0, 100);
  // DEMISSÃO: meta falhada + confiança no fundo do poço = você foi CORTADO. Não
  // durante empréstimo (quem manda é o clube-mãe). O aviso (evento hot-seat) já veio.
  const sackable = !!verdict && !verdict.met && boardConfidence <= 5 && !save.world.loanReturn;

  // PRÊMIO INDIVIDUAL (RTP v13): rating médio do herói no campeonato (acumulado por
  // série em applyMatchOutcome) + colocação + força do field decidem MVP/EVP.
  const eventSeries = save.world.eventSeries ?? 0;
  const avgEventRating = eventSeries > 0 ? (save.world.eventRatingSum ?? 0) / eventSeries : 1.0;
  const finishedTeams = (save.world.league?.gsl as GslLeague | undefined)?.teams ?? [];
  const userStrength = finishedTeams.find((t) => t.id === 'user')?.strength ?? 0;
  const strongerCount = finishedTeams.filter((t) => t.id !== 'user' && t.strength > userStrength).length;
  const awardKind = deriveEventAward(place, avgEventRating, strongerCount);
  const accolade: Accolade | null = awardKind
    ? makeAccolade(awardKind, finishedName, save.world.season, avgEventRating, save.team.tier, save.rng.tick)
    : null;
  const eventRatingOut = Math.round(avgEventRating * 100) / 100;
  // LINHA DO TEMPO (RTP v14): um registro por campeonato fechado — a história da
  // carreira que o Perfil e o Legado contam.
  const timelineEntry = {
    season: save.world.season, event: seasonEvent, eventName: finishedName, tier: save.team.tier,
    teamTag: save.team.tag, place, rating: eventRatingOut, award: awardKind ?? undefined,
  };
  const withRecords = (h: CareerLog, seasonEnd: boolean): CareerLog => ({
    ...h,
    accolades: accolade ? [...(h.accolades ?? []), accolade] : (h.accolades ?? []),
    timeline: [...(h.timeline ?? []), timelineEntry],
    // DINASTIA (RTP v15): série de títulos de elite + avaliação da temporada invicta.
    records: recordsAtEventEnd(h.records ?? defaultRecords(), { won: wonEvent, elite: save.team.tier === 'elite', seasonEnd }),
  });

  // AINDA HÁ ETAPAS na temporada → próximo CAMPEONATO (mesmo tier/temporada), sem
  // envelhecer/promover. É aqui que também podem CHEGAR propostas no meio do ano.
  if (seasonEvent < EVENTS_PER_SEASON) {
    const nextEvent = seasonEvent + 1;
    // Corte no meio do ano: um clube mais fraco te recolhe como rotação (lua de mel
    // curta em 42). Se não houver clube, segue no atual com a confiança rasteira.
    const replacement = sackable ? weakestClubContext(save, save.team.tier, save.world.season) : null;
    const teamNext: TeamContext = replacement ?? { ...save.team, contract };
    const lifeNext = replacement ? { ...life, morale: clamp(life.morale - 14, 0, 100), fame: clamp(life.fame - 3, 0, 100) } : life;
    const confNext = replacement ? 42 : boardConfidence;
    const saveForCircuit = { ...save, team: teamNext };
    const nextCircuit = buildCircuit(saveForCircuit, teamNext.tier, (save.rng.seed ^ (nextEvent * 7717) ^ (replacement ? 0x5ac : 0)) >>> 0, nextEvent);
    const history = withRecords(eventTrophy ? { ...save.history, trophies: [...save.history.trophies, eventTrophy] } : save.history, false);
    const st = updateStanding(save, history, save.player, teamNext.tier);
    const media = beatHeadlines(save, { title: eventTrophy, award: awardKind, sackedTo: replacement?.teamName, rankDelta: st.delta, rank: st.worldRank, eventName: finishedName });
    // propostas de meio de temporada: RARAS (senão vira spam) e não se emprestado
    // nem recém-cortado (você acabou de assinar).
    const offerRng = makeRng((save.rng.seed ^ (save.world.season * 331) ^ (nextEvent * 97)) >>> 0);
    const midOffers = !replacement && !save.world.loanReturn && offerRng() < 0.3 ? generateOffers(save, place, offerRng) : [];
    return {
      eventEnd: { name: finishedName, place, won: wonEvent, nextName: nextCircuit.name, objLabel: obj?.label, objMet: verdict?.met, conf: confNext, sacked: !!replacement, newTeamName: replacement?.teamName, award: awardKind, eventRating: eventRatingOut, worldRank: st.worldRank, worldRankDelta: st.delta },
      save: withWeekStart({
        ...save,
        life: lifeNext,
        team: teamNext,
        history,
        media,
        world: { ...save.world, week: 1, seasonEvent: nextEvent, league: nextCircuit, objective: computeObjective(nextCircuit), boardConfidence: confNext, worldRank: st.worldRank, peakRank: st.peakRank, eventRatingSum: 0, eventSeries: 0, actionsLeft: ACTIONS_PER_WEEK, pendingOffers: midOffers },
        rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
      }),
    };
  }

  // ── Última etapa → FIM DE TEMPORADA (envelhece, promove, Major) ──
  const oldTier = save.team.tier;
  let newTier = oldTier;
  let promoted = false, relegated = false;
  if (oldTier === 'academy') {
    // ACADEMIA: não promove por colocação. Boas campanhas geram PROPOSTAS de times
    // profissionais (access) — aceitar uma é "ir pro pro". Recusar = fica outra
    // temporada na academia provando seu valor. Sem rebaixamento (é o degrau base).
  } else {
    // Tiers PROFISSIONAIS: finalistas (place<=2) sobem; 4º de grupo (place 7) cai —
    // mas access é o piso do pro (não cai pra academia).
    if (place <= 2 && oldTier !== 'elite') { newTier = tierUp(oldTier); promoted = true; }
    else if (place >= 7 && oldTier !== 'access') { newTier = tierDown(oldTier); relegated = true; }
  }

  // EMPRÉSTIMO: fim da temporada emprestada. Brilhou (place<=2) → comprado de vez
  // (some o loanReturn, fluxo normal). Senão → VOLTA pro clube-mãe (reconstrói o
  // elenco real, tier/contrato do parent), ignorando promoção/rebaixamento.
  const loan = save.world.loanReturn;
  let returnTeam: TeamContext | null = null;
  if (loan && place > 2) {
    const parent = worldTeamById(loan.realTeamId, save.world.season + 1);
    if (parent) {
      const teammates = joinTeam(parent, save.player.role);
      returnTeam = {
        teamId: 'rtp-user', realTeamId: parent.id, teamName: parent.name, tag: parent.tag,
        colors: parent.colors, logo: parent.logoUrl, tier: loan.tier, squadRole: squadRoleFor(place),
        contract: loan.contract, teammates, chem: Object.fromEntries(teammates.map((m) => [m.sourcePlayerId, 30])),
      };
      newTier = loan.tier; promoted = false; relegated = false;
    }
  }

  const champion = place === 1 && oldTier === 'elite';
  // Título do campeonato final da temporada entra na galeria + prêmio + timeline.
  const historyEnd = withRecords(eventTrophy ? { ...save.history, trophies: [...save.history.trophies, eventTrophy] } : save.history, true);

  const season = save.world.season + 1;
  const agedPlayer = ageUp(save.player);   // +1 ano + declínio por idade + OVR
  const retired = agedPlayer.age >= RETIRE_AGE;
  const squadRole = squadRoleFor(place);
  // DEMISSÃO no fechamento do ano (mesma régua do meio da temporada). A vaga no
  // Major protege — a org não corta quem acabou de classificá-la; aposentando,
  // não faz sentido assinar com clube novo.
  const endSack = !retired && sackable && !returnTeam && !majorQualifies(place, oldTier)
    ? weakestClubContext(save, newTier, season) : null;
  const finalTier = returnTeam ? returnTeam.tier : newTier;
  const st = updateStanding(save, historyEnd, agedPlayer, finalTier);
  const seasonEnd: SeasonEndResult = { placement: place, promoted, relegated, oldTier, newTier, champion, award: awardKind, eventRating: eventRatingOut, worldRank: st.worldRank, worldRankDelta: st.delta, sacked: !!endSack, newTeamName: endSack?.teamName };

  // Aposentadoria natural: encerra a carreira (a UI mostra o legado). Não precisa
  // montar próxima temporada/ofertas/Major.
  if (retired) {
    return {
      seasonEnd,
      // applyRecordBreaks: a última temporada ainda pode quebrar um marco de lenda
      // (aqui não passa pelo withWeekStart) — marca antes de fechar o legado.
      save: applyRecordBreaks({ ...save, player: agedPlayer, life, team: { ...save.team, contract }, history: historyEnd, world: { ...save.world, worldRank: st.worldRank, peakRank: st.peakRank, eventRatingSum: 0, eventSeries: 0 }, retired: true, rng: { seed: save.rng.seed, tick: save.rng.tick + 1 } }),
    };
  }

  const saveForNext = { ...save, player: agedPlayer, team: returnTeam ?? endSack ?? { ...save.team, tier: newTier } };
  const nextCircuit = buildCircuit({ ...saveForNext, world: { ...save.world, season } }, newTier, (save.rng.seed ^ (season * 7919)) >>> 0);

  // Janela de transferências + classificação pro Major (do tier que disputou).
  // Recém-cortado não recebe ofertas (você acabou de assinar com o clube-resgate).
  const offerRng = makeRng((save.rng.seed ^ (season * 4099)) >>> 0);
  const offers = endSack ? [] : generateOffers({ ...saveForNext, world: { ...save.world, season } }, place, offerRng);
  let major: MajorState | null = null;
  let pendingOffers: TransferOffer[] = offers;
  if (majorQualifies(place, oldTier)) {
    const saveForMajor = { ...save, world: { ...save.world, season } };
    major = buildMajor(saveForMajor, oldTier, season, (save.rng.seed ^ (season * 8191) ^ 0x4d41) >>> 0);
    major.deferredOffers = offers;
    pendingOffers = [];
  }

  const lifeEnd = endSack ? { ...life, morale: clamp(life.morale - 14, 0, 100), fame: clamp(life.fame - 3, 0, 100) } : life;
  const mediaEnd = beatHeadlines(save, {
    eventName: finishedName, title: eventTrophy, award: awardKind, sackedTo: endSack?.teamName,
    rankDelta: st.delta, rank: st.worldRank, promotedTo: promoted ? newTier : undefined,
    relegatedTo: relegated ? newTier : undefined, majorName: major?.name,
  });
  return {
    seasonEnd,
    save: withWeekStart({
      ...save,
      player: agedPlayer,
      life: lifeEnd,
      team: returnTeam ?? endSack ?? { ...save.team, tier: newTier, squadRole, contract },
      history: historyEnd,
      media: mediaEnd,
      world: { ...save.world, season, week: 1, seasonEvent: 1, league: nextCircuit, objective: computeObjective(nextCircuit), boardConfidence: endSack ? 42 : boardConfidence, worldRank: st.worldRank, peakRank: st.peakRank, eventRatingSum: 0, eventSeries: 0, actionsLeft: ACTIONS_PER_WEEK, pendingOffers, major, loanReturn: undefined },
      rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
    }),
  };
}

// Auto-sim da série do herói (skip): joga no automático e conclui a rodada.
export interface AutoSimResult { result: ProMatchResult; consequence: MatchConsequence; conclusion: RoundConclusion; }
export function autoSimCircuitRound(save: RoadToProSave): AutoSimResult | null {
  const prep = prepareCircuitMatch(save);
  if (!prep) return null;
  const { result, matchResult } = finishCircuitMatch(save, prep, []);
  // Skip TAMBÉM credita sua carreira (histórico/forma/fama/XP/prêmio) — igual ao
  // jogo manual; simular só pula o drama dos momentos, não a partida em si.
  const { save: afterOutcome, consequence } = applyMatchOutcome(save, result);
  const conclusion = concludeCircuitRound(afterOutcome, matchResult);
  return { result, consequence, conclusion };
}

// ── Consultas pra UI (dashboard) ─────────────────────────────────────────────
export interface CircuitMatchRow { key: string; opponent: string; score: string; won: boolean; maps: string[]; }

// Partidas resolvidas do herói (grupos + playoff), mais recentes por último.
export function circuitUserMatches(c: CircuitState): CircuitMatchRow[] {
  const rows: CircuitMatchRow[] = [];
  const push = (oppName: string, res: SeriesResult, userIdx: 0 | 1) => {
    rows.push({
      key: `m${rows.length}`, opponent: oppName,
      score: `${res.mapScore[userIdx]}-${res.mapScore[1 - userIdx]}`,
      won: res.winner === userIdx,
      maps: res.maps.map((mp) => `${MAP_LABELS[mp.map] ?? mp.map} ${mp.score[userIdx]}-${mp.score[1 - userIdx]}`),
    });
  };
  const gsl = c.gsl as GslLeague;
  for (const round of gsl.rounds) for (const m of round) {
    if (!m.result || (m.a !== 'user' && m.b !== 'user')) continue;
    const ui = (m.a === 'user' ? 0 : 1) as 0 | 1;
    push(leagueTeam(gsl, ui === 0 ? m.b : m.a).name, m.result, ui);
  }
  if (c.playoff) for (const h of c.playoff.history) {
    const p = h.pairing;
    if (!p.result || (p.a !== 'user' && p.b !== 'user')) continue;
    const ui = (p.a === 'user' ? 0 : 1) as 0 | 1;
    push(getTeam(c.playoff, ui === 0 ? p.b : p.a).name, p.result, ui);
  }
  return rows;
}

export function circuitForm(c: CircuitState): ('W' | 'L')[] {
  return circuitUserMatches(c).map((r) => (r.won ? 'W' : 'L'));
}

export interface CircuitRankRow { id: string; tag: string; name: string; colors: [string, string]; logoUrl?: string; strength: number; isUser: boolean; wins: number; losses: number; }
export function circuitRanking(c: CircuitState): CircuitRankRow[] {
  const gsl = c.gsl as GslLeague;
  return [...gsl.teams]
    .sort((a, b) => b.wins - a.wins || b.roundDiff - a.roundDiff || b.strength - a.strength)
    .map((t) => ({ id: t.id, tag: t.tag, name: t.name, colors: t.colors, logoUrl: t.logoUrl, strength: t.strength, isUser: t.id === 'user', wins: t.wins ?? 0, losses: t.losses ?? 0 }));
}

export { TIER_NAME, TIER_ORDER };
