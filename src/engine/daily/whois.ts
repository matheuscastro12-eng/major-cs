// DIÁRIO — QUEM É O PRO? (estilo Loldle/Wordle de jogador): um pro misterioso
// do cenário 2026 por dia; cada chute revela dicas comparando TIME, PAÍS,
// FUNÇÃO e OVR. Puro, sem React, determinístico pela DATA (todo mundo caça o
// mesmo pro no mesmo dia).

import { makeRng } from '../rng';
import { hashStr } from '../../state/hash';
import { regionOf } from '../../data/regions';
import { playerOvr } from '../ratings';
import type { TeamSeason } from '../../types';
import { dayNumberOf, normalizeGuess } from './lines';

export const WHOIS_MAX = 8;      // chutes até o pro se revelar
export const WHOIS_MIN_OVR = 76; // piso do pool — só gente que a base conhece

export interface WhoisEntry {
  id: string;
  nick: string;
  country: string;
  region: string;
  role: string;
  role2?: string;
  team: string;      // nome da org
  tag: string;
  ovr: number;
}

// pool do jogo: jogadores reconhecíveis (OVR ≥ piso), ordem estável por id.
export function whoisPool(dataset: TeamSeason[]): WhoisEntry[] {
  const out: WhoisEntry[] = [];
  for (const t of dataset) {
    for (const p of t.players) {
      const ovr = playerOvr(p);
      if (ovr < WHOIS_MIN_OVR) continue;
      out.push({
        id: p.id, nick: p.nick, country: p.country,
        region: regionOf(p.country) ?? 'global',
        role: p.role, role2: p.role2,
        team: t.team, tag: t.tag, ovr,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// o pro do dia — mesmo esquema de ciclo sem repetição do lineOfDay (seed própria).
export function whoisOfDay(dateKey: string, pool: WhoisEntry[]): WhoisEntry {
  const n = dayNumberOf(dateKey) - 1;
  const cycle = Math.floor(n / pool.length);
  const rng = makeRng((hashStr(`whois:${cycle}`) ^ 0xb10) >>> 0);
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return pool[order[n % pool.length]];
}

// dica por dimensão: hit = igual, near = "quente" (mesma região / função
// secundária bate), up/down = o ALVO está acima/abaixo do chute.
export type ClueCell = 'hit' | 'near' | 'miss';
export type OvrClue = 'hit' | 'up' | 'down';

export interface WhoisClue {
  nick: string;
  team: ClueCell;
  country: ClueCell;   // near = mesma região
  role: ClueCell;      // near = a função bate na secundária (de um dos lados)
  ovr: OvrClue;        // hit = diferença ≤ 1
}

export function clueOf(target: WhoisEntry, guess: WhoisEntry): WhoisClue {
  const rolesT = [target.role, target.role2].filter(Boolean);
  const rolesG = [guess.role, guess.role2].filter(Boolean);
  return {
    nick: guess.nick,
    team: guess.team === target.team ? 'hit' : 'miss',
    country: guess.country === target.country ? 'hit' : guess.region === target.region ? 'near' : 'miss',
    role: guess.role === target.role ? 'hit' : rolesT.some((r) => rolesG.includes(r)) ? 'near' : 'miss',
    ovr: Math.abs(guess.ovr - target.ovr) <= 1 ? 'hit' : target.ovr > guess.ovr ? 'up' : 'down',
  };
}

export interface WhoisProgress {
  guesses: WhoisClue[];
  done: boolean;
  won: boolean;
}

export function freshWhois(): WhoisProgress {
  return { guesses: [], done: false, won: false };
}

// resolve o texto do chute contra o pool (nick normalizado). null = desconhecido.
export function findInPool(pool: WhoisEntry[], raw: string): WhoisEntry | null {
  const g = normalizeGuess(raw);
  if (g.length < 2) return null;
  return pool.find((p) => normalizeGuess(p.nick) === g) ?? null;
}

// aplica um chute VÁLIDO (já resolvido no pool) — imutável. Chute repetido é no-op.
export function applyWhoisGuess(target: WhoisEntry, p: WhoisProgress, guess: WhoisEntry): WhoisProgress {
  if (p.done || p.guesses.some((c) => c.nick === guess.nick)) return p;
  const won = guess.id === target.id;
  const guesses = [...p.guesses, clueOf(target, guess)];
  return { guesses, won, done: won || guesses.length >= WHOIS_MAX };
}

export function giveUpWhois(p: WhoisProgress): WhoisProgress {
  return p.done ? p : { ...p, done: true, won: false };
}

// share — uma linha de emojis por chute (time·país·função·ovr), como o Loldle.
export function shareTextOfWhois(dateKey: string, p: WhoisProgress, streak: number): string {
  const day = dayNumberOf(dateKey);
  const cell = (c: ClueCell) => (c === 'hit' ? '🟩' : c === 'near' ? '🟨' : '🟥');
  const ovrCell = (c: OvrClue) => (c === 'hit' ? '🟩' : c === 'up' ? '⬆️' : '⬇️');
  const rows = p.guesses.map((g) => `${cell(g.team)}${cell(g.country)}${cell(g.role)}${ovrCell(g.ovr)}`).join('\n');
  const head = p.won
    ? `Cravei em ${p.guesses.length}/${WHOIS_MAX}`
    : `O pro misterioso me escapou (${WHOIS_MAX} chutes)`;
  const tail = streak >= 2 ? ` · 🔥 ${streak} dias seguidos` : '';
  return `QUEM É O PRO? #${day} · MAJOR//CS\n${head}${tail}\n${rows}\nroadtomajor.com.br/diario`;
}
