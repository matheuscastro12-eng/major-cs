// Onboarding de 60s: as 3 rotas (Major, Draft, Carreira) têm texto nos 3
// idiomas e o modal antigo do Draft (draft → veto → partida) não voltou.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const i18n = readFileSync(ROOT + 'src/state/i18n.tsx', 'utf8');
const comp = readFileSync(ROOT + 'src/components/Onboarding.tsx', 'utf8');

test('toda chave onboard.* usada no componente existe em pt, en e es', () => {
  const used = [...new Set([...comp.matchAll(/t\('(onboard\.[\w]+)'\)/g)].map((m) => m[1]))];
  assert.ok(used.length >= 15, `esperava as chaves das 3 rotas, achei ${used.length}`);
  const missing = used.filter((k) => (i18n.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) ?? []).length !== 3);
  assert.deepEqual(missing, []);
});

test('as 3 rotas existem e o passo a passo do Draft saiu', () => {
  for (const r of ["go('major')", "go('draft')", "go('career')"]) assert.ok(comp.includes(r), r);
  assert.ok(!/onboard\.step\d/.test(i18n), 'chaves onboard.stepN antigas ainda no i18n');
});
