// DIÁRIO — engine do minigame LINES HISTÓRICAS (estilo Futbol11): todo dia uma
// escalação icônica de CS; você lembra os 5. Puro, sem React, determinístico
// pela DATA (todo mundo joga a mesma line no mesmo dia).
//
// Este arquivo também define o REGISTRY dos jogos diários: o hub do Diário lê
// daqui — jogo novo entra adicionando uma entrada (e sua tela), sem mexer no hub.

import { makeRng } from '../rng';
import { hashStr } from '../../state/hash';
import { HISTORIC_LINES, type HistoricLine, type LinePlayer } from './lineups';

// ─────────────────────────────────────────────────────────────────────────────
// Registry dos minigames diários (o hub renderiza a partir daqui)

export interface DailyGameDef {
  id: string;
  title: string;
  blurb: string;
  icon: string;               // emoji — o Diário é leve, sem dependência de ícone
}

export const DAILY_GAMES: DailyGameDef[] = [
  {
    id: 'lines',
    title: 'Lines Históricas',
    blurb: 'Uma escalação icônica por dia — você lembra os 5?',
    icon: '🖐️',
  },
  {
    id: 'whois',
    title: 'Quem é o Pro?',
    blurb: 'Um pro misterioso do cenário 2026 — cace pelas dicas em 8 chutes.',
    icon: '🕵️',
  },
  {
    id: 'impostor',
    title: 'O Impostor',
    blurb: 'Uma line histórica com UM infiltrado — ache ele em 2 tentativas.',
    icon: '🎭',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dia — chave de data LOCAL (o "dia" vira à meia-noite do jogador) e número
// sequencial desde a época do Diário (define a line e o nº do share).

export const DAILY_EPOCH = '2026-08-01';   // dia #1 do Diário

export function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// nº do dia (1-based) a partir da chave — datas antes da época contam do 1.
export function dayNumberOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [ey, em, ed] = DAILY_EPOCH.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86_400_000);
  return Math.max(1, days + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorteio da line do dia: dentro de um CICLO (uma volta completa no pool) não
// há repetição — a ordem do ciclo é um shuffle semeado pelo nº do ciclo, então
// o pool inteiro passa antes de qualquer line voltar.

export function lineOfDay(dateKey: string, pool: HistoricLine[] = HISTORIC_LINES): HistoricLine {
  const n = dayNumberOf(dateKey) - 1;        // 0-based
  const cycle = Math.floor(n / pool.length);
  const rng = makeRng((hashStr(`lines:${cycle}`) ^ 0xd1a) >>> 0);
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return pool[order[n % pool.length]];
}

// ordem de exibição dos slots do dia (embaralhada por dia — a posição não
// entrega quem é a estrela).
export function slotOrderOf(dateKey: string, line: HistoricLine): number[] {
  const rng = makeRng((hashStr(`slots:${line.id}:${dateKey}`) ^ 0x51a7) >>> 0);
  const order = line.players.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching de palpite: minúsculas, sem acento, só [a-z0-9] — cobre "FalleN",
// "fallen", "GeT_RiGhT"/"getright", "pashaBiceps "/"pasha" (via alias).

export function normalizeGuess(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function answersOf(p: LinePlayer): string[] {
  return [normalizeGuess(p.nick), ...(p.aliases ?? []).map(normalizeGuess)].filter(Boolean);
}

// devolve o ÍNDICE do jogador acertado (no array da line), ou null se errou.
// `found` evita re-acertar o mesmo slot.
export function matchGuess(line: HistoricLine, guess: string, found: number[]): number | null {
  const g = normalizeGuess(guess);
  if (g.length < 2) return null;
  for (let i = 0; i < line.players.length; i++) {
    if (found.includes(i)) continue;
    if (answersOf(line.players[i]).includes(g)) return i;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regras da rodada

export const MAX_ERRORS = 6;    // chutes errados até a line se revelar

export interface LinesProgress {
  found: number[];              // índices já acertados
  errors: number;               // chutes errados
  done: boolean;                // acabou (completou ou estourou os erros)
  won: boolean;                 // achou os 5
}

export function freshProgress(): LinesProgress {
  return { found: [], errors: 0, done: false, won: false };
}

// aplica um palpite — imutável. Palpite repetido/curto não conta erro.
export function applyGuess(line: HistoricLine, p: LinesProgress, guess: string): { progress: LinesProgress; hit: number | null } {
  if (p.done) return { progress: p, hit: null };
  const g = normalizeGuess(guess);
  if (g.length < 2) return { progress: p, hit: null };
  const hit = matchGuess(line, guess, p.found);
  if (hit == null) {
    const errors = p.errors + 1;
    return { progress: { ...p, errors, done: errors >= MAX_ERRORS, won: false }, hit: null };
  }
  const found = [...p.found, hit];
  const won = found.length >= line.players.length;
  return { progress: { ...p, found, done: won, won }, hit };
}

export function giveUp(p: LinesProgress): LinesProgress {
  return p.done ? p : { ...p, done: true, won: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Share — o texto que vai pro grupo (por que o Wordle espalhou: o print é o convite)

export function shareTextOf(dateKey: string, line: HistoricLine, p: LinesProgress, streak: number): string {
  const day = dayNumberOf(dateKey);
  const grid = line.players.map((_, i) => (p.found.includes(i) ? '🟩' : '🟥')).join('');
  const errors = '❌'.repeat(Math.min(p.errors, MAX_ERRORS));
  const head = p.won
    ? `Lembrei a line ${line.team} ${line.year} — ${grid}${errors ? ` ${errors}` : ''}`
    : `A line ${line.team} ${line.year} me pegou — ${grid} ${errors}`;
  const tail = streak >= 2 ? ` · 🔥 ${streak} dias seguidos` : '';
  return `LINES HISTÓRICAS #${day} · MAJOR//CS\n${head}${tail}\nroadtomajor.com.br/diario`;
}
