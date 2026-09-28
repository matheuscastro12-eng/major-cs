// [O0-28/O1-35/O0-26/O0-12] Carreira: restore depois do mount remonta pelo
// epoch, lápide limpa a memória, sync entre abas, push pra nuvem mesmo com a
// gravação local falhando e o reset local da tela de erro (sem lápide).
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map<string, string>();
let quotaLimit = Infinity;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (String(v).length > quotaLimit) throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
    mem.set(k, String(v));
  },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const handlers = new Map<string, (e?: unknown) => void>();
(globalThis as Record<string, unknown>).window = { addEventListener: (ev: string, fn: (e?: unknown) => void) => { handlers.set(ev, fn); } };
(globalThis as Record<string, unknown>).document = { addEventListener: () => {}, visibilityState: 'visible' };
mem.set('rtm-acct-token-v1', 'tok');

type Reply = { status: number; body?: unknown };
let replies: Reply[] = [];
const pushes: Record<string, unknown>[] = [];
(globalThis as Record<string, unknown>).fetch = async (url: string, init?: { body?: string }) => {
  if (url !== '/api/cloud-save') return { ok: true, status: 200, json: async () => ({}) } as Response;
  const body = JSON.parse(init?.body ?? '{}');
  if (body.action === 'push') pushes.push(body);
  const r = replies.shift() ?? { status: 200, body: { ok: true } };
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
};

const { useGame, resetSlotLocal } = await import('../src/state/gameStore.ts');
const cloud = await import('../src/state/cloud.ts');
const { useSaveHealth } = await import('../src/state/saveHealth.ts');
cloud.setCloudEnabled(true);
const KEY = 'rtm-career-v1';
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

test('aparelho novo: restore termina DEPOIS do mount → reload do disco + epoch (a tela remonta com o save da nuvem)', async () => {
  mem.delete(KEY);
  // "mount": a carreira carrega o slot vazio (a tela iria pra fundação)
  assert.equal(useGame.getState().loadFromSlot(1), null);
  const epoch0 = useGame.getState().epoch;
  const cloudSave = JSON.stringify({ _v: 99, org: { name: 'Nuvem FC' }, split: 7 });
  replies = [{ status: 200, body: { data: cloudSave, updatedAt: 1234 } }];
  assert.equal(await cloud.syncSlot('career', KEY), 'restored');
  useGame.getState().reloadFromDisk(); // o que o App faz no 'restored'
  const st = useGame.getState();
  assert.equal(st.epoch, epoch0 + 1, 'epoch muda → key da CareerScreen muda → stage recalculado');
  assert.equal((st.save as { org?: { name: string } } | null)?.org?.name, 'Nuvem FC');
  // a próxima gravação parte do save restaurado, não de um emptySave por cima
  useGame.getState().update({ split: 8 } as never);
  const disk = JSON.parse(mem.get(KEY)!);
  assert.equal(disk.org.name, 'Nuvem FC');
  assert.equal(disk.split, 8);
});

test("lápide de outro aparelho ('deleted'): a memória também esvazia (o autosave não ressuscita)", async () => {
  mem.set(KEY, JSON.stringify({ _v: 99, org: { name: 'Velho' } }));
  mem.set(`${KEY}.cloudts`, '10');
  useGame.getState().loadFromSlot(1);
  replies = [{ status: 200, body: { data: '', updatedAt: 50 } }];
  assert.equal(await cloud.syncSlot('career', KEY), 'deleted');
  useGame.getState().reloadFromDisk();
  assert.equal(useGame.getState().save, null);
});

test('outra aba gravou o mesmo slot: esta re-hidrata e bumpa o epoch', () => {
  mem.set(KEY, JSON.stringify({ _v: 99, org: { name: 'Aba A' }, split: 1 }));
  useGame.getState().loadFromSlot(1);
  const e0 = useGame.getState().epoch;
  mem.set(KEY, JSON.stringify({ _v: 99, org: { name: 'Aba A' }, split: 5 })); // a outra aba jogou
  handlers.get('storage')?.({ key: KEY, newValue: mem.get(KEY) });
  assert.equal((useGame.getState().save as { split?: number }).split, 5);
  assert.equal(useGame.getState().epoch, e0 + 1);
  handlers.get('storage')?.({ key: KEY, newValue: JSON.stringify(useGame.getState().save) });
  assert.equal(useGame.getState().epoch, e0 + 1, 'mesmo conteúdo da memória: não remonta');
  handlers.get('storage')?.({ key: 'outra-chave' });
  assert.equal(useGame.getState().epoch, e0 + 1, 'chave de outro slot não mexe');
});

test('gravação local falhou: o banner recebe o erro e o save AINDA sobe pra nuvem', async () => {
  pushes.length = 0;
  mem.set(KEY, JSON.stringify({ _v: 99, org: { name: 'X' } }));
  useGame.getState().loadFromSlot(1);
  quotaLimit = 10; // nada grande cabe
  useGame.getState().update({ split: 99 } as never);
  quotaLimit = Infinity;
  assert.ok(useGame.getState().lastPersistError);
  assert.ok(useSaveHealth.getState().localErrors.career, 'espelhado na saveHealth');
  handlers.get('pagehide')?.();
  await settle();
  assert.equal(pushes.length, 1);
  assert.equal(JSON.parse(pushes[0].data as string).split, 99);
  // gravou de novo: o aviso some
  useGame.getState().persistNow();
  assert.equal(useSaveHealth.getState().localErrors.career, undefined);
});

test('reset da tela de erro: tira o save do aparelho, guarda .corrupt, trava o sync e NÃO grava lápide', async () => {
  pushes.length = 0;
  mem.set(`${KEY}__s2`, '{"_v":99,"org":{"name":"Quebrado"}}');
  mem.set(`${KEY}__s2.bak`, '{"_v":99}');
  useGame.getState().loadFromSlot(2);
  const e0 = useGame.getState().epoch;
  resetSlotLocal(2);
  handlers.get('pagehide')?.();
  await settle();
  assert.equal(mem.has(`${KEY}__s2`), false);
  assert.equal(mem.has(`${KEY}__s2.bak`), false);
  assert.equal(mem.get(`${KEY}__s2.corrupt`), '{"_v":99,"org":{"name":"Quebrado"}}');
  assert.equal(cloud.cloudHold(`${KEY}__s2`), 'reset');
  assert.equal(useGame.getState().save, null);
  assert.equal(useGame.getState().epoch, e0 + 1);
  assert.equal(pushes.length, 0, 'nenhuma lápide/push na nuvem');
});
