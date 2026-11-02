// [O0-01] Gate de ESM das Vercel Functions: (1) nenhum import de runtime sem
// `.js` na cadeia de api/ (varredura estática) e (2) cada handler de api/
// CARREGA em Node puro, sem o tsx — transpila a cadeia inteira pra um diretório
// temporário (como a Vercel faz: arquivo a arquivo, sem bundle) e importa cada
// api/*.js num processo `node` limpo. O tsx resolve import sem extensão, por
// isso os outros testes nunca pegaram o ERR_MODULE_NOT_FOUND de produção.
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeImports, scanApiImportGraph } from './esmImportGraph.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('varredura: regras do que conta como import de runtime', () => {
  const src = [
    "import { a } from './a';",
    "import type { B } from './b';",
    "import { type C } from './c';",
    "export type { D } from './d';",
    "export { e } from './e.js';",
    "import data from './f.json' with { type: 'json' };",
    "type M = typeof import('./g.js');",
    "const lazy = () => import('./h.js');",
  ].join('\n');
  assert.deepEqual(runtimeImports(src).map((i) => i.spec), ['./a', './c', './e.js', './f.json', './h.js']);
});

test('nenhum import relativo sem .js na cadeia de runtime de api/', () => {
  const { files, violations } = scanApiImportGraph(ROOT);
  assert.ok(files.includes('api/ranking.ts') && files.includes('src/engine/ultimate/weekendEvent.ts'), 'o grafo precisa alcançar a cadeia do evento de fim de semana');
  assert.deepEqual(violations, [], 'import sem extensão derruba a função na Vercel (ERR_MODULE_NOT_FOUND). Use o sufixo .js.');
});

test('cada handler de api/ carrega em Node ESM puro (sem tsx)', () => {
  const { files } = scanApiImportGraph(ROOT);
  const out = mkdtempSync(join(tmpdir(), 'rtm-esm-'));
  try {
    for (const rel of files) {
      const js = ts.transpileModule(readFileSync(join(ROOT, rel), 'utf8'), {
        fileName: rel,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2023,
          jsx: ts.JsxEmit.ReactJSX,
          verbatimModuleSyntax: true, // o mais estrito: `import { type X }` vira `import {}` e carrega o módulo
        },
      }).outputText;
      const dest = join(out, rel.replace(/\.tsx?$/, '.js'));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, js);
    }
    writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }));
    symlinkSync(join(ROOT, 'node_modules'), join(out, 'node_modules'), 'dir');
    const handlers = files.filter((f) => /^api\/[^/]+\.ts$/.test(f));
    // um processo pra todos: importa cada handler e junta as falhas (código + mensagem)
    const probe = `
      const files = ${JSON.stringify(handlers.map((f) => f.replace(/\.ts$/, '.js')))};
      const fails = [];
      for (const f of files) {
        try { await import(new URL(f, ${JSON.stringify(`file://${out}/`)}).href); }
        catch (e) { fails.push(f + ': ' + (e && e.code ? e.code + ' ' : '') + String(e && e.message || e).split('\\n')[0]); }
      }
      console.log(JSON.stringify(fails));`;
    // env mínimo: nada de DATABASE_URL/segredos no processo de prova
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: out, env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 60_000 });
    assert.equal(r.status, 0, `node saiu com ${r.status}: ${r.stderr}`);
    const fails = JSON.parse(r.stdout.trim().split('\n').pop() ?? '[]') as string[];
    assert.ok(handlers.length >= 10, 'esperava achar os handlers de api/');
    assert.deepEqual(fails, []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
