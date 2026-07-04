// RTP3 — camada de partida do protagonista.
//
// A série do TIME roda no engine existente (engine/match.ts → simulateSeries).
// Por cima, o protagonista vive os momentos-chave (engine/rtp/moments.ts), cujo
// desempenho (momentScore) dá um boost/penalidade no skill efetivo dele na
// simulação — é o "carregar ou entregar". E o estado off-game (energia, moral,
// foco, físico) modula os atributos efetivos: é aqui que a vida fora do servidor
// finalmente MORDE o desempenho dentro dele.

import { makeRng, type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import { simulateSeries, computeDisplay, mergeLines } from '../match';
import { MAP_POOL, type MapId, type TPlayer, type TTeam, type Coach, type Role, type PlayerLine, type SeriesResult } from '../../types';
import { ALL_ATTRS, type AttrKey } from '../attributes';
import { proToTPlayer } from './coreStats';
import type { Moment } from './moments';
import { STARTER_SETUP } from './createSave';
import { setupConditionMods } from './setup';
import { perkAttrBonus, aggregatePassives, applyMatchProgression, detectHistoryTraits, traitById, type MatchProgressCtx } from './perks';
import { heroMapComfort, type GamePlan, type ScoutReport } from './meta';
import { updateMediaAfterMatch, rivalStakeDelta, type MediaMatchCtx } from './media';
import { defaultRecords, recordsAfterSeries } from './records';
import type { RoadToProSave, SetupState, Tier, SquadRole } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
// Condição (off-game → buffs/debuffs nos atributos efetivos)

export interface ConditionFactor { label: string; delta: number; good: boolean; }

export function conditionModifiers(life: RoadToProSave['life'], setup: SetupState = STARTER_SETUP()): { mod: number; factors: ConditionFactor[] } {
  let mod = 1.0;
  const factors: ConditionFactor[] = [];
  const add = (label: string, delta: number) => { mod += delta / 100; factors.push({ label, delta, good: delta > 0 }); };

  // Penalidades SUAVES: a vida afeta, mas um profissional não some numa fase ruim.
  if (life.energy < 35) add('Exausto', -5);
  else if (life.energy < 65) add('Cansado', -2);
  else if (life.energy >= 88) add('Descansado', +3);

  if (life.morale < 35) add('Desmotivado', -4);
  else if (life.morale >= 78) add('Confiante', +3);

  if (life.focus < 35) add('Disperso', -3);
  else if (life.focus >= 78) add('Focado', +3);

  if (life.fitness < 35) add('Fora de forma', -2);

  // Lesão pesa forte (jogar machucado dói).
  if (life.flags.injured) add(`Lesionado (${life.flags.injured.kind})`, -6);

  // Setup (periféricos) + psicólogo: sucata pesa contra, gear afiado ajuda.
  for (const f of setupConditionMods(setup).factors) { mod += f.delta / 100; factors.push(f); }

  // Piso 0.87: mesmo no fundo do poço você continua sendo um pro (não vira saco de
  // pancada). Teto 1.18 pra caber o buff do gear elite junto da vida.
  return { mod: clamp(mod, 0.87, 1.18), factors };
}

// Atributos efetivos do protagonista (base × condição + bônus de perks), 1-20.
// O bônus de perk é FLAT sobre o valor já modulado (perk = skill treinado, não
// escala com a condição) e entra no roll real — por isso já aparece no % base do
// Round Room (perks com `attr` NÃO viram fator separado, pra não duplicar).
export function effectiveAttrs(save: RoadToProSave, mod: number): Record<AttrKey, number> {
  const out = {} as Record<AttrKey, number>;
  const bonus = perkAttrBonus(save);
  for (const k of ALL_ATTRS) out[k] = clamp(Math.round(save.player.attrs[k] * mod) + (bonus[k] ?? 0), 1, 20);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coach / mapPrefs neutros (compartilhados por circuit.ts e major.ts)

const NEUTRAL_COACH: Coach = { nick: '—', name: '—', country: 'br', rating: 60, style: 'tactical' };

function neutralMapPrefs(seed: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MAP_POOL) out[m] = (hashStr(`${seed}:${m}`) % 7) - 3;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preparação da partida (antes dos momentos)

export interface MatchPrep {
  matchSeed: number;
  opp: { name: string; tag: string; colors: [string, string]; strength: number; players: TPlayer[]; logoUrl?: string; mapPrefs?: Record<string, number> };
  maps: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  bestOf: 1 | 3 | 5;
  conditionMod: number;
  factors: ConditionFactor[];
  effAttrs: Record<AttrKey, number>;
  moments: Moment[];
  // RTP v9 — meta competitivo (runtime, não persistido):
  scout?: ScoutReport;          // relatório de scouting do adversário
  grudge?: number;              // +effAttr por rivalidade (0 se não for o rival)
  plan?: GamePlan;              // plano de jogo escolhido no pré-jogo (default na UI)
  // RTP v10 — jogo mental: confiança (moral + sequência), −1..+1. Semeia o momentum
  // inicial da Sala e firma (ou faz tremer) nos rounds de pressão (clutch/map point).
  confidence?: number;
}

// Confiança pré-jogo derivada da moral + sequência de vitórias/derrotas (−1..+1).
export function matchConfidence(save: RoadToProSave): number {
  const streak = save.life.flags.streak ?? 0;
  return clamp((save.life.morale - 55) / 45 + streak * 0.05, -1, 1);
}

// Sorteia `bestOf` mapas distintos do pool (pickedBy alterna; o último é decider).
export function pickMaps(rng: Rng, bestOf: number): { map: MapId; pickedBy: 0 | 1 | -1 }[] {
  const pool = [...MAP_POOL];
  const out: { map: MapId; pickedBy: 0 | 1 | -1 }[] = [];
  for (let i = 0; i < bestOf; i++) {
    const idx = Math.floor(rng() * pool.length);
    const m = pool.splice(idx, 1)[0];
    out.push({ map: m, pickedBy: i === bestOf - 1 ? -1 : (i % 2) as 0 | 1 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução da série + linha do protagonista + consequências

export interface ScoreRow {
  id: string; nick: string; role: Role; isHero: boolean;
  kills: number; deaths: number; adr: number; rating: number;
}

export interface ProMatchResult {
  oppName: string; oppTag: string; oppColors: [string, string];
  won: boolean;
  mapScore: [number, number];
  maps: { map: MapId; score: [number, number]; won: boolean }[];
  heroRating: number;
  mvp: boolean;
  userRows: ScoreRow[];
  oppRows: ScoreRow[];
  momentScore: number;
  execAvg: number | null;         // v15 — média das execuções nos minigames (null = nenhum jogado)
  // stats brutos do herói na série (progressão RPG: traits/marcos)
  heroStats: { openings: number; clutches: number; hs: number; multiKills: number; kills: number; deaths: number };
  // Pro Scoreboard da Carreira (display de stats idêntico):
  series: SeriesResult;
  userTeam: TTeam;
  oppTeam: TTeam;
}

export interface MatchConsequence {
  won: boolean; rating: number; mvp: boolean;
  prize: number; formBefore: number; formAfter: number;
  deltas: { label: string; value: string }[];
  // Progressão RPG (RTP v8): XP/nível ganho e traits recém-conquistados na partida.
  xpGained: number; leveledUp: number; newLevel: number; newTraits: string[];
  headline?: string;              // RTP v14 — manchete que a partida gerou (debrief)
}

// Constrói o TTeam do usuário com o herói EFETIVO (atributos modulados + boost
// dos momentos no OVR/skill) e os colegas.
// teamId default 'rtp-user' (liga); o Major passa 'user' (contrato do swiss.ts).
export function buildUserTeam(save: RoadToProSave, effAttrs: Record<AttrKey, number>, momentBoostOvr: number, teamId = 'rtp-user'): TTeam {
  // O motor distribui frags por `aim` e mortes por `consistency`. O `aim`/`consistency`
  // derivados dos 28 (avg×5) ficam ~10 abaixo do que o OVR do herói implica, então
  // ele fragava de menos e MORRIA de mais (parecia "chutável"). Alinhamos os dois
  // pro nível do OVR e deixamos o desempenho nos MOMENTOS (momentBoostOvr, ±9) mover
  // de verdade: carregar vira frags no placar; entregar, um jogo ruim — mas NUNCA
  // catastrófico (um profissional não some numa partida ruim). Piso protege o floor.
  const HERO_AIM_ALIGN = 13;
  const HERO_CONS_ALIGN = 14;
  const heroBase = proToTPlayer({ ...save.player, attrs: effAttrs }, 'rtp-hero');

  // Colegas ganham ids ÚNICOS ('rtp-mate-*'). CRÍTICO: os times de academia do
  // dataset compartilham o prefixo 'acaopp-p*', então sem re-id os seus colegas de
  // academia colidiriam com os jogadores do adversário de academia → o motor
  // somaria as stats no MESMO slot (rounds/kills/mortes dobrados, herói parecendo
  // fraco no placar). sourcePlayerId (chem) é preservado.
  // SEGURANÇA: sempre 4 colegas (elenco de 5) — alguns times reais têm roster
  // incompleto no dataset; sem isso o motor de partida lê player.id de undefined.
  const src = save.team.teammates;
  const mates = Array.from({ length: 4 }, (_, i) => {
    const t = src.length ? src[i % src.length] : heroBase;
    return { ...t, id: `rtp-mate-${i}` };
  });

  // O motor distribui frags por `aim` (peso ~aim^2.6) e mortes por `consistency`.
  // Alinhamos aim/consistency ao OVR do herói e deixamos o desempenho nos MOMENTOS
  // (momentBoostOvr, ±) MOVER de verdade — carregar vira frags; entregar, jogo ruim.
  // MAS: a PENALIDADE é AMORTECIDA (metade do peso) e o herói tem PISO RELATIVO aos
  // colegas: mesmo num jogo horrível ele NUNCA fica muito abaixo do elenco (um pro
  // não faz 3-15 sob hipótese nenhuma; o pior dele é um jogo fraco, ~0.6 KPR).
  const boostAim = momentBoostOvr >= 0 ? momentBoostOvr : momentBoostOvr * 0.4;
  const matesAvgAim = mates.reduce((a, p) => a + p.aim, 0) / mates.length;
  const matesAvgCons = mates.reduce((a, p) => a + p.consistency, 0) / mates.length;
  const hero: TPlayer = {
    ...heroBase,
    ovr: clamp(heroBase.ovr + momentBoostOvr, 40, 99),
    skill: heroBase.skill + momentBoostOvr * 0.8,
    // PISO RELATIVO ao elenco (o motor pesa frags por aim^2.6 e mortes por
    // consistency). Mira: no MÁXIMO ~4 abaixo da média dos colegas → kill-share
    // nunca colapsa. Consistência (mortes): no MÁXIMO ~2 abaixo → o herói NUNCA
    // morre muito mais que o time. Juntos garantem: pior jogo = fraco (~0.6 KPR),
    // jamais catastrófico (nada de 3-15; um pro não some numa partida).
    aim: clamp(heroBase.aim + HERO_AIM_ALIGN + boostAim * 1.1, Math.min(90, matesAvgAim - 4), 96),
    consistency: clamp(heroBase.consistency + HERO_CONS_ALIGN + boostAim * 0.7, Math.min(90, matesAvgCons - 2), 96),
  };
  const players = [hero, ...mates];
  const chemVals = Object.values(save.team.chem);
  const chemAvg = chemVals.length ? chemVals.reduce((a, b) => a + b, 0) / chemVals.length : 30;
  // Força do time COM O HERÓI COMO PESO (protagonista carrega): a média simples
  // fazia seu crescimento (1 de 5) quase não mexer no resultado — virar craque não
  // ganhava jogo. Pesando o herói ~metade, sua evolução (e o boost dos momentos)
  // move o placar de verdade, e um astro carrega colegas fracos (realista).
  const matesAvg = mates.length ? mates.reduce((a, p) => a + p.ovr, 0) / mates.length : hero.ovr;
  // Garra de casa: um empurrãozinho (maior na academia caótica, onde o rookie
  // briga pra cima) pra não ser punição jogar por baixo. Cresce com a química.
  const gritBump = (save.team.tier === 'academy' ? 3 : 1) + Math.round((matesAvg && Object.values(save.team.chem).length ? (Object.values(save.team.chem).reduce((a, b) => a + b, 0) / Object.values(save.team.chem).length - 30) / 30 : 0));
  const teamStrength = Math.round(hero.ovr * 0.5 + matesAvg * 0.5) + gritBump;
  return {
    id: teamId, name: save.team.teamName, tag: save.team.tag, country: save.player.country,
    isUser: true, game: 'CS2', colors: save.team.colors, logoUrl: save.team.logo,
    strength: teamStrength,
    teamwork: clamp(Math.round(45 + chemAvg * 0.4), 40, 90),
    // conforto de mapa do herói (RTP v9): vetar pros seus mapas fortes rende no sim.
    mapPrefs: heroMapComfort(save), coach: NEUTRAL_COACH,
    players, wins: 0, losses: 0, roundDiff: 0, status: 'alive',
  };
}

// Helpers reaproveitados por circuit.ts e major.ts.
export { neutralMapPrefs, NEUTRAL_COACH, effectiveAttrs as majorEffectiveAttrs };

// PISO DO HERÓI (relativo ao TIME): o protagonista NUNCA é o ponto fora da curva.
// Kills ≥ ~75% da média dos colegas (e ≥ ~0.42 KPR); mortes ≤ ~1.15× a média.
// Assim um jogo ruim reflete o time inteiro afundando (todo mundo baixo) — jamais
// um "3-15" isolado. Só FLOOR: jogo bom passa intacto. dmg/kast/mk escalam junto.
function applyHeroFloor(hero: PlayerLine, matesAvgK: number, matesAvgD: number): PlayerLine {
  const R = Math.max(1, hero.rounds);
  const minK = Math.min(R * 4, Math.round(Math.max(0.42 * R, 0.75 * matesAvgK)));
  const maxD = Math.round(Math.min(R, Math.max(0.55 * R, 1.15 * matesAvgD)));
  if (hero.kills >= minK && hero.deaths <= maxD) return hero;
  const kills = Math.max(hero.kills, minK);
  const deaths = Math.min(hero.deaths, maxD);
  const kScale = hero.kills > 0 ? kills / hero.kills : kills;   // dano acompanha os frags
  const dmg = Math.max(hero.dmg, hero.kills > 0 ? Math.round(hero.dmg * kScale) : Math.round(kills * 82));
  const kastRounds = Math.min(R, Math.max(hero.kastRounds, Math.round(0.64 * R)));
  const mkRounds = Math.max(hero.mkRounds, Math.floor((kills - hero.kills) / 3));
  return { ...hero, kills, deaths, dmg, kastRounds, mkRounds };
}

function rowsFrom(team: TTeam, result: ReturnType<typeof simulateSeries>, heroId: string, heroOverride?: PlayerLine): ScoreRow[] {
  return team.players.map((p) => {
    const isHero = p.id === heroId;
    const lines = result.maps.map((m) => m.stats[p.id]?.both).filter(Boolean) as PlayerLine[];
    const merged = isHero && heroOverride ? heroOverride : mergeLines(lines.length ? lines : [emptyLine()]);
    const d = computeDisplay(merged);
    return {
      id: p.id, nick: p.nick, role: p.role, isHero,
      kills: d.kills, deaths: d.deaths, adr: Math.round(d.adr), rating: Math.round(d.rating * 100) / 100,
    };
  });
}

function emptyLine(): PlayerLine {
  return { kills: 0, deaths: 0, assists: 0, dmg: 0, kastRounds: 0, rounds: 1, openKills: 0, clutchWins: 0, hsKills: 0, mkRounds: 0, tradedDeaths: 0 };
}

// Monta o ProMatchResult a partir de uma série JÁ orientada ao usuário (índice 0
// = você). Compartilhado por finishCircuitMatch (liga) e finishMajorMatch (Major).
export function assembleProResult(userTeam: TTeam, oppTeam: TTeam, result: SeriesResult, momentScore: number, execAvg: number | null = null): ProMatchResult {
  const won = result.winner === 0;
  const heroLinesRaw = result.maps.map((m) => m.stats['rtp-hero']?.both).filter(Boolean) as PlayerLine[];
  const heroRaw = mergeLines(heroLinesRaw.length ? heroLinesRaw : [emptyLine()]);
  // Média dos COLEGAS (mesmo time, sem o herói) pra ancorar o piso relativo.
  const mateLines = userTeam.players.filter((p) => p.id !== 'rtp-hero')
    .map((p) => mergeLines(result.maps.map((m) => m.stats[p.id]?.both).filter(Boolean) as PlayerLine[]));
  const matesAvgK = mateLines.length ? mateLines.reduce((a, l) => a + l.kills, 0) / mateLines.length : heroRaw.kills;
  const matesAvgD = mateLines.length ? mateLines.reduce((a, l) => a + l.deaths, 0) / mateLines.length : heroRaw.deaths;
  const heroLine = applyHeroFloor(heroRaw, matesAvgK, matesAvgD);
  const heroDisplay = computeDisplay(heroLine);
  const userRows = rowsFrom(userTeam, result, 'rtp-hero', heroLine);
  const oppRows = rowsFrom(oppTeam, result, 'rtp-hero');
  const topRating = Math.max(...userRows.map((r) => r.rating), ...oppRows.map((r) => r.rating));
  const heroRating = Math.round(heroDisplay.rating * 100) / 100;
  const mvp = won && heroRating >= topRating;
  const heroStats = {
    openings: heroLine.openKills, clutches: heroLine.clutchWins, hs: heroLine.hsKills,
    multiKills: heroLine.mkRounds, kills: heroLine.kills, deaths: heroLine.deaths,
  };
  return {
    oppName: oppTeam.name, oppTag: oppTeam.tag, oppColors: oppTeam.colors,
    won, mapScore: result.mapScore,
    maps: result.maps.map((m) => ({ map: m.map, score: m.score, won: m.winner === 0 })),
    heroRating, mvp, userRows, oppRows, momentScore, execAvg, heroStats,
    series: result, userTeam, oppTeam,
  };
}

// Execução nos minigames → OVR efetivo na simulação (v15). Neutro em 0.55 (o
// "instinto"); perfeito ≈ +4.5, desastroso ≈ −1.5. Soma ao momentBoost (±9) —
// DECISÕES pesam mais, mas a MÃO aparece no rating de forma explícita.
export function execBoostOvr(execAvg: number | null): number {
  return execAvg == null ? 0 : (execAvg - 0.55) * 10;
}

// Re-semeia o simulateSeries até o placar de MAPAS bater o resultado da jogada
// (mesmo vencedor + 2-0/2-1). Assim o oficial (scoreboard/rating/histórico) é o
// que a SUA jogada produziu, e o card nunca contradiz o que você viu. Fallback:
// se o placar exato não sair em N tentativas, casa ao menos o VENCEDOR.
export function simulateSeriesForPlay(
  baseSeed: number, a: TTeam, b: TTeam, maps: { map: MapId; pickedBy: 0 | 1 | -1 }[],
  bestOf: 1 | 3 | 5, target: { mapWins: [number, number]; seriesWon: boolean },
): SeriesResult {
  let winnerMatch: SeriesResult | null = null;
  for (let k = 0; k <= 160; k++) {
    const s = simulateSeries(makeRng((baseSeed ^ (k * 0x9e3779b1)) >>> 0), a, b, maps, bestOf);
    if (s.mapScore[0] === target.mapWins[0] && s.mapScore[1] === target.mapWins[1]) return s;
    if (!winnerMatch && (s.winner === 0) === target.seriesWon) winnerMatch = s;
  }
  return winnerMatch ?? simulateSeries(makeRng(baseSeed >>> 0), a, b, maps, bestOf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Consequências (form, fama, $, moral, energia, histórico). NÃO vira a semana —
// o caller compõe com advanceWeek.

// Premiação por vitória, alinhada à união real de Tier (academy/access/
// challenger/elite). O bug antigo usava 'tier1' (inexistente) e ignorava 'access'.
// Premiação por série (vitória; derrota paga 1/3 de ajuda de custo). Academia é
// amadora: prêmio simbólico (antes R$4k/vitória + R$1,3k/derrota deixava um rookie
// falido milionário numa temporada — irrealista).
//
// RTP v15 (iter15) — REESCALADO ao salário. O prêmio antigo escalava MUITO mais
// íngreme que o salário (TIER_WAGE 1000/3000/9000/26000): a razão prêmio/salário
// disparava 1.2x → 3.0x → 5.0x → 4.6x, então uma ÚNICA vitória de elite (120k)
// pagava ~4.6 semanas de salário e ~1/4 de um setup elite completo (~500k). Isso
// afogava o sink de custo de vida (iter14) e trivializava o loop de investimento
// em gear/psicólogo — o dinheiro deixava de importar já no meio da carreira.
// Agora o prêmio dos tiers PRO fica ~2x o salário semanal (constante), suplemento
// forte da renda sem virar mangueira de dinheiro; academia segue simbólica (1.2x).
const TIER_PRIZE: Record<Tier, number> = {
  elite: 55_000, challenger: 20_000, access: 6_000, academy: 1_200,
};
function tierPrize(tier: Tier): number { return TIER_PRIZE[tier] ?? 4_000; }

// FUNÇÃO NO ELENCO dinâmica (RTP v12): seu status sobe/desce com a fase. Estrela
// leva a maior fatia; banco, uma migalha. Fase quente sustentada te promove; fase
// ruim sustentada te rebaixa — até o BANCO (crise). É o "jogou mal, foi kickado".
const ROLE_ORDER: SquadRole[] = ['bench', 'rotation', 'starter', 'star'];
const ROLE_PRIZE_MULT: Record<SquadRole, number> = { star: 1.35, starter: 1.0, rotation: 0.7, bench: 0.35 };
export const ROLE_LABEL: Record<SquadRole, string> = { star: 'Estrela', starter: 'Titular', rotation: 'Rotação', bench: 'Banco' };
// Muda no MÁXIMO um degrau por partida, e só em tendência CLARA (streak ±3): promove
// com fase quente, rebaixa com fase fria.
// Limiares calibrados à ESCALA REAL da forma (que satura ~0.88..1.05, não 0.85..1.15).
// O COACH pesa: quem tem a confiança dele (rel.coach alto) tem a vaga protegida
// (custa mais cair); quem perdeu a confiança vai pro banco mais fácil.
function adjustSquadRole(role: SquadRole, form: number, streak: number, coachFaith: number): SquadRole {
  const i = ROLE_ORDER.indexOf(role);
  const demoteStreak = coachFaith >= 65 ? -4 : coachFaith <= 35 ? -2 : -3;
  if (form >= 1.015 && streak >= 3 && i < 3) return ROLE_ORDER[i + 1];
  if (form <= 0.92 && streak <= demoteStreak && i > 0) return ROLE_ORDER[i - 1];
  return role;
}

// `leaguePrize` controla a premiação por-série da LIGA. No Major ela é FALSE: a
// premiação vem só da resolução do torneio (concludeMajorRound), senão dobraria.
export function applyMatchOutcome(save: RoadToProSave, mr: ProMatchResult, opts: { leaguePrize?: boolean } = {}): { save: RoadToProSave; consequence: MatchConsequence } {
  const leaguePrize = opts.leaguePrize !== false;
  const rating = mr.heroRating;
  const won = mr.won;
  const life = save.life;

  const formBefore = save.player.form;
  const formTarget = clamp(0.85 + clamp((rating - 0.5) / 1.5, 0, 1) * 0.3, 0.85, 1.15);
  const formAfter = clamp(Math.round((formBefore + (formTarget - formBefore) * 0.5) * 100) / 100, 0.85, 1.15);

  // Prêmio escala pela FUNÇÃO no elenco (estrela leva mais; banco, migalha).
  const roleMult = ROLE_PRIZE_MULT[save.team.squadRole] ?? 1;
  const prize = !leaguePrize ? 0 : Math.round((won ? tierPrize(save.team.tier) : tierPrize(save.team.tier) / 3) * roleMult);
  // Psicólogo (setup) + perks/traits amortecem o tombo de moral pós-derrota.
  const passives = aggregatePassives(save);
  const { tiltResist: setupTilt } = setupConditionMods(save.setup);
  const tiltResist = clamp(setupTilt + passives.tiltResist, 0, 0.85);
  const rawMorale = (won ? 6 : -6) + (rating > 1.3 ? 3 : rating < 0.8 ? -3 : 0);
  const moraleDelta = rawMorale < 0 ? Math.round(rawMorale * (1 - tiltResist)) : rawMorale;
  // Fama: perks/traits (ex.: Ídolo, Estrela) rendem mais visibilidade por partida.
  // No Major (leaguePrize:false) a fama vem da RESOLUÇÃO do torneio (placement),
  // igual ao prêmio — senão a fama por-série dobraria com a fama de colocação.
  const fameBase = (won ? 1 : 0) + (rating > 1.4 ? 2 : rating > 1.15 ? 1 : 0);
  const fameDelta = leaguePrize ? Math.round(fameBase * passives.fameMult) : 0;
  // Rivalidade (RTP v9): bater/perder pro rival mexe mais com a cabeça e a fama.
  const stake = rivalStakeDelta(save, mr.oppTeam.id, won);
  const teamDelta = (won ? 3 : -1) + (rating > 1.2 ? 1 : 0);
  const streakPrev = life.flags.streak ?? 0;
  const streak = won ? Math.max(1, streakPrev + 1) : Math.min(-1, streakPrev - 1);
  // Função no elenco reage à fase (promove/rebaixa até o banco) — o coach pesa.
  const newRole = adjustSquadRole(save.team.squadRole, formAfter, streak, save.life.rel.coach);

  const nextLife = {
    ...life,
    energy: clamp(life.energy - 28, 0, 100),
    morale: clamp(life.morale + moraleDelta + stake.morale, 0, 100),
    fame: clamp(life.fame + fameDelta + stake.fame, 0, 100),
    money: life.money + prize,
    rel: { ...life.rel, team: clamp(life.rel.team + teamDelta, 0, 100) },
    flags: { ...life.flags, streak },
  };

  const h = save.history;
  const heroRow = mr.userRows.find((r) => r.isHero);
  const history = {
    ...h,
    matchesPlayed: h.matchesPlayed + 1,
    mapsPlayed: h.mapsPlayed + mr.maps.length,
    kills: h.kills + (heroRow?.kills ?? 0),
    deaths: h.deaths + (heroRow?.deaths ?? 0),
    ratingSum: h.ratingSum + rating,
    mvps: h.mvps + (mr.mvp ? 1 : 0),
    trophies: h.trophies,
    awards: h.awards,
    accolades: h.accolades ?? [],
    timeline: h.timeline ?? [],
    records: recordsAfterSeries(h.records ?? defaultRecords(), won),  // RTP v15 — placar da temporada (invicta)
    peakOvr: Math.max(h.peakOvr, save.player.ovr),
  };

  // Progressão RPG: XP/nível + traits emergentes (perks são gastos pelo jogador).
  const prog0 = save.player.progression ?? { level: 1, xp: 0, perkPoints: 0, perks: [], traits: [], tally: { wins: 0, openings: 0, clutches: 0, hs: 0, multiKills: 0, bigWins: 0, peakStreak: 0 } };
  const progCtx: MatchProgressCtx = {
    won, rating, mvp: mr.mvp, streak, oppStrength: mr.oppTeam.strength, ovr: save.player.ovr,
    trophies: h.trophies.length, fame: nextLife.fame, heroStats: mr.heroStats,
  };
  const pr = applyMatchProgression(prog0, progCtx);
  // t_vet depende de partidas jogadas (histórico completo) — detecta aqui.
  const histTraits = detectHistoryTraits(pr.progression, history.matchesPlayed, h.trophies.length, nextLife.fame, history.peakOvr);
  const newTraits = [...pr.newTraits, ...histTraits];
  const progression = { ...pr.progression, traits: [...pr.progression.traits, ...histTraits] };

  // Mídia & rival (RTP v9): UM único lugar que atualiza W/L do rival + manchetes.
  const mediaCtx: MediaMatchCtx = {
    won, rating, mvp: mr.mvp, streak, oppTeam: mr.oppTeam, heroNick: save.player.nick,
    ovr: save.player.ovr, season: save.world.season, week: save.world.week,
  };
  const media = updateMediaAfterMatch({ ...save, life: nextLife }, mediaCtx);
  const followersBefore = save.media?.followers ?? 0;
  const followersDelta = media.followers - followersBefore;

  // Química com os colegas (RTP v10): vence junto e joga bem → entrosamento sobe;
  // derrota/jogo ruim esfria. Alimenta o teamwork do time no sim (buildUserTeam).
  const chemDelta = (won ? 3 : -1) + (rating > 1.15 ? 1 : rating < 0.8 ? -1 : 0);
  const chem = Object.fromEntries(Object.entries(save.team.chem).map(([k, v]) => [k, clamp(v + chemDelta, 0, 100)]));
  const chemAvgBefore = Object.values(save.team.chem).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(save.team.chem).length);
  const chemAvgAfter = Object.values(chem).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(chem).length);

  const deltas = [
    { label: 'Forma', value: `${formBefore.toFixed(2)} → ${formAfter.toFixed(2)}` },
    { label: 'Moral', value: fmt(moraleDelta + stake.morale) },
    { label: 'Fama', value: fmt(fameDelta + stake.fame) },
    { label: 'Entrosamento', value: fmt(teamDelta) },
    { label: 'Química', value: `${fmt(Math.round(chemAvgAfter - chemAvgBefore))} (${Math.round(chemAvgAfter)})` },
    { label: 'Energia', value: '−28' },
    { label: 'XP', value: `+${pr.xpGained}` },
    { label: 'Seguidores', value: `+${followersDelta.toLocaleString('pt-BR')}` },
  ];
  if (pr.leveledUp > 0) deltas.push({ label: 'Nível', value: `↑ ${pr.newLevel}` });
  if (newRole !== save.team.squadRole) {
    const up = ROLE_ORDER.indexOf(newRole) > ROLE_ORDER.indexOf(save.team.squadRole);
    deltas.push({ label: 'Função', value: `${up ? '↑' : '↓'} ${ROLE_LABEL[newRole]}` });
  }
  for (const id of newTraits) deltas.push({ label: 'Novo trait', value: traitById(id)?.label ?? id });
  if (leaguePrize) deltas.push({ label: won ? 'Premiação' : 'Ajuda de custo', value: `+R$ ${prize.toLocaleString('pt-BR')}` });

  // A manchete que ESTA partida gerou (se gerou): id novo no topo da pilha.
  const freshHeadline = media.headlines[0] && media.headlines[0].id !== save.media?.headlines?.[0]?.id
    ? media.headlines[0].text : undefined;

  return {
    consequence: { won, rating, mvp: mr.mvp, prize, formBefore, formAfter, deltas, xpGained: pr.xpGained, leveledUp: pr.leveledUp, newLevel: pr.newLevel, newTraits, headline: freshHeadline },
    save: {
      ...save,
      player: { ...save.player, form: formAfter, progression },
      life: nextLife,
      media,
      team: { ...save.team, chem, squadRole: newRole },
      history,
      // RTP v13 — acumula o rating do herói por série pra decidir MVP/EVP do
      // campeonato (concludeCircuitRound/applyResolution consomem e zeram).
      world: { ...save.world, eventRatingSum: (save.world.eventRatingSum ?? 0) + rating, eventSeries: (save.world.eventSeries ?? 0) + 1 },
      rng: { seed: save.rng.seed, tick: save.rng.tick + 1 },
    },
  };
}

function fmt(v: number): string { return v > 0 ? `+${v}` : `${v}`; }

// A liga (circuito GSL+playoff) e o Major vivem em circuit.ts e major.ts e
// reaproveitam os helpers exportados acima (buildUserTeam, assembleProResult,
// pickMaps, conditionModifiers, applyMatchOutcome, neutralMapPrefs…).
