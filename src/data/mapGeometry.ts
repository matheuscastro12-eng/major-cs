// Geometria dos mapas para o canvas 2D live/broadcast (T2.5 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md).
//
// Modos:
//   - "abstract": layout genérico top-down (fallback). Hoje só usado pra mapas
//                que não estejam em SPECIFIC (não acontece — todos os 7 do
//                MAP_POOL têm radar real).
//   - "radar":   layout calibrado em cima do radar PNG oficial do CS2.
//                Coords em PIXEL do PNG 1024×1024.
//
// Pipeline pra atualizar quando a Valve mudar o radar de um mapa:
//   1) `curl -O https://raw.githubusercontent.com/2mlml/cs2-radar-images/master/de_<map>.png`
//   2) Atualizar entry em SPECIFIC abaixo se as coords do `.txt` mudaram
//   3) Re-testar visualmente no LiveCanvasGame (Replay 2D)
//
// Coords vieram dos arquivos `.txt` do mesmo repo, onde
// `CTSpawn_x/y`, `TSpawn_x/y`, `bombA_x/y`, `bombB_x/y` são fracionais [0..1]
// do radar — multiplicamos por 1024 pra ter pixel.

import type { MapId } from '../types';

export interface Vec2 {
  x: number;
  y: number;
}

export interface ZoneRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface MapLayout {
  mode: 'abstract' | 'radar';
  width: number;
  height: number;
  radarImage: string | null;
  backgroundImage: string | null;
  spawnsT: Vec2[];
  spawnsCT: Vec2[];
  siteA: ZoneRect;
  siteB: ZoneRect;
  midT: Vec2;
  midCT: Vec2;
  floor: string;
  grid: string;
  accent: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de calibração (rodam no module load — produzem dados const)

// Espalha 5 spawns ao redor de um ponto central (offset ~±25 pixels). Como o
// radar é 1024², 25px corresponde a ~3% do mapa — bate com a separação real
// dos players no spawn pelado.
function spread5(center: Vec2): Vec2[] {
  return [
    { x: center.x, y: center.y },
    { x: center.x - 28, y: center.y - 12 },
    { x: center.x + 28, y: center.y - 12 },
    { x: center.x - 16, y: center.y + 18 },
    { x: center.x + 16, y: center.y + 18 },
  ];
}

// Ponto intermediário entre spawn e site — usado pelo engine 2D pra rotear
// agents (eles vão pro mid primeiro, depois pro site).
function midpoint(a: Vec2, b: Vec2, t = 0.55): Vec2 {
  return { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback abstrato (mantido pra mapas não-cadastrados ou debugging)

const ABSTRACT_LAYOUT: MapLayout = {
  mode: 'abstract',
  width: 1600,
  height: 900,
  radarImage: null,
  backgroundImage: null,
  spawnsT: spread5({ x: 110, y: 450 }),
  spawnsCT: spread5({ x: 1490, y: 450 }),
  siteA: { cx: 800, cy: 180, w: 240, h: 160 },
  siteB: { cx: 800, cy: 720, w: 240, h: 160 },
  midT: { x: 420, y: 450 },
  midCT: { x: 1180, y: 450 },
  floor: '#1c2230',
  grid: 'rgba(120, 138, 170, 0.07)',
  accent: '#d4a04a',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapas reais — coords em pixel do radar 1024×1024
//
// Convenção: ZoneRect.w/h ~120px (≈ 12% do radar) cobre confortavelmente
// um bombsite real. Pra mapas com sites apertados (Nuke A/B) ou amplos
// (Ancient mid), valor é ajustado individualmente.

const RADAR = 1024;

// Helper: coord normalizada [0..1] → pixel
const px = (frac: number): number => Math.round(frac * RADAR);

// MIRAGE (de_mirage.txt: CTSpawn 0.28,0.70 · TSpawn 0.87,0.36 · A 0.54,0.76 · B 0.23,0.28)
const MIRAGE: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_mirage.png',
  backgroundImage: '/maps/mirage.jpg',
  spawnsT: spread5({ x: px(0.87), y: px(0.36) }),
  spawnsCT: spread5({ x: px(0.28), y: px(0.70) }),
  siteA: { cx: px(0.54), cy: px(0.76), w: 130, h: 110 },
  siteB: { cx: px(0.23), cy: px(0.28), w: 130, h: 110 },
  midT: midpoint({ x: px(0.87), y: px(0.36) }, { x: px(0.54), y: px(0.76) }, 0.45),
  midCT: midpoint({ x: px(0.28), y: px(0.70) }, { x: px(0.23), y: px(0.28) }, 0.4),
  floor: '#2a2418',
  grid: 'transparent',
  accent: '#d4a04a',
};

// INFERNO (CTSpawn 0.9,0.35 · TSpawn 0.1,0.67 · A 0.81,0.69 · B 0.49,0.22)
const INFERNO: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_inferno.png',
  backgroundImage: '/maps/inferno.webp',
  spawnsT: spread5({ x: px(0.10), y: px(0.67) }),
  spawnsCT: spread5({ x: px(0.90), y: px(0.35) }),
  siteA: { cx: px(0.81), cy: px(0.69), w: 130, h: 110 },
  siteB: { cx: px(0.49), cy: px(0.22), w: 130, h: 110 },
  midT: midpoint({ x: px(0.10), y: px(0.67) }, { x: px(0.81), y: px(0.69) }, 0.45),
  midCT: midpoint({ x: px(0.90), y: px(0.35) }, { x: px(0.49), y: px(0.22) }, 0.45),
  floor: '#251b15',
  grid: 'transparent',
  accent: '#b34a30',
};

// NUKE (CTSpawn 0.82,0.45 · TSpawn 0.19,0.54 · A 0.58,0.48 · B 0.58,0.58)
// Mapa vertical (A em cima, B no andar de baixo). Por enquanto usamos só o
// radar default (top); _lower.png pode entrar quando tivermos verticalsections.
const NUKE: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_nuke.png',
  backgroundImage: '/maps/nuke.jpg',
  spawnsT: spread5({ x: px(0.19), y: px(0.54) }),
  spawnsCT: spread5({ x: px(0.82), y: px(0.45) }),
  siteA: { cx: px(0.58), cy: px(0.48), w: 110, h: 90 },
  siteB: { cx: px(0.58), cy: px(0.58), w: 110, h: 90 },
  midT: midpoint({ x: px(0.19), y: px(0.54) }, { x: px(0.58), y: px(0.48) }, 0.5),
  midCT: midpoint({ x: px(0.82), y: px(0.45) }, { x: px(0.58), y: px(0.48) }, 0.45),
  floor: '#1a1f24',
  grid: 'transparent',
  accent: '#5a8aa8',
};

// ANCIENT (CTSpawn 0.51,0.17 · TSpawn 0.485,0.87 · A 0.31,0.25 · B 0.80,0.40)
const ANCIENT: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_ancient.png',
  backgroundImage: '/maps/ancient.jpg',
  spawnsT: spread5({ x: px(0.485), y: px(0.87) }),
  spawnsCT: spread5({ x: px(0.51), y: px(0.17) }),
  siteA: { cx: px(0.31), cy: px(0.25), w: 130, h: 110 },
  siteB: { cx: px(0.80), cy: px(0.40), w: 130, h: 110 },
  midT: midpoint({ x: px(0.485), y: px(0.87) }, { x: px(0.31), y: px(0.25) }, 0.5),
  midCT: midpoint({ x: px(0.51), y: px(0.17) }, { x: px(0.80), y: px(0.40) }, 0.45),
  floor: '#1c2a1f',
  grid: 'transparent',
  accent: '#5e8a4a',
};

// ANUBIS (CTSpawn 0.61,0.22 · TSpawn 0.58,0.93 — bombA/bombB não vêm no .txt,
// estimados visualmente: A perto do CT side, B no mid-bottom).
const ANUBIS: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_anubis.png',
  backgroundImage: '/maps/anubis.jpg',
  spawnsT: spread5({ x: px(0.58), y: px(0.93) }),
  spawnsCT: spread5({ x: px(0.61), y: px(0.22) }),
  siteA: { cx: px(0.61), cy: px(0.32), w: 130, h: 110 },
  siteB: { cx: px(0.30), cy: px(0.55), w: 130, h: 110 },
  midT: midpoint({ x: px(0.58), y: px(0.93) }, { x: px(0.61), y: px(0.32) }, 0.5),
  midCT: midpoint({ x: px(0.61), y: px(0.22) }, { x: px(0.30), y: px(0.55) }, 0.45),
  floor: '#2a241a',
  grid: 'transparent',
  accent: '#c79a3a',
};

// DUST2 (CTSpawn 0.62,0.21 · TSpawn 0.39,0.91 · A 0.80,0.16 · B 0.21,0.12)
const DUST2: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_dust2.png',
  backgroundImage: '/maps/dust2.jpg',
  spawnsT: spread5({ x: px(0.39), y: px(0.91) }),
  spawnsCT: spread5({ x: px(0.62), y: px(0.21) }),
  siteA: { cx: px(0.80), cy: px(0.16), w: 130, h: 110 },
  siteB: { cx: px(0.21), cy: px(0.12), w: 130, h: 110 },
  midT: midpoint({ x: px(0.39), y: px(0.91) }, { x: px(0.80), y: px(0.16) }, 0.45),
  midCT: midpoint({ x: px(0.62), y: px(0.21) }, { x: px(0.21), y: px(0.12) }, 0.45),
  floor: '#2c2317',
  grid: 'transparent',
  accent: '#d4a050',
};

// TRAIN (CTSpawn 0.86,0.77 · TSpawn 0.12,0.25 · A 0.63,0.49 · B 0.52,0.76)
const TRAIN: MapLayout = {
  mode: 'radar',
  width: RADAR,
  height: RADAR,
  radarImage: '/maps/de_train.png',
  backgroundImage: '/maps/train.jpg',
  spawnsT: spread5({ x: px(0.12), y: px(0.25) }),
  spawnsCT: spread5({ x: px(0.86), y: px(0.77) }),
  siteA: { cx: px(0.63), cy: px(0.49), w: 130, h: 110 },
  siteB: { cx: px(0.52), cy: px(0.76), w: 130, h: 110 },
  midT: midpoint({ x: px(0.12), y: px(0.25) }, { x: px(0.63), y: px(0.49) }, 0.5),
  midCT: midpoint({ x: px(0.86), y: px(0.77) }, { x: px(0.52), y: px(0.76) }, 0.45),
  floor: '#1f2229',
  grid: 'transparent',
  accent: '#7a8aa0',
};

const SPECIFIC: Record<MapId, MapLayout> = {
  mirage: MIRAGE,
  inferno: INFERNO,
  nuke: NUKE,
  ancient: ANCIENT,
  anubis: ANUBIS,
  dust2: DUST2,
  train: TRAIN,
};

export function geometryFor(map: MapId): MapLayout {
  return SPECIFIC[map] ?? ABSTRACT_LAYOUT;
}

export function hasRadarImage(map: MapId): boolean {
  return geometryFor(map).mode === 'radar';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de geometria usados pelo engine 2D

export function distanceTo(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function directionTo(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function isInsideZone(p: Vec2, zone: ZoneRect): boolean {
  return (
    p.x >= zone.cx - zone.w / 2 &&
    p.x <= zone.cx + zone.w / 2 &&
    p.y >= zone.cy - zone.h / 2 &&
    p.y <= zone.cy + zone.h / 2
  );
}

export function zoneCenter(zone: ZoneRect): Vec2 {
  return { x: zone.cx, y: zone.cy };
}
