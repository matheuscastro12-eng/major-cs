import type { KillEvent, MapId, MapResult, Playstyle, PlayerLine, PlayerMapStats, SeriesResult, TPlayer, TTeam } from '../types';
import { derivePlaystyle } from '../types';
import type { Rng } from './rng';
import { weightedIndex } from './rng';

const playstyleOf = (p: TPlayer): Playstyle => p.playstyle ?? derivePlaystyle(p.role);

// ---------------- camada tática: estilo de jogo x postura ----------------
// A postura escolhida ao vivo VALORIZA os jogadores cujo estilo combina e
// penaliza quem não combina. Agressivo rende no T com jogadores agressivos;
// cauteloso rende no CT com jogadores passivos. "default" é o meio-termo seguro.

// quanto a postura soma/subtrai na força efetiva do time, considerando o lado
// e quantos jogadores combinam com a tática
function stanceFitDelta(team: TTeam, side: 'ct' | 't', mode: Stance): number {
  if (mode === 'default') return 0;
  let d = mode === 'aggressive' ? (side === 't' ? 1.4 : -1.2) : side === 'ct' ? 1.4 : -1.0;
  const favored: Playstyle = mode === 'aggressive' ? 'aggressive' : 'passive';
  const against: Playstyle = mode === 'aggressive' ? 'passive' : 'aggressive';
  for (const p of team.players) {
    const ps = playstyleOf(p);
    if (ps === favored) d += 0.55;
    else if (ps === against) d -= 0.45;
  }
  // postura alinhada ao estilo do IGL rende mais (o time já treina assim)
  if (iglStyleOf(team).style === favored) d += 0.8;
  return d;
}

// multiplicador no peso de FRAGS do jogador conforme estilo, lado e postura
function killStyleMult(p: TPlayer, side: 'ct' | 't', mode: Stance | undefined): number {
  const ps = playstyleOf(p);
  let m = 1;
  if (ps === 'aggressive') m *= side === 't' ? 1.15 : 0.95;
  if (ps === 'passive') m *= side === 'ct' ? 1.08 : 0.96;
  if (mode === 'aggressive' && ps === 'aggressive') m *= 1.12;
  if (mode === 'cautious' && ps === 'passive') m *= 1.1;
  return m;
}

// agressivos morrem um pouco mais (correm risco); passivos morrem menos
function deathStyleMult(p: TPlayer): number {
  const ps = playstyleOf(p);
  if (ps === 'aggressive') return 1.12;
  if (ps === 'passive') return 0.9;
  return 1;
}

// estilo do IGL (jogador de maior igl) dá ao time uma tendência natural de lado:
// IGL agressivo puxa o T, IGL passivo segura o CT. Quanto melhor o IGL, mais forte.
function iglStyleOf(team: TTeam): { style: Playstyle; rating: number } {
  let igl = team.players[0];
  for (const p of team.players) if (p.igl > igl.igl) igl = p;
  return { style: playstyleOf(igl), rating: igl.igl };
}
function iglLean(team: TTeam, side: 'ct' | 't'): number {
  const { style, rating } = iglStyleOf(team);
  const pow = Math.max(0, (rating - 78) / 22); // 0..~1
  if (style === 'aggressive') return side === 't' ? 0.5 + pow * 0.9 : -0.3;
  if (style === 'passive') return side === 'ct' ? 0.5 + pow * 0.9 : -0.3;
  return 0;
}

function emptyLine(): PlayerLine {
  return { kills: 0, deaths: 0, assists: 0, dmg: 0, kastRounds: 0, rounds: 0, openKills: 0, clutchWins: 0 };
}

function emptyStats(): PlayerMapStats {
  return { both: emptyLine(), t: emptyLine(), ct: emptyLine() };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const KILL_ROLE_MULT: Record<string, number> = {
  Entry: 1.12,
  AWP: 1.08,
  Rifler: 1.0,
  Lurker: 0.98,
  Support: 0.85,
  IGL: 0.78,
};

const DEATH_ROLE_MULT: Record<string, number> = {
  Entry: 1.25,
  AWP: 0.92,
  Rifler: 1.0,
  Lurker: 0.9,
  Support: 1.05,
  IGL: 1.02,
};

interface RoundTally {
  kills: number[];
  killers: number[];
  assists: number[];
  died: boolean[];
  open: number;
  clutch: number;
}

interface CompFlags {
  hasAwp: boolean;
  hasIgl: boolean;
}

function newRoundTally(): RoundTally {
  return {
    kills: [0, 0, 0, 0, 0],
    killers: [],
    assists: [0, 0, 0, 0, 0],
    died: [false, false, false, false, false],
    open: -1,
    clutch: -1,
  };
}

function compFlags(team: TTeam): CompFlags {
  return {
    hasAwp: team.players.some((p) => p.awp >= 80),
    hasIgl: team.players.some((p) => p.igl >= 80),
  };
}

// fase dos jogadores afeta a força do time na série (±~2 pontos no extremo)
function formBoost(team: TTeam): number {
  const avg = team.players.reduce((s, p) => s + (p.form ?? 1), 0) / team.players.length;
  return (avg - 1) * 20;
}

// ---------------- economia ----------------
// Dinheiro médio por jogador, decidido pelo IGL/coach a cada round:
// full buy (>=4500), force (>=2600) ou eco. Eco joga de MAC-10/pistola
// e sofre penalidade de força - mas o upset existe.

export type BuyTier = 'pistol' | 'eco' | 'force' | 'full';

const BUY_PENALTY: Record<BuyTier, number> = {
  pistol: 0,
  full: 0,
  force: -2.6,
  eco: -7,
};

interface EcoState {
  money: number;
  lossStreak: number;
}

function decideBuy(eco: EcoState, isPistol: boolean, aggressiveCoach: boolean): BuyTier {
  if (isPistol) return 'pistol';
  const forceThreshold = aggressiveCoach ? 2300 : 2600; // coach agressivo força mais
  if (eco.money >= 4500) return 'full';
  if (eco.money >= forceThreshold) return 'force';
  return 'eco';
}

function buyCost(tier: BuyTier): number {
  if (tier === 'full') return 4100;
  if (tier === 'force') return 2300;
  if (tier === 'eco') return 500;
  return 700;
}

function weaponFor(p: TPlayer, rng: Rng, tier: BuyTier, side: 'ct' | 't'): string {
  if (tier === 'pistol') {
    if (rng() < 0.12) return 'deagle';
    return side === 'ct' ? 'usp' : 'glock';
  }
  if (tier === 'eco') {
    const r = rng();
    if (r < 0.45) return 'mac10';
    if (r < 0.65) return 'deagle';
    if (r < 0.85) return side === 'ct' ? 'usp' : 'glock';
    // rifle salvo do round anterior
  }
  if (tier === 'force') {
    const r = rng();
    if (r < 0.3) return 'mac10';
    if (r < 0.45) return 'deagle';
  }
  if (p.role === 'AWP' && tier === 'full' && rng() < 0.62) return 'awp';
  if (rng() < 0.015) return 'knife';
  if (tier === 'full' && rng() < 0.06) return 'deagle';
  const main = side === 't' ? 'ak47' : 'm4';
  const off = side === 't' ? 'm4' : 'ak47';
  return rng() < 0.88 ? main : off;
}

function effStrength(
  team: TTeam,
  flags: CompFlags,
  map: MapId,
  side: 'ct' | 't',
  tier: BuyTier,
  lostLast: boolean,
  isPistol: boolean,
  secondHalf: boolean,
  pickedOwnMap: boolean,
): number {
  let s = team.strength + (team.mapPrefs[map] ?? 0) * 1.35;
  if (side === 'ct') s += 1.1;
  s += BUY_PENALTY[tier];

  // composição mal montada sofre DENTRO do jogo, não só na força base
  if (!flags.hasIgl) {
    s -= 1.5;
    if (secondHalf) s -= 1.8; // o adversário leu o caos: sem mid-round calls não há ajuste
  }
  if (!flags.hasAwp && side === 'ct' && tier === 'full') s -= 1.8; // CT sem AWP não segura abertura

  // estilo do coach
  const c = team.coach;
  const cPow = Math.max(0, (c.rating - 75) / 12);
  if (c.style === 'tactical' && pickedOwnMap) s += 1.2 + cPow;
  if (c.style === 'tactical' && !flags.hasIgl) s += 1.2;
  if (c.style === 'aggressive' && side === 't') s += 0.9 + cPow * 0.6;
  if (c.style === 'discipline' && lostLast && !isPistol) s += 1.4 + cPow * 0.5;

  // tendência natural do time pelo estilo do IGL
  s += iglLean(team, side);

  return s;
}

// ---------------- simulação incremental ----------------

// postura tática escolhida ao vivo pelo jogador: muda o perfil de risco do round
export type Stance = 'aggressive' | 'default' | 'cautious';

// chamada tática de UM round: rush (all-in no T), retake (segura o CT),
// force buy (compra mesmo sem grana) e save (economiza). Impacta força e economia.
export type RoundCall = 'rush' | 'retake' | 'force' | 'save';
export interface Call {
  team: 0 | 1;
  kind: RoundCall;
}

export interface StepMods {
  boostTeam?: 0 | 1 | null; // timeout tático
  stance?: { team: 0 | 1; mode: Stance };
  call?: Call; // chamada de round (one-shot)
}

export interface MapSim {
  step: (boostTeam?: 0 | 1 | null, stance?: { team: 0 | 1; mode: Stance }, call?: Call) => boolean; // joga 1 round; true quando o mapa terminou
  done: () => boolean;
  score: () => [number, number];
  money: () => [number, number]; // dinheiro de cada time (para decidir force/save)
  roundLog: () => (0 | 1)[];
  killFeed: () => KillEvent[];
  buys: () => [BuyTier, BuyTier]; // compra do round atual (antes do step)
  result: () => MapResult; // disponível quando done()
}

export function createMapSim(rng: Rng, a: TTeam, b: TTeam, map: MapId, pickedBy: 0 | 1 | -1): MapSim {
  const stats: Record<string, PlayerMapStats> = {};
  for (const p of [...a.players, ...b.players]) stats[p.id] = emptyStats();

  let scoreA = 0;
  let scoreB = 0;
  let target = 13;
  let ot = false;
  let lastWinner: 0 | 1 | -1 = -1;
  const roundLog: (0 | 1)[] = [];
  const killFeed: KillEvent[] = [];
  const buyLog: [BuyTier, BuyTier][] = [];
  const aStartsCt = rng() < 0.5;
  let halfScore = '';
  let finished = false;

  const teamPlayers: [TPlayer[], TPlayer[]] = [a.players, b.players];
  const teams: [TTeam, TTeam] = [a, b];
  const flags: [CompFlags, CompFlags] = [compFlags(a), compFlags(b)];
  const eco: [EcoState, EcoState] = [
    { money: 800, lossStreak: 0 },
    { money: 800, lossStreak: 0 },
  ];
  const formA = formBoost(a);
  const formB = formBoost(b);

  let round = 0;
  let nextBuys: [BuyTier, BuyTier] = ['pistol', 'pistol'];

  const computeBuys = (): [BuyTier, BuyTier] => {
    const isPistol = round === 0 || round === 12;
    return [
      decideBuy(eco[0], isPistol, teams[0].coach.style === 'aggressive'),
      decideBuy(eco[1], isPistol, teams[1].coach.style === 'aggressive'),
    ];
  };
  nextBuys = computeBuys();

  const step = (boostTeam?: 0 | 1 | null, stance?: { team: 0 | 1; mode: Stance }, call?: Call): boolean => {
    if (finished) return true;

    let aSide: 'ct' | 't';
    if (round < 12) aSide = aStartsCt ? 'ct' : 't';
    else if (round < 24) aSide = aStartsCt ? 't' : 'ct';
    else {
      const block = Math.floor((round - 24) / 3);
      aSide = block % 2 === 0 ? (aStartsCt ? 'ct' : 't') : aStartsCt ? 't' : 'ct';
    }
    const bSide: 'ct' | 't' = aSide === 'ct' ? 't' : 'ct';
    const isPistol = round === 0 || round === 12;
    const secondHalf = round >= 12;

    // economia: reseta nos pistols
    if (isPistol) {
      eco[0] = { money: 800, lossStreak: 0 };
      eco[1] = { money: 800, lossStreak: 0 };
    }
    const buys = computeBuys();
    // chamada de economia (force/save) sobrescreve a compra do time que chamou.
    // Force exige dinheiro de verdade: sem caixa para um force real, a chamada
    // não inventa armas (senão seria upgrade grátis de eco -7 para force -2.6).
    if (call && !isPistol) {
      if (call.kind === 'force') {
        const m = eco[call.team].money;
        if (m >= 4100) buys[call.team] = 'full';
        else if (m >= buyCost('force')) buys[call.team] = 'force';
      }
      if (call.kind === 'save') buys[call.team] = 'eco';
    }
    buyLog.push(buys);
    eco[0].money = Math.max(0, eco[0].money - buyCost(buys[0]));
    eco[1].money = Math.max(0, eco[1].money - buyCost(buys[1]));

    let effA = effStrength(a, flags[0], map, aSide, buys[0], lastWinner === 1, isPistol, secondHalf, pickedBy === 0) + formA;
    let effB = effStrength(b, flags[1], map, bSide, buys[1], lastWinner === 0, isPistol, secondHalf, pickedBy === 1) + formB;
    if (boostTeam === 0) effA += 3.5; // timeout tático
    if (boostTeam === 1) effB += 3.5;

    // postura tática escolhida ao vivo: valoriza quem combina com a tática.
    // O delta depende do lado E de quantos jogadores têm o estilo certo.
    if (stance && stance.mode !== 'default') {
      const sSide = stance.team === 0 ? aSide : bSide;
      const delta = stanceFitDelta(teams[stance.team], sSide, stance.mode);
      if (stance.team === 0) effA += delta;
      else effB += delta;
    }
    // chamada de round rush/retake: aposta forte de UM round (alto risco/retorno)
    if (call && (call.kind === 'rush' || call.kind === 'retake')) {
      const cSide = call.team === 0 ? aSide : bSide;
      let cd = 0;
      if (call.kind === 'rush') cd = cSide === 't' ? 2.8 : -1.6;
      if (call.kind === 'retake') cd = cSide === 'ct' ? 2.8 : -1.6;
      if (call.team === 0) effA += cd;
      else effB += cd;
    }
    // estilo de frag por jogador conforme o lado, a postura E a chamada do round
    const callMode = (teamIdx: 0 | 1): Stance | undefined => {
      if (!call || call.team !== teamIdx) return undefined;
      if (call.kind === 'rush') return 'aggressive';
      if (call.kind === 'retake') return 'cautious';
      return undefined;
    };
    const stanceModeFor = (teamIdx: 0 | 1): Stance | undefined =>
      callMode(teamIdx) ?? (stance && stance.team === teamIdx ? stance.mode : undefined);
    const sideFor = (teamIdx: 0 | 1): 'ct' | 't' => (teamIdx === 0 ? aSide : bSide);

    const diff = isPistol ? (effA - effB) * 0.45 : effA - effB;
    const pA = sigmoid(diff / 15);
    const winner: 0 | 1 = rng() < pA ? 0 : 1;

    const closeness = 1 - Math.abs(pA - 0.5) * 2;
    const wLoser = [2.1 - 1.2 * closeness, 1.6, 1.15 + 0.55 * closeness, 0.6 + 0.65 * closeness, 0.2 + 0.5 * closeness];
    const loserKills = weightedIndex(rng, wLoser);
    let savers = 0;
    if (loserKills <= 1) {
      const r = rng();
      savers = r < 0.18 ? 2 : r < 0.55 ? 1 : 0;
    } else if (rng() < 0.22) {
      savers = 1;
    }
    const winnerKills = 5 - savers;

    const winIdx = winner;
    const loseIdx: 0 | 1 = winner === 0 ? 1 : 0;
    const tally: [RoundTally, RoundTally] = [newRoundTally(), newRoundTally()];

    const assign = (teamIdx: 0 | 1, nKills: number, firstIsOpen: boolean) => {
      const ps = teamPlayers[teamIdx];
      const sd = sideFor(teamIdx);
      const sm = stanceModeFor(teamIdx);
      const weights = ps.map(
        (p) =>
          Math.pow(p.aim / 70, 2.6) *
          (KILL_ROLE_MULT[p.role] ?? 1) *
          Math.pow(p.form ?? 1, 2.2) *
          killStyleMult(p, sd, sm),
      );
      for (let k = 0; k < nKills; k++) {
        const i = weightedIndex(rng, weights);
        tally[teamIdx].kills[i]++;
        tally[teamIdx].killers.push(i);
        weights[i] *= 0.32;
        if (k === 0 && firstIsOpen) tally[teamIdx].open = i;
        if (rng() < 0.3) {
          let j = Math.floor(rng() * ps.length);
          if (j === i) j = (j + 1) % ps.length;
          tally[teamIdx].assists[j]++;
        }
      }
    };

    const winnerOpens = rng() < 0.62;
    assign(winIdx, winnerKills, winnerOpens);
    assign(loseIdx, loserKills, !winnerOpens && loserKills > 0);

    const pickVictims = (teamIdx: 0 | 1, deaths: number) => {
      const ps = teamPlayers[teamIdx];
      const idxs = [0, 1, 2, 3, 4];
      const weights = ps.map((p) => (DEATH_ROLE_MULT[p.role] ?? 1) * (110 - p.consistency) * deathStyleMult(p));
      const chosen: number[] = [];
      for (let d = 0; d < deaths; d++) {
        const avail = idxs.filter((i) => !chosen.includes(i));
        const aw = avail.map((i) => weights[i]);
        const c = avail[weightedIndex(rng, aw)];
        chosen.push(c);
      }
      for (const c of chosen) tally[teamIdx].died[c] = true;
    };
    pickVictims(loseIdx, winnerKills);
    pickVictims(winIdx, loserKills);

    const eventsFor = (killerTeam: 0 | 1, victimTeam: 0 | 1): KillEvent[] => {
      const killers = tally[killerTeam].killers;
      const victims = tally[victimTeam].died.map((died, i) => (died ? i : -1)).filter((i) => i >= 0);
      const killerSide = killerTeam === 0 ? aSide : bSide;
      const tier = buys[killerTeam];
      return killers.slice(0, victims.length).map((killerIdx, i) => {
        const killer = teamPlayers[killerTeam][killerIdx];
        return {
          round: round + 1,
          killerId: killer.id,
          victimId: teamPlayers[victimTeam][victims[i]].id,
          killerTeam,
          victimTeam,
          weapon: weaponFor(killer, rng, tier, killerSide),
          headshot: rng() < (killer.role === 'AWP' ? 0.18 : 0.43),
          opening: false,
          trade: i > 0 && rng() < 0.28,
        };
      });
    };
    const winEvents = eventsFor(winIdx, loseIdx);
    const loseEvents = eventsFor(loseIdx, winIdx);
    const roundEvents = winnerOpens ? [...winEvents, ...loseEvents] : [...loseEvents, ...winEvents];
    if (roundEvents[0]) roundEvents[0].opening = true;
    killFeed.push(...roundEvents);

    if (loserKills >= 3 && rng() < 0.45) {
      const ps = teamPlayers[winIdx];
      const alive = ps.map((_, i) => i).filter((i) => !tally[winIdx].died[i]);
      if (alive.length > 0 && alive.length <= 2) {
        const cw = alive.map((i) => ps[i].clutch);
        tally[winIdx].clutch = alive[weightedIndex(rng, cw)];
      }
    }

    const sides: ['ct' | 't', 'ct' | 't'] = [aSide, bSide];
    for (const ti of [0, 1] as const) {
      const ps = teamPlayers[ti];
      const side = sides[ti];
      for (let i = 0; i < ps.length; i++) {
        const st = stats[ps[i].id];
        const kills = tally[ti].kills[i];
        const assists = tally[ti].assists[i];
        const died = tally[ti].died[i];
        let dmg = 0;
        for (let k = 0; k < kills; k++) dmg += 70 + rng() * 38;
        dmg += rng() * 24;
        if (assists > 0) dmg += assists * (22 + rng() * 16);
        dmg = Math.min(dmg, 5 * 100 + 60);

        const survived = !died;
        const traded = died && rng() < 0.25;
        const kast = kills > 0 || assists > 0 || survived || traded;

        for (const line of [st.both, side === 'ct' ? st.ct : st.t]) {
          line.rounds++;
          line.kills += kills;
          line.assists += assists;
          line.deaths += died ? 1 : 0;
          line.dmg += dmg;
          if (kast) line.kastRounds++;
          if (tally[ti].open === i) line.openKills++;
          if (tally[ti].clutch === i) line.clutchWins++;
        }
      }
    }

    // pagamento do round
    const loserIdx2: 0 | 1 = winner === 0 ? 1 : 0;
    eco[winner].money = Math.min(16000, eco[winner].money + 3250);
    eco[winner].lossStreak = 0;
    eco[loserIdx2].lossStreak++;
    eco[loserIdx2].money = Math.min(16000, eco[loserIdx2].money + 1400 + Math.min(4, eco[loserIdx2].lossStreak) * 500);

    if (winner === 0) scoreA++;
    else scoreB++;
    roundLog.push(winner);
    lastWinner = winner;
    round++;

    if (round === 12) halfScore = `${scoreA}:${scoreB}`;
    if (scoreA >= target || scoreB >= target) {
      finished = true;
    } else if (scoreA === 12 && scoreB === 12 && target === 13) {
      // empate na regulamentação: vai para prorrogação MR3 (primeiro a +4)
      target = 16;
      ot = true;
    } else if (ot && scoreA === target - 1 && scoreB === target - 1) {
      // empate no fim de um bloco de OT (15-15, 18-18, 21-21…): mais um MR3
      target += 3;
    }
    // trava de segurança bem alta (na prática a OT MR3 sempre decide bem antes)
    if (round > 120) finished = true;

    if (!finished) nextBuys = computeBuys();
    return finished;
  };

  return {
    step,
    done: () => finished,
    score: () => [scoreA, scoreB],
    money: () => [eco[0].money, eco[1].money],
    roundLog: () => roundLog,
    killFeed: () => killFeed,
    buys: () => nextBuys,
    result: (): MapResult => ({
      map,
      pickedBy,
      score: [scoreA, scoreB],
      halves: halfScore ? `1o half ${halfScore}` : '',
      ot,
      winner: scoreA > scoreB ? 0 : 1,
      roundLog,
      killFeed,
      stats,
    }),
  };
}

export function simulateMap(rng: Rng, a: TTeam, b: TTeam, map: MapId, pickedBy: 0 | 1 | -1): MapResult {
  const sim = createMapSim(rng, a, b, map, pickedBy);
  while (!sim.step()) {
    /* roda até o fim */
  }
  return sim.result();
}

export function simulateSeries(
  rng: Rng,
  a: TTeam,
  b: TTeam,
  maps: { map: MapId; pickedBy: 0 | 1 | -1 }[],
  bestOf: 1 | 3 | 5 = 3,
): SeriesResult {
  const need = Math.ceil(bestOf / 2); // BO1 -> 1, BO3 -> 2, BO5 -> 3
  const results: MapResult[] = [];
  let winsA = 0;
  let winsB = 0;
  for (const m of maps) {
    if (winsA === need || winsB === need) break;
    const r = simulateMap(rng, a, b, m.map, m.pickedBy);
    results.push(r);
    if (r.winner === 0) winsA++;
    else winsB++;
  }
  return {
    teamIds: [a.id, b.id],
    maps: results,
    winner: winsA > winsB ? 0 : 1,
    mapScore: [winsA, winsB],
  };
}

export interface DisplayLine {
  kills: number;
  deaths: number;
  adr: number;
  kast: number;
  swing: number;
  rating: number;
}

export function computeDisplay(line: PlayerLine): DisplayLine {
  const r = Math.max(1, line.rounds);
  const kpr = line.kills / r;
  const dpr = line.deaths / r;
  const apr = line.assists / r;
  const adr = line.dmg / r;
  const kastPct = (line.kastRounds / r) * 100;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  const rating2 = 0.0073 * kastPct + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587;
  const rating = Math.max(0, (rating2 - 1) * 1.18 + 1);
  const swing = ((line.kills - line.deaths) / r) * 22 + (line.kastRounds / r - 0.7) * 9 + (line.openKills / r) * 6 + (line.clutchWins / r) * 8;
  return {
    kills: line.kills,
    deaths: line.deaths,
    adr,
    kast: kastPct,
    swing,
    rating,
  };
}

export function mergeLines(lines: PlayerLine[]): PlayerLine {
  const out = emptyLine();
  for (const l of lines) {
    out.kills += l.kills;
    out.deaths += l.deaths;
    out.assists += l.assists;
    out.dmg += l.dmg;
    out.kastRounds += l.kastRounds;
    out.rounds += l.rounds;
    out.openKills += l.openKills;
    out.clutchWins += l.clutchWins;
  }
  return out;
}
