// Grafo de waypoints do B da Nuke: os nós nomeados do radar 2D (ramp, bT, B,
// bCT, secret) + pontos de cobertura gerados nos cantos dos `floor` rects e em
// volta das caixas. Arestas ligam pares com linha livre (com folga do corpo).
// A* puro.
import { map2dOf } from '../../components/match2d/maps';
import { CRATES, type Level, type Rect, toWorld, lineClear, solidAt, BODY_R, GRID_W, GRID_H, ORIGIN } from './level';

export const NAMED = ['ramp', 'bT', 'B', 'bCT', 'secret'] as const;
export type NamedNode = (typeof NAMED)[number];

export interface NavNode { id: number; name: string; x: number; z: number; cover: boolean }
export interface NavGraph { nodes: NavNode[]; adj: { to: number; cost: number }[][] }

const MAX_EDGE_M = 14;

function clearWide(l: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz) || 1;
  const ox = (-dz / d) * BODY_R, oz = (dx / d) * BODY_R;
  return lineClear(l, ax, az, bx, bz) && lineClear(l, ax + ox, az + oz, bx + ox, bz + oz) && lineClear(l, ax - ox, az - oz, bx - ox, bz - oz);
}

function freeSpot(l: Level, x: number, z: number): boolean {
  const r = BODY_R + 0.15;
  return !solidAt(l, x, z) && !solidAt(l, x - r, z - r) && !solidAt(l, x + r, z - r) && !solidAt(l, x - r, z + r) && !solidAt(l, x + r, z + r);
}

export function buildNavGraph(l: Level): NavGraph {
  const m = map2dOf('nuke');
  const nodes: NavNode[] = [];
  const add = (name: string, mx: number, my: number, cover: boolean) => {
    const w = toWorld(mx, my);
    if (!freeSpot(l, w.x, w.z)) return;
    if (nodes.some((n) => Math.hypot(n.x - w.x, n.z - w.z) < 1.2)) return;
    nodes.push({ id: nodes.length, name, x: w.x, z: w.z, cover });
  };
  for (const n of NAMED) add(n, m.nodes[n].x, m.nodes[n].y, false);
  const inGrid = (x: number, y: number) => x > ORIGIN.x && y > ORIGIN.y && x < ORIGIN.x + GRID_W && y < ORIGIN.y + GRID_H;
  for (const r of (m.floor ?? []) as Rect[]) {
    const x0 = Math.max(r[0], ORIGIN.x + 1), y0 = Math.max(r[1], ORIGIN.y + 1);
    const x1 = r[0] + r[2], y1 = r[1] + r[3];
    if (x1 <= x0 || y1 <= y0) continue;
    for (const [cx, cy] of [[x0 + 1.5, y0 + 1.5], [x1 - 1.5, y0 + 1.5], [x0 + 1.5, y1 - 1.5], [x1 - 1.5, y1 - 1.5]]) {
      if (inGrid(cx, cy)) add('cover', cx, cy, true);
    }
  }
  for (const c of CRATES) {
    for (const [cx, cy] of [[c[0] - 1.2, c[1] + c[3] / 2], [c[0] + c[2] + 1.2, c[1] + c[3] / 2], [c[0] + c[2] / 2, c[1] - 1.2], [c[0] + c[2] / 2, c[1] + c[3] + 1.2]]) {
      add('cover', cx, cy, true);
    }
  }
  const adj: NavGraph['adj'] = nodes.map(() => []);
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      if (d > MAX_EDGE_M) continue;
      if (!clearWide(l, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z)) continue;
      adj[a].push({ to: b, cost: d });
      adj[b].push({ to: a, cost: d });
    }
  }
  return { nodes, adj };
}

export function nodeByName(g: NavGraph, name: NamedNode): NavNode {
  const n = g.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`nav node ausente: ${name}`);
  return n;
}

/** nó mais próximo com linha livre até o ponto (cai para o mais próximo se nenhum) */
export function nearestNode(g: NavGraph, l: Level, x: number, z: number): number {
  let best = -1, bestD = Infinity, any = 0, anyD = Infinity;
  for (const n of g.nodes) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < anyD) { anyD = d; any = n.id; }
    if (d < bestD && clearWide(l, x, z, n.x, n.z)) { bestD = d; best = n.id; }
  }
  return best >= 0 ? best : any;
}

/** A*: lista de ids de nós de `from` até `to` (inclusive); [] se não houver caminho */
export function aStar(g: NavGraph, from: number, to: number): number[] {
  if (from === to) return [from];
  const n = g.nodes.length;
  const gs = new Float64Array(n).fill(Infinity);
  const fs = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const open = new Set<number>([from]);
  const closed = new Uint8Array(n);
  const h = (i: number) => Math.hypot(g.nodes[i].x - g.nodes[to].x, g.nodes[i].z - g.nodes[to].z);
  gs[from] = 0; fs[from] = h(from);
  while (open.size) {
    let cur = -1, cf = Infinity;
    for (const o of open) if (fs[o] < cf || (fs[o] === cf && o < cur)) { cf = fs[o]; cur = o; }
    if (cur === to) {
      const path = [cur];
      while (prev[path[0]] >= 0) path.unshift(prev[path[0]]);
      return path;
    }
    open.delete(cur);
    closed[cur] = 1;
    for (const e of g.adj[cur]) {
      if (closed[e.to]) continue;
      const t = gs[cur] + e.cost;
      if (t < gs[e.to]) {
        gs[e.to] = t; fs[e.to] = t + h(e.to); prev[e.to] = cur;
        open.add(e.to);
      }
    }
  }
  return [];
}

/** caminho de um ponto a outro no mundo: waypoints intermediários + destino */
export function planPath(g: NavGraph, l: Level, fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  if (clearWide(l, fx, fz, tx, tz)) return [{ x: tx, z: tz }];
  const ids = aStar(g, nearestNode(g, l, fx, fz), nearestNode(g, l, tx, tz));
  const pts = ids.map((i) => ({ x: g.nodes[i].x, z: g.nodes[i].z }));
  pts.push({ x: tx, z: tz });
  return pts;
}
