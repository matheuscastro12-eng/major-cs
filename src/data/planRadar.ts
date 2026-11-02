// Radar do Replay 2D (LiveCanvasGame), do quadro do Road to Pro e do fundo do
// Ultimate, desenhado a partir das nossas plantas (src/components/match2d/plans):
// só a silhueta do piso, sem imagem da Valve. Os anéis estão em % do quadro do
// overview do jogo (0–100), o mesmo quadro de 1024 px em que mapGeometry.ts
// calibrou spawns, sites e meios — então as coordenadas de lá continuam valendo.
//
// Cores fixas (a imagem vira data URL e não enxerga os tokens do CSS). O piso
// precisa de alpha alto e brilho >= 70: walkableMask.ts lê esse desenho para
// saber onde dá pra andar. Fora do piso fica transparente; o contorno é escuro
// e conta como parede.

import type { MapId } from '../types';
import { ANCIENT_RINGS } from '../components/match2d/plans/ancient';
import { ANUBIS_RINGS } from '../components/match2d/plans/anubis';
import { DUST2_RINGS } from '../components/match2d/plans/dust2';
import { INFERNO_RINGS } from '../components/match2d/plans/inferno';
import { MIRAGE_RINGS } from '../components/match2d/plans/mirage';
import { NUKE_RINGS } from '../components/match2d/plans/nuke';
import { TRAIN_RINGS } from '../components/match2d/plans/train';

export const PLAN_RADAR_SIZE = 1024;
export const PLAN_FLOOR = '#3d4a60';
export const PLAN_WALL = '#1a2130';
const WALL_WIDTH = 0.35; // em % do quadro

const RINGS: Record<MapId, number[][]> = {
  mirage: MIRAGE_RINGS,
  inferno: INFERNO_RINGS,
  nuke: NUKE_RINGS,
  ancient: ANCIENT_RINGS,
  anubis: ANUBIS_RINGS,
  dust2: DUST2_RINGS,
  train: TRAIN_RINGS,
};

/** path SVG do piso (even-odd: o 1º anel é o piso, os outros são vãos) */
export function planRadarPath(map: MapId): string {
  return RINGS[map]
    .map((r) => {
      const pts: string[] = [];
      for (let i = 0; i < r.length; i += 2) pts.push(`${r[i]},${r[i + 1]}`);
      return `M${pts.join('L')}Z`;
    })
    .join('');
}

export function planRadarSvg(map: MapId): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PLAN_RADAR_SIZE}" height="${PLAN_RADAR_SIZE}" viewBox="0 0 100 100">` +
    `<path d="${planRadarPath(map)}" fill="${PLAN_FLOOR}" fill-rule="evenodd" stroke="${PLAN_WALL}" stroke-width="${WALL_WIDTH}" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const urls = new Map<MapId, string>();
const mapOfUrl = new Map<string, MapId>();

/** data URL do radar do mapa (memoizada; a mesma string serve de chave do cache da máscara) */
export function planRadarUrl(map: MapId): string {
  let u = urls.get(map);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planRadarSvg(map))}`;
    urls.set(map, u);
    mapOfUrl.set(u, map);
  }
  return u;
}

/** qual mapa gerou esta URL (null = não é um radar nosso) */
export function planMapOfUrl(url: string): MapId | null {
  return mapOfUrl.get(url) ?? null;
}

/** desenha o radar direto no canvas (sem decodificar imagem), em `size` px */
export function paintPlanRadar(ctx: CanvasRenderingContext2D, map: MapId, size: number): void {
  const p = new Path2D(planRadarPath(map));
  ctx.save();
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = PLAN_FLOOR;
  ctx.fill(p, 'evenodd');
  ctx.strokeStyle = PLAN_WALL;
  ctx.lineWidth = WALL_WIDTH;
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.restore();
}
