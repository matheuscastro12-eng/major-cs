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
import { TRAIN_CALLS, TRAIN_RINGS } from './plans/train';
import { ANUBIS_CALLS, ANUBIS_RINGS } from './plans/anubis';
import { ANCIENT_CALLS, ANCIENT_RINGS } from './plans/ancient';
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
  ancient: fromRadar({
    id: 'ancient',
    nodes: { tS: { x: 48, y: 86 }, tLow: { x: 48, y: 76 }, tMid: { x: 46, y: 58 }, mid: { x: 47, y: 48 }, ctMid: { x: 47.4, y: 30 }, ctS: { x: 50, y: 15 }, aMainLow: { x: 22, y: 62 }, aMain: { x: 21, y: 50.3 }, aT: { x: 18.6, y: 35.3 }, A: { x: 30, y: 26 }, aBack: { x: 18, y: 22 }, aCT: { x: 31, y: 17 }, donut: { x: 35.1, y: 46.1 }, aDonut: { x: 31, y: 37 }, rampLow: { x: 69, y: 78 }, ramp: { x: 77.2, y: 64 }, bT: { x: 77.8, y: 55.4 }, B: { x: 74, y: 40 }, cave: { x: 61.6, y: 56.1 }, bCT: { x: 66, y: 25 }, bBack: { x: 83, y: 30 }, tS_tLow1: { x: 51.9, y: 82.6 }, tLow_tMid1: { x: 34.4, y: 70.6 }, tLow_tMid2: { x: 35.9, y: 58.4 }, ctMid_ctS1: { x: 53.4, y: 22.1 }, mid_donut1: { x: 37.4, y: 45.6 }, donut_aDonut1: { x: 30.9, y: 39.4 }, tLow_aMainLow1: { x: 26.4, y: 68.4 }, aMainLow_aMain1: { x: 21.4, y: 50.4 }, aMain_aT1: { x: 21.6, y: 40.6 }, aMain_aT2: { x: 17.4, y: 36.6 }, ctS_aCT1: { x: 31.1, y: 16.1 }, aCT_A1: { x: 27.4, y: 19.9 }, aCT_A2: { x: 24.4, y: 21.4 }, aCT_A3: { x: 28.6, y: 26.1 }, tS_rampLow1: { x: 51.9, y: 82.6 }, tS_rampLow2: { x: 53.4, y: 78.4 }, ramp_bT1: { x: 78.4, y: 57.4 }, bT_B1: { x: 82.4, y: 53.4 }, bT_B2: { x: 79.6, y: 45.1 }, mid_cave1: { x: 53.9, y: 57.4 }, mid_cave2: { x: 61.4, y: 57.9 }, cave_B1: { x: 66.9, y: 49.6 }, cave_B2: { x: 66.6, y: 39.6 }, cave_B3: { x: 72.6, y: 38.6 }, ctS_bCT1: { x: 56.1, y: 27.6 }, bCT_B1: { x: 70.6, y: 28.1 }, bCT_B2: { x: 73.1, y: 37.6 }, B_bBack1: { x: 82.1, y: 33.1 } },
    edges: [['tS', 'tS_tLow1'], ['tS_tLow1', 'tLow'], ['tLow', 'tLow_tMid1'], ['tLow_tMid1', 'tLow_tMid2'], ['tLow_tMid2', 'tMid'], ['tMid', 'mid'], ['mid', 'ctMid'], ['ctMid', 'ctMid_ctS1'], ['ctMid_ctS1', 'ctS'], ['mid', 'mid_donut1'], ['mid_donut1', 'donut'], ['donut', 'donut_aDonut1'], ['donut_aDonut1', 'aDonut'], ['aDonut', 'A'], ['tLow', 'tLow_aMainLow1'], ['tLow_aMainLow1', 'aMainLow'], ['aMainLow', 'aMainLow_aMain1'], ['aMainLow_aMain1', 'aMain'], ['aMain', 'aMain_aT1'], ['aMain_aT1', 'aMain_aT2'], ['aMain_aT2', 'aT'], ['aT', 'A'], ['A', 'aBack'], ['ctS', 'ctS_aCT1'], ['ctS_aCT1', 'aCT'], ['aCT', 'aCT_A1'], ['aCT_A1', 'aCT_A2'], ['aCT_A2', 'aCT_A3'], ['aCT_A3', 'A'], ['tS', 'tS_rampLow1'], ['tS_rampLow1', 'tS_rampLow2'], ['tS_rampLow2', 'rampLow'], ['rampLow', 'ramp'], ['ramp', 'ramp_bT1'], ['ramp_bT1', 'bT'], ['bT', 'bT_B1'], ['bT_B1', 'bT_B2'], ['bT_B2', 'B'], ['mid', 'mid_cave1'], ['mid_cave1', 'mid_cave2'], ['mid_cave2', 'cave'], ['cave', 'cave_B1'], ['cave_B1', 'cave_B2'], ['cave_B2', 'cave_B3'], ['cave_B3', 'B'], ['ctS', 'ctS_bCT1'], ['ctS_bCT1', 'bCT'], ['bCT', 'bCT_B1'], ['bCT_B1', 'bCT_B2'], ['bCT_B2', 'B'], ['B', 'B_bBack1'], ['B_bBack1', 'bBack']],
    sites: { A: R(30, 26, 9, 7), B: R(74, 40, 10, 8) },
    spawns: { t: R(48, 86, 8, 6), ct: R(50, 14, 8, 8) },
    holds: { A: ['aCT', 'aBack'], B: ['bCT', 'bBack'], mid: ['ctMid'] },
    stage: ['tMid', 'aMainLow', 'rampLow', 'tLow', 'tMid'],
    jitter: 0.45,
  }, { x0: 3.3, y0: 2, size: 91.1 }, ANCIENT_RINGS, ANCIENT_CALLS),
  anubis: fromRadar({
    id: 'anubis',
    nodes: { tS: { x: 47, y: 89 }, tMid: { x: 47.8, y: 69.2 }, mid: { x: 51, y: 52 }, ctMid: { x: 48.2, y: 38 }, ctS: { x: 43, y: 21 }, bMain1: { x: 32.3, y: 78.3 }, bMain2: { x: 22, y: 60 }, bT: { x: 26, y: 50 }, B: { x: 35.5, y: 47.5 }, bCon: { x: 40, y: 58 }, bCT: { x: 29.8, y: 30.3 }, bBack: { x: 29, y: 42 }, aMain1: { x: 62, y: 80 }, aMain2: { x: 73.2, y: 58.9 }, aT: { x: 71, y: 50 }, A: { x: 75, y: 25 }, aCon: { x: 62, y: 58 }, aCT: { x: 60, y: 24 }, aBack: { x: 83, y: 38 }, tS_tMid1: { x: 63.1, y: 85.4 }, tS_tMid2: { x: 60.4, y: 74.1 }, tS_tMid3: { x: 49.4, y: 68.4 }, mid_ctMid1: { x: 56.9, y: 37.9 }, mid_ctMid2: { x: 53.9, y: 33.1 }, mid_ctMid3: { x: 48.4, y: 34.9 }, ctMid_ctS1: { x: 47.4, y: 24.4 }, tS_bMain11: { x: 34.6, y: 85.4 }, bMain1_bMain21: { x: 33.4, y: 73.6 }, bMain2_bT1: { x: 23.4, y: 54.9 }, bT_B1: { x: 34.6, y: 46.4 }, mid_bCon1: { x: 47.9, y: 58.6 }, mid_bCon2: { x: 41.1, y: 59.9 }, bCon_B1: { x: 34.4, y: 54.1 }, ctS_bCT1: { x: 29.6, y: 29.6 }, bCT_B1: { x: 31.1, y: 45.4 }, tS_aMain11: { x: 63.1, y: 85.4 }, aMain1_aMain21: { x: 69.1, y: 68.4 }, aMain1_aMain22: { x: 66.9, y: 61.4 }, aMain1_aMain23: { x: 71.6, y: 57.9 }, aT_A1: { x: 77.4, y: 46.1 }, aT_A2: { x: 82.1, y: 44.6 }, aT_A3: { x: 82.4, y: 31.4 }, mid_aCon1: { x: 51.4, y: 58.4 }, aCon_aT1: { x: 69.9, y: 55.6 }, ctS_aCT1: { x: 54.1, y: 12.1 }, ctS_aCT2: { x: 58.1, y: 18.6 }, aCT_A1: { x: 66.6, y: 25.4 }, aCT_A2: { x: 70.6, y: 21.4 }, A_aBack1: { x: 83.9, y: 37.4 } },
    edges: [['tS', 'tS_tMid1'], ['tS_tMid1', 'tS_tMid2'], ['tS_tMid2', 'tS_tMid3'], ['tS_tMid3', 'tMid'], ['tMid', 'mid'], ['mid', 'mid_ctMid1'], ['mid_ctMid1', 'mid_ctMid2'], ['mid_ctMid2', 'mid_ctMid3'], ['mid_ctMid3', 'ctMid'], ['ctMid', 'ctMid_ctS1'], ['ctMid_ctS1', 'ctS'], ['tS', 'tS_bMain11'], ['tS_bMain11', 'bMain1'], ['bMain1', 'bMain1_bMain21'], ['bMain1_bMain21', 'bMain2'], ['bMain2', 'bMain2_bT1'], ['bMain2_bT1', 'bT'], ['bT', 'bT_B1'], ['bT_B1', 'B'], ['mid', 'mid_bCon1'], ['mid_bCon1', 'mid_bCon2'], ['mid_bCon2', 'bCon'], ['bCon', 'bCon_B1'], ['bCon_B1', 'B'], ['ctS', 'ctS_bCT1'], ['ctS_bCT1', 'bCT'], ['bCT', 'bCT_B1'], ['bCT_B1', 'B'], ['B', 'bBack'], ['tS', 'tS_aMain11'], ['tS_aMain11', 'aMain1'], ['aMain1', 'aMain1_aMain21'], ['aMain1_aMain21', 'aMain1_aMain22'], ['aMain1_aMain22', 'aMain1_aMain23'], ['aMain1_aMain23', 'aMain2'], ['aMain2', 'aT'], ['aT', 'aT_A1'], ['aT_A1', 'aT_A2'], ['aT_A2', 'aT_A3'], ['aT_A3', 'A'], ['mid', 'mid_aCon1'], ['mid_aCon1', 'aCon'], ['aCon', 'aCon_aT1'], ['aCon_aT1', 'aT'], ['ctS', 'ctS_aCT1'], ['ctS_aCT1', 'ctS_aCT2'], ['ctS_aCT2', 'aCT'], ['aCT', 'aCT_A1'], ['aCT_A1', 'aCT_A2'], ['aCT_A2', 'A'], ['A', 'A_aBack1'], ['A_aBack1', 'aBack']],
    sites: { A: R(75, 25, 10, 9), B: R(35, 48.5, 8, 7) },
    spawns: { t: R(47, 89, 10, 5), ct: R(43, 21, 10, 7) },
    holds: { A: ['aCT', 'aBack'], B: ['bCT', 'bBack'], mid: ['ctMid'] },
    stage: ['tMid', 'bMain1', 'aMain1', 'tMid', 'bMain2'],
    jitter: 0.45,
  }, { x0: -0.3, y0: -3.5, size: 101.7 }, ANUBIS_RINGS, ANUBIS_CALLS),
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
  train: fromRadar({
    id: 'train',
    nodes: { tS: { x: 12, y: 17 }, alley: { x: 30, y: 16 }, ivy: { x: 60, y: 12 }, ivy2: { x: 81.6, y: 25 }, aIvy: { x: 76, y: 38 }, A: { x: 63, y: 47 }, tCon: { x: 36, y: 40 }, aT: { x: 41, y: 56 }, tLow: { x: 31.6, y: 60 }, bT: { x: 41.6, y: 70.9 }, lowerB: { x: 28.4, y: 82 }, lowerB2: { x: 40, y: 91 }, B: { x: 55, y: 80 }, mid: { x: 64.2, y: 63.4 }, ctS: { x: 88, y: 78 }, ctStairs: { x: 95, y: 62 }, aCT: { x: 78, y: 52 }, bCT: { x: 78, y: 80 }, bBack: { x: 66, y: 88 }, ivy_ivy21: { x: 78.4, y: 12.6 }, ivy2_aIvy1: { x: 79.1, y: 38.1 }, aT_A1: { x: 43.6, y: 58.4 }, tCon_tLow1: { x: 36.6, y: 55.6 }, tLow_bT1: { x: 34.4, y: 70.6 }, lowerB_lowerB21: { x: 34.4, y: 91.1 }, lowerB2_B1: { x: 47.4, y: 88.4 }, mid_B1: { x: 71.4, y: 68.4 }, ctS_ctStairs1: { x: 95.9, y: 70.9 }, ctStairs_aCT1: { x: 92.4, y: 52.6 }, aCT_A1: { x: 73.6, y: 44.9 }, ctS_bCT1: { x: 86.1, y: 70.9 }, ctS_bCT2: { x: 78.6, y: 72.9 } },
    edges: [['tS', 'alley'], ['alley', 'ivy'], ['ivy', 'ivy_ivy21'], ['ivy_ivy21', 'ivy2'], ['ivy2', 'ivy2_aIvy1'], ['ivy2_aIvy1', 'aIvy'], ['aIvy', 'A'], ['alley', 'tCon'], ['tCon', 'aT'], ['aT', 'aT_A1'], ['aT_A1', 'A'], ['tCon', 'tCon_tLow1'], ['tCon_tLow1', 'tLow'], ['tLow', 'tLow_bT1'], ['tLow_bT1', 'bT'], ['bT', 'B'], ['tLow', 'lowerB'], ['lowerB', 'lowerB_lowerB21'], ['lowerB_lowerB21', 'lowerB2'], ['lowerB2', 'lowerB2_B1'], ['lowerB2_B1', 'B'], ['A', 'mid'], ['mid', 'mid_B1'], ['mid_B1', 'B'], ['ctS', 'ctS_ctStairs1'], ['ctS_ctStairs1', 'ctStairs'], ['ctStairs', 'ctStairs_aCT1'], ['ctStairs_aCT1', 'aCT'], ['aCT', 'aCT_A1'], ['aCT_A1', 'A'], ['aIvy', 'aCT'], ['ctS', 'ctS_bCT1'], ['ctS_bCT1', 'ctS_bCT2'], ['ctS_bCT2', 'bCT'], ['bCT', 'B'], ['B', 'bBack']],
    sites: { A: R(63, 47, 12, 9), B: R(55, 80, 12, 9) },
    spawns: { t: R(12, 17, 10, 4), ct: R(90, 80, 7, 9) },
    holds: { A: ['aCT', 'mid'], B: ['bCT', 'bBack'], mid: ['aIvy'] },
    stage: ['alley', 'tCon', 'tLow', 'alley', 'tLow'],
    jitter: 0.45,
  }, { x0: -1.4, y0: -4.1, size: 103.8 }, TRAIN_RINGS, TRAIN_CALLS),
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
