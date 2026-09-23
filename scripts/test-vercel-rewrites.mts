// O0-32 / ENGE-M01 — Todo path que o App empurra no history precisa de rewrite
// no vercel.json. Sem isso, F5 ou link compartilhado cai no 404 da Vercel em vez
// do jogo (foi o caso de /carreira/jogador/:id e /carreira/time/:id).
// Roda `tsx --test scripts/test-vercel-rewrites.mts`.
//
// O SCREEN_PATH mora dentro do App.tsx (componente); em vez de importar o React
// inteiro, o teste lê o bloco do arquivo. Se o bloco sumir ou mudar de forma, o
// teste falha alto, e não em silêncio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { careerPlayerPath } from '../src/state/career-player-route.ts';
import { careerTeamPath } from '../src/state/career-team-route.ts';

const root = new URL('..', import.meta.url);
const vercel = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
};
const appSrc = readFileSync(new URL('src/App.tsx', root), 'utf8');

/** Converte um `source` da Vercel (path-to-regexp) num RegExp suficiente pra cá. */
function sourceToRegExp(source: string): RegExp {
  let re = '';
  for (const seg of source.split('/').slice(1)) {
    if (/^:\w+\*$/.test(seg)) re += '(?:/.*)?'; // :path* = zero ou mais segmentos
    else if (/^:\w+$/.test(seg)) re += '/[^/]+';
    else re += '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re || '/'}$`, 'i');
}

const matchers = vercel.rewrites.map((r) => sourceToRegExp(r.source));
const hasRewrite = (path: string) => path === '/' || matchers.some((m) => m.test(path));

function screenPaths(): string[] {
  const block = appSrc.match(/const SCREEN_PATH[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, 'bloco SCREEN_PATH não encontrado em src/App.tsx');
  const paths = [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(paths.length > 10, `SCREEN_PATH com poucos paths (${paths.length})`);
  return paths;
}

test('todo path do SCREEN_PATH tem rewrite para o SPA', () => {
  const missing = screenPaths().filter((p) => !hasRewrite(p));
  assert.deepEqual(missing, [], `sem rewrite no vercel.json: ${missing.join(', ')}`);
});

test('deep links da Carreira (jogador e time) têm rewrite', () => {
  for (const p of [careerPlayerPath('user__abc'), careerTeamPath('faze'), careerPlayerPath('nome com espaço')]) {
    assert.ok(hasRewrite(p), `sem rewrite: ${p}`);
  }
});

test('links legados que o App ainda trata têm rewrite', () => {
  // routeFromLocation redireciona esses paths; sem rewrite eles dariam 404 antes.
  for (const p of ['/banners', '/ultimateteam', '/ultimate-team', '/online/lobby', '/admin/acessos', '/admin/financeiro']) {
    assert.ok(hasRewrite(p), `sem rewrite: ${p}`);
  }
});

test('assets e api não são engolidos por rewrite', () => {
  for (const p of ['/api/ranking', '/assets/index.js', '/logos/faze.png', '/maps/inferno.webp']) {
    assert.ok(!hasRewrite(p), `rewrite indevido: ${p}`);
  }
});
