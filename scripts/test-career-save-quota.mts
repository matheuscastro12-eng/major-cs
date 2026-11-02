// [SAVE-QUOTA] rtm-career-v1 estourando a cota: o disco recebe SEMPRE o save
// enxuto (sem killFeed) por qualquer caminho de gravação, save antigo gordo é
// regravado enxuto ao abrir, e o resgate de cota descarta o cache da base de
// times antes de qualquer backup. A memória (partida ao vivo) não perde nada.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map<string, string>();
let quotaLimit = Infinity; // total de caracteres do "domínio"
const used = () => [...mem].reduce((n, [k, v]) => n + k.length + v.length, 0);
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    const next = used() - (mem.has(k) ? k.length + mem.get(k)!.length : 0) + k.length + String(v).length;
    if (next > quotaLimit) throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
    mem.set(k, String(v));
  },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
(globalThis as Record<string, unknown>).window = { addEventListener: () => {} };
(globalThis as Record<string, unknown>).document = { addEventListener: () => {}, visibilityState: 'visible' };
(globalThis as Record<string, unknown>).fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

const { useGame, serializeForDisk, installSaveMigrations } = await import('../src/state/gameStore.ts');
const { SAVE_VERSION } = await import('../src/state/saveVersion.ts');
const { writeWithQuotaRescue } = await import('../src/state/storageQuota.ts');
installSaveMigrations((s) => s);
const KEY = 'rtm-career-v1';

const kill = (i: number) => ({ round: i, killerId: `p${i % 5}`, victimId: `q${i % 5}`, killerTeam: 0, victimTeam: 1, weapon: 'ak47', hs: i % 2 === 0 });
const map = () => ({ map: 'mirage', score: [13, 9], roundLog: Array.from({ length: 22 }, (_, i) => i % 2), killFeed: Array.from({ length: 150 }, (_, i) => kill(i)), stats: { p0: { both: { kills: 20 } } } });
const series = () => ({ maps: [map(), map()], winner: 0, mapScore: [2, 0] });
const fatSave = () => ({
  _v: SAVE_VERSION, org: { name: 'Teste FC' }, split: 9, cash: 123456,
  squad: [{ playerId: 'p0' }], history: [{ split: 8, place: 1 }],
  seasonStats: { user__p0: [{ split: 8, event: 1, k: 30 }] },
  league: { teams: [], rounds: [[{ a: 'user', b: 'x', result: series() }], [{ a: 'user', b: 'y', result: series() }]] },
  playoff: { qf: [{ a: 'user', b: 'z', result: series() }] },
});
const feedLen = (raw: string) => (raw.match(/"killFeed":\[\{/g) ?? []).length;

test('setSave/update/persistNow gravam no disco SEM killFeed; a memória mantém o feed', () => {
  mem.clear();
  useGame.setState({ save: null, loadedSlot: 1 });
  useGame.getState().setSave(fatSave());
  assert.equal(feedLen(mem.get(KEY)!), 0, 'setSave enxuto');
  useGame.getState().update({ cash: 1 });
  assert.equal(feedLen(mem.get(KEY)!), 0, 'update() enxuto (era o caminho que gravava 2 MB)');
  useGame.getState().persistNow();
  assert.equal(feedLen(mem.get(KEY)!), 0, 'persistNow enxuto');
  const live = useGame.getState().save as ReturnType<typeof fatSave>;
  assert.equal(live.league.rounds[0][0].result.maps[0].killFeed.length, 150, 'memória intacta');
  const disk = JSON.parse(mem.get(KEY)!);
  assert.equal(disk.cash, 1); assert.equal(disk.org.name, 'Teste FC');
  assert.deepEqual(disk.seasonStats, live.seasonStats, 'progresso/estatística preservados');
  assert.deepEqual(disk.league.rounds[0][0].result.maps[0].roundLog, live.league.rounds[0][0].result.maps[0].roundLog);
});

test('save antigo gordo: abrir regrava enxuto (migração silenciosa) e não muda o progresso', () => {
  mem.clear();
  const fat = JSON.stringify(fatSave());
  mem.set(KEY, fat);
  const loaded = useGame.getState().loadFromSlot(1) as ReturnType<typeof fatSave>;
  assert.equal(loaded.cash, 123456);
  const after = mem.get(KEY)!;
  assert.ok(after.length < fat.length / 2, `encolheu (${fat.length} → ${after.length})`);
  assert.equal(feedLen(after), 0);
  assert.equal(mem.get(KEY + '.bak'), fat, 'o save original fica no .bak (um passo de volta)');
  assert.equal(after, serializeForDisk(loaded));
});

test('quota: resgate descarta cache da base de times ANTES dos backups', () => {
  mem.clear();
  mem.set('major-cs-dataset-v3', 'x'.repeat(5000));
  mem.set('rtm-rtp-v1.bak', 'b'.repeat(3000));
  quotaLimit = used() + 2000;
  const r = writeWithQuotaRescue(KEY, 's'.repeat(4000));
  quotaLimit = Infinity;
  assert.equal(r.ok, true); assert.equal(r.rescued, true);
  assert.equal(mem.has('major-cs-dataset-v3'), false, 'cache refeito do build: descartado');
  assert.equal(mem.has('rtm-rtp-v1.bak'), true, 'backup de outro save preservado');
});

test('quota: base do admin com edição suja NÃO é descartada', () => {
  mem.clear();
  mem.set('major-cs-dataset-dirty-v1', '1');
  mem.set('major-cs-dataset-v3', 'x'.repeat(5000));
  quotaLimit = used() + 100;
  const r = writeWithQuotaRescue(KEY, 's'.repeat(4000));
  quotaLimit = Infinity;
  assert.equal(r.ok, false);
  assert.equal(mem.has('major-cs-dataset-v3'), true);
});
