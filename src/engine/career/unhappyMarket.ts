// ALVOS INFELIZES no mercado (#38 do gap Brasval). Puro, sem React.
//
// A IA não tem moral individual modelada (save.morale é só do SEU elenco) —
// a infelicidade de um jogador de IA é DERIVADA, determinística por split:
//   · crise do clube (forma real via teamForm — o fator dominante)
//   · papel no elenco (os últimos OVRs do roster se sentem preteridos)
//   · ruído estável por (jogador, split) — nem todo mundo do time em crise
//     quer sair, e a lista muda a cada janela
//
// Jogador infeliz fica MAIS BARATO: o desconto entra no decideOffer como
// multiplicador do alvo do vendedor ("quer sair — o clube facilita").

import { hashStr } from '../../state/hash';
import type { Player, TeamSeason } from '../../types';
import { playerOvr } from '../ratings';

// infelicidade mínima pra virar OPORTUNIDADE (abaixo disso, desconto zero)
export const UNHAPPY_MIN = 0.55;
export const UNHAPPY_MAX_DISCOUNT = 0.30;

// 0..1 — quão infeliz o jogador está NESTE split.
export function unhappinessOf(playerId: string, split: number, clubForm: number, rankInRoster: number, rosterSize: number): number {
  const crisis = Math.max(0, 45 - clubForm) / 45;                                   // clube mal (forma <45) pesa mais
  const benchy = rosterSize > 1 ? rankInRoster / (rosterSize - 1) : 0;              // 0 = estrela, 1 = último OVR
  const noise = (hashStr(`unhappy:${playerId}:${split}`) % 100) / 100;              // estável no split, muda na janela
  return Math.min(1, crisis * 0.55 + benchy * 0.2 + noise * 0.35);
}

// desconto (0 ou 0.10..0.30): só a partir de UNHAPPY_MIN — estrela feliz em
// time em alta NUNCA sai com desconto.
export function unhappyDiscountOf(u: number): number {
  if (u < UNHAPPY_MIN) return 0;
  return Math.min(UNHAPPY_MAX_DISCOUNT, 0.10 + (u - UNHAPPY_MIN) * (0.20 / (1 - UNHAPPY_MIN)));
}

// atalho: desconto direto de (jogador, clube) — rank derivado do roster por OVR.
export function unhappyDiscountFor(player: Player, roster: Player[], split: number, clubForm: number): number {
  const sorted = [...roster].sort((a, b) => playerOvr(b) - playerOvr(a) || a.id.localeCompare(b.id));
  const rank = Math.max(0, sorted.findIndex((p) => p.id === player.id));
  return unhappyDiscountOf(unhappinessOf(player.id, split, clubForm, rank, sorted.length));
}

export interface UnhappyTarget {
  player: Player;
  teamId: string;
  teamName: string;
  tag: string;
  discount: number;   // 0.10..0.30
  clubForm: number;
}

// varre os clubes de IA e lista as oportunidades da janela (maior desconto
// primeiro). `formOf` = forma real do clube; `excludeIds` = já contratados/seus.
export function listUnhappyTargets(
  teams: TeamSeason[], formOf: (teamId: string) => number, split: number, excludeIds: Set<string>, cap = 10,
): UnhappyTarget[] {
  const out: UnhappyTarget[] = [];
  for (const t of teams) {
    const form = formOf(t.id);
    const sorted = [...t.players].sort((a, b) => playerOvr(b) - playerOvr(a) || a.id.localeCompare(b.id));
    sorted.forEach((p, rank) => {
      if (excludeIds.has(p.id)) return;
      const d = unhappyDiscountOf(unhappinessOf(p.id, split, form, rank, sorted.length));
      if (d > 0) out.push({ player: p, teamId: t.id, teamName: t.team, tag: t.tag, discount: d, clubForm: form });
    });
  }
  return out.sort((a, b) => b.discount - a.discount || a.player.id.localeCompare(b.player.id)).slice(0, cap);
}
