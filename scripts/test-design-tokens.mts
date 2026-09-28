// [DS] Tokens "Broadcast Desk" (src/styles/tokens.css): contraste WCAG dos
// pares texto × superfície nos dois temas (O0-38 / UX-08), nenhuma variável
// legada órfã (UX-01), nenhuma camada legada redefinida fora do mapa e nenhum
// hexadecimal nos arquivos do design system.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

// ── parser mínimo dos blocos de tokens ──────────────────────────────────────
const TOKENS = stripComments(read('src/styles/tokens.css'));
function block(selector: string): Record<string, string> {
  const at = TOKENS.indexOf(`${selector} {`);
  assert.ok(at >= 0, `bloco ${selector} não encontrado em tokens.css`);
  const body = TOKENS.slice(TOKENS.indexOf('{', at) + 1, TOKENS.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const DARK = block(':root');
const LIGHT = { ...DARK, ...block("[data-theme='light']") };

function resolve(vars: Record<string, string>, name: string, depth = 0): string {
  const v = vars[name];
  assert.ok(v, `token ${name} não definido`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref && depth < 8) return resolve(vars, ref[1], depth + 1);
  return v;
}
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  assert.match(h, /^[0-9a-f]{6}$/i, `esperava hexadecimal de 6 dígitos, veio ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(vars: Record<string, string>, fg: string, bg: string): number {
  const a = lum(rgb(resolve(vars, fg))), b = lum(rgb(resolve(vars, bg)));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const SURFACES = ['--c-surface-0', '--c-surface-1', '--c-surface-2', '--c-surface-3', '--c-shell', '--c-shell-glow', '--c-panel-head', '--c-rail'];
// tudo que aparece como TEXTO sobre superfície (tags, links, deltas, placar)
const TEXT_ON_SURFACE = [
  '--c-ink', '--c-ink-dim', '--c-ink-faint',
  '--mode-base', '--mode-rtp', '--mode-carreira', '--mode-ultimate', '--mode-diario', '--mode-online', '--mode-major',
  '--c-brand', '--c-achievement', '--c-win', '--c-loss', '--c-warn', '--c-epic', '--c-ct', '--c-t', '--c-live',
  '--c-attr-1', '--c-attr-2', '--c-attr-3', '--c-attr-4', '--c-attr-5',
  '--c-role-rifler', '--c-role-entry', '--c-role-awp', '--c-role-igl', '--c-role-support', '--c-role-lurker',
];
const MODES = ['--mode-base', '--mode-rtp', '--mode-carreira', '--mode-ultimate', '--mode-diario', '--mode-online', '--mode-major'];

for (const [theme, vars] of [['escuro', DARK], ['claro', LIGHT]] as const) {
  test(`contraste ≥ 4,5:1 de todo texto sobre as 4 superfícies (tema ${theme})`, () => {
    const fails: string[] = [];
    for (const fg of TEXT_ON_SURFACE) {
      for (const bg of SURFACES) {
        const c = contrast(vars, fg, bg);
        if (c < 4.5) fails.push(`${fg} sobre ${bg}: ${c.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(fails, []);
  });

  test(`contraste ≥ 4,5:1 do texto sobre preenchimentos (tema ${theme})`, () => {
    const fails: string[] = [];
    for (const m of MODES) {
      const c = contrast(vars, '--c-on-accent', m);
      if (c < 4.5) fails.push(`--c-on-accent sobre ${m}: ${c.toFixed(2)}:1`);
    }
    for (const [fg, bg] of [['--c-on-achievement', '--c-achievement'], ['--c-on-brand', '--c-brand'], ['--c-on-brand', '--c-brand-deep'], ['--c-on-brand', '--c-brand-strong'], ['--c-ink', '--c-topbar'], ['--c-topbar-ink', '--c-topbar'], ['--c-topbar-ink', '--c-topbar-mid'], ['--c-on-strong', '--c-live-fill'], ['--c-on-accent', '--c-loss']]) {
      const c = contrast(vars, fg, bg);
      if (c < 4.5) fails.push(`${fg} sobre ${bg}: ${c.toFixed(2)}:1`);
    }
    assert.deepEqual(fails, []);
  });
}

test('escala tipográfica: 6 degraus com piso de 11px', () => {
  const px = [1, 2, 3, 4, 5, 6].map((n) => {
    const v = DARK[`--fs-${n}`];
    assert.ok(v, `--fs-${n} ausente`);
    return parseFloat(v) * (v.endsWith('rem') ? 16 : 1);
  });
  assert.equal(px[0], 11);
  for (let i = 1; i < px.length; i++) assert.ok(px[i] > px[i - 1], 'degraus crescentes');
});

// ── camadas legadas ─────────────────────────────────────────────────────────
const LEGACY_FILE = stripComments(read('src/styles/tokens-legacy.css'));
const LEGACY_MAPPED = new Set([...LEGACY_FILE.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const LEGACY_PREFIX = /^--(rtm|em|rtp|ut|dl|dash)-/;
const LEGACY_BARE = new Set([
  '--bg', '--bg-deep', '--panel', '--panel-2', '--panel-3', '--header', '--row-a', '--row-b', '--border', '--border-soft',
  '--text', '--text-strong', '--dim', '--muted', '--faint', '--link', '--blue', '--blue-bright', '--green', '--green-bright',
  '--red', '--red-bright', '--gold', '--gold-2', '--gold-soft', '--gold-glow', '--pos', '--pos-soft', '--neg', '--neg-soft',
  '--radius', '--r-sm', '--r', '--r-lg', '--elev-1', '--elev-2', '--font', '--font-cond', '--mono', '--font-mono',
]);
const isLegacy = (v: string) => LEGACY_PREFIX.test(v) || LEGACY_BARE.has(v);

const CSS_FILES = walk('src', ['.css']);
const CODE_FILES = walk('src', ['.ts', '.tsx']);

test('nenhuma variável legada usada no app fica órfã (todas mapeadas em tokens-legacy.css)', () => {
  const used = new Set<string>();
  for (const f of [...CSS_FILES, ...CODE_FILES]) {
    const src = f.endsWith('.css') ? stripComments(read(f)) : read(f);
    for (const m of src.matchAll(/var\((--[\w-]+)/g)) used.add(m[1]);
  }
  const orphans = [...used].filter((v) => isLegacy(v) && !LEGACY_MAPPED.has(v)).sort();
  assert.deepEqual(orphans, []);
});

test('camadas legadas não são redefinidas fora de tokens-legacy.css', () => {
  const offenders: string[] = [];
  for (const f of CSS_FILES) {
    if (f.endsWith('tokens-legacy.css')) continue;
    for (const m of stripComments(read(f)).matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)) {
      if (isLegacy(m[1])) offenders.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('todo token semântico usado existe em tokens.css', () => {
  const defined = new Set([...TOKENS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const missing = new Set<string>();
  for (const f of [...CSS_FILES, ...CODE_FILES]) {
    const src = f.endsWith('.css') ? stripComments(read(f)) : read(f);
    for (const m of src.matchAll(/var\((--(?:c|sp|fs|rad|shadow|dur|ease|font|z|lh|tracking|mode)-[\w-]+)/g)) {
      if (!defined.has(m[1]) && !isLegacy(m[1])) missing.add(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual([...missing].sort(), []);
});

test('arquivos do design system não têm hexadecimal nem fontSize inline', () => {
  const DS = [
    'src/styles/tokens-legacy.css', 'src/styles/primitives.css', 'src/styles/base.css', 'src/styles/design-screen.css',
    'src/styles/shell.css', 'src/styles/home.css',
    ...walk('src/components/ds', ['.tsx', '.ts']), 'src/pages/DesignScreen.tsx',
  ];
  const offenders: string[] = [];
  for (const f of DS) {
    const src = f.endsWith('.css') ? stripComments(read(f)) : read(f).replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${f}: ${m[0]}`);
    if (!f.endsWith('.css') && /fontSize\s*:/.test(src)) offenders.push(`${f}: fontSize inline`);
  }
  assert.deepEqual(offenders, []);
});
