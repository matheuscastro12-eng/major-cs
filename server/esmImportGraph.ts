// [O0-01] Grafo de imports de RUNTIME das Vercel Functions (api/*.ts e tudo o
// que elas carregam de server/ e src/). Na Vercel cada arquivo é transpilado
// SEM bundle e o Node ESM resolve o especificador ao pé da letra: import
// relativo sem `.js` vira ERR_MODULE_NOT_FOUND no load e derruba a função
// inteira (Mercado em 2026-07-05; ranking, liveops e lobby em set/2026, DADO-01).
// Os testes rodam com tsx, que resolve import sem extensão — por isso nada
// falhava. Este módulo acha as violações estaticamente; o teste
// server/esm-imports.test.ts usa ele e ainda carrega cada handler em Node puro.
//
// O que conta como import de runtime:
// - `import ... from` e `export ... from`, exceto `import type`/`export type`
//   (apagados por qualquer compilador). `import { type A } from` CONTA: com
//   verbatimModuleSyntax ele vira `import {} from`, que carrega o módulo.
// - `import('./x.js')` dinâmico (o loader lazy do catálogo usa).
// - `typeof import('./x.js')` é só tipo e não conta.
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export interface ImportViolation {
  file: string;   // relativo à raiz do repo
  spec: string;   // especificador como está no código
  reason: 'sem-extensao' | 'json-sem-atributo' | 'nao-encontrado';
}

export interface ImportGraph {
  files: string[];            // arquivos alcançáveis em runtime (relativos)
  violations: ImportViolation[];
}

interface RuntimeImport { spec: string; json: boolean; hasAttributes: boolean }

// imports de runtime de um arquivo TS (ver regras no topo).
export function runtimeImports(source: string, fileName = 'x.ts'): RuntimeImport[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: RuntimeImport[] = [];
  const push = (lit: ts.Expression | undefined, attrs: boolean) => {
    if (!lit || !ts.isStringLiteral(lit)) return;
    out.push({ spec: lit.text, json: lit.text.endsWith('.json'), hasAttributes: attrs });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) push(node.moduleSpecifier, !!node.attributes);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier) push(node.moduleSpecifier, !!node.attributes);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      push(node.arguments[0], node.arguments.length > 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// resolve `./x.js` → x.ts/x.tsx (o arquivo que a Vercel transpila pra x.js).
function resolveJs(abs: string): string | null {
  for (const ext of ['.ts', '.tsx']) {
    const c = abs.replace(/\.js$/, ext);
    if (existsSync(c)) return c;
  }
  return existsSync(abs) ? abs : null;
}

// caminha o grafo a partir de api/*.ts (e de extras, se passados).
export function scanApiImportGraph(root: string, entries?: string[]): ImportGraph {
  const apiDir = join(root, 'api');
  const start = entries ?? readdirSync(apiDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => join(apiDir, f));
  const seen = new Set<string>();
  const violations: ImportViolation[] = [];
  const queue = [...start];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    const rel = relative(root, file);
    for (const imp of runtimeImports(readFileSync(file, 'utf8'), file)) {
      if (!imp.spec.startsWith('.')) continue; // pacote do node_modules: o Node resolve
      const abs = resolve(dirname(file), imp.spec);
      if (imp.json) {
        if (!imp.hasAttributes) violations.push({ file: rel, spec: imp.spec, reason: 'json-sem-atributo' });
        continue;
      }
      if (!imp.spec.endsWith('.js')) {
        violations.push({ file: rel, spec: imp.spec, reason: 'sem-extensao' });
        // segue a cadeia mesmo assim, pra listar tudo de uma vez
        const guess = ['.ts', '.tsx'].map((e) => abs + e).find((c) => existsSync(c));
        if (guess) queue.push(guess);
        continue;
      }
      const target = resolveJs(abs);
      if (!target) { violations.push({ file: rel, spec: imp.spec, reason: 'nao-encontrado' }); continue; }
      queue.push(target);
    }
  }
  return { files: [...seen].map((f) => relative(root, f)).sort(), violations };
}
