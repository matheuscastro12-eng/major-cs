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
import { MIRAGE_CALLS, MIRAGE_RINGS } from './plans/mirage';

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
  // planta baixa opcional: retângulos de piso [x, y, w, h] (canto superior
  // esquerdo). Quando existe, o radar desenha o piso no lugar dos corredores.
  // Traço próprio que segue o formato dos corredores reais.
  floor?: [number, number, number, number][];
  // planta vetorial fiel ao layout real (protótipo: só a Mirage). Quando existe,
  // o radar desenha a planta no lugar de `floor` e os nós andam pelos
  // corredores dela. rings já no quadro 100×100; calls = nomes das áreas.
  plan?: { rings: number[][]; calls: [string, number, number, number?][] };
  // escala do espalhamento das bolinhas em volta da rota (1 = padrão). Na
  // planta real os corredores são estreitos, então espalha menos.
  jitter?: number;
}

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// Planta real: coordenadas em % do radar (0–100) → quadro 100×100 do SVG,
// recortando a margem vazia do radar (escala uniforme, sem distorcer).
interface RadarFrame { x0: number; y0: number; size: number }
function fromRadar(m: Map2D, f: RadarFrame, rings: number[][], calls: [string, number, number, number?][]): Map2D {
  const k = 100 / f.size;
  const X = (x: number) => Math.round((x - f.x0) * k * 10) / 10;
  const Y = (y: number) => Math.round((y - f.y0) * k * 10) / 10;
  const box = (r: { x: number; y: number; w: number; h: number }) => R(X(r.x), Y(r.y), Math.round(r.w * k * 10) / 10, Math.round(r.h * k * 10) / 10);
  return {
    ...m,
    nodes: Object.fromEntries(Object.entries(m.nodes).map(([n, p]) => [n, { x: X(p.x), y: Y(p.y) }])),
    sites: { A: box(m.sites.A), B: box(m.sites.B) },
    spawns: { t: box(m.spawns.t), ct: box(m.spawns.ct) },
    plan: {
      rings: rings.map((r) => r.map((v, i) => (i % 2 ? Y(v) : X(v)))),
      calls: calls.map(([t, x, y, a]) => [t, X(x), Y(y), a]),
    },
  };
}

const MAPS: Record<MapId, Map2D> = {
  // MIRAGE (protótipo "mapa real"): nós e sites em % do radar, alinhados aos
  // corredores da planta (plans/mirage.ts); toda aresta fica dentro do piso.
  mirage: fromRadar({
    id: 'mirage',
    nodes: {
      tS: { x: 87, y: 36 }, ctS: { x: 30, y: 70 },
      A: { x: 54, y: 74 }, B: { x: 23, y: 28 },
      // TR → A pelo ramp e pelo palace
      tLow: { x: 87, y: 55 }, rampTop: { x: 76, y: 57 }, ramp: { x: 76, y: 64.2 }, aT: { x: 62, y: 64.2 },
      palTop: { x: 89, y: 60.5 }, palIn: { x: 82, y: 61 }, palDown: { x: 82, y: 71.5 }, palace: { x: 75, y: 74 },
      palLow: { x: 72, y: 78 }, palStairs: { x: 64.5, y: 78 }, aPal: { x: 64, y: 75 },
      // TR → B pelo apps
      tTop: { x: 86, y: 23 }, appsIn: { x: 76, y: 21 }, appsUp: { x: 73, y: 17 }, apps: { x: 57, y: 16 },
      appsLow: { x: 56, y: 25 }, bT: { x: 36, y: 25 },
      // meio: top mid, mid, short, connector, jungle, window
      topCol: { x: 68, y: 23 }, top: { x: 68, y: 38 }, mid: { x: 55, y: 45 },
      short: { x: 46, y: 35 }, shortTop: { x: 46, y: 29 }, midConn: { x: 50, y: 47 }, conn: { x: 50, y: 57 },
      jungle: { x: 46, y: 61 }, jN: { x: 39.5, y: 58.5 }, midW: { x: 41, y: 45 }, window: { x: 40.5, y: 50 }, ctMid: { x: 37, y: 54 },
      // CT: market/kitchen até o B, e o CT do A
      ctMk: { x: 31, y: 52 }, mk2: { x: 31, y: 46 }, market: { x: 28, y: 44.5 }, bCT: { x: 24, y: 37 },
      ctLow: { x: 32, y: 77 }, aCT: { x: 47, y: 77.5 },
    },
    edges: [
      ['tS', 'tLow', 6], ['tLow', 'rampTop', 6], ['rampTop', 'ramp', 5], ['ramp', 'aT', 5], ['aT', 'A', 7],
      ['tLow', 'palTop', 4], ['palTop', 'palIn', 4], ['palIn', 'palDown', 3], ['palDown', 'palace', 5],
      ['palace', 'palLow', 5], ['palLow', 'palStairs', 4], ['palStairs', 'aPal', 3], ['aPal', 'A', 6],
      ['tS', 'tTop', 6], ['tTop', 'appsIn', 5], ['appsIn', 'appsUp', 4], ['appsUp', 'apps', 4], ['apps', 'appsLow', 5],
      ['appsLow', 'bT', 5], ['bT', 'B', 7],
      ['appsIn', 'topCol', 5], ['topCol', 'top', 4], ['top', 'mid', 7],
      ['mid', 'short', 5], ['short', 'shortTop', 4], ['shortTop', 'B', 6],
      ['mid', 'midConn', 5], ['midConn', 'conn', 4], ['conn', 'A', 5], ['conn', 'jungle', 4], ['jungle', 'A', 6],
      ['mid', 'midW', 5], ['midW', 'window', 3], ['window', 'ctMid', 4], ['jungle', 'jN', 4], ['jN', 'ctMid', 3], ['ctMid', 'ctMk', 5],
      ['ctS', 'ctMk', 5], ['ctMk', 'mk2', 3], ['mk2', 'market', 4], ['market', 'bCT', 4], ['bCT', 'B', 6],
      ['ctS', 'ctLow', 5], ['ctLow', 'aCT', 5], ['aCT', 'A', 6],
    ],
    sites: { A: R(54, 74.5, 14, 10), B: R(23, 28, 14, 12) },
    spawns: { t: R(87.5, 36, 7, 12), ct: R(28.5, 70, 11, 9) },
    holds: { A: ['jungle', 'aCT'], B: ['bCT', 'market'], mid: ['window'] },
    stage: ['ramp', 'top', 'appsIn', 'palace', 'top'],
    jitter: 0.45,
  }, { x0: 8, y0: 11, size: 86 }, MIRAGE_RINGS, MIRAGE_CALLS),
  inferno: {
    id: 'inferno',
    nodes: {
      tS: { x: 14, y: 84 }, ctS: { x: 76, y: 16 },
      A: { x: 80, y: 58 }, B: { x: 40, y: 16 },
      aT: { x: 66, y: 66 }, apts: { x: 42, y: 50 }, aptsTop: { x: 62, y: 50 }, second: { x: 54, y: 78 },
      aCT: { x: 84, y: 38 }, pit: { x: 90, y: 72 },
      mid: { x: 52, y: 68 }, tMid: { x: 40, y: 78 },
      bT: { x: 30, y: 28 }, banana: { x: 28, y: 46 }, bananaLow: { x: 24, y: 64 },
      bCT: { x: 58, y: 16 }, arch: { x: 70, y: 34 },
    },
    edges: [
      ['tS', 'tMid', 6], ['tMid', 'second', 5], ['second', 'aT', 6], ['tMid', 'apts', 5], ['apts', 'aptsTop', 5], ['aptsTop', 'A', 5], ['aT', 'A', 7],
      ['tMid', 'mid', 6], ['mid', 'aT', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['A', 'pit', 5], ['arch', 'aCT', 5], ['arch', 'bCT', 5],
      ['tS', 'bananaLow', 6], ['bananaLow', 'banana', 6], ['banana', 'bT', 6], ['bT', 'B', 7],
      ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(81, 58, 22, 16), B: R(40, 15, 24, 18) },
    spawns: { t: R(13, 85, 14, 14), ct: R(75, 16, 18, 16) },
    holds: { A: ['aCT', 'pit'], B: ['bCT', 'B'], mid: ['arch'] },
    stage: ['tMid', 'bananaLow', 'apts', 'second', 'banana'],
    floor: [
      [6, 78, 14, 14], [10, 74, 44, 12],   // spawn TR + T ramp
      [18, 52, 10, 24], [22, 24, 12, 30],   // banana
      [28, 6, 24, 18],    // bomb B
      [50, 12, 18, 8], [58, 18, 10, 10],   // CT do B
      [66, 8, 18, 16],    // spawn CT
      [64, 26, 14, 12],   // arco / biblioteca
      [78, 24, 12, 26],   // CT do A
      [70, 50, 22, 16],   // bomb A
      [84, 64, 10, 14],   // pit
      [38, 48, 8, 34],    // subida dos apartamentos
      [44, 46, 28, 8],    // apartamentos → balcão
      [44, 64, 14, 8],    // meio
      [52, 60, 18, 22],   // second mid / A short
    ],
  },
  nuke: {
    id: 'nuke',
    nodes: {
      tS: { x: 12, y: 50 }, ctS: { x: 88, y: 46 }, tOut: { x: 11, y: 14 },
      A: { x: 58, y: 42 }, B: { x: 60, y: 69 },
      aT: { x: 42, y: 42 }, hut: { x: 42, y: 50 }, lobby: { x: 26, y: 47 },
      aCT: { x: 72, y: 36 }, heaven: { x: 61, y: 27 },
      mid: { x: 40, y: 14 }, secret: { x: 76, y: 80 },
      bT: { x: 44, y: 67 }, ramp: { x: 30, y: 62 }, bCT: { x: 76, y: 64 },
      out2: { x: 76, y: 14 },
    },
    edges: [
      ['tS', 'lobby', 7], ['lobby', 'aT', 6], ['aT', 'A', 7], ['lobby', 'hut', 5], ['hut', 'A', 5], ['A', 'heaven', 4],
      ['tS', 'tOut', 6], ['tOut', 'mid', 6], ['mid', 'out2', 7], ['out2', 'ctS', 6], ['out2', 'heaven', 4],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6],
      ['lobby', 'ramp', 6], ['ramp', 'bT', 6], ['bT', 'B', 7],
      ['ctS', 'bCT', 6], ['bCT', 'B', 6], ['out2', 'secret', 5], ['secret', 'B', 5], ['aCT', 'bCT', 4],
    ],
    sites: { A: R(59, 42, 22, 20), B: R(60, 69, 24, 14) },
    spawns: { t: R(11, 50, 14, 20), ct: R(88, 47, 16, 22) },
    holds: { A: ['heaven', 'A'], B: ['B', 'bCT'], mid: ['out2'] },
    stage: ['lobby', 'mid', 'ramp', 'lobby', 'ramp'],
    floor: [
      [4, 40, 14, 20], [4, 8, 14, 34],   // spawn TR + saída pro outside
      [6, 8, 74, 12],     // outside
      [78, 20, 10, 18],   // garagem
      [80, 36, 16, 22],   // spawn CT
      [18, 40, 16, 14],   // lobby
      [34, 36, 14, 18],   // squeaky / hut
      [48, 32, 22, 20],   // bomb A
      [56, 20, 14, 14],   // heaven
      [66, 30, 14, 12],   // CT do A
      [72, 8, 8, 80],     // rampa / secret pelo lado
      [24, 52, 12, 16], [24, 62, 26, 10],   // rampa pro B
      [48, 62, 24, 14],   // bomb B
      [60, 74, 16, 10],   // sala do secret
    ],
  },
  ancient: {
    id: 'ancient',
    nodes: {
      tS: { x: 50, y: 88 }, ctS: { x: 50, y: 12 },
      A: { x: 22, y: 30 }, B: { x: 78, y: 32 },
      aT: { x: 22, y: 54 }, mainA: { x: 26, y: 74 }, donut: { x: 38, y: 42 },
      aCT: { x: 32, y: 14 },
      mid: { x: 50, y: 46 }, tMid: { x: 50, y: 68 }, cave: { x: 63, y: 46 },
      bT: { x: 80, y: 52 }, rampB: { x: 74, y: 74 }, bCT: { x: 68, y: 14 },
    },
    edges: [
      ['tS', 'mainA', 6], ['mainA', 'aT', 6], ['aT', 'A', 7], ['tS', 'tMid', 6], ['tMid', 'mid', 6],
      ['mid', 'donut', 5], ['donut', 'A', 5], ['mid', 'ctS', 5], ['mid', 'cave', 5], ['cave', 'B', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6],
      ['tS', 'rampB', 6], ['rampB', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(23, 31, 26, 26), B: R(79, 31, 26, 26) },
    spawns: { t: R(50, 88, 28, 12), ct: R(50, 14, 20, 12) },
    holds: { A: ['aCT', 'donut'], B: ['bCT', 'cave'], mid: ['mid'] },
    stage: ['mainA', 'tMid', 'rampB', 'mainA', 'rampB'],
    floor: [
      [36, 82, 28, 12],   // spawn TR
      [22, 70, 20, 12], [16, 44, 12, 32],   // A main
      [10, 18, 26, 26],   // bomb A
      [28, 8, 44, 12],    // CT (liga A e B)
      [44, 20, 12, 62],   // meio
      [32, 36, 14, 10],   // donut
      [56, 40, 14, 12],   // caverna
      [66, 18, 26, 26],   // bomb B
      [56, 70, 24, 12], [72, 44, 14, 30],   // rampa / B main
    ],
  },
  anubis: {
    id: 'anubis',
    nodes: {
      tS: { x: 50, y: 88 }, ctS: { x: 50, y: 12 },
      A: { x: 80, y: 28 }, B: { x: 20, y: 28 },
      aT: { x: 80, y: 52 }, mainA: { x: 76, y: 74 }, water: { x: 62, y: 42 },
      aCT: { x: 70, y: 14 },
      mid: { x: 50, y: 50 }, tMid: { x: 50, y: 68 }, bridge: { x: 38, y: 38 },
      bT: { x: 20, y: 52 }, mainB: { x: 24, y: 74 }, bCT: { x: 30, y: 14 },
    },
    edges: [
      ['tS', 'mainA', 6], ['mainA', 'aT', 6], ['aT', 'A', 7], ['tS', 'tMid', 6], ['tMid', 'mid', 6],
      ['mid', 'water', 5], ['water', 'A', 5], ['mid', 'bridge', 5], ['bridge', 'B', 5], ['bridge', 'ctS', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6],
      ['tS', 'mainB', 6], ['mainB', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(81, 29, 26, 26), B: R(21, 29, 26, 26) },
    spawns: { t: R(50, 88, 28, 12), ct: R(50, 14, 20, 12) },
    holds: { A: ['aCT', 'water'], B: ['bCT', 'bridge'], mid: ['bridge'] },
    stage: ['mainA', 'tMid', 'mainB', 'tMid', 'mainB'],
    floor: [
      [36, 82, 28, 12],   // spawn TR
      [58, 70, 22, 12], [72, 40, 14, 34],   // A main
      [68, 16, 26, 26],   // bomb A
      [28, 8, 44, 12],    // CT (liga A e B)
      [44, 30, 12, 52],   // meio
      [54, 36, 14, 12],   // canal / água
      [32, 32, 14, 12], [38, 18, 10, 16],   // ponte → CT
      [8, 16, 26, 26],    // bomb B
      [22, 70, 20, 12], [14, 40, 12, 34],   // B main
    ],
  },
  dust2: {
    id: 'dust2',
    nodes: {
      tS: { x: 46, y: 88 }, ctS: { x: 60, y: 21 },
      A: { x: 81, y: 15 }, B: { x: 20, y: 15 },
      aT: { x: 86, y: 34 }, longA: { x: 86, y: 66 }, longDoors: { x: 66, y: 73 },
      short: { x: 64, y: 33 }, aCT: { x: 70, y: 18 },
      mid: { x: 49, y: 62 }, xbox: { x: 52, y: 38 }, lower: { x: 49, y: 26 },
      bT: { x: 21, y: 33 }, tunnels: { x: 21, y: 56 }, upperTun: { x: 28, y: 80 }, bCT: { x: 40, y: 18 },
    },
    edges: [
      ['tS', 'longDoors', 6], ['longDoors', 'longA', 6], ['longA', 'aT', 7], ['aT', 'A', 7],
      ['tS', 'mid', 6], ['mid', 'xbox', 5], ['xbox', 'short', 5], ['short', 'A', 5], ['xbox', 'lower', 5], ['lower', 'bCT', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['ctS', 'lower', 5],
      ['tS', 'upperTun', 6], ['upperTun', 'tunnels', 6], ['tunnels', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(81, 15, 24, 18), B: R(20, 15, 24, 18) },
    spawns: { t: R(42, 88, 26, 10), ct: R(60, 21, 14, 12) },
    holds: { A: ['A', 'short'], B: ['B', 'bCT'], mid: ['lower'] },
    stage: ['longDoors', 'mid', 'upperTun', 'longDoors', 'upperTun'],
    floor: [
      [29, 83, 26, 10],   // spawn TR
      [55, 76, 9, 6], [60, 68, 12, 10],   // saída pro long + portas
      [72, 60, 22, 16],   // pit / fim do long
      [80, 24, 12, 38],   // long A
      [69, 6, 24, 20],    // bomb A
      [53, 15, 15, 12],   // spawn CT
      [58, 24, 13, 15],   // short / catwalk
      [45, 34, 13, 8],    // top mid / xbox
      [45, 42, 9, 41],    // meio
      [32, 32, 14, 8],    // lower túnel
      [45, 22, 8, 14],    // CT mid
      [32, 14, 21, 8],    // portas do B → CT
      [8, 6, 24, 18],     // bomb B
      [16, 24, 10, 16],   // saída do túnel no B
      [16, 40, 10, 32],   // túnel superior
      [16, 70, 14, 8], [24, 74, 10, 12],   // entrada do túnel desde o TR
    ],
  },
  train: {
    id: 'train',
    nodes: {
      tS: { x: 12, y: 66 }, ctS: { x: 86, y: 36 }, tIvy: { x: 11, y: 22 },
      A: { x: 56, y: 44 }, B: { x: 62, y: 78 },
      aT: { x: 40, y: 48 }, ivy: { x: 26, y: 22 }, mainA: { x: 28, y: 49 },
      aCT: { x: 72, y: 40 }, conn: { x: 58, y: 24 },
      mid: { x: 42, y: 64 }, pop: { x: 54, y: 60 },
      bT: { x: 44, y: 82 }, lowerB: { x: 28, y: 82 }, bCT: { x: 78, y: 70 },
    },
    edges: [
      ['tS', 'mainA', 6], ['mainA', 'aT', 6], ['aT', 'A', 7], ['tS', 'tIvy', 5], ['tIvy', 'ivy', 5], ['ivy', 'conn', 5], ['conn', 'A', 5], ['conn', 'ctS', 5],
      ['ctS', 'aCT', 6], ['aCT', 'A', 6], ['tS', 'mid', 5], ['mid', 'pop', 5], ['pop', 'A', 5], ['pop', 'B', 5],
      ['tS', 'lowerB', 6], ['lowerB', 'bT', 6], ['bT', 'B', 7], ['ctS', 'bCT', 6], ['bCT', 'B', 6],
    ],
    sites: { A: R(57, 44, 26, 20), B: R(63, 77, 22, 14) },
    spawns: { t: R(12, 66, 16, 20), ct: R(85, 37, 18, 22) },
    holds: { A: ['aCT', 'conn'], B: ['bCT', 'B'], mid: ['pop'] },
    stage: ['mainA', 'ivy', 'lowerB', 'mid', 'lowerB'],
    floor: [
      [4, 56, 16, 20], [6, 18, 10, 40],   // spawn TR + subida pro ivy
      [6, 18, 24, 10], [24, 16, 40, 12],   // ivy
      [52, 26, 10, 10], [60, 20, 18, 12],   // conector → CT
      [76, 26, 18, 22],   // spawn CT
      [68, 34, 10, 10],   // CT do A
      [18, 44, 26, 10], [18, 52, 8, 8],   // A main
      [44, 34, 26, 20],   // bomb A (trens)
      [18, 60, 28, 8],    // meio
      [44, 52, 16, 14], [54, 64, 8, 8],   // pop dog
      [16, 74, 38, 14],   // lower / B main
      [52, 70, 22, 14],   // bomb B
      [74, 44, 12, 30],   // CT do B
    ],
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
