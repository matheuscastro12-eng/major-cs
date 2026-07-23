// Ultimate Squad — DRAFT (o modo icônico do gênero FUT, adaptado ao CS).
//
// O manager paga a inscrição, monta um squad EMPRESTADO escolhendo 1 de 5
// cartas por função (capitão primeiro, com pool premium), e leva o time num
// run de até DRAFT_TARGET vitórias contra IA que escala — a 1ª derrota encerra.
// Recompensa cresce por vitória; campanha perfeita paga carta Lendária.
// As cartas do draft NÃO entram no inventário (são do run) — o prêmio sim.
//
// Puro/determinístico: as 5 opções de cada estágio saem de um seed fixado no
// início do run — F5/reload NÃO re-rola as opções (anti-reroll, mesmo padrão
// commit-on-start do openPack). Ver docs-but-map.md §4.

import type { Role } from '../../types';
import { makeRng, type Rng } from '../rng';
import type { UltCard } from './cards';
import { rarityInfo, type UltRarity } from './rarities';

export const DRAFT_ENTRY = 15_000;      // inscrição (credits)
export const DRAFT_TARGET = 4;          // vitórias pra campanha perfeita
export const DRAFT_OPTIONS = 5;         // opções por estágio
// ordem dos picks = slots da formação 'standard' (química de role-fit alinha)
export const DRAFT_ROLES: Role[] = ['IGL', 'Support', 'AWP', 'Entry', 'Rifler'];

// recompensa por nº de vitórias do run (0..4). Curva calibrada contra a
// economia do iter47: inscrição 15k; sair no 0-1 dá prejuízo (risco real),
// 2 vitórias ~empata, campanha perfeita paga bem + Lendária (teto abaixo do
// pack electric pra não virar a única fonte de special).
export const DRAFT_REWARDS: { credits: number; card?: UltRarity }[] = [
  { credits: 3_000 },
  { credits: 8_000 },
  { credits: 15_000, card: 'rareGold' },
  { credits: 25_000, card: 'elite' },
  { credits: 42_000, card: 'legendary' },
];

// estado do run (mora em profile.draft; persiste entre reloads)
export interface DraftRunState {
  date: string | null;   // dia do último run iniciado
  seed: number;          // seed das opções do run (fixado no start)
  stage: number;         // 0..4 = escolhendo DRAFT_ROLES[stage]; 5 = squad pronto
  picks: string[];       // card keys escolhidas (ordem = DRAFT_ROLES)
  wins: number;
  active: boolean;
  best: number;          // recorde de vitórias
  runs: number;          // total de runs iniciados (stats)
}

export const DRAFT_DEFAULT: DraftRunState = {
  date: null, seed: 0, stage: 0, picks: [], wins: 0, active: false, best: 0, runs: 0,
};

// pesos de raridade por estágio. Capitão vem do pool premium (elite+ e
// specials); os demais slots são ouro-pesado com chance real de topo — o
// gostinho de "veio um Ícone no meu draft" é o coração do modo.
const CAPTAIN_WEIGHTS: [minTier: number, maxTier: number, weight: number][] = [
  [5, 5, 40],   // elite
  [6, 6, 30],   // legendary
  [7, 7, 12],   // icon
  [8, 99, 18],  // specials (tots/major/promo)
];
const FIELD_WEIGHTS: [number, number, number][] = [
  [3, 3, 42],   // gold
  [4, 4, 30],   // rareGold
  [5, 5, 16],   // elite
  [6, 6, 7],    // legendary
  [7, 7, 2],    // icon
  [8, 99, 3],   // specials
];

function fitsRole(c: UltCard, role: Role): boolean {
  // Rifler é o flex do CS (mesmo critério do roleFitsSlot da química)
  return c.role === role || c.role === 'Rifler' || role === 'Rifler';
}

function weightedBucket(rng: Rng, weights: [number, number, number][]): [number, number] {
  const total = weights.reduce((a, w) => a + w[2], 0);
  let roll = rng() * total;
  for (const [lo, hi, w] of weights) {
    roll -= w;
    if (roll <= 0) return [lo, hi];
  }
  const last = weights[weights.length - 1];
  return [last[0], last[1]];
}

/**
 * As DRAFT_OPTIONS opções do estágio. Determinístico por (seed, stage):
 * reload não re-rola. Nunca repete jogador já escolhido nem oferece o mesmo
 * jogador duas vezes no estágio; cascata de fallback pra tier abaixo quando o
 * bucket sorteado não tem candidato (catálogo pequeno em specials).
 */
export function draftOptions(
  catalog: UltCard[],
  seed: number,
  stage: number,
  pickedPlayerIds: string[],
): UltCard[] {
  const role = DRAFT_ROLES[Math.max(0, Math.min(DRAFT_ROLES.length - 1, stage))];
  const rng = makeRng(((seed ^ (stage * 0x9e3779b1)) >>> 0) || 1);
  const taken = new Set(pickedPlayerIds);
  const weights = stage === 0 ? CAPTAIN_WEIGHTS : FIELD_WEIGHTS;
  const eligible = catalog.filter((c) => fitsRole(c, role) && !taken.has(c.playerId));
  const byTier = (lo: number, hi: number) =>
    eligible.filter((c) => {
      const t = rarityInfo(c.rarity).tier;
      return t >= lo && t <= hi;
    });

  const out: UltCard[] = [];
  const offered = new Set<string>();
  let guard = 0;
  while (out.length < DRAFT_OPTIONS && guard++ < 60) {
    let [lo, hi] = weightedBucket(rng, weights);
    // cascata: desce um degrau até achar candidato livre (piso: gold)
    for (; lo >= 3; lo--) {
      const pool = byTier(lo, hi).filter((c) => !offered.has(c.playerId));
      if (pool.length > 0) {
        const pick = pool[Math.floor(rng() * pool.length)];
        offered.add(pick.playerId);
        out.push(pick);
        break;
      }
      hi = lo - 1;
    }
    // pool esgotado até no piso → relaxa pra qualquer elegível livre
    if (out.length < DRAFT_OPTIONS && guard >= 40) {
      const rest = eligible.filter((c) => !offered.has(c.playerId));
      if (!rest.length) break;
      const pick = rest[Math.floor(rng() * rest.length)];
      offered.add(pick.playerId);
      out.push(pick);
    }
  }
  // ordena por OVR↓ só pra apresentação estável
  return out.sort((a, b) => b.ovr - a.ovr);
}

/** Dificuldade da IA no run: começa no nível do seu draft e sobe por vitória. */
export function draftOppTarget(draftAvgOvr: number, wins: number): number {
  return Math.max(60, Math.min(97, draftAvgOvr + wins * 2.5));
}
