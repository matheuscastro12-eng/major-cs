// Base histórica (teams.json + atributos) fora da carga inicial: o carregador
// (state/baseDataset.ts) baixa uma vez só, tenta de novo depois de uma falha de
// rede e segura a tela quando o chunk falhou e a página vai recarregar. Depois
// de carregada, a base é a mesma de antes (mesmo conteúdo e ordem), com o cache
// local por BASE_REV e o merge do /api/teams intactos (state/crm.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── fake do localStorage (antes de importar o crm) ───────────────────────────
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const { createBaseLoader, baseDataset } = await import('../src/state/baseDataset.ts');
const { BASE_TEAMS, BASE_REV } = await import('../src/data/teams.ts');

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const settled = async <T,>(p: Promise<T>) => Promise.race([p.then(() => 'resolveu', () => 'rejeitou'), tick().then(() => 'pendente')]);

test('load() baixa uma vez só e o ready não dispara o download sozinho', async () => {
  let calls = 0;
  const loader = createBaseLoader(async () => { calls++; await tick(5); return { ok: 1 }; });
  void loader.ready;
  await tick();
  assert.equal(calls, 0, 'ready sozinho não baixa');
  assert.equal(loader.peek(), null);
  const [a, b] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(loader.peek(), a);
  assert.equal(await loader.ready, a);
  assert.equal(await loader.load(), a);
  assert.equal(calls, 1, 'depois de carregada, load() não baixa de novo');
});

test('falha de rede: load() rejeita, o ready espera e a próxima chamada tenta de novo', async () => {
  let calls = 0;
  const loader = createBaseLoader(async () => {
    calls++;
    if (calls === 1) throw new Error('Failed to fetch dynamically imported module');
    return { ok: 2 };
  });
  await assert.rejects(loader.load(), /Failed to fetch/);
  assert.equal(await settled(loader.ready), 'pendente');
  assert.equal(loader.peek(), null);
  const m = await loader.load();
  assert.equal(calls, 2);
  assert.equal(await loader.ready, m);
});

test('chunk vazio (reload pedido pelo vite:preloadError): segura a tela em vez de montar sem base', async () => {
  const loader = createBaseLoader(async () => undefined);
  assert.equal(await settled(loader.load()), 'pendente');
  assert.equal(await settled(loader.ready), 'pendente');
  assert.equal(loader.peek(), null);
});

test('a base carregada é a mesma do teams.json (conteúdo e ordem) e o cache local por BASE_REV segue valendo', async () => {
  mem.clear();
  const crm = await baseDataset.load();
  assert.equal(baseDataset.peek(), crm);
  const json = JSON.parse(readFileSync(new URL('../src/data/teams.json', import.meta.url), 'utf8')) as { id: string }[];
  assert.deepEqual(BASE_TEAMS.map((t) => t.id), json.map((t) => t.id), 'mesma ordem do teams.json');

  // sem cache: a base do build (cópia, não a mesma referência)
  const fresh = crm.loadDataset();
  assert.deepEqual(fresh, BASE_TEAMS);
  assert.notEqual(fresh, BASE_TEAMS);

  // cache gravado neste build: volta o que estava salvo
  const edited = structuredClone(BASE_TEAMS.slice(0, 3));
  edited[0].team = 'Time editado';
  crm.saveDataset(edited);
  assert.equal(mem.get('major-cs-dataset-rev'), BASE_REV);
  assert.equal(crm.loadDataset()[0].team, 'Time editado');

  // deploy novo (rev mudou) sem edição pendente: descarta o cache e adota a base fresca
  mem.set('major-cs-dataset-rev', 'rev-antigo');
  assert.deepEqual(crm.loadDataset(), BASE_TEAMS);
  assert.equal(mem.get('major-cs-dataset-rev'), BASE_REV);

  // rev mudou MAS há edição local não enviada: mantém o cache
  crm.saveDataset(edited);
  mem.set('major-cs-dataset-rev', 'rev-antigo');
  crm.markDirty();
  assert.equal(crm.loadDataset()[0].team, 'Time editado');
  crm.clearDirty();
});

test('adoptRemoteDataset: banco deste build manda; banco antigo só soma os times exclusivos dele', async () => {
  mem.clear();
  const crm = await baseDataset.load();
  const dbOnly = { ...structuredClone(BASE_TEAMS[0]), id: 'so-no-banco', pending: false };
  const remote = [...structuredClone(BASE_TEAMS.slice(0, 20)), dbOnly];
  remote[1].team = 'Editado no admin';

  // salvo contra ESTE build: adota o banco (+ pendentes novos do build que o banco não tem)
  const same = crm.adoptRemoteDataset({ teams: remote, rev: BASE_REV });
  assert.equal(same[1].team, 'Editado no admin');
  assert.deepEqual(same.slice(0, remote.length), remote);
  const pend = BASE_TEAMS.filter((t) => t.pending && !remote.some((r) => r.id === t.id)).map((t) => t.id);
  assert.deepEqual(same.slice(remote.length).map((t) => t.id), pend);

  // salvo num build antigo (ou sem rev): base fresca do build + só o que é exclusivo do banco, no fim
  for (const rev of ['rev-antigo', '']) {
    const old = crm.adoptRemoteDataset({ teams: remote, rev });
    assert.deepEqual(old.slice(0, BASE_TEAMS.length), BASE_TEAMS);
    assert.deepEqual(old.slice(BASE_TEAMS.length).map((t) => t.id), ['so-no-banco']);
  }
});
