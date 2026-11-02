// Radar do Replay 2D / Road to Pro / Ultimate sai das nossas plantas
// (src/data/planRadar.ts), não de imagem da Valve. Trava a volta dos PNGs do
// overview e confere que o desenho serve para a máscara de piso
// (walkableMask.ts: chão com brilho >= 70, parede abaixo disso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { geometryFor } from '../src/data/mapGeometry.ts';
import { PLAN_FLOOR, PLAN_RADAR_SIZE, PLAN_WALL, planMapOfUrl, planRadarPath, planRadarSvg, planRadarUrl } from '../src/data/planRadar.ts';
import { MAP_POOL } from '../src/types.ts';

const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
};

test('todo mapa do pool usa a planta como radar, no quadro de 1024 px', () => {
  for (const id of MAP_POOL) {
    const url = geometryFor(id).radarImage;
    assert.equal(url, planRadarUrl(id), `${id}: radarImage`);
    assert.ok(url!.startsWith('data:image/svg+xml'), `${id}: data URL`);
    assert.equal(planMapOfUrl(url!), id, `${id}: volta da URL pro mapa`);
    const svg = planRadarSvg(id);
    assert.ok(svg.includes(`width="${PLAN_RADAR_SIZE}"`) && svg.includes('viewBox="0 0 100 100"'), `${id}: tamanho`);
    assert.ok(planRadarPath(id).split('M').length > 2, `${id}: piso com vãos`);
  }
  assert.equal(planMapOfUrl('/maps/de_mirage.png'), null);
});

test('cores da planta separam chão e parede no corte da máscara (70)', () => {
  assert.ok(luma(PLAN_FLOOR) >= 70, 'chão andável');
  assert.ok(luma(PLAN_WALL) < 70, 'parede');
});

test('sem PNG nem .txt do overview da Valve no repo, e nada aponta pra eles', () => {
  const left = readdirSync('public/maps').filter((f) => /^de_.*\.(png|txt)$/.test(f));
  assert.deepEqual(left, []);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(f) && /\/maps\/de_\w+\.png/.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk('src');
  assert.deepEqual(hits, []);
});
