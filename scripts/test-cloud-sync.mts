// [O0-14/O0-27/O0-12/O0-26] Sync da nuvem no cliente: 413 não é transitório,
// restore com resgate de cota e trava 'quota', trava 'reset' da tela de erro,
// "Liberar espaço" e o backup JSON.
import test from 'node:test';
import assert from 'node:assert/strict';

// ── fakes do navegador (antes de importar os módulos) ────────────────────────
const mem = new Map<string, string>();
let quotaLimit = Infinity; // setItem de valor maior que isto estoura a cota
const quotaErr = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
const storage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { if (String(v).length > quotaLimit) throw quotaErr(); mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
(globalThis as Record<string, unknown>).localStorage = storage;
const handlers = new Map<string, () => void>();
(globalThis as Record<string, unknown>).window = { addEventListener: (ev: string, fn: () => void) => { handlers.set(ev, fn); } };
(globalThis as Record<string, unknown>).document = { addEventListener: () => {}, visibilityState: 'visible' };
mem.set('rtm-acct-token-v1', 'tok');

type Reply = { status: number; body?: unknown };
let replies: Reply[] = [];
const saveCalls: Record<string, unknown>[] = [];
(globalThis as Record<string, unknown>).fetch = async (url: string, init?: { body?: string }) => {
  if (url !== '/api/cloud-save') return { ok: true, status: 200, json: async () => ({}) } as Response; // /api/error etc.
  saveCalls.push(JSON.parse(init?.body ?? '{}'));
  const r = replies.shift() ?? { status: 200, body: { ok: true } };
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
};

const cloud = await import('../src/state/cloud.ts');
const health = await import('../src/state/saveHealth.ts');
const { freeLocalSpace } = await import('../src/state/storageQuota.ts');
const { buildSaveBackup, backupFileName } = await import('../src/state/saveRecovery.ts');
cloud.setCloudEnabled(true);

// Espera o trabalho assíncrono do sync terminar. Só setImmediate não basta em
// runner lento (CI): o push em voo vazava para o teste seguinte. Intercala
// rodadas de setImmediate com macrotarefas curtas — os timers de retry do sync
// (30 s) não disparam nessa janela.
const settle = async () => {
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 5));
  }
};
const flushNow = async () => { handlers.get('pagehide')?.(); await settle(); };

test('413 no push: o slot para de tentar, avisa e não reagenda', async () => {
  saveCalls.length = 0;
  replies = [{ status: 413, body: { error: 'save grande demais' } }];
  cloud.cloudOnLocalSave('career-3', 'k3', () => '{"a":1}');
  await flushNow();
  assert.equal(saveCalls.length, 1);
  const block = health.getCloudBlock('career-3');
  assert.equal(block?.reason, 'too-large');
  assert.equal(block?.message, 'save grande demais');
  // novas gravações locais não reenviam nada nesta sessão
  cloud.cloudOnLocalSave('career-3', 'k3', () => '{"a":2}');
  await flushNow();
  assert.equal(saveCalls.length, 1, 'nenhum reenvio depois do 413');
});

test('5xx no push continua transitório (sem bloqueio, snapshot preservado)', async () => {
  saveCalls.length = 0;
  replies = [{ status: 503 }, { status: 200, body: { ok: true } }];
  cloud.cloudOnLocalSave('career-4', 'k4', () => '{"b":1}');
  await flushNow();
  assert.equal(health.getCloudBlock('career-4'), null);
  await flushNow(); // a tentativa seguinte leva o mesmo snapshot
  assert.equal(saveCalls.length, 2);
  assert.equal(saveCalls[1].data, '{"b":1}');
});

test('restore que não cabe: devolve quota, trava o slot e não deixa o save velho subir', async () => {
  saveCalls.length = 0;
  mem.set('rtm-rtp-v1', '{"old":true}');
  mem.set('rtm-rtp-v1.cloudts', '100');
  const big = JSON.stringify({ new: 'x'.repeat(200) });
  quotaLimit = 100;
  replies = [{ status: 200, body: { data: big, updatedAt: 500 } }];
  const r = await cloud.syncSlot('rtp', 'rtm-rtp-v1');
  assert.equal(r, 'quota');
  assert.equal(cloud.cloudHold('rtm-rtp-v1'), 'quota');
  assert.equal(health.getCloudBlock('rtp')?.reason, 'quota');
  assert.equal(mem.get('rtm-rtp-v1'), '{"old":true}', 'o local velho fica intacto');
  // o jogador joga mais um pouco: nada sobe (subir apagaria o save novo da nuvem)
  const before = saveCalls.length;
  cloud.cloudOnLocalSave('rtp', 'rtm-rtp-v1', () => '{"old":true,"week":2}');
  await flushNow();
  assert.equal(saveCalls.length, before);
  // liberou espaço: o próximo sync ignora o ts local e baixa de novo
  quotaLimit = Infinity;
  health.clearCloudBlock('rtp'); // bloqueio de sessão; a trava persistida segue valendo
  mem.set('rtm-rtp-v1.cloudts', String(Date.now())); // RtP carimba .cloudts a cada save
  replies = [{ status: 200, body: { data: big, updatedAt: 500 } }];
  const r2 = await cloud.syncSlot('rtp', 'rtm-rtp-v1');
  assert.equal(r2, 'restored');
  assert.equal(saveCalls.at(-1)?.since, 0, 'pull sem o ts local (ele não vale com a trava)');
  assert.equal(mem.get('rtm-rtp-v1'), big);
  assert.equal(cloud.cloudHold('rtm-rtp-v1'), null);
});

test('restore usa o resgate de cota (descarta .bak antes de desistir)', async () => {
  mem.set('slotX', '{"v":1}');
  mem.set('slotX.cloudts', '10');
  mem.set('outro.bak', 'y'.repeat(50));
  quotaLimit = Infinity;
  const payload = JSON.stringify({ v: 2 });
  // estoura só enquanto o .bak existir
  const realSet = storage.setItem;
  storage.setItem = (k: string, v: string) => { if (k === 'slotX' && mem.has('outro.bak')) throw quotaErr(); realSet(k, v); };
  replies = [{ status: 200, body: { data: payload, updatedAt: 99 } }];
  const r = await cloud.syncSlot('career-5', 'slotX');
  storage.setItem = realSet;
  assert.equal(r, 'restored');
  assert.equal(mem.has('outro.bak'), false);
  assert.equal(mem.get('slotX'), payload);
});

test("trava 'reset': o sync não restaura nem sobe; o primeiro save novo destrava", async () => {
  saveCalls.length = 0;
  cloud.setCloudHold('rtm-career-v1__s2', 'reset');
  const r = await cloud.syncSlot('career-2', 'rtm-career-v1__s2');
  assert.equal(r, 'none');
  assert.equal(saveCalls.length, 0, 'nem pull');
  replies = [{ status: 200, body: { ok: true } }];
  cloud.cloudOnLocalSave('career-2', 'rtm-career-v1__s2', () => '{"org":"nova"}');
  assert.equal(cloud.cloudHold('rtm-career-v1__s2'), null);
  await flushNow();
  assert.equal(saveCalls.at(-1)?.action, 'push');
});

test('Liberar espaço: apaga .bak/.corrupt e o cache da base, nunca o save principal', () => {
  const m = new Map<string, string>([
    ['rtm-career-v1', 'SAVE'], ['rtm-career-v1.bak', 'B'], ['rtm-rtp-v1.corrupt', 'C'],
    ['major-cs-dataset-v3', 'D'], ['rtm-acct-token-v1', 'T'],
  ]);
  const st = { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  const res = freeLocalSpace(st);
  assert.deepEqual(res.removed.sort(), ['major-cs-dataset-v3', 'rtm-career-v1.bak', 'rtm-rtp-v1.corrupt']);
  assert.ok(m.has('rtm-career-v1') && m.has('rtm-acct-token-v1'));
  // base do admin com edições não salvas fica
  const m2 = new Map<string, string>([['major-cs-dataset-v3', 'D'], ['major-cs-dataset-dirty-v1', '1']]);
  const st2 = { getItem: (k: string) => m2.get(k) ?? null, removeItem: (k: string) => { m2.delete(k); }, key: (i: number) => [...m2.keys()][i] ?? null, get length() { return m2.size; } };
  assert.deepEqual(freeLocalSpace(st2).removed, []);
});

test('backup JSON: parseia o que é JSON, guarda cru o resto, pula ausentes', () => {
  const src: Record<string, string> = { a: '{"x":1}', b: 'não-json{' };
  const b = buildSaveBackup('career', ['a', 'b', 'c'], (k) => src[k] ?? null, Date.UTC(2026, 8, 23, 12, 0));
  assert.deepEqual(b.entries, { a: { x: 1 }, b: 'não-json{' });
  assert.equal(b.mode, 'career');
  assert.equal(b.exportedAt, '2026-09-23T12:00:00.000Z');
  assert.match(backupFileName('rtp', Date.UTC(2026, 8, 23, 12, 0)), /^major-cs-backup-rtp-2026092\d-\d{4}\.json$/);
});
