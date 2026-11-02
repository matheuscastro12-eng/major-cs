// [F2] Partida PvP do Ultimate resolvida no servidor: decisões simultâneas,
// prazo com escolha automática, sem dupla resolução (CAS), W.O. e fechamento
// ranqueado (MMR + prêmio) aplicado uma vez só.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeDb } from './ultimate-economy.mock.js';
import {
  BEAT_DEADLINE_MS, WO_MISSED_BEATS, WO_SILENCE_MS, decideMatch, pollMatch, settleIfNeeded, sqlRankedSettler, startMatch,
  type MatchPlayerIn, type RankedSettler, type UltMatchRow, type UltMatchStore,
} from './ult-match.js';
import { RANKED_WIN_CREDITS, rankedRewardOpId } from './ultimate-pvp-reward.js';
import { pvpBeats } from '../src/engine/ultimate/pvpMatch.js';
import { rankedDelta } from '../api/_reportPairing.js';
import { RANKED_K } from './rankedSeason.js';

class MemStore implements UltMatchStore {
  rows = new Map<string, UltMatchRow>();
  writes = 0;
  conflicts = 0;
  async get(code: string) { const r = this.rows.get(code); return r ? structuredClone(r) : null; }
  async insert(row: UltMatchRow) { if (this.rows.has(row.code)) return false; this.rows.set(row.code, structuredClone(row)); return true; }
  async update(row: UltMatchRow, expected: number) {
    const cur = this.rows.get(row.code);
    if (!cur || cur.version !== expected) { this.conflicts++; return false; }
    this.rows.set(row.code, structuredClone(row)); this.writes++; return true;
  }
  async claimSettle(code: string) {
    const cur = this.rows.get(code);
    if (!cur || cur.settled || cur.status !== 'done') return false;
    cur.settled = true; return true;
  }
}

function memSettler(legacy = false) {
  const mmr = new Map<string, number>();
  const credits: { email: string; code: string; won: boolean }[] = [];
  const s: RankedSettler = {
    async applyMmr(email, won) { const b = mmr.get(email) ?? 1000; mmr.set(email, b + rankedDelta(won, b, 10, RANKED_K)); },
    async credit(email, code, won) { credits.push({ email, code, won }); },
    async legacyApplied() { return legacy; },
  };
  return { s, mmr, credits };
}

const squad = (ovr: number) => ({ name: `S${ovr}`, chem: 1, cards: Array.from({ length: 5 }, () => ({ ovr })) });
const PLAYERS: [MatchPlayerIn, MatchPlayerIn] = [
  { nick: 'Ana#1', email: 'ana@x.com', squad: squad(80) },
  { nick: 'Bia#2', email: 'bia@x.com', squad: squad(80) },
];
const A = { email: 'ana@x.com', nick: 'Ana#1' };
const B = { email: 'bia@x.com', nick: 'Bia#2' };
const T0 = 1_000_000;

async function fresh(ranked = true, code = 'ABCDE') {
  const store = new MemStore();
  const r = await startMatch(store, { code, seed: 1234, ranked, players: PLAYERS }, A, T0);
  assert.ok(r.ok);
  return store;
}

test('matchStart é idempotente e só aceita quem joga', async () => {
  const store = await fresh();
  const again = await startMatch(store, { code: 'ABCDE', seed: 1234, ranked: true, players: PLAYERS }, B, T0 + 10);
  assert.ok(again.ok);
  if (again.ok) assert.equal(again.view.side, 1);
  assert.equal(store.rows.size, 1);
  const intruder = await pollMatch(store, 'ABCDE', { email: 'eve@x.com', nick: 'Ana#1' }, T0);
  assert.equal(intruder.ok, false);
  if (!intruder.ok) assert.equal(intruder.status, 403, 'ranqueada identifica pela conta, não pelo nick');
});

test('decisões simultâneas: o beat só resolve quando os DOIS decidem; o adversário vê "já decidiu" sem ver a escolha', async () => {
  const store = await fresh();
  const r1 = await decideMatch(store, 'ABCDE', A, 'aggro', 0, T0 + 1000);
  assert.ok(r1.ok);
  if (!r1.ok) return;
  assert.equal(r1.view.myDecision, 'aggro');
  assert.equal(r1.view.beat?.idx, 0, 'ainda no beat 0');
  const bView = await pollMatch(store, 'ABCDE', B, T0 + 1100);
  assert.ok(bView.ok && bView.view.oppDecided && bView.view.myDecision == null);
  assert.ok(bView.ok && bView.view.last == null && !('pending' in bView.view), 'a escolha do rival não vaza antes da resolução');
  const r2 = await decideMatch(store, 'ABCDE', B, 'safe', 0, T0 + 1200);
  assert.ok(r2.ok);
  if (!r2.ok) return;
  assert.equal(r2.view.beat?.idx, 1);
  assert.equal(r2.view.last?.mine, 'safe');
  assert.equal(r2.view.last?.theirs, 'aggro');
  assert.equal(r2.view.last?.myAuto, false);
});

test('decisão travada: não troca depois e decisão de beat passado é ignorada', async () => {
  const store = await fresh();
  await decideMatch(store, 'ABCDE', A, 'aggro', 0, T0 + 10);
  const r = await decideMatch(store, 'ABCDE', A, 'smart', 0, T0 + 20);
  assert.ok(r.ok && r.view.myDecision === 'aggro');
  await decideMatch(store, 'ABCDE', B, 'aggro', 0, T0 + 30);
  const stale = await decideMatch(store, 'ABCDE', B, 'smart', 0, T0 + 40);
  assert.ok(stale.ok && stale.view.myDecision == null && stale.view.beat?.idx === 1);
  const bad = await decideMatch(store, 'ABCDE', A, 'hack', 1, T0 + 50);
  assert.equal(bad.ok, false);
});

test('prazo vencido: quem não decidiu recebe a escolha automática e o beat resolve no poll', async () => {
  const store = await fresh();
  await decideMatch(store, 'ABCDE', A, 'smart', 0, T0 + 500);
  const before = await pollMatch(store, 'ABCDE', A, T0 + BEAT_DEADLINE_MS - 1);
  assert.ok(before.ok && before.view.beat?.idx === 0 && before.view.deadlineIn > 0);
  const after = await pollMatch(store, 'ABCDE', A, T0 + BEAT_DEADLINE_MS + 1);
  assert.ok(after.ok);
  if (!after.ok) return;
  assert.equal(after.view.beat?.idx, 1);
  assert.equal(after.view.last?.mine, 'smart');
  assert.equal(after.view.last?.myAuto, false);
  assert.equal(after.view.last?.theirAuto, true);
  assert.equal(store.rows.get('ABCDE')!.missed[1], 1);
});

test('sem dupla resolução: corrida entre duas instâncias resolve o beat uma vez só', async () => {
  const store = await fresh();
  await decideMatch(store, 'ABCDE', A, 'aggro', 0, T0 + 10);
  // dois requests do B em paralelo leem a mesma versão; só um grava (CAS), o outro relê
  const p1 = decideMatch(store, 'ABCDE', B, 'safe', 0, T0 + 20);
  const p2 = decideMatch(store, 'ABCDE', B, 'safe', 0, T0 + 20);
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok(r1.ok && r2.ok);
  assert.ok(store.conflicts >= 1, 'houve corrida de verdade');
  const row = store.rows.get('ABCDE')!;
  assert.equal(row.state.history.length, 1, 'um beat resolvido');
  assert.equal(row.state.idx, 1);
  // polls concorrentes depois do prazo também não resolvem em dobro
  const t = T0 + 20 + BEAT_DEADLINE_MS + 5;
  await Promise.all([pollMatch(store, 'ABCDE', A, t), pollMatch(store, 'ABCDE', B, t), pollMatch(store, 'ABCDE', A, t)]);
  const row2 = store.rows.get('ABCDE')!;
  assert.equal(row2.state.history.length, 2);
  assert.deepEqual(row2.state.history.map((h) => h.idx), [0, 1]);
});

test('W.O. por beats seguidos sem decidir: o outro vence', async () => {
  const store = await fresh(false);
  let t = T0;
  for (let i = 0; i < WO_MISSED_BEATS; i++) {
    const r = await pollMatch(store, 'ABCDE', A, t);
    assert.ok(r.ok);
    if (r.ok && r.view.status === 'live') await decideMatch(store, 'ABCDE', A, 'safe', r.view.beat!.idx, t + 1);
    t += BEAT_DEADLINE_MS + 10;
    // B segue fazendo poll (presente), mas nunca decide
    await pollMatch(store, 'ABCDE', B, t - 5);
  }
  const end = await pollMatch(store, 'ABCDE', A, t);
  assert.ok(end.ok);
  if (!end.ok) return;
  assert.equal(end.view.status, 'done');
  assert.equal(end.view.reason, 'wo');
  assert.equal(end.view.won, true);
});

test('W.O. por silêncio (sem poll): quem sumiu perde; os dois sumidos = abandonada sem vencedor', async () => {
  const store = await fresh(false);
  const t = T0 + WO_SILENCE_MS + 1;
  const r = await pollMatch(store, 'ABCDE', B, t);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.view.status, 'done'); assert.equal(r.view.won, true); assert.equal(r.view.reason, 'wo'); }

  // os dois presentes (poll) mas ninguém decide: 3 prazos seguidos = abandonada, sem vencedor
  const s2 = await fresh(false, 'ZZZZZ');
  let t2 = T0;
  for (let i = 0; i < WO_MISSED_BEATS; i++) {
    t2 += BEAT_DEADLINE_MS + 1;
    await pollMatch(s2, 'ZZZZZ', B, t2);
    await pollMatch(s2, 'ZZZZZ', A, t2);
  }
  const late = await pollMatch(s2, 'ZZZZZ', A, t2 + 1);
  assert.ok(late.ok);
  if (late.ok) { assert.equal(late.view.status, 'abandoned'); assert.equal(late.view.won, null); }
});

test('partida até o fim: placar e vencedor do servidor; ranqueada fecha MMR e prêmio UMA vez', async () => {
  const store = await fresh(true);
  const { s, mmr, credits } = memSettler();
  let t = T0;
  const beats = pvpBeats(store.rows.get('ABCDE')!.state).length;
  for (let i = 0; i < beats; i++) {
    await decideMatch(store, 'ABCDE', A, 'aggro', i, t, s);
    await decideMatch(store, 'ABCDE', B, (['safe', 'smart', 'aggro'] as const)[i % 3], i, t + 1, s);
    t += 2000;
  }
  const row = store.rows.get('ABCDE')!;
  assert.equal(row.status, 'done');
  assert.equal(row.reason, 'played');
  assert.ok(row.settled);
  const winEmail = row.winner === 0 ? 'ana@x.com' : 'bia@x.com';
  const loseEmail = row.winner === 0 ? 'bia@x.com' : 'ana@x.com';
  assert.equal(mmr.get(winEmail), 1000 + RANKED_K.kWin);
  assert.equal(mmr.get(loseEmail), 1000 - RANKED_K.kLoss);
  assert.equal(credits.length, 2);
  // polls e decides depois do fim não aplicam de novo
  await pollMatch(store, 'ABCDE', A, t + 10, s);
  await pollMatch(store, 'ABCDE', B, t + 20, s);
  assert.equal(await settleIfNeeded(store, store.rows.get('ABCDE')!, s), false);
  assert.equal(mmr.get(winEmail), 1000 + RANKED_K.kWin);
  assert.equal(credits.length, 2);
  // a visão de cada lado é espelhada
  const va = await pollMatch(store, 'ABCDE', A, t + 30, s), vb = await pollMatch(store, 'ABCDE', B, t + 30, s);
  assert.ok(va.ok && vb.ok);
  if (va.ok && vb.ok) { assert.deepEqual(va.view.finalScore, [vb.view.finalScore![1], vb.view.finalScore![0]]); assert.notEqual(va.view.won, vb.view.won); }
});

test('amistoso não fecha MMR nem prêmio; report legado já aplicado bloqueia o fechamento', async () => {
  const store = await fresh(false);
  const { s, mmr } = memSettler();
  const row = { ...store.rows.get('ABCDE')!, status: 'done' as const, winner: 0 as const };
  store.rows.set('ABCDE', row);
  assert.equal(await settleIfNeeded(store, row, s), false);
  assert.equal(mmr.size, 0);

  const st2 = await fresh(true, 'LEGCY');
  const legacy = memSettler(true);
  const r2 = { ...st2.rows.get('LEGCY')!, status: 'done' as const, winner: 1 as const };
  st2.rows.set('LEGCY', r2);
  assert.equal(await settleIfNeeded(st2, r2, legacy.s), false);
  assert.equal(legacy.mmr.size, 0);
  assert.equal(legacy.credits.length, 0);
});

test('prêmio pelo resultado do servidor usa o op_id da F1 e é idempotente no ledger', async () => {
  const db = new FakeDb();
  const settler = sqlRankedSettler(db.sql);
  await settler.credit('ana@x.com', 'ABCDE', true);
  await settler.credit('ana@x.com', 'ABCDE', true);
  await settler.credit('bia@x.com', 'ABCDE', false);
  assert.equal(db.wallets.get('ana@x.com'), RANKED_WIN_CREDITS);
  assert.equal(db.ledger.filter((l) => l.opId === rankedRewardOpId('ABCDE')).length, 1);
  assert.equal(db.wallets.get('bia@x.com') ?? 0, 0);
});
