// Peças COMPARTILHADAS pelos dois motores de partida (v1 = engine/match.ts,
// v2 = engine/match2/). Economia, playbook, postura, elenco 5v5 e utilitários.
// Movidas de match.ts sem mudança de comportamento: o v1 continua bit a bit o
// mesmo, e o v2 reusa as MESMAS regras (calls, playbook, técnico, IGL, economia)
// para que trocar o motor não mude as alavancas táticas que a UI mostra.

import type { PlayerLine, PlayerMapStats, Playbook, Playstyle, TPlayer, TTeam } from '../types';
import { derivePlaystyle } from '../types';
import { ct } from '../state/career-i18n';

export const playstyleOf = (p: TPlayer): Playstyle => p.playstyle ?? derivePlaystyle(p.role);

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// lê de process.env via globalThis (sem exigir os types do node); no browser
// process é indefinido e cai no default.
export const envStr = (k: string): string | undefined => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const v = env?.[k];
  return v != null && v !== '' ? v : undefined;
};
export const envNum = (k: string, def: number): number => {
  const v = envStr(k);
  return v != null ? Number(v) : def;
};

export function emptyLine(): PlayerLine {
  return { kills: 0, deaths: 0, assists: 0, dmg: 0, kastRounds: 0, rounds: 0, openKills: 0, clutchWins: 0, hsKills: 0, mkRounds: 0, tradedDeaths: 0 };
}

export function emptyStats(): PlayerMapStats {
  return { both: emptyLine(), t: emptyLine(), ct: emptyLine() };
}

// postura tática escolhida ao vivo pelo jogador: muda o perfil de risco do round
export type Stance = 'aggressive' | 'default' | 'cautious';

// ---------------- IGL: estilo e tendência de lado ----------------
// estilo do IGL (jogador de maior igl) dá ao time uma tendência natural de lado:
// IGL agressivo puxa o T, IGL passivo segura o CT. Quanto melhor o IGL, mais forte.
// O v2 passa o IGL lido dos atributos (liderança, comunicação, game sense…).
export interface IglInfo { style: Playstyle; rating: number }
export function iglStyleOf(team: TTeam): IglInfo {
  let igl = team.players[0];
  for (const p of team.players) if (p.igl > igl.igl) igl = p;
  return { style: playstyleOf(igl), rating: igl.igl };
}
export function iglLean(team: TTeam, side: 'ct' | 't', igl: IglInfo = iglStyleOf(team)): number {
  const { style, rating } = igl;
  const pow = Math.max(0, (rating - 78) / 22); // 0..~1
  if (style === 'aggressive') return side === 't' ? 0.5 + pow * 0.9 : -0.3;
  if (style === 'passive') return side === 'ct' ? 0.5 + pow * 0.9 : -0.3;
  return 0;
}

// ---------------- camada tática: estilo de jogo x postura ----------------
// A postura escolhida ao vivo VALORIZA os jogadores cujo estilo combina e
// penaliza quem não combina. Agressivo rende no T com jogadores agressivos;
// cauteloso rende no CT com jogadores passivos. "default" é o meio-termo seguro.
// quanto a postura soma/subtrai na força efetiva do time, considerando o lado
// e quantos jogadores combinam com a tática
export function stanceFitDelta(team: TTeam, side: 'ct' | 't', mode: Stance, igl: IglInfo = iglStyleOf(team)): number {
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
  if (igl.style === favored) d += 0.8;
  return d;
}

// ---------------- economia ----------------
// Dinheiro médio por jogador, decidido pelo IGL/coach a cada round:
// full buy (>=4500), force (>=2600) ou eco. Eco joga de MAC-10/pistola
// e sofre penalidade de força - mas o upset existe.

export type BuyTier = 'pistol' | 'eco' | 'force' | 'full';

// caixa de cada half da prorrogação no CS2 (mp_overtime_startmoney).
export const OT_START_MONEY = 12500;

export interface EcoState {
  money: number;
  lossStreak: number;
}

export function decideBuy(eco: EcoState, isPistol: boolean, aggressiveCoach: boolean): BuyTier {
  if (isPistol) return 'pistol';
  const forceThreshold = aggressiveCoach ? 2300 : 2600; // coach agressivo força mais
  if (eco.money >= 4500) return 'full';
  if (eco.money >= forceThreshold) return 'force';
  return 'eco';
}

export function buyCost(tier: BuyTier): number {
  if (tier === 'full') return 4100;
  if (tier === 'force') return 2300;
  if (tier === 'eco') return 500;
  return 700;
}

// Efeito do PLAYBOOK por round: cada esquema é forte em certos contextos e fraco
// em outros (estratégia: escolher e treinar o certo, e ler o adversário/mapa).
// Retorna o delta de força ANTES de escalar pelo entrosamento, e o rótulo do
// fator dominante do round — reusado na UI pra "demonstrar" o efeito ao vivo.
export interface PlaybookCtx { side: 'ct' | 't'; isPistol: boolean; secondHalf: boolean; lostLast: boolean; pickedOwnMap: boolean; eco: boolean; }
export function playbookLean(pb: Playbook, ctx: PlaybookCtx): { delta: number; label: string } {
  let net = 0, best = 0, label = '';
  const add = (v: number, l: string) => { net += v; if (Math.abs(v) > Math.abs(best)) { best = v; label = l; } };
  if (pb === 'aggressive') {
    if (ctx.side === 't') add(1.4, ct('pressão no ataque')); else add(-1.1, ct('pressão exposta no CT'));
    if (ctx.isPistol) add(1.3, ct('pistol agressivo'));
    if (ctx.eco && !ctx.isPistol) add(0.9, ct('force agressivo'));
    if (ctx.lostLast && !ctx.isPistol) add(-0.8, ct('atrás no placar'));
  } else if (pb === 'tactical') {
    if (ctx.secondHalf) add(1.3, ct('ajuste de 2º half'));
    if (ctx.pickedOwnMap) add(1.0, ct('domínio do mapa'));
    if (ctx.side === 'ct') add(0.6, ct('defesa estruturada'));
    if (ctx.isPistol) add(-1.1, ct('pistol sem ritmo'));
  } else if (pb === 'fast') {
    if (ctx.side === 't') add(1.7, ct('execução rápida')); else add(-1.4, ct('CT vulnerável'));
    if (ctx.eco) add(0.8, ct('rush de eco'));
  } else {
    if (ctx.side === 'ct') add(1.5, ct('controle no CT')); else add(-1.0, ct('ataque lento'));
    if (ctx.secondHalf) add(0.7, ct('round longo dominado'));
    if (ctx.isPistol) add(-1.0, ct('pistol arriscado'));
  }
  return { delta: net, label: label || ct('neutro') };
}

// ---------------- elenco (O1-48) ----------------
// O motor modela SEMPRE 5 contra 5 (mortes, savers, dano e pickVictims contam
// 5). Antes (ENGI-09) um time com 4 jogadores derrubava a partida com "Cannot
// read properties of undefined" e só a UI protegia, em pontos espalhados. Agora
// a entrada normaliza: corta o excedente, completa com o banco e, faltando
// ainda, com reservas genéricos derivados do próprio elenco (um degrau abaixo
// da média). Sem NENHUM jogador não há de quem derivar: erro tipado.

export class RosterError extends Error {
  readonly code = 'roster_incompleto' as const;
  readonly teamId: string;
  readonly count: number;
  constructor(teamId: string, count: number) {
    super(`roster_incompleto: ${teamId} tem ${count} jogador(es)`);
    this.name = 'RosterError';
    this.teamId = teamId;
    this.count = count;
  }
}

export const LINEUP_SIZE = 5;
const RESERVE_DROP = 6;   // reserva genérico: 6 pontos abaixo da média do elenco

export function withFullRoster(team: TTeam): TTeam {
  const players = team.players.slice(0, LINEUP_SIZE);
  if (players.length === LINEUP_SIZE && team.players.length === LINEUP_SIZE) return team;
  for (const p of team.bench ?? []) {
    if (players.length >= LINEUP_SIZE) break;
    if (!players.some((q) => q.id === p.id)) players.push(p);
  }
  if (!players.length) throw new RosterError(team.id, 0);
  const avg = (k: 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl' | 'skill' | 'ovr') =>
    Math.max(1, Math.round(players.reduce((acc, p) => acc + p[k], 0) / players.length) - RESERVE_DROP);
  const base = players[0];
  for (let i = 0; players.length < LINEUP_SIZE; i++) {
    players.push({
      id: `${team.id}-reserva-${i + 1}`,
      sourcePlayerId: `${team.id}-reserva-${i + 1}`,
      nick: `reserva${i + 1}`,
      name: `Reserva ${i + 1}`,
      country: team.country,
      role: 'Rifler',
      playstyle: base.playstyle,
      aim: avg('aim'), clutch: avg('clutch'), consistency: avg('consistency'),
      awp: avg('awp'), igl: avg('igl'), skill: avg('skill'), ovr: avg('ovr'),
      form: 1,
    });
  }
  return { ...team, players };
}
