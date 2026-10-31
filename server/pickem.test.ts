import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveSwissResult, isLocked, pickWinners, rankEntries, scoreStage, validatePick,
  type Entry, type SwissPick, type SwissResult,
} from '../src/engine/majorPickem.ts';
import { adminDecidePrize, savePick, type SqlTag } from './pickem.ts';
import { swissFromBo3 } from './pickem-bo3.ts';

const T = Array.from({ length: 16 }, (_, i) => `t${i}`);
const result: SwissResult = { threeZero: ['t0', 't1'], zeroThree: ['t14', 't15'], advanced: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'] };
const perfect: SwissPick = { threeZero: ['t0', 't1'], zeroThree: ['t14', 't15'], advance: ['t2', 't3', 't4', 't5', 't6', 't7'] };

test('pontuação: palpite perfeito de Stage = 2×3 + 2×3 + 6×2 = 24', () => {
  assert.equal(scoreStage('s1', perfect, result).points, 24);
  assert.equal(scoreStage('s1', perfect, result).exact, 4);
});

test('pontuação: 3-0 que avançou sem 3-0 vale +1 parcial; avança que foi 3-0 não pontua', () => {
  const p: SwissPick = { threeZero: ['t2', 't8'], zeroThree: ['t9', 't10'], advance: ['t0', 't3', 't11', 't12', 't13', 't9'] };
  // t2: parcial (+1); t3 avança (+2); t0 foi 3-0 → 0
  assert.equal(scoreStage('s1', p, result).points, 3);
});

test('pontuação: sem resultado = 0', () => {
  assert.equal(scoreStage('s1', perfect, null).points, 0);
});

test('pontuação playoffs: semis 2, final 4, campeão 8', () => {
  const r = { semis: ['t0', 't1', 't2', 't3'], final: ['t0', 't1'], champion: 't0' };
  const s = scoreStage('playoffs', { semis: ['t0', 't1', 't2', 't9'], final: ['t0', 't2'], champion: 't0' }, r);
  assert.equal(s.points, 3 * 2 + 4 + 8);
  assert.equal(s.champion, true);
});

test('validação: ids repetidos, fora do Stage e campeão fora da final são recusados', () => {
  assert.equal(validatePick('s1', perfect, T).ok, true);
  assert.equal(validatePick('s1', { ...perfect, zeroThree: ['t0', 't15'] }, T).ok, false);
  assert.equal(validatePick('s1', { ...perfect, advance: ['x', 't3', 't4', 't5', 't6', 't7'] }, T).ok, false);
  assert.equal(validatePick('playoffs', { semis: ['t0', 't1', 't2', 't3'], final: ['t0', 't1'], champion: 't2' }, T).ok, false);
});

test('trava: antes libera, no instante e depois trava; sem data = travado', () => {
  const lock = '2026-11-24T02:00:00Z';
  assert.equal(isLocked(lock, new Date('2026-11-24T01:59:59Z')), false);
  assert.equal(isLocked(lock, new Date('2026-11-24T02:00:00Z')), true);
  assert.equal(isLocked(lock, new Date('2026-11-25T00:00:00Z')), true);
  assert.equal(isLocked(null, new Date()), true);
});

test('desempate: pontos → acertos exatos → campeão → acertos playoff → quem salvou antes', () => {
  const e = (email: string, savedAt: string, pick: SwissPick): Entry => ({ email, nick: email, picks: { s1: pick }, savedAt });
  const ranked = rankEntries([
    e('late', '2026-11-20T10:00:00Z', perfect),
    e('early', '2026-11-20T09:00:00Z', perfect),
    e('weak', '2026-11-01T00:00:00Z', { ...perfect, threeZero: ['t2', 't8'] }),
  ], { s1: result });
  assert.deepEqual(ranked.map((r) => r.email), ['early', 'late', 'weak']);
  assert.deepEqual(pickWinners(ranked).map((r) => r.rank), [1, 2, 3]);
});

test('ganhadores: quem fez 0 ponto não ganha', () => {
  const ranked = rankEntries([{ email: 'z', nick: 'z', picks: {}, savedAt: '2026-11-01T00:00:00Z' }], { s1: result });
  assert.equal(pickWinners(ranked).length, 0);
});

test('Swiss derivado das séries (3 vitórias avança, 3 derrotas cai)', () => {
  const s = [];
  // a: 3-0, b: 0-3
  for (const o of ['x1', 'x2', 'x3']) s.push({ a: 'a', b: o, winner: 'a' });
  for (const o of ['y1', 'y2', 'y3']) s.push({ a: 'b', b: o, winner: o });
  const r = deriveSwissResult(s);
  assert.ok(r.threeZero.includes('a'));
  assert.ok(r.zeroThree.includes('b'));
  assert.ok(r.advanced.includes('a'));
});

test('bo3.gg: ids viram bo3_team_<id> e partidas não finalizadas são ignoradas', () => {
  const r = swissFromBo3([
    { team1_id: 1, team2_id: 2, winner_team_id: 1, status: 'finished' },
    { team1_id: 1, team2_id: 3, winner_team_id: 1, status: 'finished' },
    { team1_id: 1, team2_id: 4, winner_team_id: 1, status: 'finished' },
    { team1_id: 5, team2_id: 6, winner_team_id: null, status: 'upcoming' },
  ]);
  assert.deepEqual(r.threeZero, ['bo3_team_1']);
});

// ---------- banco falso: simula a trava do relógio do servidor no SQL
function fakeDb(serverNow: string, locksAt: string | null) {
  const picks = new Map<string, unknown>();
  const prizes = new Map<number, string>([[1, 'review']]);
  const sql = (async (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join('?');
    const locked = isLocked(locksAt, new Date(serverNow));
    if (q.includes('INSERT INTO rtm_pickem_picks')) {
      if (locked) return [];
      picks.set(`${vals[0]}`, vals[3]);
      return [{ saved_at: serverNow }];
    }
    if (q.includes('FROM rtm_pickem_stages WHERE stage')) return [{ teams: T, locks_at: locksAt, server_now: serverNow }];
    if (q.includes('UPDATE rtm_pickem_prizes')) {
      const [decision, , , rank, from] = vals as [string, string, string, number, string];
      if (prizes.get(rank) !== from) return [];
      prizes.set(rank, decision);
      return [{ rank }];
    }
    return [];
  }) as unknown as SqlTag;
  return { sql, picks, prizes };
}

test('trava no servidor: salva antes, 423 depois', async () => {
  const open = fakeDb('2026-11-24T01:00:00Z', '2026-11-24T02:00:00Z');
  assert.deepEqual(await savePick(open.sql, 'a@x', 'a', 's1', perfect), { ok: true, savedAt: '2026-11-24T01:00:00.000Z' });
  const closed = fakeDb('2026-11-24T02:00:01Z', '2026-11-24T02:00:00Z');
  const r = await savePick(closed.sql, 'a@x', 'a', 's1', perfect);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 423);
  assert.equal(closed.picks.size, 0);
});

test('trava: Stage sem data de trava não aceita palpite', async () => {
  const db = fakeDb('2026-11-24T01:00:00Z', null);
  const r = await savePick(db.sql, 'a@x', 'a', 's1', perfect);
  assert.equal(!r.ok && r.status, 423);
});

test('prêmio: só com ok manual, review→approved→delivered, nunca entrega 2x', async () => {
  const db = fakeDb('2026-12-14T00:00:00Z', null);
  assert.equal(await adminDecidePrize(db.sql, 1, 'delivered', 'adm'), false); // sem aprovar não entrega
  assert.equal(await adminDecidePrize(db.sql, 1, 'approved', 'adm'), true);
  assert.equal(await adminDecidePrize(db.sql, 1, 'approved', 'adm'), false);
  assert.equal(await adminDecidePrize(db.sql, 1, 'delivered', 'adm'), true);
  assert.equal(await adminDecidePrize(db.sql, 1, 'delivered', 'adm'), false);
});

test('PICKEM_AUTO_SCHEMA não tem efeito em produção', async () => {
  const { autoSchemaEnabled } = await import('./pickem.ts');
  assert.equal(autoSchemaEnabled({ PICKEM_AUTO_SCHEMA: '1', VERCEL_ENV: 'production' }), false);
  assert.equal(autoSchemaEnabled({ PICKEM_AUTO_SCHEMA: '1', NODE_ENV: 'production' }), false);
  assert.equal(autoSchemaEnabled({}), false);
  assert.equal(autoSchemaEnabled({ PICKEM_AUTO_SCHEMA: '1', VERCEL_ENV: 'preview' }), true);
});

test('placar sem tabelas: vazio + soon, sem quebrar', async () => {
  const { safeBoard } = await import('./pickem.ts');
  const missing = Object.assign(((() => Promise.reject(Object.assign(new Error('relation "rtm_pickem_stages" does not exist'), { code: '42P01' }))) as unknown), { transaction: async () => [] }) as unknown as SqlTag;
  assert.deepEqual(await safeBoard(missing), { ranked: [], soon: true });
});
