// CSS das telas fora da carga inicial (scripts/gen-css-inicial.mts):
//  - carga-inicial.css e telas.css batem com o gerador (mudou index.css, um CSS de
//    tela ou a ordem dos imports do main.tsx → npm run gen:css-inicial);
//  - telas.css repete o CSS global a partir dos arquivos que saíram, na ordem do
//    bundle (é isso que deixa a cascata idêntica quando ele carrega);
//  - o filtro de seletor não descarta regra que a carga inicial pode usar;
//  - o carregador (state/lazyCss.ts) põe a folha logo depois do CSS global, mesmo
//    com CSS lazy que já chegou, e tenta de novo depois de uma falha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CARGA_INICIAL, MOVIDOS, TELAS, classesExigidas, generate, globalCssOrder, parseCss, seletores } from './gen-css-inicial.mts';
import { createSheetLoader, type DocLike, type ElLike, type LinkLike } from '../src/state/lazyCss.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

test('carga-inicial.css e telas.css estão em dia com o gerador', () => {
  const { inicial, telas } = generate();
  assert.equal(read(CARGA_INICIAL), inicial, `${CARGA_INICIAL} desatualizado: rode npm run gen:css-inicial`);
  assert.equal(read(TELAS), telas, `${TELAS} desatualizado: rode npm run gen:css-inicial`);
});

test('telas.css = arquivos que saíram + todo CSS global que vinha depois, na ordem do bundle', () => {
  const global = globalCssOrder();
  for (const f of MOVIDOS) assert.ok(!global.includes(f), `${f} voltou pro CSS global`);
  const at = global.indexOf(CARGA_INICIAL);
  assert.ok(at > 0, 'o main.tsx importa o carga-inicial.css');
  const imports = [...read(TELAS).matchAll(/@import '([^']+)'/g)].map((m) => join('src/styles', m[1]));
  assert.deepEqual(imports, [...MOVIDOS, ...global.slice(at + 1)]);
  // tokens primeiro e primitives/skin depois dos CSS das telas, como antes
  assert.deepEqual(global.slice(0, at), ['src/styles/tokens.css', 'src/styles/tokens-legacy.css', 'src/styles/base.css']);
  assert.ok(global.indexOf('src/styles/primitives.css') > at && global.indexOf('src/styles/skin.css') > at);
});

test('toda regra do carga-inicial.css é cópia fiel de uma regra de origem, na mesma ordem', () => {
  type No = ReturnType<typeof parseCss>[number];
  // folhas da árvore com o @media/@supports em volta; espaço normalizado (a cópia é reindentada)
  const folhas = (nos: No[], ctx = ''): string[] => nos.flatMap((n) => (n.tipo === 'bloco' ? folhas(n.filhos, `${ctx}${n.prelude}|`) : [`${ctx}${n.texto}`.replace(/\s+/g, ' ')]));
  const origem = MOVIDOS.flatMap((f) => folhas(parseCss(read(f))));
  const copia = folhas(parseCss(read(CARGA_INICIAL)));
  assert.ok(copia.length > 100 && copia.length < origem.length);
  let i = 0;
  for (const c of copia) {
    while (i < origem.length && origem[i] !== c) i++;
    assert.ok(i < origem.length, `regra sem origem (ou fora de ordem): ${c.slice(0, 100)}`);
    i++;
  }
});

test('filtro de seletor: atributo, :not e :is não viram exigência; vírgula só no nível de cima', () => {
  assert.deepEqual(classesExigidas('.a .b:hover > span'), ['a', 'b']);
  assert.deepEqual(classesExigidas('a[href$=".pdf"].doc'), ['doc']);
  assert.deepEqual(classesExigidas('.btn:not(.ghost):not(:disabled)'), ['btn']);
  assert.deepEqual(classesExigidas('.x :is(.y, .z) .w'), ['x', 'w']);
  assert.deepEqual(classesExigidas('body:has(.page-play) .app-header'), ['page-play', 'app-header']);
  assert.deepEqual(classesExigidas('input[type="range"]::-webkit-slider-thumb'), []);
  assert.deepEqual(seletores('.a, .b:is(.c, .d), [data-x="1,2"]'), ['.a', '.b:is(.c, .d)', '[data-x="1,2"]']);
  const nos = parseCss('/* c */ .a{color:red} @media (min-width:1px){ .b{x:"}"} .c{y:1} } @keyframes k{from{a:1}to{a:2}}');
  assert.deepEqual(nos.map((n) => n.tipo), ['regra', 'bloco', 'at']);
});

// ── carregador com um <head> falso ─────────────────────────────────────────
function fakeDoc() {
  const head: ElLike[] = [];
  const el = (tag: string): ElLike & { tag: string } => {
    const e: ElLike & { tag: string } = { tag, isConnected: true, after(x: ElLike) { head.splice(head.indexOf(e) + 1, 0, x); (x as ElLike).isConnected = true; } };
    return e;
  };
  const created: LinkLike[] = [];
  const doc: DocLike = {
    head: {
      querySelectorAll: () => head.filter((x) => ['link', 'style'].includes((x as { tag?: string }).tag ?? '')),
      appendChild: (x: ElLike) => { head.push(x); x.isConnected = true; },
    },
    createElement: () => {
      const l = Object.assign(el('link'), {
        rel: '', href: '', onload: null, onerror: null, attrs: {} as Record<string, string>,
        remove() { head.splice(head.indexOf(l), 1); l.isConnected = false; },
        setAttribute(k: string, v: string) { l.attrs[k] = v; },
      }) as LinkLike & { tag: string; attrs: Record<string, string> };
      created.push(l);
      return l;
    },
  };
  return { head, doc, created, el };
}

test('a folha entra logo depois do CSS global, antes do CSS lazy que já chegou', async () => {
  const { head, doc, created, el } = fakeDoc();
  const global = el('link');
  head.push(el('meta'), global);
  const loader = createSheetLoader('/assets/telas.css', 'telas', () => doc);
  loader.markGlobalEnd();
  const lazyMajor = el('link'); head.push(lazyMajor); // major.css anexado pelo Vite no fim
  const p1 = loader.load();
  const p2 = loader.load();
  assert.equal(p1, p2, 'uma folha só');
  assert.equal(created.length, 1);
  assert.deepEqual(head.map((x) => x === global ? 'global' : x === lazyMajor ? 'major' : (x as { tag: string }).tag), ['meta', 'global', 'link', 'major']);
  assert.equal(created[0].href, '/assets/telas.css');
  assert.equal(created[0].rel, 'stylesheet');
  created[0].onload!();
  await p1;
});

test('falha ao baixar a folha: rejeita, tira o <link> e a próxima chamada tenta de novo', async () => {
  const { head, doc, created, el } = fakeDoc();
  head.push(el('style'));
  const loader = createSheetLoader('/t.css', 't', () => doc);
  loader.markGlobalEnd();
  const p = loader.load();
  created[0].onerror!();
  await assert.rejects(p, /css_load_failed/);
  assert.equal(head.length, 1);
  const again = loader.load();
  assert.equal(created.length, 2);
  created[1].onload!();
  await again;
});

test('sem document (testes, SSR) o carregador não faz nada', async () => {
  const loader = createSheetLoader('/t.css', 't', () => undefined);
  loader.markGlobalEnd();
  await loader.load();
});
