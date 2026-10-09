// Nível em dados puros: o andar do B da Nuke a partir dos `floor` rects do
// radar 2D (src/components/match2d/maps.ts, desenho nosso), rasterizado numa
// grade de 1 unidade do quadro 100×100. Paredes = células não andáveis vizinhas
// de chão. Colisão e linha de visada também usam a grade (determinístico, sem three).
import { map2dOf } from '../../components/match2d/maps';

/** metros por unidade do quadro 100×100 */
export const SCALE = 0.6;
export const ORIGIN = { x: 22, y: 50 };
export const GRID_W = 60;
export const GRID_H = 40;
export const WALL_H = 3.2;

export type Rect = [number, number, number, number]; // [x, y, w, h] em unidades do quadro

/** caixas de cobertura dentro do bomb B e na rampa (unidades do quadro) */
export const CRATES: Rect[] = [
  [52, 65, 2, 2], [63, 71, 3, 2], [68, 65, 2, 3], [56, 73, 2, 2], [40, 64, 2, 2], [74, 70, 2, 2],
];

export const BOMB_MAP = { x: 60, y: 68 };
export const PLAYER_SPAWN_MAP = { x: 76, y: 52 };

export const toWorld = (mx: number, my: number) => ({ x: (mx - ORIGIN.x) * SCALE, z: (my - ORIGIN.y) * SCALE });
export const toMap = (x: number, z: number) => ({ x: x / SCALE + ORIGIN.x, y: z / SCALE + ORIGIN.y });

export interface Level {
  w: number; h: number;
  /** 0 = parede/fora, 1 = chão, 2 = caixa (sólida, mas renderizada como cobertura) */
  cells: Uint8Array;
}

function inRect(mx: number, my: number, r: Rect) {
  return mx >= r[0] && mx < r[0] + r[2] && my >= r[1] && my < r[1] + r[3];
}

export function buildLevel(): Level {
  const floor = (map2dOf('nuke').floor ?? []) as Rect[];
  const cells = new Uint8Array(GRID_W * GRID_H);
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) {
      const mx = ORIGIN.x + i + 0.5;
      const my = ORIGIN.y + j + 0.5;
      // só o andar de B: corta tudo acima de y=50 (a grade já começa ali)
      if (floor.some((r) => inRect(mx, my, r))) cells[j * GRID_W + i] = 1;
      if (cells[j * GRID_W + i] === 1 && CRATES.some((r) => inRect(mx, my, r))) cells[j * GRID_W + i] = 2;
    }
  }
  // fecha a borda superior do corredor (o resto do mapa não existe na fase 1)
  for (let i = 0; i < GRID_W; i++) cells[i] = 0;
  return { w: GRID_W, h: GRID_H, cells };
}

export function cellAt(l: Level, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= l.w || j >= l.h) return 0;
  return l.cells[j * l.w + i];
}

/** sólido em coordenadas de mundo (metros) */
export function solidAt(l: Level, x: number, z: number): boolean {
  return cellAt(l, Math.floor(x / SCALE), Math.floor(z / SCALE)) !== 1;
}

/** distância (m, no plano) até a primeira célula sólida ao longo de (dx,dz) normalizado */
export function raycastGrid(l: Level, x: number, z: number, dx: number, dz: number, maxDist: number): number {
  // DDA na grade
  let i = Math.floor(x / SCALE), j = Math.floor(z / SCALE);
  const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(SCALE / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(SCALE / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (i + 1) * SCALE - x : x - i * SCALE) / Math.abs(dx)) : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? (j + 1) * SCALE - z : z - j * SCALE) / Math.abs(dz)) : Infinity;
  let t = 0;
  if (cellAt(l, i, j) !== 1) return 0;
  while (t < maxDist) {
    if (tMaxX < tMaxZ) { i += stepI; t = tMaxX; tMaxX += tDeltaX; }
    else { j += stepJ; t = tMaxZ; tMaxZ += tDeltaZ; }
    if (cellAt(l, i, j) !== 1) return Math.min(t, maxDist);
  }
  return maxDist;
}

export function lineClear(l: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  return raycastGrid(l, ax, az, dx / d, dz / d, d) >= d - 1e-6;
}

export const BODY_R = 0.3;

/** move um círculo (AABB) com colisão separada por eixo; muta pos */
export function moveWithCollision(l: Level, pos: { x: number; z: number }, mx: number, mz: number): void {
  const blocked = (x: number, z: number) =>
    solidAt(l, x - BODY_R, z - BODY_R) || solidAt(l, x + BODY_R, z - BODY_R) ||
    solidAt(l, x - BODY_R, z + BODY_R) || solidAt(l, x + BODY_R, z + BODY_R);
  if (!blocked(pos.x + mx, pos.z)) pos.x += mx;
  if (!blocked(pos.x, pos.z + mz)) pos.z += mz;
}

export interface Box { x: number; z: number; w: number; d: number; h: number; kind: 'wall' | 'crate' | 'floor' }

/** caixas para render: corridas horizontais de paredes, caixas e chão */
export function levelBoxes(l: Level): Box[] {
  const out: Box[] = [];
  const isWall = (i: number, j: number) => {
    if (cellAt(l, i, j) !== 0) return false;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (cellAt(l, i + di, j + dj) !== 0) return true;
    return false;
  };
  const kinds: [Box['kind'], (i: number, j: number) => boolean, number][] = [
    ['wall', isWall, WALL_H],
    ['crate', (i, j) => cellAt(l, i, j) === 2, 2.0],
    ['floor', (i, j) => cellAt(l, i, j) !== 0, 0.1],
  ];
  for (const [kind, pred, h] of kinds) {
    for (let j = 0; j < l.h; j++) {
      let i = 0;
      while (i < l.w) {
        if (!pred(i, j)) { i++; continue; }
        const s = i;
        while (i < l.w && pred(i, j)) i++;
        out.push({ x: s * SCALE, z: j * SCALE, w: (i - s) * SCALE, d: SCALE, h, kind });
      }
    }
  }
  return out;
}
