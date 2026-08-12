// DIÁRIO — O IMPOSTOR: uma escalação histórica do dia com UM infiltrado de
// outro time/era — ache ele em até 2 tentativas. Reusa o dataset de lines
// (engine/daily/lineups.ts). Puro, determinístico pela DATA.

import { makeRng } from '../rng';
import { hashStr } from '../../state/hash';
import { HISTORIC_LINES, type HistoricLine, type LinePlayer } from './lineups';
import { dayNumberOf, normalizeGuess } from './lines';

export const IMPOSTOR_TRIES = 2;

export interface ImpostorRound {
  team: string;             // o time anunciado (da line verdadeira)
  year: number;
  context: string;
  players: LinePlayer[];    // 5 exibidos (4 legítimos + 1 intruso), ordem embaralhada
  impostorIdx: number;      // índice do intruso em `players`
  from: { team: string; year: number }; // de onde o intruso veio (revelado no fim)
}

// nicks (normalizados) de uma line — pra barrar doador que compartilha jogador
// com a line do dia (fer na SK 2016 E na Imperial 2022, p.ex.).
function nicksOf(line: HistoricLine): Set<string> {
  return new Set(line.players.map((p) => normalizeGuess(p.nick)));
}

// a rodada do dia: line base pelo ciclo-sem-repetição (seed própria — NÃO é a
// mesma line do jogo Lines no mesmo dia), doador sorteado entre as lines cujo
// elenco não colide, intruso sorteado do doador e enfiado num slot aleatório.
export function impostorOfDay(dateKey: string, pool: HistoricLine[] = HISTORIC_LINES): ImpostorRound {
  const n = dayNumberOf(dateKey) - 1;
  const cycle = Math.floor(n / pool.length);
  const rng0 = makeRng((hashStr(`impostor:${cycle}`) ^ 0x1f0) >>> 0);
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng0() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const line = pool[order[n % pool.length]];

  // rng do DIA (não do ciclo) pro doador/slot — cada dia embaralha diferente
  const rng = makeRng((hashStr(`impostor-day:${dateKey}:${line.id}`) ^ 0xace) >>> 0);
  const baseNicks = nicksOf(line);
  const donors = pool.filter((l) => l.id !== line.id && l.players.some((p) => !baseNicks.has(normalizeGuess(p.nick))));
  const donor = donors[Math.floor(rng() * donors.length)];
  const candidates = donor.players.filter((p) => !baseNicks.has(normalizeGuess(p.nick)));
  const intruder = candidates[Math.floor(rng() * candidates.length)];

  // 4 legítimos (derruba um aleatório) + intruso, tudo embaralhado
  const dropIdx = Math.floor(rng() * line.players.length);
  const shown: LinePlayer[] = line.players.filter((_, i) => i !== dropIdx).concat(intruder);
  for (let i = shown.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shown[i], shown[j]] = [shown[j], shown[i]];
  }
  return {
    team: line.team,
    year: line.year,
    context: line.context,
    players: shown,
    impostorIdx: shown.indexOf(intruder),
    from: { team: donor.team, year: donor.year },
  };
}

export interface ImpostorProgress {
  picks: number[];          // índices já apontados (errados ou o final)
  done: boolean;
  won: boolean;
}

export function freshImpostor(): ImpostorProgress {
  return { picks: [], done: false, won: false };
}

// aponta um suspeito — imutável. Repetido é no-op.
export function applyPick(round: ImpostorRound, p: ImpostorProgress, idx: number): ImpostorProgress {
  if (p.done || p.picks.includes(idx) || idx < 0 || idx >= round.players.length) return p;
  const picks = [...p.picks, idx];
  const won = idx === round.impostorIdx;
  return { picks, won, done: won || picks.length >= IMPOSTOR_TRIES };
}

// share — 🟥 por erro, 🟩 no acerto ("de primeira" é o flex do dia).
export function shareTextOfImpostor(dateKey: string, round: ImpostorRound, p: ImpostorProgress, streak: number): string {
  const day = dayNumberOf(dateKey);
  const grid = p.picks.map((i) => (i === round.impostorIdx ? '🟩' : '🟥')).join('');
  const head = p.won
    ? p.picks.length === 1
      ? `Achei o impostor da ${round.team} ${round.year} DE PRIMEIRA 🕵️ ${grid}`
      : `Achei o impostor da ${round.team} ${round.year} ${grid}`
    : `O impostor da ${round.team} ${round.year} me enganou ${grid}`;
  const tail = streak >= 2 ? ` · 🔥 ${streak} dias seguidos` : '';
  return `O IMPOSTOR #${day} · MAJOR//CS\n${head}${tail}\nroadtomajor.com.br/diario`;
}
