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
import { NUKE_CALLS, NUKE_RINGS } from './plans/nuke';
import { INFERNO_CALLS, INFERNO_RINGS } from './plans/inferno';
import { DUST2_CALLS, DUST2_RINGS } from './plans/dust2';

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
  inferno: fromRadar({
    id: 'inferno',
    nodes: { tS: { x: 10, y: 68 }, ctS: { x: 89, y: 35 }, A: { x: 81, y: 68 }, B: { x: 49, y: 21 }, tRamp: { x: 20, y: 66 }, tMid: { x: 30, y: 66 }, mid: { x: 55, y: 65 }, second: { x: 68, y: 71 }, aT: { x: 74, y: 76 }, banLow: { x: 40, y: 60 }, banana: { x: 44, y: 50 }, banTop: { x: 50, y: 38 }, bT: { x: 56.5, y: 30 }, bCar: { x: 50, y: 14 }, aptsIn: { x: 24, y: 78 }, apts: { x: 45, y: 78 }, balcony: { x: 66, y: 76 }, library: { x: 80, y: 40 }, arch: { x: 77, y: 48 }, aCT: { x: 89, y: 49 }, pit: { x: 88, y: 80 }, ctB: { x: 78, y: 20 }, bCT: { x: 66, y: 21 }, tS_tRamp1: { x: 15.1, y: 73.1 }, tS_tRamp2: { x: 19.4, y: 66.4 }, tMid_mid1: { x: 36.4, y: 60.4 }, tMid_mid2: { x: 54.9, y: 65.4 }, mid_second1: { x: 68.9, y: 69.1 }, aT_A1: { x: 81.1, y: 71.6 }, tMid_banLow1: { x: 36.4, y: 60.4 }, banLow_banana1: { x: 43.9, y: 57.4 }, banTop_bT1: { x: 56.9, y: 32.9 }, tS_aptsIn1: { x: 13.1, y: 79.9 }, tS_aptsIn2: { x: 17.1, y: 81.4 }, tS_aptsIn3: { x: 20.6, y: 84.6 }, balcony_A1: { x: 68.6, y: 73.9 }, balcony_A2: { x: 80.1, y: 74.6 }, ctS_library1: { x: 82.1, y: 41.1 }, arch_A1: { x: 79.9, y: 54.6 }, arch_A2: { x: 87.1, y: 58.6 }, arch_A3: { x: 81.4, y: 68.1 }, aCT_A1: { x: 92.4, y: 52.6 }, aCT_A2: { x: 87.4, y: 59.1 }, bCT_B1: { x: 52.1, y: 23.4 } },
    edges: [['tS', 'tS_tRamp1'], ['tS_tRamp1', 'tS_tRamp2'], ['tS_tRamp2', 'tRamp'], ['tRamp', 'tMid'], ['tMid', 'tMid_mid1'], ['tMid_mid1', 'tMid_mid2'], ['tMid_mid2', 'mid'], ['mid', 'mid_second1'], ['mid_second1', 'second'], ['second', 'aT'], ['aT', 'aT_A1'], ['aT_A1', 'A'], ['tMid', 'tMid_banLow1'], ['tMid_banLow1', 'banLow'], ['banLow', 'banLow_banana1'], ['banLow_banana1', 'banana'], ['banana', 'banTop'], ['banTop', 'banTop_bT1'], ['banTop_bT1', 'bT'], ['bT', 'B'], ['B', 'bCar'], ['tS', 'tS_aptsIn1'], ['tS_aptsIn1', 'tS_aptsIn2'], ['tS_aptsIn2', 'tS_aptsIn3'], ['tS_aptsIn3', 'aptsIn'], ['aptsIn', 'apts'], ['apts', 'balcony'], ['balcony', 'balcony_A1'], ['balcony_A1', 'balcony_A2'], ['balcony_A2', 'A'], ['ctS', 'ctS_library1'], ['ctS_library1', 'library'], ['library', 'arch'], ['arch', 'arch_A1'], ['arch_A1', 'arch_A2'], ['arch_A2', 'arch_A3'], ['arch_A3', 'A'], ['ctS', 'aCT'], ['aCT', 'aCT_A1'], ['aCT_A1', 'aCT_A2'], ['aCT_A2', 'A'], ['A', 'pit'], ['ctS', 'ctB'], ['ctB', 'bCT'], ['bCT', 'bCT_B1'], ['bCT_B1', 'B']],
    sites: { A: R(81, 68, 14, 10), B: R(49, 21, 13, 11) },
    spawns: { t: R(10, 68, 7, 14), ct: R(89, 35, 6, 12) },
    holds: { A: ['pit', 'aCT'], B: ['bCT', 'bCar'], mid: ['arch'] },
    stage: ['tMid', 'banLow', 'apts', 'second', 'banLow'],
    jitter: 0.45,
  }, { x0: 3, y0: -1, size: 95.8 }, INFERNO_RINGS, INFERNO_CALLS),
  nuke: fromRadar({
    id: 'nuke',
    nodes: { tS: { x: 17, y: 53 }, tOut: { x: 33, y: 55 }, lobby: { x: 40, y: 52 }, aT: { x: 47, y: 53 }, A: { x: 57, y: 49 }, bT: { x: 50, y: 57 }, B: { x: 57, y: 58 }, mid: { x: 57, y: 67 }, silo: { x: 47, y: 64 }, secret: { x: 71, y: 67 }, ctS: { x: 82, y: 46 }, aCT: { x: 66, y: 46 }, bCT: { x: 65, y: 58 }, garage: { x: 93, y: 51 }, heaven: { x: 55, y: 36 }, tS_tOut1: { x: 28.4, y: 56.9 }, lobby_aT1: { x: 41.6, y: 49.9 }, lobby_aT2: { x: 44.1, y: 54.1 }, lobby_aT3: { x: 45.6, y: 54.1 }, aT_A1: { x: 46.9, y: 46.6 }, lobby_bT1: { x: 41.6, y: 49.9 }, lobby_bT2: { x: 44.4, y: 54.4 }, lobby_bT3: { x: 49.6, y: 57.6 }, bT_B1: { x: 47.4, y: 56.9 }, bT_B2: { x: 50.6, y: 53.6 }, bT_B3: { x: 56.6, y: 51.9 }, secret_B1: { x: 64.4, y: 46.1 }, secret_B2: { x: 58.4, y: 49.1 }, ctS_aCT1: { x: 66.4, y: 46.4 }, ctS_garage1: { x: 93.1, y: 50.1 }, ctS_bCT1: { x: 70.6, y: 51.1 }, bCT_B1: { x: 65.1, y: 46.1 }, bCT_B2: { x: 58.4, y: 48.9 }, A_heaven1: { x: 50.4, y: 43.9 }, A_heaven2: { x: 52.1, y: 39.1 } },
    edges: [['tS', 'tS_tOut1'], ['tS_tOut1', 'tOut'], ['tOut', 'lobby'], ['lobby', 'lobby_aT1'], ['lobby_aT1', 'lobby_aT2'], ['lobby_aT2', 'lobby_aT3'], ['lobby_aT3', 'aT'], ['aT', 'aT_A1'], ['aT_A1', 'A'], ['lobby', 'lobby_bT1'], ['lobby_bT1', 'lobby_bT2'], ['lobby_bT2', 'lobby_bT3'], ['lobby_bT3', 'bT'], ['bT', 'bT_B1'], ['bT_B1', 'bT_B2'], ['bT_B2', 'bT_B3'], ['bT_B3', 'B'], ['tOut', 'silo'], ['silo', 'mid'], ['mid', 'secret'], ['secret', 'secret_B1'], ['secret_B1', 'secret_B2'], ['secret_B2', 'B'], ['ctS', 'ctS_aCT1'], ['ctS_aCT1', 'aCT'], ['aCT', 'A'], ['ctS', 'ctS_garage1'], ['ctS_garage1', 'garage'], ['ctS', 'ctS_bCT1'], ['ctS_bCT1', 'bCT'], ['bCT', 'bCT_B1'], ['bCT_B1', 'bCT_B2'], ['bCT_B2', 'B'], ['bCT', 'secret'], ['A', 'A_heaven1'], ['A_heaven1', 'A_heaven2'], ['A_heaven2', 'heaven']],
    sites: { A: R(57, 49, 8, 6), B: R(57, 58, 8, 6) },
    spawns: { t: R(17, 53, 8, 5), ct: R(82, 46, 8, 5) },
    holds: { A: ['aCT', 'heaven'], B: ['bCT', 'secret'], mid: ['garage'] },
    stage: ['lobby', 'mid', 'lobby', 'tOut', 'mid'],
    jitter: 0.45,
  }, { x0: 2.4, y0: -0.2, size: 99.1 }, NUKE_RINGS, NUKE_CALLS),
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
  dust2: fromRadar({
    id: 'dust2',
    nodes: { tS: { x: 39, y: 89 }, ctS: { x: 61, y: 21 }, A: { x: 79, y: 17 }, B: { x: 19, y: 15 }, outsideLong: { x: 64, y: 74 }, longDoors: { x: 68.5, y: 58 }, longA: { x: 86, y: 57 }, aT: { x: 87, y: 32 }, tMid: { x: 44.5, y: 72 }, mid: { x: 47, y: 52 }, xbox: { x: 47, y: 40 }, ctMid: { x: 47, y: 28 }, cat: { x: 57, y: 41 }, short: { x: 63, y: 33 }, aShort: { x: 69, y: 22 }, aCT: { x: 72, y: 21 }, outsideTun: { x: 17, y: 70 }, upperTun: { x: 15, y: 45 }, bT: { x: 11, y: 33 }, lowerTun: { x: 34, y: 40 }, bCT: { x: 30, y: 20 }, aCar: { x: 84, y: 22 }, bBack: { x: 12, y: 10 }, tS_outsideLong1: { x: 60.4, y: 80.4 }, outsideLong_longDoors1: { x: 69.4, y: 58.9 }, longDoors_longA1: { x: 73.1, y: 51.6 }, tS_tMid1: { x: 45.9, y: 83.6 }, cat_short1: { x: 63.1, y: 34.6 }, short_aShort1: { x: 68.1, y: 22.6 }, tS_outsideTun1: { x: 19.6, y: 76.4 }, outsideTun_upperTun1: { x: 16.6, y: 46.9 }, upperTun_bT1: { x: 10.9, y: 37.1 }, upperTun_lowerTun1: { x: 30.4, y: 43.1 }, lowerTun_mid1: { x: 45.9, y: 41.9 } },
    edges: [['tS', 'tS_outsideLong1'], ['tS_outsideLong1', 'outsideLong'], ['outsideLong', 'outsideLong_longDoors1'], ['outsideLong_longDoors1', 'longDoors'], ['longDoors', 'longDoors_longA1'], ['longDoors_longA1', 'longA'], ['longA', 'aT'], ['aT', 'A'], ['tS', 'tS_tMid1'], ['tS_tMid1', 'tMid'], ['tMid', 'mid'], ['mid', 'xbox'], ['xbox', 'ctMid'], ['ctMid', 'ctS'], ['xbox', 'cat'], ['cat', 'cat_short1'], ['cat_short1', 'short'], ['short', 'short_aShort1'], ['short_aShort1', 'aShort'], ['aShort', 'A'], ['ctS', 'aCT'], ['aCT', 'A'], ['ctMid', 'bCT'], ['bCT', 'B'], ['tS', 'tS_outsideTun1'], ['tS_outsideTun1', 'outsideTun'], ['outsideTun', 'outsideTun_upperTun1'], ['outsideTun_upperTun1', 'upperTun'], ['upperTun', 'upperTun_bT1'], ['upperTun_bT1', 'bT'], ['bT', 'B'], ['upperTun', 'upperTun_lowerTun1'], ['upperTun_lowerTun1', 'lowerTun'], ['lowerTun', 'lowerTun_mid1'], ['lowerTun_mid1', 'mid'], ['A', 'aCar'], ['B', 'bBack']],
    sites: { A: R(79, 16, 14, 10), B: R(19, 14, 14, 12) },
    spawns: { t: R(39, 89, 18, 7), ct: R(61, 20, 10, 9) },
    holds: { A: ['aCT', 'aCar'], B: ['bCT', 'bBack'], mid: ['ctMid'] },
    stage: ['outsideLong', 'tMid', 'outsideTun', 'outsideLong', 'outsideTun'],
    jitter: 0.45,
  }, { x0: -2.3, y0: -4.7, size: 104.8 }, DUST2_RINGS, DUST2_CALLS),
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
