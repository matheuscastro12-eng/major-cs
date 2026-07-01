// Ultimate Squad — formações (5 slots num "pitch") + arestas de química. Porta a
// ideia do BUT/FUT: cada slot tem uma FUNÇÃO designada e posição (x,y 0..1) pra
// desenhar; `adjacency` são os pares de slots que formam links de química.

import type { Role } from '../../types';

export interface FormationSlot { slot: number; role: Role; x: number; y: number }
export interface Formation { id: string; name: string; desc: string; slots: FormationSlot[]; adjacency: [number, number][] }

// posições compartilhadas (pentágono, IGL ancorado embaixo). x cresce →, y cresce ↓.
const POS: { x: number; y: number }[] = [
  { x: 0.50, y: 0.82 }, // 0 (âncora)
  { x: 0.15, y: 0.55 }, // 1
  { x: 0.85, y: 0.55 }, // 2
  { x: 0.32, y: 0.18 }, // 3
  { x: 0.68, y: 0.18 }, // 4
];
const ADJ: [number, number][] = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [0, 3], [0, 4]];

function mk(id: string, name: string, desc: string, roles: Role[]): Formation {
  return { id, name, desc, adjacency: ADJ, slots: roles.map((role, i) => ({ slot: i, role, x: POS[i].x, y: POS[i].y })) };
}

export const FORMATIONS: Formation[] = [
  mk('standard', 'Equilíbrio', 'Setup clássico: IGL, AWP, entrada, suporte e um rifler flex.', ['IGL', 'Support', 'AWP', 'Entry', 'Rifler']),
  mk('aggressive', 'Agressivo', 'Dupla de entrada pra abrir espaço rápido.', ['IGL', 'Entry', 'AWP', 'Entry', 'Rifler']),
  mk('control', 'Controle', 'Lurker + suporte pra jogo de mapa e informação.', ['IGL', 'Support', 'AWP', 'Lurker', 'Rifler']),
];

export const DEFAULT_FORMATION = 'standard';

export function formationById(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];
}

export function formationSlotRoles(id: string): Role[] {
  return formationById(id).slots.map((s) => s.role);
}
