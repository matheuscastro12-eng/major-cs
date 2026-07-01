// Ultimate Squad — química do squad. Portado do BUT (`chemistry.ts`) com os
// nossos eixos de CS: mesma ORG (+1), mesma REGIÃO (+0.5), mesmo PAÍS (+0.5) por
// aresta; +1 de role-fit por slot; total 0-15 → multiplicador 0.90×..1.10× na
// força de partida. Puro. Ver docs-but-map.md §2.1/§4.

import type { Role } from '../../types';
import type { RegionKey } from '../../data/regions';

export interface ChemNodeCard {
  teamOrigin: string;
  region: RegionKey | 'global';
  country: string;
  role: Role;
  role2?: Role;
}

export interface ChemNode {
  slot: number;
  slotRole: Role;
  card: ChemNodeCard | null;
}

export interface ChemEdge { a: number; b: number; score: number } // score 0..2
export interface ChemResult { perSlot: number[]; edges: ChemEdge[]; total: number; multiplier: number }

// "Rifler" é o coringa (flex) do CS: encaixa em qualquer slot, e qualquer carta
// encaixa num slot de Rifler. role2 também conta.
export function roleFitsSlot(cardRole: Role, slotRole: Role, role2?: Role): boolean {
  return cardRole === slotRole || role2 === slotRole || cardRole === 'Rifler' || slotRole === 'Rifler';
}

function linkScore(a: ChemNodeCard, b: ChemNodeCard): number {
  let s = 0;
  if (a.teamOrigin && a.teamOrigin === b.teamOrigin) s += 1.0;
  if (a.region === b.region) s += 0.5;
  if (a.country === b.country) s += 0.5;
  return s;
}

export function computeChemistry(adjacency: [number, number][], nodes: ChemNode[]): ChemResult {
  const edges: ChemEdge[] = [];
  const linkSum = nodes.map(() => 0);
  for (const [ai, bi] of adjacency) {
    const a = nodes[ai]?.card;
    const b = nodes[bi]?.card;
    if (!a || !b) { edges.push({ a: ai, b: bi, score: 0 }); continue; }
    const sc = linkScore(a, b);
    edges.push({ a: ai, b: bi, score: sc });
    linkSum[ai] += sc;
    linkSum[bi] += sc;
  }
  const perSlot = nodes.map((n, i) => {
    if (!n.card) return 0;
    const roleBonus = roleFitsSlot(n.card.role, n.slotRole, n.card.role2) ? 1 : 0;
    return Math.min(3, linkSum[i] + roleBonus);
  });
  const total = Math.min(15, perSlot.reduce((a, b) => a + b, 0));
  const multiplier = 0.9 + (total / 15) * 0.2;
  return { perSlot, edges, total, multiplier };
}

export function edgeColor(score: number): 'green' | 'yellow' | 'red' {
  return score >= 1.5 ? 'green' : score >= 0.5 ? 'yellow' : 'red';
}

// rótulo curto pra UI (0-15).
export function chemLabel(total: number): { label: string; color: string } {
  if (total >= 13) return { label: 'Perfeita', color: '#5ed88a' };
  if (total >= 9) return { label: 'Ótima', color: '#8fd86f' };
  if (total >= 5) return { label: 'Ok', color: '#e8c170' };
  return { label: 'Fraca', color: '#e58a8a' };
}
