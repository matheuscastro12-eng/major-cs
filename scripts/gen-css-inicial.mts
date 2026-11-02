// Gera os dois CSS que tiram as folhas das telas de jogo da carga inicial:
//
//   src/styles/carga-inicial.css  cópia (verbatim, na ordem) das regras de MOVIDOS
//                                 que podem casar em algo da carga inicial (landing,
//                                 Início, shell, modais globais) ou do /major-singapore.
//                                 O main.tsx importa no lugar onde os MOVIDOS ficavam.
//   src/styles/telas.css          @import de todos os MOVIDOS + todo o CSS global que
//                                 vinha depois deles, na ordem do bundle. Carrega com as
//                                 telas de jogo (state/telasCss.ts) logo depois do CSS
//                                 global: cada regra volta a ter, em relação às outras,
//                                 a mesma posição de antes, e a cópia da carga inicial
//                                 fica sempre atrás do original. Cascata idêntica.
//
// "Pode casar": toda classe do seletor aparece num literal de string (ou JSON) de
// algum arquivo alcançável pelos imports estáticos de KEEP_ENTRIES. Seletor sem
// classe, @keyframes, @font-face etc. entram sempre. Na dúvida, a regra fica.
//
// Rode com: npm run gen:css-inicial   (o teste scripts/test-css-inicial.mts falha se
// um dos dois arquivos divergir do que este script gera)
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname;

/** CSS que saem da carga inicial (ordem do main.tsx) */
export const MOVIDOS = [
  'src/index.css',
  'src/styles/career-dashboard.css',
  'src/styles/career-player-page.css',
  'src/styles/career-team-page.css',
  'src/styles/play-hub.css',
  'src/styles/rtp.css',
];
/** telas que abrem sem o telas.css: a carga inicial e o /major-singapore (visão geral e Pick'em) */
export const KEEP_ENTRIES = ['src/main.tsx', 'src/components/major/MajorSingaporeScreen.tsx'];
export const CARGA_INICIAL = 'src/styles/carga-inicial.css';
export const TELAS = 'src/styles/telas.css';

// ── grafo de imports estáticos (mesmo resolvedor do test-initial-load) ─────────
const IMPORT_RE = /^\s*import\s+(?!type\b)[^;'"]*?\s+from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|^\s*export\s+(?!type\b)[^;'"]*?\s+from\s+['"]([^'"]+)['"]/gm;
function resolveSpec(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec));
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx', '.json']) {
    const p = base + ext;
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p;
  }
  return null;
}
const importsOf = (f: string) => [...readFileSync(join(ROOT, f), 'utf8').matchAll(IMPORT_RE)]
  .map((m) => resolveSpec(f, m[1] ?? m[2] ?? m[3])).filter((d): d is string => !!d);

/** arquivos alcançáveis por imports estáticos */
export function staticFiles(entries: string[]): Set<string> {
  const seen = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length) {
    const f = queue.shift()!;
    if (!/\.(tsx?|mts)$/.test(f)) continue;
    for (const d of importsOf(f)) if (!seen.has(d)) { seen.add(d); queue.push(d); }
  }
  return seen;
}

/** ordem do CSS global no bundle: ordem de avaliação dos módulos (pós-ordem do DFS) */
export function globalCssOrder(entry = 'src/main.tsx'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const visit = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    if (f.endsWith('.css')) { out.push(f); return; }
    if (!/\.(tsx?|mts)$/.test(f)) return;
    for (const d of importsOf(f)) visit(d);
  };
  visit(entry);
  return out;
}

// ── classes citadas no código (literais de string, templates e JSON) ──────────
interface Uso { tokens: Set<string>; prefixos: Set<string>; sufixos: Set<string> }
export function usoDe(files: Iterable<string>): Uso {
  const uso: Uso = { tokens: new Set(), prefixos: new Set(), sufixos: new Set() };
  const add = (s: string, cabecaDeTemplate: boolean) => {
    const parts = s.split(/\s+/).filter(Boolean);
    parts.forEach((p, i) => {
      // `em-status-${x}` e 'em-btn-' + x: qualquer classe que comece assim
      if ((cabecaDeTemplate && i === parts.length - 1 && /[\w-]$/.test(s)) || /^[a-z][\w-]*-$/.test(p)) uso.prefixos.add(p.split(/[^\w-]+/).pop()!);
      // `${base}--light`: qualquer classe que termine assim
      if (/^-{1,2}[a-z][\w-]*$/.test(p)) uso.sufixos.add(p);
      for (const t of p.split(/[^\w-]+/)) if (t) uso.tokens.add(t);
    });
  };
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    if (f.endsWith('.json')) {
      const visit = (v: unknown) => {
        if (typeof v === 'string') add(v, false);
        else if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { add(k, false); visit(x); }
      };
      visit(JSON.parse(text));
      continue;
    }
    if (!/\.(tsx?|mts)$/.test(f)) continue;
    const sc = ts.createScanner(ts.ScriptTarget.Latest, false, f.endsWith('x') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
    const pilha: ('template' | 'chave')[] = [];
    let anterior = ts.SyntaxKind.Unknown;
    for (let k = sc.scan(); k !== ts.SyntaxKind.EndOfFileToken; anterior = k, k = sc.scan()) {
      if (k === ts.SyntaxKind.WhitespaceTrivia || k === ts.SyntaxKind.NewLineTrivia) { k = anterior; continue; }
      // `/` depois de algo que não fecha expressão abre um regex: consome inteiro
      if ((k === ts.SyntaxKind.SlashToken || k === ts.SyntaxKind.SlashEqualsToken) && !FECHA_EXPRESSAO.has(anterior)) { k = sc.reScanSlashToken(); continue; }
      if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral) add(sc.getTokenValue(), false);
      else if (k === ts.SyntaxKind.TemplateHead) { add(sc.getTokenValue(), true); pilha.push('template'); }
      else if (k === ts.SyntaxKind.OpenBraceToken) pilha.push('chave');
      else if (k === ts.SyntaxKind.CloseBraceToken) {
        if (pilha[pilha.length - 1] === 'template') {
          const r = sc.reScanTemplateToken(false);
          add(sc.getTokenValue(), r === ts.SyntaxKind.TemplateMiddle);
          if (r !== ts.SyntaxKind.TemplateMiddle) pilha.pop();
        } else pilha.pop();
      }
    }
  }
  return uso;
}
const FECHA_EXPRESSAO = new Set([
  ts.SyntaxKind.Identifier, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken, ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail, ts.SyntaxKind.ThisKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword,
]);
export const usada = (c: string, uso: Uso) => uso.tokens.has(c)
  || [...uso.prefixos].some((p) => p.length >= 3 && c.startsWith(p))
  || [...uso.sufixos].some((s) => s.length >= 3 && c.endsWith(s));

// ── parser mínimo de CSS (sem aninhamento; os arquivos daqui não usam) ────────
type No = { tipo: 'regra'; seletor: string; texto: string } | { tipo: 'bloco'; prelude: string; filhos: No[] } | { tipo: 'at'; texto: string };
function fimDoBloco(css: string, abre: number): number {
  let prof = 0;
  for (let i = abre; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = css.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'") { i = fimDaString(css, i); continue; }
    if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return i;
  }
  throw new Error('bloco sem fechar');
}
function fimDaString(css: string, i: number): number {
  const q = css[i];
  for (let j = i + 1; j < css.length; j++) { if (css[j] === '\\') j++; else if (css[j] === q) return j; }
  throw new Error('string sem fechar');
}
export function parseCss(css: string): No[] {
  const out: No[] = [];
  let ini = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const fim = css.indexOf('*/', i + 2);
      if (css.slice(ini, i).trim() === '') ini = fim + 2; // comentário entre regras: some
      i = fim + 1;
      continue;
    }
    if (c === '"' || c === "'") { i = fimDaString(css, i); continue; }
    if (c === ';') { // @import/@charset soltos
      const t = css.slice(ini, i + 1).trim();
      if (t) out.push({ tipo: 'at', texto: t });
      ini = i + 1;
      continue;
    }
    if (c === '{') {
      const fim = fimDoBloco(css, i);
      const prelude = css.slice(ini, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const corpo = css.slice(i + 1, fim);
      if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) out.push({ tipo: 'bloco', prelude, filhos: parseCss(corpo) });
      else if (prelude.startsWith('@')) out.push({ tipo: 'at', texto: `${prelude} {${corpo}}` });
      else out.push({ tipo: 'regra', seletor: prelude, texto: `${prelude} {${corpo}}` });
      ini = fim + 1;
      i = fim;
    }
  }
  return out;
}

/** separa a lista de seletores nas vírgulas do nível de cima */
export function seletores(lista: string): string[] {
  const out: string[] = [];
  let prof = 0, ini = 0;
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    if (c === '"' || c === "'") { i = fimDaString(lista, i); continue; }
    if (c === '(' || c === '[') prof++;
    else if (c === ')' || c === ']') prof--;
    else if (c === ',' && prof === 0) { out.push(lista.slice(ini, i).trim()); ini = i + 1; }
  }
  out.push(lista.slice(ini).trim());
  return out.filter(Boolean);
}
/** classes que o elemento (ou um ancestral/irmão) precisa ter pro seletor casar */
export function classesExigidas(sel: string): string[] {
  let s = sel.replace(/\[[^\]]*\]/g, '[]'); // valor de atributo não é classe ([href$=".pdf"])
  // :not()/:is()/:where() não exigem as classes de dentro (na dúvida, a regra fica)
  for (let guard = 0; guard < 10 && /:(not|is|where|matches|-webkit-any)\(/.test(s); guard++) {
    s = s.replace(/:(not|is|where|matches|-webkit-any)\(([^()]|\([^()]*\))*\)/g, '');
  }
  return [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

function filtra(nos: No[], fica: (sel: string) => boolean): No[] {
  const out: No[] = [];
  for (const n of nos) {
    if (n.tipo === 'at') out.push(n);
    else if (n.tipo === 'regra') { if (seletores(n.seletor).some(fica)) out.push(n); }
    else { const filhos = filtra(n.filhos, fica); if (filhos.length) out.push({ ...n, filhos }); }
  }
  return out;
}
function imprime(nos: No[], ind = ''): string {
  return nos.map((n) => n.tipo === 'bloco'
    ? `${ind}${n.prelude} {\n${imprime(n.filhos, ind + '  ')}\n${ind}}`
    : `${ind}${n.texto.replace(/\n/g, `\n${ind}`)}`).join('\n');
}
const conta = (nos: No[]): number => nos.reduce((s, n) => s + (n.tipo === 'bloco' ? conta(n.filhos) : 1), 0);

const AVISO = '/* GERADO por scripts/gen-css-inicial.mts: não edite à mão (npm run gen:css-inicial). */';

export function generate(): { inicial: string; telas: string; resumo: string } {
  const global = globalCssOrder();
  const vazou = MOVIDOS.filter((f) => global.includes(f));
  if (vazou.length) throw new Error(`ainda importados na carga inicial: ${vazou.join(', ')}`);
  const at = global.indexOf(CARGA_INICIAL);
  if (at < 0) throw new Error(`${CARGA_INICIAL} não está no CSS global do main.tsx`);

  const uso = usoDe(staticFiles(KEEP_ENTRIES));
  const fica = (sel: string) => classesExigidas(sel).every((c) => usada(c, uso));
  const partes: string[] = [];
  const resumo: string[] = [];
  for (const f of MOVIDOS) {
    const nos = parseCss(readFileSync(join(ROOT, f), 'utf8'));
    const ficam = filtra(nos, fica);
    resumo.push(`${f}: ${conta(ficam)}/${conta(nos)} regras`);
    if (ficam.length) partes.push(`/* ── ${f} ── */\n${imprime(ficam)}`);
  }
  const inicial = `${AVISO}
/* Regras de ${MOVIDOS.map((f) => f.split('/').pop()).join(', ')} que a carga
   inicial (landing, Início, shell, modais globais) e o /major-singapore podem usar.
   O resto só chega com as telas de jogo, no ${TELAS.split('/').pop()} (ver state/telasCss.ts). */
${partes.join('\n')}
`;
  const dir = dirname(join(ROOT, TELAS));
  const imports = [...MOVIDOS, ...global.slice(at + 1)].map((f) => `@import '${relative(dir, join(ROOT, f)).replace(/^(?!\.)/, './')}';`);
  const telas = `${AVISO}
/* CSS das telas de jogo: os arquivos que saíram da carga inicial + todo o CSS
   global que vinha depois deles, na ordem do bundle. state/telasCss.ts insere esta
   folha logo depois do CSS global, então a cascata é a mesma de antes. */
${imports.join('\n')}
`;
  return { inicial, telas, resumo: resumo.join('\n') };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const { inicial, telas, resumo } = generate();
  const alvo: [string, string][] = [[CARGA_INICIAL, inicial], [TELAS, telas]];
  if (process.argv.includes('--check')) {
    const velhos = alvo.filter(([f, txt]) => !existsSync(join(ROOT, f)) || readFileSync(join(ROOT, f), 'utf8') !== txt).map(([f]) => f);
    if (velhos.length) { console.error(`desatualizado: ${velhos.join(', ')} (rode npm run gen:css-inicial)`); process.exit(1); }
    console.log('ok');
  } else {
    for (const [f, txt] of alvo) writeFileSync(join(ROOT, f), txt);
    console.log(resumo);
  }
}
