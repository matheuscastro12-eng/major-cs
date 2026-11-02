// Regressão: `new URL(...).pathname` sobre import.meta.url codifica espaço como %20 e
// quebra os testes quando o repo está numa pasta com espaço. Use fileURLToPath.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('nenhum script/teste usa import.meta.url com .pathname', () => {
  const bad: string[] = [];
  for (const dir of ['scripts', 'server', 'api']) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (!/\.(m?ts)$/.test(f)) continue;
      const src = readFileSync(join(ROOT, dir, f), 'utf8');
      if (/import\.meta\.url\)\s*\.pathname/.test(src)) bad.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('fileURLToPath decodifica espaço', () => {
  assert.equal(fileURLToPath('file:///tmp/minha%20pasta/x'), '/tmp/minha pasta/x');
});
