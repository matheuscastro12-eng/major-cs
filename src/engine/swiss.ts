import type { Pairing, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { mergeLines, computeDisplay } from './match';
import { simulateSeries } from './match';
import { teamSeasonToTTeam } from './ratings';
import type { Rng } from './rng';
import { shuffle } from './rng';
import { autoVeto } from './veto';
import { ct } from '../state/career-i18n';
import { bestOfForRecord, getTeam, pairingBestOf, phaseLabel } from './swissView';

// funções de leitura em swissView.ts (fora da carga inicial do motor); quem já
// importava daqui continua importando
export { getTeam, placementCode, pairingBestOf, userMapRecord, phaseLabel, phaseLabelDisplay, userPairing, userTeam, standings, type PlacementCode } from './swissView';

export function createTournament(
  dataset: TeamSeason[],
  user: TTeam,
  rng: Rng,
  name = `🏆 ${ct('Major Mundial')}`,
  oppBoost = 0,
): Tournament {
  const pool = shuffle(rng, dataset).slice(0, 15).map((ts) => {
    const tt = teamSeasonToTTeam(ts);
    tt.strength += oppBoost; // dificuldade: adversários mais fortes
    return tt;
  });
  const teams = [user, ...pool];
  const t: Tournament = {
    name,
    teams,
    phase: 'swiss',
    swissRound: 1,
    pairings: [],
    history: [],
  };
  t.pairings = makeSwissPairings(t, rng);
  return t;
}

// Cria um Major a partir de um conjunto exato de times (sem sortear). Usado no
// modo online: os times draftados pelos jogadores + times da IA preenchendo até
// 16 disputam o mesmo torneio (Suíça + playoffs), tudo determinístico pelo seed.
export function createTournamentFromTeams(teams: TTeam[], rng: Rng, name = 'MAJOR ONLINE'): Tournament {
  const fresh = teams.map((t) => ({ ...t, wins: 0, losses: 0, roundDiff: 0, status: 'alive' as const }));
  const t: Tournament = {
    name,
    teams: fresh,
    phase: 'swiss',
    swissRound: 1,
    pairings: [],
    history: [],
  };
  t.pairings = makeSwissPairings(t, rng);
  return t;
}

// ----- MAJOR EM STAGES (formato real 2025+): 3 Swiss encadeados + playoffs -----
// Stage = um Swiss de 16 que PARA quando os 8 classificados são definidos
// (phase 'done'), sem ir pros playoffs. O stage seguinte recebe esses 8 + 8 seeds.
export function createSwissStage(teams: TTeam[], rng: Rng, name: string): Tournament {
  const t = createTournamentFromTeams(teams, rng, name);
  t.stageOnly = true;
  return t;
}
// os 8 classificados de um stage (seed por menos derrotas / saldo / força)
export function stageAdvancers(t: Tournament): TTeam[] {
  const adv = seedAdvanced(t);
  if (adv.length >= 8) return adv.slice(0, 8);
  // DEFENSIVO: se por algum motivo menos de 8 fecharam 3 vitórias (ex.: um time
  // ficou sem par num grupo ímpar e congelou 'alive'), completa com os melhores
  // restantes por record. Sem isso, createPlayoffStage pega seeds[7] = undefined
  // e a tela do Major TRAVA (clicar não avança).
  const taken = new Set(adv.map((x) => x.id));
  const rest = t.teams
    .filter((x) => !taken.has(x.id))
    .sort((a, b) => a.losses - b.losses || b.roundDiff - a.roundDiff || b.strength - a.strength);
  return [...adv, ...rest].slice(0, 8);
}
// Champions Stage: mata-mata MD3 (final MD5) direto a partir de 8 seeds.
export function createPlayoffStage(seeds8: TTeam[], name: string): Tournament {
  const seeds = seeds8.map((t) => ({ ...t, status: 'alive' as const }));
  // blindagem: se vierem menos de 8 seeds, repete os existentes pra fechar 8 e
  // nunca gerar uma pairing com id undefined (que travaria a tela do Major).
  const at = (i: number) => seeds[i] ?? seeds[i % seeds.length] ?? seeds[0];
  const t: Tournament = {
    name,
    teams: seeds,
    phase: 'quarters',
    swissRound: 5,
    pairings: [
      { a: at(0).id, b: at(7).id, label: 'QF1', bestOf: 3 },
      { a: at(3).id, b: at(4).id, label: 'QF2', bestOf: 3 },
      { a: at(1).id, b: at(6).id, label: 'QF3', bestOf: 3 },
      { a: at(2).id, b: at(5).id, label: 'QF4', bestOf: 3 },
    ],
    history: [],
  };
  return t;
}

function pastOpponents(t: Tournament, id: string): Set<string> {
  const s = new Set<string>();
  for (const h of t.history) {
    if (h.pairing.a === id) s.add(h.pairing.b);
    if (h.pairing.b === id) s.add(h.pairing.a);
  }
  return s;
}

function makeSwissPairings(t: Tournament, rng: Rng): Pairing[] {
  const alive = t.teams.filter((x) => x.status === 'alive');
  // agrupa por record
  const groups = new Map<string, TTeam[]>();
  for (const team of alive) {
    const key = `${team.wins}-${team.losses}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(team);
  }
  const pairings: Pairing[] = [];
  const leftovers: TTeam[] = []; // sobras ímpares de cada record, pareadas no fim
  const sortedKeys = [...groups.keys()].sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]));
  for (const key of sortedKeys) {
    const g = groups.get(key)!;
    const [w, l] = key.split('-').map(Number);
    const bo = bestOfForRecord(w, l);
    // tenta evitar rematch
    let best: TTeam[] = g;
    for (let attempt = 0; attempt < 80; attempt++) {
      const cand = shuffle(rng, g);
      let ok = true;
      for (let i = 0; i + 1 < cand.length; i += 2) {
        if (pastOpponents(t, cand[i].id).has(cand[i + 1].id)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        best = cand;
        break;
      }
      best = cand;
    }
    let i = 0;
    for (; i + 1 < best.length; i += 2) {
      pairings.push({ a: best[i].id, b: best[i + 1].id, label: key, bestOf: bo });
    }
    if (i < best.length) leftovers.push(best[i]); // grupo ímpar: flutua a sobra
  }
  // pareia as sobras entre si (records vizinhos, pois leftovers já vem em ordem).
  // Sem isso, um time de grupo ímpar ficava SEM PAR e congelava 'alive' pra sempre,
  // deixando < 8 classificados e travando o Major no fim do stage.
  // BUG FIX (caça-bugs): o pareamento sequencial das sobras não checava rematch —
  // dois times que já se enfrentaram podiam cair no mesmo confronto. Tenta uma
  // ordenação livre de rematch (shuffle), com fallback pro sequencial atual.
  let leftoverOrder = leftovers;
  if (leftovers.length >= 4) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const cand = shuffle(rng, leftovers);
      let ok = true;
      for (let i = 0; i + 1 < cand.length; i += 2) {
        if (pastOpponents(t, cand[i].id).has(cand[i + 1].id)) { ok = false; break; }
      }
      if (ok) { leftoverOrder = cand; break; }
    }
  }
  for (let i = 0; i + 1 < leftoverOrder.length; i += 2) {
    const a = leftoverOrder[i], b = leftoverOrder[i + 1];
    pairings.push({ a: a.id, b: b.id, label: `${a.wins}-${a.losses}`, bestOf: bestOfForRecord(a.wins, a.losses) });
  }
  return pairings;
}

export function simulateAiSeries(t: Tournament, pairing: Pairing, rng: Rng): SeriesResult {
  const a = getTeam(t, pairing.a);
  const b = getTeam(t, pairing.b);
  const bo = pairingBestOf(t, pairing);
  const maps = autoVeto([a, b], rng, bo);
  return t.pressure ? simulateSeries(rng, a, b, maps, bo, { pressure: t.pressure }) : simulateSeries(rng, a, b, maps, bo);
}

// O usuário ganha confiança/familiaridade nos mapas que vem vencendo: isso
// vira buff real (mapPrefs) e faz a análise parar de sugerir banir o mapa forte.
function updateUserMapConfidence(t: Tournament, pairing: Pairing): void {
  const uidx = pairing.a === 'user' ? 0 : pairing.b === 'user' ? 1 : -1;
  if (uidx < 0) return;
  const user = getTeam(t, 'user');
  const res = pairing.result!;
  for (const m of res.maps) {
    const cur = user.mapPrefs[m.map] ?? 0;
    const delta = m.winner === uidx ? 0.6 : -0.35;
    user.mapPrefs[m.map] = Math.max(-3, Math.min(5, cur + delta));
  }
}

// fase do jogador evolui conforme o rendimento na série (rating vs neutro)
function updateForm(t: Tournament, pairing: Pairing): void {
  const res = pairing.result!;
  const teams = [getTeam(t, pairing.a), getTeam(t, pairing.b)];
  teams.forEach((team, idx) => {
    const won = res.winner === idx;
    for (const p of team.players) {
      const lines = res.maps.map((m) => m.stats[p.id]?.both).filter(Boolean);
      if (lines.length === 0) continue;
      const rating = computeDisplay(mergeLines(lines as Parameters<typeof mergeLines>[0])).rating;
      const target = 1 + (rating - 1) * 0.12 + (won ? 0.012 : -0.012);
      const next = (p.form ?? 1) * 0.55 + target * 0.45;
      p.form = Math.max(0.9, Math.min(1.1, next));
    }
  });
}

function applySeries(t: Tournament, pairing: Pairing): void {
  const res = pairing.result!;
  const a = getTeam(t, pairing.a);
  const b = getTeam(t, pairing.b);
  updateForm(t, pairing);
  updateUserMapConfidence(t, pairing);
  const winner = res.winner === 0 ? a : b;
  const loser = res.winner === 0 ? b : a;
  winner.wins++;
  loser.losses++;
  for (const m of res.maps) {
    a.roundDiff += m.score[0] - m.score[1];
    b.roundDiff += m.score[1] - m.score[0];
  }
  if (t.phase === 'swiss') {
    if (winner.wins >= 3) winner.status = 'advanced';
    if (loser.losses >= 3) loser.status = 'eliminated';
  } else {
    loser.status = 'eliminated';
  }
  t.history.push({ phase: phaseLabel(t), pairing });
}

function seedAdvanced(t: Tournament): TTeam[] {
  return t.teams
    .filter((x) => x.status === 'advanced')
    .sort((a, b) => a.losses - b.losses || b.roundDiff - a.roundDiff || b.strength - a.strength);
}

// Resolve a rodada atual: simula partidas sem resultado e avança a fase
export function resolveRound(t: Tournament, rng: Rng): Tournament {
  for (const p of t.pairings) {
    if (!p.result) p.result = simulateAiSeries(t, p, rng);
    applySeries(t, p);
  }

  if (t.phase === 'swiss') {
    const stillAlive = t.teams.filter((x) => x.status === 'alive');
    if (t.swissRound < 5 && stillAlive.length > 0) {
      t.swissRound++;
      t.pairings = makeSwissPairings(t, rng);
    } else if (t.stageOnly) {
      // stage encerrado: os 8 classificados estão definidos. Não vai pros playoffs;
      // o orquestrador do Major leva os 8 (stageAdvancers) pro próximo stage.
      t.phase = 'done';
      t.pairings = [];
    } else {
      t.phase = 'quarters';
      const seeds = seedAdvanced(t);
      for (const s of seeds) s.status = 'alive';
      t.pairings = [
        { a: seeds[0].id, b: seeds[7].id, label: 'QF1', bestOf: 3 },
        { a: seeds[3].id, b: seeds[4].id, label: 'QF2', bestOf: 3 },
        { a: seeds[1].id, b: seeds[6].id, label: 'QF3', bestOf: 3 },
        { a: seeds[2].id, b: seeds[5].id, label: 'QF4', bestOf: 3 },
      ];
    }
  } else if (t.phase === 'quarters') {
    const w = t.pairings.map((p) => (p.result!.winner === 0 ? p.a : p.b));
    t.phase = 'semis';
    t.pairings = [
      { a: w[0], b: w[1], label: 'SF1', bestOf: 3 },
      { a: w[2], b: w[3], label: 'SF2', bestOf: 3 },
    ];
  } else if (t.phase === 'semis') {
    const w = t.pairings.map((p) => (p.result!.winner === 0 ? p.a : p.b));
    t.phase = 'final';
    t.pairings = [{ a: w[0], b: w[1], label: 'FINAL', bestOf: 5 }]; // grande final MD5
  } else if (t.phase === 'final') {
    const p = t.pairings[0];
    t.championId = p.result!.winner === 0 ? p.a : p.b;
    t.phase = 'done';
    t.pairings = [];
    t.mvpId = computeMvp(t);
  }
  return t;
}

function computeMvp(t: Tournament): string | undefined {
  if (!t.championId) return undefined;
  const champ = getTeam(t, t.championId);
  let best: { id: string; rating: number } | undefined;
  for (const p of champ.players) {
    const lines = [];
    for (const h of t.history) {
      const res = h.pairing.result;
      if (!res) continue;
      for (const m of res.maps) {
        const st = m.stats[p.id];
        if (st) lines.push(st.both);
      }
    }
    if (lines.length === 0) continue;
    const d = computeDisplay(mergeLines(lines));
    if (!best || d.rating > best.rating) best = { id: p.id, rating: d.rating };
  }
  return best?.id;
}

// Torneio 100% IA (lab de balanceamento): 16 times sorteados, roda até o fim
export function simulateAiTournament(dataset: TeamSeason[], rng: Rng): Tournament {
  const sample = shuffle(rng, dataset).slice(0, 16);
  const user = teamSeasonToTTeam(sample[0]);
  const t = createTournament(sample.slice(1), user, rng, 'LAB');
  let guard = 0;
  while (t.phase !== 'done' && guard++ < 20) {
    resolveRound(t, rng);
  }
  return t;
}

