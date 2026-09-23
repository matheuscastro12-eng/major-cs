// [O0-01] smoke pós-deploy: 5xx e falta de resposta reprovam; 2xx/4xx passam
// (a rota subiu e o módulo carregou). fetch falso, sem rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SMOKE_PATHS, smokeApi, smokeFailed } from './smoke-api.mts';

const fakeFetch = (byPath: Record<string, number | 'throw'>): typeof fetch => (async (input: unknown, init?: { headers?: Record<string, string> }) => {
  const url = String(input);
  const path = SMOKE_PATHS.find((p) => url.endsWith(p))!;
  const v = byPath[path];
  if (v === 'throw') throw new Error('fetch failed');
  return new Response('{}', { status: v ?? 200, headers: { 'x-bypass': init?.headers?.['x-vercel-protection-bypass'] ?? '' } });
}) as typeof fetch;

test('cobre as três rotas que caíram (DADO-01)', () => {
  assert.deepEqual(SMOKE_PATHS, ['/api/ranking?action=ladder', '/api/liveops', '/api/lobby?list=1']);
});

test('500 e sem resposta reprovam; 200 e 4xx passam', async () => {
  const r = await smokeApi('https://preview.example/', {
    fetchImpl: fakeFetch({ '/api/ranking?action=ladder': 500, '/api/liveops': 404, '/api/lobby?list=1': 'throw' }),
  });
  const by = Object.fromEntries(r.map((x) => [x.path, x]));
  assert.equal(smokeFailed(by['/api/ranking?action=ladder']), true);
  assert.equal(smokeFailed(by['/api/liveops']), false);
  assert.equal(smokeFailed(by['/api/lobby?list=1']), true);
  assert.equal(by['/api/lobby?list=1'].status, null);
  const ok = await smokeApi('https://preview.example', { fetchImpl: fakeFetch({}) });
  assert.equal(ok.filter(smokeFailed).length, 0);
});
