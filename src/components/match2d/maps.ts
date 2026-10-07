// MINIMAPAS ESTILIZADOS do radar 2D da partida (Road to Major).
//
// Desenho PRÓPRIO, sem nenhum asset da Valve: cada mapa é um grafo de
// corredores (nós + arestas) num quadro 100×100, com os dois bomb sites e os
// dois spawns como salas. As bolinhas andam SOBRE as arestas (caminho mais
// curto no grafo), então o movimento fica plausível sem precisar de máscara de
// pixel. A forma é uma leitura livre do layout de cada mapa do pool — lados,
// sites e rotas nos lugares certos, traço simplificado.
//
// Convenção dos nós obrigatórios:
//   tS / ctS  spawns          A / B   centro dos bomb sites
//   aT / bT   entrada do T no site    aCT / bCT  entrada do CT no site
//   mid       meio do mapa

import type { MapId } from '../../types';

export interface Pt { x: number; y: number }

export interface Map2D {
  id: MapId;
  nodes: Record<string, Pt>;
  edges: [string, string, number?][];   // [a, b, largura do corredor]
  sites: { A: { x: number; y: number; w: number; h: number }; B: { x: number; y: number; w: number; h: number } };
  spawns: { t: { x: number; y: number; w: number; h: number }; ct: { x: number; y: number; w: number; h: number } };
  // onde o CT segura no setup padrão (2 no A, 1 no meio, 2 no B)
  holds: { A: string[]; B: string[]; mid: string[] };
  // onde o T espera antes de decidir (default)
  stage: string[];
}

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

const MAPS: Record<MapId, Map2D> = {
  mirage: {
    id: 'mirage',
    nodes: {
      tS: { x: 86, y: 64 }, ctS: { x: 18, y: 46 },
      A: { x: 30, y: 76 }, B: { x: 18, y: 18 },
      aT: { x: 50, y: 80 }, ramp: { x: 66, y: 74 }, palace: { x: 60, y: 88 },
      aCT: { x: 20, y: 62 }, jungle: { x: 36, y: 60 },
      mid: { x: 52, y: 46 }, top: { x: 72, y: 46 }, conn: { x: 40, y: 50 },
      bT: { x: 34, y: 14 }, apps: { x: 56, y: 16 }, appsIn: { x: 74, y: 26 },
      bCT: { x: 20, y: 32 }, market: { x: 26, y: 38 }, short: { x: 38, y: 28 },
    },
    edges: [
      ['tS', 'ramp', 7], ['ramp', 'aT', 6], ['tS', 'palace', 5], ['palace', 'aT', 5], ['aT', 'A', 8],
      ['tS', 'top', 6], ['top', 'mid', 7], ['mid', 'conn', 5], ['conn', 'jungle', 5], ['jungle', 'A', 6],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['aCT', 'jungle', 4],
      ['tS', 'appsIn', 6], ['appsIn', 'apps', 6], ['apps', 'bT', 6], ['bT', 'B', 7],
      ['ctS', 'bCT', 6], ['bCT', 'B', 6], ['mid', 'short', 4], ['short', 'B', 5], ['ctS', 'market', 4], ['market', 'B', 5],
    ],
    sites: { A: R(30, 76, 20, 16), B: R(18, 18, 18, 16) },
    spawns: { t: R(86, 64, 12, 16), ct: R(18, 46, 12, 12) },
    holds: { A: ['jungle', 'aCT'], B: ['bCT', 'market'], mid: ['conn'] },
    stage: ['ramp', 'top', 'appsIn', 'palace', 'top'],
  },
  inferno: {
    id: 'inferno',
    nodes: {
      tS: { x: 16, y: 82 }, ctS: { x: 80, y: 22 },
      A: { x: 78, y: 62 }, B: { x: 46, y: 18 },
      aT: { x: 62, y: 70 }, apts: { x: 50, y: 64 }, second: { x: 46, y: 78 },
      aCT: { x: 82, y: 42 }, pit: { x: 88, y: 70 },
      mid: { x: 52, y: 52 }, tMid: { x: 34, y: 66 },
      bT: { x: 46, y: 34 }, banana: { x: 40, y: 48 }, bananaLow: { x: 32, y: 60 },
      bCT: { x: 64, y: 20 }, arch: { x: 70, y: 40 },
    },
    edges: [
      ['tS', 'tMid', 6], ['tMid', 'second', 5], ['second', 'aT', 6], ['tMid', 'apts', 5], ['apts', 'aT', 5], ['aT', 'A', 7],
      ['tMid', 'mid', 6], ['mid', 'aT', 5], ['mid', 'arch', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['A', 'pit', 5], ['arch', 'aCT', 5], ['arch', 'bCT', 5],
      ['tS', 'bananaLow', 6], ['bananaLow', 'banana', 6], ['banana', 'bT', 6], ['bT', 'B', 7],
      ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(78, 62, 18, 16), B: R(46, 18, 20, 16) },
    spawns: { t: R(16, 82, 14, 12), ct: R(80, 22, 12, 12) },
    holds: { A: ['aCT', 'pit'], B: ['bCT', 'B'], mid: ['arch'] },
    stage: ['tMid', 'bananaLow', 'apts', 'second', 'banana'],
  },
  nuke: {
    id: 'nuke',
    nodes: {
      tS: { x: 12, y: 50 }, ctS: { x: 86, y: 50 },
      A: { x: 58, y: 40 }, B: { x: 60, y: 66 },
      aT: { x: 42, y: 36 }, hut: { x: 46, y: 46 }, lobby: { x: 30, y: 40 },
      aCT: { x: 72, y: 34 }, heaven: { x: 60, y: 26 },
      mid: { x: 40, y: 18 }, secret: { x: 74, y: 84 },
      bT: { x: 44, y: 66 }, ramp: { x: 30, y: 60 }, bCT: { x: 74, y: 62 },
      out2: { x: 72, y: 16 },
    },
    edges: [
      ['tS', 'lobby', 7], ['lobby', 'aT', 6], ['aT', 'A', 7], ['lobby', 'hut', 5], ['hut', 'A', 5], ['A', 'heaven', 4],
      ['tS', 'mid', 6], ['mid', 'out2', 7], ['out2', 'ctS', 6], ['out2', 'heaven', 4],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6],
      ['lobby', 'ramp', 6], ['ramp', 'bT', 6], ['bT', 'B', 7],
      ['ctS', 'bCT', 6], ['bCT', 'B', 6], ['out2', 'secret', 5], ['secret', 'B', 5], ['aCT', 'bCT', 4],
    ],
    sites: { A: R(58, 40, 18, 14), B: R(60, 66, 18, 14) },
    spawns: { t: R(12, 50, 12, 16), ct: R(86, 50, 12, 16) },
    holds: { A: ['heaven', 'A'], B: ['B', 'bCT'], mid: ['out2'] },
    stage: ['lobby', 'mid', 'ramp', 'lobby', 'ramp'],
  },
  ancient: {
    id: 'ancient',
    nodes: {
      tS: { x: 50, y: 88 }, ctS: { x: 50, y: 12 },
      A: { x: 22, y: 30 }, B: { x: 80, y: 34 },
      aT: { x: 24, y: 50 }, mainA: { x: 28, y: 68 }, donut: { x: 40, y: 44 },
      aCT: { x: 30, y: 18 },
      mid: { x: 50, y: 48 }, tMid: { x: 50, y: 66 }, cave: { x: 66, y: 50 },
      bT: { x: 78, y: 54 }, rampB: { x: 72, y: 70 }, bCT: { x: 70, y: 20 },
    },
    edges: [
      ['tS', 'mainA', 6], ['mainA', 'aT', 6], ['aT', 'A', 7], ['tS', 'tMid', 6], ['tMid', 'mid', 6],
      ['mid', 'donut', 5], ['donut', 'A', 5], ['mid', 'ctS', 5], ['mid', 'cave', 5], ['cave', 'B', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6],
      ['tS', 'rampB', 6], ['rampB', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(22, 30, 18, 16), B: R(80, 34, 18, 16) },
    spawns: { t: R(50, 88, 16, 10), ct: R(50, 12, 16, 10) },
    holds: { A: ['aCT', 'donut'], B: ['bCT', 'cave'], mid: ['mid'] },
    stage: ['mainA', 'tMid', 'rampB', 'mainA', 'rampB'],
  },
  anubis: {
    id: 'anubis',
    nodes: {
      tS: { x: 50, y: 88 }, ctS: { x: 50, y: 12 },
      A: { x: 80, y: 28 }, B: { x: 20, y: 28 },
      aT: { x: 80, y: 50 }, mainA: { x: 76, y: 68 }, water: { x: 60, y: 44 },
      aCT: { x: 70, y: 16 },
      mid: { x: 50, y: 50 }, tMid: { x: 50, y: 68 }, bridge: { x: 40, y: 38 },
      bT: { x: 20, y: 50 }, mainB: { x: 26, y: 70 }, bCT: { x: 30, y: 16 },
    },
    edges: [
      ['tS', 'mainA', 6], ['mainA', 'aT', 6], ['aT', 'A', 7], ['tS', 'tMid', 6], ['tMid', 'mid', 6],
      ['mid', 'water', 5], ['water', 'A', 5], ['mid', 'bridge', 5], ['bridge', 'B', 5], ['bridge', 'ctS', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6],
      ['tS', 'mainB', 6], ['mainB', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(80, 28, 18, 16), B: R(20, 28, 18, 16) },
    spawns: { t: R(50, 88, 16, 10), ct: R(50, 12, 16, 10) },
    holds: { A: ['aCT', 'water'], B: ['bCT', 'bridge'], mid: ['bridge'] },
    stage: ['mainA', 'tMid', 'mainB', 'tMid', 'mainB'],
  },
  dust2: {
    id: 'dust2',
    nodes: {
      tS: { x: 40, y: 88 }, ctS: { x: 62, y: 22 },
      A: { x: 82, y: 18 }, B: { x: 18, y: 16 },
      aT: { x: 82, y: 40 }, longA: { x: 82, y: 66 }, longDoors: { x: 64, y: 70 },
      short: { x: 66, y: 36 }, aCT: { x: 70, y: 18 },
      mid: { x: 50, y: 50 }, xbox: { x: 52, y: 38 }, lower: { x: 44, y: 32 },
      bT: { x: 20, y: 38 }, tunnels: { x: 22, y: 60 }, upperTun: { x: 34, y: 72 }, bCT: { x: 34, y: 18 },
    },
    edges: [
      ['tS', 'longDoors', 6], ['longDoors', 'longA', 6], ['longA', 'aT', 7], ['aT', 'A', 7],
      ['tS', 'mid', 6], ['mid', 'xbox', 5], ['xbox', 'short', 5], ['short', 'A', 5], ['xbox', 'lower', 5], ['lower', 'bCT', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['ctS', 'lower', 5],
      ['tS', 'upperTun', 6], ['upperTun', 'tunnels', 6], ['tunnels', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(82, 18, 18, 16), B: R(18, 16, 20, 16) },
    spawns: { t: R(40, 88, 18, 10), ct: R(62, 22, 12, 10) },
    holds: { A: ['A', 'short'], B: ['B', 'bCT'], mid: ['lower'] },
    stage: ['longDoors', 'mid', 'upperTun', 'longDoors', 'upperTun'],
  },
  train: {
    id: 'train',
    nodes: {
      tS: { x: 14, y: 70 }, ctS: { x: 86, y: 34 },
      A: { x: 56, y: 44 }, B: { x: 60, y: 76 },
      aT: { x: 40, y: 44 }, ivy: { x: 30, y: 26 }, mainA: { x: 28, y: 50 },
      aCT: { x: 70, y: 40 }, conn: { x: 58, y: 24 },
      mid: { x: 44, y: 62 }, pop: { x: 56, y: 60 },
      bT: { x: 44, y: 80 }, lowerB: { x: 28, y: 84 }, bCT: { x: 76, y: 70 },
    },
    edges: [
      ['tS', 'mainA', 6], ['mainA', 'aT', 6], ['aT', 'A', 7], ['tS', 'ivy', 5], ['ivy', 'conn', 5], ['conn', 'A', 5], ['conn', 'ctS', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['tS', 'mid', 5], ['mid', 'pop', 5], ['pop', 'A', 5], ['pop', 'B', 5],
      ['tS', 'lowerB', 6], ['lowerB', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(56, 44, 20, 14), B: R(60, 76, 18, 12) },
    spawns: { t: R(14, 70, 12, 16), ct: R(86, 34, 12, 16) },
    holds: { A: ['aCT', 'conn'], B: ['bCT', 'B'], mid: ['pop'] },
    stage: ['mainA', 'ivy', 'lowerB', 'mid', 'lowerB'],
  },
};

export function map2dOf(map: MapId | string): Map2D {
  return MAPS[map as MapId] ?? MAPS.mirage;
}

export const MAP2D_IDS = Object.keys(MAPS) as MapId[];

// caminho mais curto (Dijkstra simples; grafos de ~16 nós)
const pathCache = new Map<string, string[]>();
export function pathBetween(m: Map2D, from: string, to: string): string[] {
  const key = `${m.id}:${from}>${to}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const dist: Record<string, number> = {};
  const prev: Record<string, string | undefined> = {};
  const todo = new Set(Object.keys(m.nodes));
  for (const k of todo) dist[k] = Infinity;
  dist[from] = 0;
  while (todo.size) {
    let u = '';
    let best = Infinity;
    for (const k of todo) if (dist[k] < best) { best = dist[k]; u = k; }
    if (!u || u === to) break;
    todo.delete(u);
    for (const [a, b] of m.edges) {
      const v = a === u ? b : b === u ? a : null;
      if (!v || !todo.has(v)) continue;
      const d = best + Math.hypot(m.nodes[u].x - m.nodes[v].x, m.nodes[u].y - m.nodes[v].y);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  const out: string[] = [];
  for (let c: string | undefined = to; c; c = prev[c]) { out.unshift(c); if (c === from) break; }
  const res = out[0] === from ? out : [from, to];
  pathCache.set(key, res);
  return res;
}
