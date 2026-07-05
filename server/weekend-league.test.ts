// Testes do "Major do Sábado" (weekend league): matemática da janela em
// America/Sao_Paulo (-03:00 fixo), registro idempotente, reports pareados
// (conflito não conta pra ninguém), cap de 10 partidas e claim por faixa de
// vitórias pago pelo ledger idempotente (op_id wl:<windowId>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, type PendingQuery } from './ultimate-economy.mock.js';
import {
  weekendWindowFor,
  parseWindowId,
  rewardForWins,
  WL_REWARD_TIERS,
  WL_MAX_MATCHES,
  wlSchemaQueries,
  wlRegister,
  wlReport,
  wlClaim,
  wlStatus,
} from './weekend-league.js';

type Row = Record<string, unknown>;

// ------------------------------------------------------------ FakeDb + WL
// Estende o FakeDb da economia (SEM tocar no mock compartilhado): emula as
// tabelas rtm_wl_entries/rtm_wl_reports + rtm_ranking/rtm_accounts em memória
// e delega o resto (ledger/carteira do applyUltTransaction) pro base.

interface WlEntryRow { email: string; windowId: string; division: string; elo: number; wins: number; losses: number; claimedAt: string | null; seq: number }
interface WlReportRow { windowId: string; matchCode: string; email: string; oppNick: string; won: boolean; status: string }

class WlFakeDb extends FakeDb {
  entries: WlEntryRow[] = [];
  reports: WlReportRow[] = [];
  ranking = new Map<string, number>(); // email → mmr
  nicks = new Map<string, string>();
  seq = 0;

  entry(email: string, windowId: string) {
    return this.entries.find((e) => e.email === email && e.windowId === windowId);
  }

  run(q: PendingQuery): Row[] {
    const { text, params } = q;
    if (text.includes('FROM rtm_ranking WHERE email=')) {
      const email = String(params[0]);
      return this.ranking.has(email) ? [{ mmr: this.ranking.get(email) }] : [];
    }
    if (text.startsWith('INSERT INTO rtm_wl_entries')) {
      const [email, windowId, division, elo] = params.map(String);
      if (this.entry(email, windowId)) return [];
      this.entries.push({ email, windowId, division, elo: Number(elo), wins: 0, losses: 0, claimedAt: null, seq: this.seq++ });
      return [{ wins: 0 }];
    }
    if (text.includes('FROM rtm_wl_entries WHERE email=')) {
      const e = this.entry(String(params[0]), String(params[1]));
      return e ? [{ division: e.division, elo: e.elo, wins: e.wins, losses: e.losses, claimed_at: e.claimedAt }] : [];
    }
    if (text.startsWith('INSERT INTO rtm_wl_reports')) {
      const [windowId, matchCode, email, oppNick] = params.slice(0, 4).map(String);
      const won = !!params[4];
      if (this.reports.some((r) => r.windowId === windowId && r.matchCode === matchCode && r.email === email)) return [];
      this.reports.push({ windowId, matchCode, email, oppNick, won, status: 'pending' });
      return [{ match_code: matchCode }];
    }
    if (text.includes('FROM rtm_wl_reports WHERE window_id=') && text.includes('email<>')) {
      const [windowId, matchCode, email] = params.map(String);
      const o = this.reports.find((r) => r.windowId === windowId && r.matchCode === matchCode && r.email !== email);
      return o ? [{ email: o.email, won: o.won, status: o.status }] : [];
    }
    if (text.startsWith("UPDATE rtm_wl_reports SET status='conflict'")) {
      const [windowId, matchCode] = params.map(String);
      for (const r of this.reports) if (r.windowId === windowId && r.matchCode === matchCode) r.status = 'conflict';
      return [];
    }
    if (text.startsWith("UPDATE rtm_wl_reports SET status='applied'")) {
      const [windowId, matchCode] = params.map(String);
      const claimed = this.reports.filter((r) => r.windowId === windowId && r.matchCode === matchCode && r.status === 'pending');
      for (const r of claimed) r.status = 'applied';
      return claimed.map((r) => ({ email: r.email, won: r.won }));
    }
    if (text.startsWith('UPDATE rtm_wl_entries SET wins = wins +')) {
      const winInc = Number(params[0]);
      const lossInc = Number(params[1]);
      const e = this.entry(String(params[2]), String(params[3]));
      const cap = Number(params[4]);
      if (e && e.wins + e.losses < cap) { e.wins += winInc; e.losses += lossInc; return [{}]; }
      return [];
    }
    if (text.startsWith('UPDATE rtm_wl_entries SET claimed_at=now()')) {
      const e = this.entry(String(params[0]), String(params[1]));
      if (e && e.claimedAt == null) { e.claimedAt = new Date().toISOString(); return [{}]; }
      return [];
    }
    if (text.includes('FROM rtm_wl_entries e LEFT JOIN rtm_accounts a')) {
      const windowId = String(params[0]);
      return this.entries
        .filter((e) => e.windowId === windowId)
        .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.seq - b.seq)
        .slice(0, 20)
        .map((e) => ({ wins: e.wins, losses: e.losses, division: e.division, nick: this.nicks.get(e.email) ?? 'manager' }));
    }
    return super.run(q);
  }
}

// datas fixas (jul/2026): 04/jul é sábado. Offsets em UTC (SP = -03).
const FRI_NOON = new Date('2026-07-03T15:00:00Z'); // sex 12:00 -03
const SAT_START = new Date('2026-07-04T03:00:00Z'); // sáb 00:00 -03
const SAT_MORNING = new Date('2026-07-04T12:00:00Z'); // sáb 09:00 -03
const SUN_LAST_MIN = new Date('2026-07-06T02:59:00Z'); // dom 23:59 -03
const MON_START = new Date('2026-07-06T03:00:00Z'); // seg 00:00 -03
const WID = 'wl-2026-07-04';

// ---------------------------------------------------------------- janela

test('weekendWindowFor: sexta → fechada apontando pro sábado seguinte', () => {
  const w = weekendWindowFor(FRI_NOON);
  assert.equal(w.open, false);
  assert.equal(w.id, WID);
  assert.equal(w.startsAt, '2026-07-04T03:00:00.000Z');
  assert.equal(w.endsAt, '2026-07-06T03:00:00.000Z');
});

test('weekendWindowFor: sábado 00:00 e manhã → aberta', () => {
  assert.equal(weekendWindowFor(SAT_START).open, true);
  const w = weekendWindowFor(SAT_MORNING);
  assert.equal(w.open, true);
  assert.equal(w.id, WID);
});

test('weekendWindowFor: domingo 23:59 -03 ainda aberta; segunda 00:00 fechada com PRÓXIMO id', () => {
  const sun = weekendWindowFor(SUN_LAST_MIN);
  assert.equal(sun.open, true);
  assert.equal(sun.id, WID);
  const mon = weekendWindowFor(MON_START);
  assert.equal(mon.open, false);
  assert.equal(mon.id, 'wl-2026-07-11');
});

test('parseWindowId: só sábado real no formato wl-YYYY-MM-DD', () => {
  const b = parseWindowId(WID);
  assert.ok(b);
  assert.equal(b?.startsAt.toISOString(), '2026-07-04T03:00:00.000Z');
  assert.equal(parseWindowId('wl-2026-07-05'), null); // domingo
  assert.equal(parseWindowId('wl-2026-02-30'), null); // data inexistente
  assert.equal(parseWindowId('2026-07-04'), null);
});

// ------------------------------------------------------------- recompensas

test('rewardForWins: faixas 1/3/5/7/9', () => {
  assert.equal(rewardForWins(0), null);
  assert.equal(rewardForWins(1)?.credits, 3000);
  assert.equal(rewardForWins(2)?.credits, 3000);
  assert.equal(rewardForWins(3)?.credits, 7500);
  assert.equal(rewardForWins(4)?.credits, 7500);
  assert.equal(rewardForWins(5)?.credits, 13500);
  assert.equal(rewardForWins(5)?.card, 'rareGold');
  assert.equal(rewardForWins(7)?.credits, 22500);
  assert.equal(rewardForWins(9)?.credits, 37500);
  assert.equal(rewardForWins(10)?.credits, 37500);
  assert.equal(rewardForWins(10)?.card, 'tots');
  assert.equal(WL_REWARD_TIERS.length, 5);
});

// ---------------------------------------------------------------- registro

test('register: snapshot de divisão/elo da ranqueada + idempotente', async () => {
  const db = new WlFakeDb();
  db.ranking.set('a@x', 1600); // Platina
  const r1 = await wlRegister(db.sql, 'a@x', WID, SAT_MORNING);
  assert.ok(r1.ok);
  if (r1.ok) {
    assert.equal(r1.replayed, false);
    assert.equal(r1.entry.elo, 1600);
    assert.equal(r1.entry.division, 'Platina');
    assert.equal(r1.entry.wins, 0);
  }
  const r2 = await wlRegister(db.sql, 'a@x', WID, SAT_MORNING);
  assert.ok(r2.ok && r2.replayed);
  assert.equal(db.entries.length, 1);
  // sem linha na ranqueada → default 1000
  const r3 = await wlRegister(db.sql, 'b@x', WID, SAT_MORNING);
  assert.ok(r3.ok);
  if (r3.ok) assert.equal(r3.entry.elo, 1000);
});

test('register: janela fechada ou id errado rejeitados', async () => {
  const db = new WlFakeDb();
  const closed = await wlRegister(db.sql, 'a@x', WID, FRI_NOON);
  assert.deepEqual(closed, { ok: false, error: 'window_closed' });
  const wrong = await wlRegister(db.sql, 'a@x', 'wl-2026-07-11', SAT_MORNING);
  assert.deepEqual(wrong, { ok: false, error: 'wrong_window' });
});

// ------------------------------------------------------------------ report

async function setupPair(db: WlFakeDb) {
  await wlRegister(db.sql, 'a@x', WID, SAT_MORNING);
  await wlRegister(db.sql, 'b@x', WID, SAT_MORNING);
}

test('report: par consistente conta vitória e derrota pros dois lados', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const r1 = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0001', won: true, oppNick: 'B' }, SAT_MORNING);
  assert.ok(r1.ok && r1.outcome === 'pending');
  const r2 = await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0001', won: false, oppNick: 'A' }, SAT_MORNING);
  assert.ok(r2.ok && r2.outcome === 'applied');
  assert.equal(db.entry('a@x', WID)?.wins, 1);
  assert.equal(db.entry('a@x', WID)?.losses, 0);
  assert.equal(db.entry('b@x', WID)?.wins, 0);
  assert.equal(db.entry('b@x', WID)?.losses, 1);
});

test('report: conflito (dois "ganhei") não conta pra ninguém', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0002', won: true, oppNick: 'B' }, SAT_MORNING);
  const r2 = await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0002', won: true, oppNick: 'A' }, SAT_MORNING);
  assert.ok(r2.ok && r2.outcome === 'conflict');
  assert.equal(db.entry('a@x', WID)?.wins, 0);
  assert.equal(db.entry('b@x', WID)?.wins, 0);
  assert.ok(db.reports.every((r) => r.status === 'conflict'));
});

test('report: duplicado não re-aplica; não-registrado e código curto rejeitados', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0003', won: true, oppNick: 'B' }, SAT_MORNING);
  const dup = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0003', won: false, oppNick: 'B' }, SAT_MORNING);
  assert.ok(dup.ok && dup.outcome === 'duplicate');
  assert.equal(db.reports.filter((r) => r.matchCode === 'M0003').length, 1);
  const noreg = await wlReport(db.sql, 'c@x', { windowId: WID, matchCode: 'M0003', won: false, oppNick: 'A' }, SAT_MORNING);
  assert.deepEqual(noreg, { ok: false, error: 'not_registered' });
  const short = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M1', won: true, oppNick: 'B' }, SAT_MORNING);
  assert.deepEqual(short, { ok: false, error: 'bad_match_code' });
  const closed = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0004', won: true, oppNick: 'B' }, MON_START);
  assert.deepEqual(closed, { ok: false, error: 'window_closed' });
});

test('report: cap de 10 partidas — 11º report rejeitado; lado capado não conta no apply', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 6; a.losses = 4; // run completo
  const r = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0011', won: true, oppNick: 'B' }, SAT_MORNING);
  assert.deepEqual(r, { ok: false, error: 'run_complete' });
  // b reporta contra a (a capado ENTRE o report e o pareamento): b conta, a não
  await wlRegister(db.sql, 'c@x', WID, SAT_MORNING);
  const c = db.entry('c@x', WID)!;
  await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0012', won: true, oppNick: 'C' }, SAT_MORNING);
  c.wins = 6; c.losses = 4; // capou depois de b reportar? não — c nem reportou; simula cap no apply
  const rc = await wlReport(db.sql, 'c@x', { windowId: WID, matchCode: 'M0012', won: false, oppNick: 'B' }, SAT_MORNING);
  assert.deepEqual(rc, { ok: false, error: 'run_complete' }); // submit já barra
  // cap no APLICAR: b pendente em M0013, então b completa o run por outras partidas
  await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0013', won: true, oppNick: 'D' }, SAT_MORNING);
  await wlRegister(db.sql, 'd@x', WID, SAT_MORNING);
  const b = db.entry('b@x', WID)!;
  b.wins = 7; b.losses = 3; // capou entre o report e o par
  const rd = await wlReport(db.sql, 'd@x', { windowId: WID, matchCode: 'M0013', won: false, oppNick: 'B' }, SAT_MORNING);
  assert.ok(rd.ok && rd.outcome === 'applied');
  assert.equal(b.wins + b.losses, 10); // capado: não passou de 10
  assert.equal(db.entry('d@x', WID)?.losses, 1); // lado com espaço conta
});

// ------------------------------------------------------------------- claim

test('claim: antes de fechar só com run completo; paga a faixa pelo ledger', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 3; a.losses = 2;
  const early = await wlClaim(db.sql, 'a@x', WID, SAT_MORNING);
  assert.deepEqual(early, { ok: false, error: 'window_still_open' });
  a.wins = 6; a.losses = 4; // run completo ainda na janela
  const r = await wlClaim(db.sql, 'a@x', WID, SAT_MORNING);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.replayed, false);
    assert.equal(r.tier.credits, 13500); // 6 vitórias → faixa 5+
    assert.equal(r.tier.card, 'rareGold');
    assert.equal(r.credits, 13500);
  }
  assert.equal(db.wallets.get('a@x'), 13500);
  const led = db.ledger.find((l) => l.email === 'a@x' && l.opId === `wl:${WID}`);
  assert.ok(led);
  assert.equal(led?.kind, 'reward');
});

test('claim: depois do fechamento com qualquer nº de partidas; 0 vitórias sem prêmio', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 1; a.losses = 2;
  const r = await wlClaim(db.sql, 'a@x', WID, MON_START);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.tier.credits, 3000);
  const b = db.entry('b@x', WID)!;
  b.wins = 0; b.losses = 4;
  const zero = await wlClaim(db.sql, 'b@x', WID, MON_START);
  assert.deepEqual(zero, { ok: false, error: 'no_reward' });
});

test('claim: idempotente — claimed_at barra e op_id wl:<windowId> não paga em dobro', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 9; a.losses = 1;
  const r1 = await wlClaim(db.sql, 'a@x', WID, MON_START);
  assert.ok(r1.ok && r1.credits === 37500);
  const r2 = await wlClaim(db.sql, 'a@x', WID, MON_START);
  assert.deepEqual(r2, { ok: false, error: 'already_claimed' });
  // crash-heal: mesmo se claimed_at se perdesse, o replay do op não re-paga
  a.claimedAt = null;
  const r3 = await wlClaim(db.sql, 'a@x', WID, MON_START);
  assert.ok(r3.ok);
  if (r3.ok) assert.equal(r3.replayed, true);
  assert.equal(db.wallets.get('a@x'), 37500); // pagou UMA vez
  assert.equal(a.claimedAt != null, true); // marcador restaurado
  const bad = await wlClaim(db.sql, 'a@x', 'wl-2026-07-08', MON_START); // quarta
  assert.deepEqual(bad, { ok: false, error: 'bad_window' });
  const noreg = await wlClaim(db.sql, 'z@x', WID, MON_START);
  assert.deepEqual(noreg, { ok: false, error: 'not_registered' });
});

// ------------------------------------------------------------------ status

test('status: janela + minha entry + standings top por vitórias', async () => {
  const db = new WlFakeDb();
  db.nicks.set('a@x', 'Alice');
  db.nicks.set('b@x', 'Bob');
  await setupPair(db);
  db.entry('a@x', WID)!.wins = 4;
  db.entry('b@x', WID)!.wins = 7;
  const s = await wlStatus(db.sql, 'a@x', SAT_MORNING);
  assert.equal(s.window.id, WID);
  assert.equal(s.entry?.wins, 4);
  assert.equal(s.standings.length, 2);
  assert.deepEqual(s.standings.map((x) => x.nick), ['Bob', 'Alice']);
  assert.equal(s.standings[0].rank, 1);
  assert.equal(s.rewardTiers, WL_REWARD_TIERS);
  // não registrado → entry null
  const s2 = await wlStatus(db.sql, 'z@x', SAT_MORNING);
  assert.equal(s2.entry, null);
});

test('schema: DDL idempotente roda no fake sem erro', async () => {
  const db = new WlFakeDb();
  for (const q of wlSchemaQueries(db.sql)) await q;
  assert.ok(db.executed.some((t) => t.startsWith('CREATE TABLE IF NOT EXISTS rtm_wl_entries')));
  assert.equal(WL_MAX_MATCHES, 10);
});
