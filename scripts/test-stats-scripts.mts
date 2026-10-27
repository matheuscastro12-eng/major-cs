// Scripts de stats do Major (scripts/stats/*). Roda via `npm run test:sim`.
//  - prob-jogo: determinismo com seed fixa, probabilidades fecham em 100, favorito sobe de Bo1 pra Bo5, time inexistente falha
//  - runs-agregado.sql: só SELECT/WITH, sem coluna pessoal; script sem READONLY_DATABASE_URL não conecta (exit 3) e ignora DATABASE_URL
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['--import', 'tsx', join(REPO, 'scripts/stats', script), ...args], { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '', READONLY_DATABASE_URL: '', ...env } });

test('prob-jogo: reprodutível, soma 100 e favorito cresce com a série', () => {
  const a = run('prob-jogo.mts', ['--a', 'Vitality', '--b', 'paiN', '--n', '400', '--seed', '7', '--json']);
  assert.equal(a.status, 0, a.stderr);
  const b = run('prob-jogo.mts', ['--a', 'Vitality', '--b', 'paiN', '--n', '400', '--seed', '7', '--json']);
  assert.equal(a.stdout, b.stdout);
  const m = JSON.parse(a.stdout);
  for (const f of ['bo1', 'bo3', 'bo5']) assert.ok(Math.abs(m[f].pA + m[f].pB - 100) < 0.11, f);
  assert.ok(m.bo1.pA > 50, 'Vitality favorita contra paiN');
  assert.ok(m.bo5.pA >= m.bo3.pA - 3 && m.bo3.pA >= m.bo1.pA - 3, 'série mais longa não reduz o favorito');
});

test('prob-jogo: time fora da lista dá erro claro', () => {
  const r = run('prob-jogo.mts', ['--a', 'TimeQueNaoExiste', '--b', 'paiN', '--n', '10']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /não está na lista do Major/);
});

test('runs-agregado.sql: só leitura e sem dado pessoal', () => {
  const sql = readFileSync(join(REPO, 'scripts/stats/runs-agregado.sql'), 'utf8');
  const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body, /\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i);
  const selects = body.split(';').map((s) => s.trim()).filter(Boolean);
  assert.ok(selects.length >= 5);
  for (const s of selects) assert.match(s, /^(select|with)\b/i);
  assert.doesNotMatch(body, /\b(email|player|sid|ip|team_name|mvp)\b/i);
});

test('runs-agregado: sem READONLY_DATABASE_URL não conecta, mesmo com DATABASE_URL', () => {
  const r = run('runs-agregado.mts', [], { DATABASE_URL: 'postgresql://escrita:x@exemplo.invalid/db' });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /SEM CREDENCIAL/);
});
