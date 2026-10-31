// Carga inicial: módulos pesados que a landing e o /major-singapore não usam
// ficam fora dos imports ESTÁTICOS a partir do src/main.tsx (PRs de code
// splitting). Um import estático novo de qualquer um deles puxa o arquivo (e
// tudo que ele importa) de volta pro bundle da primeira tela; o teste mostra a
// cadeia de imports que trouxe o módulo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// import/export com valor (import type/export type não entram no bundle)
const IMPORT_RE = /^\s*import\s+(?!type\b)[^;]*?\s+from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|^\s*export\s+(?!type\b)[^;]*?\s+from\s+['"]([^'"]+)['"]/gm;

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec));
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx', '.json']) {
    const p = base + ext;
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p;
  }
  return null;
}

// BFS: arquivo → quem o importou primeiro (pra mostrar a cadeia)
function staticGraph(entry: string): Map<string, string | null> {
  const prev = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift()!;
    if (!/\.(tsx?|mts)$/.test(f)) continue;
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const d = resolve(f, m[1] ?? m[2] ?? m[3]);
      if (d && !prev.has(d)) { prev.set(d, f); queue.push(d); }
    }
  }
  return prev;
}

const chain = (g: Map<string, string | null>, f: string) => {
  const out = [f];
  while (g.get(out[out.length - 1])) out.push(g.get(out[out.length - 1])!);
  return out.join(' ← ');
};

const FORA_DA_CARGA_INICIAL = [
  'src/state/career-strings.ts', // dicionário en/es do ct() (sob demanda em career-i18n.ts)
  'src/data/bo3.ts', // base de jogadores
  'src/state/weekendEvent.ts', // catálogo do Ultimate (a landing carrega sob demanda)
  'src/components/daily/DailyScreen.tsx',
  'src/components/ManagerSetup.tsx',
  'src/components/MatchScreen.tsx', // radar 2D, narração, canvas ao vivo
  'src/components/VetoScreen.tsx',
  'src/components/Draft.tsx',
  'src/components/Hub.tsx',
  'src/state/saveMigrations.ts', // motores da Carreira inteiros (o CareerScreen instala)
  'src/engine/swiss.ts', // simulação das séries da IA
  'src/engine/match.ts', // motor de partida
];

test('módulos pesados não entram nos imports estáticos do main.tsx', () => {
  const g = staticGraph('src/main.tsx');
  assert.ok(g.has('src/App.tsx') && g.has('src/components/Landing.tsx'), 'o grafo chegou no App e na Landing');
  const leaks = FORA_DA_CARGA_INICIAL.filter((f) => g.has(f)).map((f) => chain(g, f));
  assert.deepEqual(leaks, [], `voltou pra carga inicial:\n${leaks.join('\n')}`);
});

// /major-singapore abre na visão geral: a campanha (motor do RtP, base bo3,
// motor de partida) só vem com o resultado da simulação, a liga ou a aba Jogar
const FORA_DO_MAJOR_SG = [
  'src/engine/majorCampaign.ts',
  'src/engine/rtp/createSave.ts',
  'src/data/bo3.ts',
  'src/engine/match.ts',
  'src/engine/swiss.ts',
];

test('a tela do /major-singapore não importa a campanha de forma estática', () => {
  const g = staticGraph('src/components/major/MajorSingaporeScreen.tsx');
  const leaks = FORA_DO_MAJOR_SG.filter((f) => g.has(f)).map((f) => chain(g, f));
  assert.deepEqual(leaks, [], `voltou pra primeira tela do Modo Major:\n${leaks.join('\n')}`);
});

test('os módulos da lista existem (renomeou? atualize a lista)', () => {
  for (const f of [...FORA_DA_CARGA_INICIAL, ...FORA_DO_MAJOR_SG]) assert.ok(existsSync(join(ROOT, f)), relative(ROOT, join(ROOT, f)));
});
