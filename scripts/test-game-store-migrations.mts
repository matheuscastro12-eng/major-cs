// gameStore sem a cadeia de migrations na carga inicial: quem carrega o save
// (o CareerScreen, lazy) instala a cadeia. Save antigo sem a cadeia instalada
// falha alto em vez de hidratar e regravar no formato velho; com a cadeia, o
// save migra e é regravado no formato novo; save atual não precisa dela.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
(globalThis as Record<string, unknown>).window = { addEventListener: () => {} };
(globalThis as Record<string, unknown>).document = { addEventListener: () => {}, visibilityState: 'visible' };

const { useGame, installSaveMigrations } = await import('../src/state/gameStore.ts');
const { SAVE_VERSION } = await import('../src/state/saveVersion.ts');
const KEY = 'rtm-career-v1';

test('save atual abre sem a cadeia instalada', () => {
  mem.set(KEY, JSON.stringify({ _v: SAVE_VERSION, org: { name: 'Atual' } }));
  const s = useGame.getState().loadFromSlot(1) as Record<string, unknown>;
  assert.equal((s.org as { name: string }).name, 'Atual');
});

test('save antigo sem a cadeia instalada: falha alto e não regrava o slot', () => {
  const raw = JSON.stringify({ _v: SAVE_VERSION - 1, org: { name: 'Velho' } });
  mem.set(KEY, raw);
  assert.throws(() => useGame.getState().loadFromSlot(1), /installSaveMigrations/);
  assert.equal(mem.get(KEY), raw, 'o save antigo continua intacto no disco');
});

test('com a cadeia instalada, o save antigo migra e é regravado no formato novo', () => {
  mem.set(KEY, JSON.stringify({ _v: SAVE_VERSION - 1, org: { name: 'Velho' } }));
  installSaveMigrations((s) => ({ ...s, _v: SAVE_VERSION, migrado: true }));
  const s = useGame.getState().loadFromSlot(1) as Record<string, unknown>;
  assert.equal(s.migrado, true);
  assert.equal(JSON.parse(mem.get(KEY)!)._v, SAVE_VERSION);
});

test('o CareerScreen instala a cadeia real ao ser importado', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/components/CareerScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /^installSaveMigrations\(migrateSave\);$/m);
  assert.match(src, /import \{ migrateSave, type VersionedSave \} from '\.\.\/state\/saveMigrations';/);
});
