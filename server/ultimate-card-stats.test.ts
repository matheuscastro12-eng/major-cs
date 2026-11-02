// [CSM-3] História da carta: o que o motor do duelo produz por lado, gravação
// no fechamento ranqueado (uma vez só, cartas autoritativas dos dois lados) e
// a DDL/consulta idempotente.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardStatsDelta, decideMatch, settleIfNeeded, startMatch,
  type CardStatsDelta, type MatchPlayerIn, type RankedSettler, type UltMatchRow, type UltMatchStore,
} from './ult-match.js';
import { readCardStats, recordCardStats, sumCardStats, ultCardStatsSchemaQueries } from './ultimate-card-stats.js';
import { pvpBeats } from '../src/engine/ultimate/pvpMatch.js';
import type { SqlTag } from './ultimate-economy.js';

class MemStore implements UltMatchStore {
  rows = new Map<string, UltMatchRow>();
  async get(code: string) { const r = this.rows.get(code); return r ? structuredClone(r) : null; }
  async insert(row: UltMatchRow) { if (this.rows.has(row.code)) return false; this.rows.set(row.code, structuredClone(row)); return true; }
  async update(row: UltMatchRow, expected: number) {
    const cur = this.rows.get(row.code);
    if (!cur || cur.version !== expected) return false;
    this.rows.set(row.code, structuredClone(row)); return true;
  }
  async claimSettle(code: string) {
    const cur = this.rows.get(code);
    if (!cur || cur.settled || cur.status !== 'done') return false;
    cur.settled = true; return true;
  }
}

const squad = (ovr: number) => ({ name: `S${ovr}`, chem: 1, cards: Array.from({ length: 5 }, () => ({ ovr })) });
const IDS_A = ['a1', 'a2', 'a3', 'a4', 'a5'];
const IDS_B = ['b1', 'b2', 'b3', 'b4', 'b5'];
const PLAYERS: [MatchPlayerIn, MatchPlayerIn] = [
  { nick: 'Ana#1', email: 'ana@x.com', squad: squad(80), cardIds: IDS_A },
  { nick: 'Bia#2', email: 'bia@x.com', squad: squad(80), cardIds: IDS_B },
];
const A = { email: 'ana@x.com', nick: 'Ana#1' };
const B = { email: 'bia@x.com', nick: 'Bia#2' };

async function playToEnd(store: MemStore, s?: RankedSettler) {
  const r = await startMatch(store, { code: 'HIST1', seed: 4321, ranked: true, players: PLAYERS }, A, 1_000_000);
  assert.ok(r.ok);
  let t = 1_000_000;
  const beats = pvpBeats(store.rows.get('HIST1')!.state).length;
  for (let i = 0; i < beats; i++) {
    await decideMatch(store, 'HIST1', A, 'aggro', i, t, s);
    await decideMatch(store, 'HIST1', B, (['safe', 'smart', 'aggro'] as const)[i % 3], i, t + 1, s);
    t += 2000;
  }
  return store.rows.get('HIST1')!;
}

test('delta por lado: só o que o motor produz (jogo, resultado, rounds, clutch)', async () => {
  const row = await playToEnd(new MemStore());
  assert.equal(row.status, 'done');
  const d0 = cardStatsDelta(row, 0)!, d1 = cardStatsDelta(row, 1)!;
  assert.equal(d0.games, 1);
  assert.equal(d0.wins + d1.wins, 1);
  assert.equal(d0.wins, d1.losses);
  assert.deepEqual([d0.roundsWon, d0.roundsLost], row.state.finalScore);
  const clutch = row.state.history.filter((b) => b.kind === 'clutch');
  assert.equal(d0.clutchesPlayed, clutch.length);
  assert.equal(d0.clutchesWon + d1.clutchesWon, clutch.length);
  // nada de kills/MVP: o motor por beats não gera
  assert.deepEqual(Object.keys(d0).sort(), ['clutchesPlayed', 'clutchesWon', 'games', 'losses', 'roundsLost', 'roundsWon', 'wins']);
  // W.O.: conta jogo e resultado, sem rounds nem clutch
  const wo = cardStatsDelta({ ...row, reason: 'wo' }, 0)!;
  assert.equal(wo.roundsWon + wo.roundsLost + wo.clutchesPlayed, 0);
  assert.equal(cardStatsDelta({ ...row, status: 'live' }, 0), null);
});

test('fechamento ranqueado grava a história das 5 cartas de CADA lado, uma vez só', async () => {
  const calls: { email: string; ids: string[]; d: CardStatsDelta }[] = [];
  const s: RankedSettler = {
    async applyMmr() {}, async credit() {}, async legacyApplied() { return false; },
    async recordCardStats(email, _code, ids, d) { calls.push({ email, ids, d }); },
  };
  const store = new MemStore();
  const row = await playToEnd(store, s);
  assert.ok(row.settled);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.find((c) => c.email === 'ana@x.com')!.ids, IDS_A);
  assert.deepEqual(calls.find((c) => c.email === 'bia@x.com')!.ids, IDS_B);
  assert.equal(await settleIfNeeded(store, store.rows.get('HIST1')!, s), false);
  assert.equal(calls.length, 2);
});

// Fake mínimo do Neon para o statement de recordCardStats/readCardStats.
function fakeSql() {
  const marks = new Set<string>();
  const owned = new Map<string, Set<string>>([['ana@x.com', new Set(['a1', 'a2', 'a3', 'a4'])]]); // a5 foi vendida
  const stats = new Map<string, Record<string, number>>();
  const texts: string[] = [];
  const tag = (strings: TemplateStringsArray, ...p: unknown[]) => {
    const text = strings.join(' ');
    texts.push(text);
    let rows: Record<string, unknown>[] = [];
    if (text.includes('INSERT INTO rtm_ult_card_stats_applied')) {
      const [code, email, email2, idsJson, , games, wins, losses, rw, rl, cw, cp] = p as [string, string, string, string, string, number, number, number, number, number, number, number];
      const k = `${code}|${email}`;
      const marked = !marks.has(k);
      marks.add(k);
      let updated = 0;
      if (marked) {
        for (const id of JSON.parse(idsJson) as string[]) {
          if (!owned.get(email2)?.has(id)) continue;
          const sk = `${email2}|${id}`;
          const cur = stats.get(sk) ?? { games: 0, wins: 0, losses: 0, rounds_won: 0, rounds_lost: 0, clutches_won: 0, clutches_played: 0 };
          stats.set(sk, { games: cur.games + games, wins: cur.wins + wins, losses: cur.losses + losses, rounds_won: cur.rounds_won + rw, rounds_lost: cur.rounds_lost + rl, clutches_won: cur.clutches_won + cw, clutches_played: cur.clutches_played + cp });
          updated++;
        }
      }
      rows = [{ marked: marked ? 1 : 0, updated }];
    } else if (text.includes('FROM rtm_ult_card_stats WHERE')) {
      const [email, idsJson] = p as [string, string];
      rows = (JSON.parse(idsJson) as string[]).filter((id) => stats.has(`${email}|${id}`)).map((id) => ({ card_id: id, ...stats.get(`${email}|${id}`), last_played_at: '2026-10-27' }));
    }
    return Promise.resolve(rows);
  };
  return { sql: Object.assign(tag, { transaction: async () => [] }) as unknown as SqlTag, texts };
}

test('recordCardStats: idempotente por partida e só nas cópias ainda possuídas; leitura soma cópias', async () => {
  const { sql, texts } = fakeSql();
  const d: CardStatsDelta = { games: 1, wins: 1, losses: 0, roundsWon: 13, roundsLost: 9, clutchesWon: 1, clutchesPlayed: 1 };
  assert.equal(await recordCardStats(sql, 'ana@x.com', 'HIST1', IDS_A, d), true);
  assert.equal(await recordCardStats(sql, 'ana@x.com', 'HIST1', IDS_A, d), false, 'mesma partida não soma 2×');
  assert.equal(await recordCardStats(sql, 'ana@x.com', 'HIST2', IDS_A, { ...d, wins: 0, losses: 1, roundsWon: 5, roundsLost: 13, clutchesWon: 0 }), true);
  const rows = await readCardStats(sql, 'ana@x.com', IDS_A);
  assert.equal(rows.length, 4, 'a5 (vendida) não ganha história');
  const total = sumCardStats(rows.filter((r) => r.cardId === 'a1'));
  assert.deepEqual([total.games, total.wins, total.losses, total.roundsWon, total.roundsLost, total.clutchesWon, total.clutchesPlayed], [2, 1, 1, 18, 22, 1, 2]);
  // DDL idempotente (IF NOT EXISTS) e sem colunas que o motor não preenche
  const ddl = ultCardStatsSchemaQueries(sql).length;
  assert.equal(ddl, 2);
  const create = texts.find((t) => t.includes('CREATE TABLE IF NOT EXISTS rtm_ult_card_stats ('))!;
  assert.ok(create && !/kills|mvp|deaths|damage/i.test(create));
  assert.deepEqual(await readCardStats(sql, 'ana@x.com', 'não é lista'), []);
});
