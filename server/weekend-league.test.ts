// Testes do "Major da Semana" (weekend league): matemática da janela em
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
  wlSettle,
  WL_PLACEMENT_PRIZES,
} from './weekend-league.js';

type Row = Record<string, unknown>;

// ------------------------------------------------------------ FakeDb + WL
// Estende o FakeDb da economia (SEM tocar no mock compartilhado): emula as
// tabelas rtm_wl_entries/rtm_wl_reports + rtm_ranking/rtm_accounts em memória
// e delega o resto (ledger/carteira do applyUltTransaction) pro base.

interface WlEntryRow { email: string; windowId: string; division: string; elo: number; wins: number; losses: number; roundsFor: number; roundsAgainst: number; claimedAt: string | null; seq: number }
interface WlReportRow { windowId: string; matchCode: string; email: string; oppNick: string; won: boolean; roundsFor: number; roundsAgainst: number; status: string }

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
    if (text.startsWith('ALTER TABLE')) return [];
    if (text.includes('FROM rtm_ranking WHERE email=')) {
      const email = String(params[0]);
      return this.ranking.has(email) ? [{ mmr: this.ranking.get(email) }] : [];
    }
    if (text.startsWith('INSERT INTO rtm_wl_entries')) {
      const [email, windowId, division, elo] = params.map(String);
      if (this.entry(email, windowId)) return [];
      this.entries.push({ email, windowId, division, elo: Number(elo), wins: 0, losses: 0, roundsFor: 0, roundsAgainst: 0, claimedAt: null, seq: this.seq++ });
      return [{ wins: 0 }];
    }
    if (text.includes('FROM rtm_wl_entries WHERE email=')) {
      const e = this.entry(String(params[0]), String(params[1]));
      return e ? [{ division: e.division, elo: e.elo, wins: e.wins, losses: e.losses, rounds_for: e.roundsFor, rounds_against: e.roundsAgainst, claimed_at: e.claimedAt }] : [];
    }
    if (text.startsWith('INSERT INTO rtm_wl_reports')) {
      const [windowId, matchCode, email, oppNick] = params.slice(0, 4).map(String);
      const won = !!params[4];
      const roundsFor = Number(params[5] ?? 0);
      const roundsAgainst = Number(params[6] ?? 0);
      if (this.reports.some((r) => r.windowId === windowId && r.matchCode === matchCode && r.email === email)) return [];
      this.reports.push({ windowId, matchCode, email, oppNick, won, roundsFor, roundsAgainst, status: 'pending' });
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
      return claimed.map((r) => ({ email: r.email, won: r.won, rounds_for: r.roundsFor, rounds_against: r.roundsAgainst }));
    }
    if (text.startsWith('UPDATE rtm_wl_entries SET wins = wins +')) {
      const winInc = Number(params[0]);
      const lossInc = Number(params[1]);
      const rrf = Number(params[2]);
      const rra = Number(params[3]);
      const e = this.entry(String(params[4]), String(params[5]));
      const cap = Number(params[6]);
      if (e && e.wins + e.losses < cap) { e.wins += winInc; e.losses += lossInc; e.roundsFor += rrf; e.roundsAgainst += rra; return [{}]; }
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
        .sort((a, b) => b.wins - a.wins || (b.roundsFor - b.roundsAgainst) - (a.roundsFor - a.roundsAgainst) || a.losses - b.losses || a.seq - b.seq)
        .slice(0, 20)
        .map((e) => ({ email: e.email, wins: e.wins, losses: e.losses, rounds_for: e.roundsFor, rounds_against: e.roundsAgainst, division: e.division, claimed_at: e.claimedAt, nick: this.nicks.get(e.email) ?? 'manager' }));
    }
    return super.run(q);
  }
}

// datas fixas (jul/2026): 01/jul é quarta. Offsets em UTC (SP = -03).
const TUE_NOON = new Date('2026-06-30T15:00:00Z'); // ter 12:00 -03
const WED_START = new Date('2026-07-01T03:00:00Z'); // qua 00:00 -03
const WED_MORNING = new Date('2026-07-01T12:00:00Z'); // qua 09:00 -03
const SAT_LAST_MIN = new Date('2026-07-05T02:59:00Z'); // sáb 23:59 -03
const SUN_START = new Date('2026-07-05T03:00:00Z'); // dom 00:00 -03
const WID = 'wl-2026-07-01';

// ---------------------------------------------------------------- janela

test('weekendWindowFor: terça → fechada apontando pra quarta seguinte', () => {
  const w = weekendWindowFor(TUE_NOON);
  assert.equal(w.open, false);
  assert.equal(w.id, WID);
  assert.equal(w.startsAt, '2026-07-01T03:00:00.000Z');
  assert.equal(w.endsAt, '2026-07-05T03:00:00.000Z');
});

test('weekendWindowFor: quarta 00:00 e manhã → aberta', () => {
  assert.equal(weekendWindowFor(WED_START).open, true);
  const w = weekendWindowFor(WED_MORNING);
  assert.equal(w.open, true);
  assert.equal(w.id, WID);
});

test('weekendWindowFor: sábado 23:59 -03 ainda aberta; domingo 00:00 fechada com PRÓXIMO id', () => {
  const sat = weekendWindowFor(SAT_LAST_MIN);
  assert.equal(sat.open, true);
  assert.equal(sat.id, WID);
  const sun = weekendWindowFor(SUN_START);
  assert.equal(sun.open, false);
  assert.equal(sun.id, 'wl-2026-07-08');
});

test('parseWindowId: só quarta real no formato wl-YYYY-MM-DD', () => {
  const b = parseWindowId(WID);
  assert.ok(b);
  assert.equal(b?.startsAt.toISOString(), '2026-07-01T03:00:00.000Z');
  assert.equal(parseWindowId('wl-2026-07-04'), null); // sábado (âncora antiga)
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
  const r1 = await wlRegister(db.sql, 'a@x', WID, WED_MORNING);
  assert.ok(r1.ok);
  if (r1.ok) {
    assert.equal(r1.replayed, false);
    assert.equal(r1.entry.elo, 1600);
    assert.equal(r1.entry.division, 'Platina');
    assert.equal(r1.entry.wins, 0);
  }
  const r2 = await wlRegister(db.sql, 'a@x', WID, WED_MORNING);
  assert.ok(r2.ok && r2.replayed);
  assert.equal(db.entries.length, 1);
  // sem linha na ranqueada → default 1000
  const r3 = await wlRegister(db.sql, 'b@x', WID, WED_MORNING);
  assert.ok(r3.ok);
  if (r3.ok) assert.equal(r3.entry.elo, 1000);
});

test('register: janela fechada ou id errado rejeitados', async () => {
  const db = new WlFakeDb();
  const closed = await wlRegister(db.sql, 'a@x', WID, TUE_NOON);
  assert.deepEqual(closed, { ok: false, error: 'window_closed' });
  const wrong = await wlRegister(db.sql, 'a@x', 'wl-2026-07-09', WED_MORNING);
  assert.deepEqual(wrong, { ok: false, error: 'wrong_window' });
});

// ------------------------------------------------------------------ report

async function setupPair(db: WlFakeDb) {
  await wlRegister(db.sql, 'a@x', WID, WED_MORNING);
  await wlRegister(db.sql, 'b@x', WID, WED_MORNING);
}

test('report: par consistente conta vitória e derrota pros dois lados', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const r1 = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0001', won: true, oppNick: 'B' }, WED_MORNING);
  assert.ok(r1.ok && r1.outcome === 'pending');
  const r2 = await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0001', won: false, oppNick: 'A' }, WED_MORNING);
  assert.ok(r2.ok && r2.outcome === 'applied');
  assert.equal(db.entry('a@x', WID)?.wins, 1);
  assert.equal(db.entry('a@x', WID)?.losses, 0);
  assert.equal(db.entry('b@x', WID)?.wins, 0);
  assert.equal(db.entry('b@x', WID)?.losses, 1);
});

test('report: conflito (dois "ganhei") não conta pra ninguém', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0002', won: true, oppNick: 'B' }, WED_MORNING);
  const r2 = await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0002', won: true, oppNick: 'A' }, WED_MORNING);
  assert.ok(r2.ok && r2.outcome === 'conflict');
  assert.equal(db.entry('a@x', WID)?.wins, 0);
  assert.equal(db.entry('b@x', WID)?.wins, 0);
  assert.ok(db.reports.every((r) => r.status === 'conflict'));
});

test('report: duplicado não re-aplica; não-registrado e código curto rejeitados', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0003', won: true, oppNick: 'B' }, WED_MORNING);
  const dup = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0003', won: false, oppNick: 'B' }, WED_MORNING);
  assert.ok(dup.ok && dup.outcome === 'duplicate');
  assert.equal(db.reports.filter((r) => r.matchCode === 'M0003').length, 1);
  const noreg = await wlReport(db.sql, 'c@x', { windowId: WID, matchCode: 'M0003', won: false, oppNick: 'A' }, WED_MORNING);
  assert.deepEqual(noreg, { ok: false, error: 'not_registered' });
  const short = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M1', won: true, oppNick: 'B' }, WED_MORNING);
  assert.deepEqual(short, { ok: false, error: 'bad_match_code' });
  const closed = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0004', won: true, oppNick: 'B' }, SUN_START);
  assert.deepEqual(closed, { ok: false, error: 'window_closed' });
});

test('report: cap de 60 partidas — report além do cap rejeitado; lado capado não conta no apply', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 40; a.losses = 20; // run completo (60)
  const r = await wlReport(db.sql, 'a@x', { windowId: WID, matchCode: 'M0011', won: true, oppNick: 'B' }, WED_MORNING);
  assert.deepEqual(r, { ok: false, error: 'run_complete' });
  // b reporta contra a (a capado ENTRE o report e o pareamento): b conta, a não
  await wlRegister(db.sql, 'c@x', WID, WED_MORNING);
  const c = db.entry('c@x', WID)!;
  await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0012', won: true, oppNick: 'C' }, WED_MORNING);
  c.wins = 40; c.losses = 20; // capou depois de b reportar? não — c nem reportou; simula cap no apply
  const rc = await wlReport(db.sql, 'c@x', { windowId: WID, matchCode: 'M0012', won: false, oppNick: 'B' }, WED_MORNING);
  assert.deepEqual(rc, { ok: false, error: 'run_complete' }); // submit já barra
  // cap no APLICAR: b pendente em M0013, então b completa o run por outras partidas
  await wlReport(db.sql, 'b@x', { windowId: WID, matchCode: 'M0013', won: true, oppNick: 'D' }, WED_MORNING);
  await wlRegister(db.sql, 'd@x', WID, WED_MORNING);
  const b = db.entry('b@x', WID)!;
  b.wins = 57; b.losses = 3; // capou entre o report e o par (60)
  const rd = await wlReport(db.sql, 'd@x', { windowId: WID, matchCode: 'M0013', won: false, oppNick: 'B' }, WED_MORNING);
  assert.ok(rd.ok && rd.outcome === 'applied');
  assert.equal(b.wins + b.losses, 60); // capado: não passou de 60
  assert.equal(db.entry('d@x', WID)?.losses, 1); // lado com espaço conta
});

// ------------------------------------------------------------------- claim

test('claim: antes de fechar só com run completo; paga a faixa pelo ledger', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 3; a.losses = 2;
  const early = await wlClaim(db.sql, 'a@x', WID, WED_MORNING);
  assert.deepEqual(early, { ok: false, error: 'window_still_open' });
  a.wins = 6; a.losses = 54; // run completo ainda na janela (60)
  const r = await wlClaim(db.sql, 'a@x', WID, WED_MORNING);
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
  const r = await wlClaim(db.sql, 'a@x', WID, SUN_START);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.tier.credits, 3000);
  const b = db.entry('b@x', WID)!;
  b.wins = 0; b.losses = 4;
  const zero = await wlClaim(db.sql, 'b@x', WID, SUN_START);
  assert.deepEqual(zero, { ok: false, error: 'no_reward' });
});

test('claim: idempotente — claimed_at barra e op_id wl:<windowId> não paga em dobro', async () => {
  const db = new WlFakeDb();
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  a.wins = 9; a.losses = 1;
  const r1 = await wlClaim(db.sql, 'a@x', WID, SUN_START);
  assert.ok(r1.ok && r1.credits === 37500);
  const r2 = await wlClaim(db.sql, 'a@x', WID, SUN_START);
  assert.deepEqual(r2, { ok: false, error: 'already_claimed' });
  // crash-heal: mesmo se claimed_at se perdesse, o replay do op não re-paga
  a.claimedAt = null;
  const r3 = await wlClaim(db.sql, 'a@x', WID, SUN_START);
  assert.ok(r3.ok);
  if (r3.ok) assert.equal(r3.replayed, true);
  assert.equal(db.wallets.get('a@x'), 37500); // pagou UMA vez
  assert.equal(a.claimedAt != null, true); // marcador restaurado
  const bad = await wlClaim(db.sql, 'a@x', 'wl-2026-07-07', SUN_START); // terça
  assert.deepEqual(bad, { ok: false, error: 'bad_window' });
  const noreg = await wlClaim(db.sql, 'z@x', WID, SUN_START);
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
  const s = await wlStatus(db.sql, 'a@x', WED_MORNING);
  assert.equal(s.window.id, WID);
  assert.equal(s.entry?.wins, 4);
  assert.equal(s.standings.length, 2);
  assert.deepEqual(s.standings.map((x) => x.nick), ['Bob', 'Alice']);
  assert.equal(s.standings[0].rank, 1);
  assert.equal(s.rewardTiers, WL_REWARD_TIERS);
  // não registrado → entry null
  const s2 = await wlStatus(db.sql, 'z@x', WED_MORNING);
  assert.equal(s2.entry, null);
});

test('status: desempate por saldo de rounds (mesmo nº de vitórias)', async () => {
  const db = new WlFakeDb();
  db.nicks.set('a@x', 'Alice');
  db.nicks.set('b@x', 'Bob');
  await setupPair(db);
  const a = db.entry('a@x', WID)!;
  const b = db.entry('b@x', WID)!;
  a.wins = 5; a.losses = 5; a.roundsFor = 100; a.roundsAgainst = 90; // saldo +10
  b.wins = 5; b.losses = 5; b.roundsFor = 100; b.roundsAgainst = 70; // saldo +30
  const s = await wlStatus(db.sql, 'a@x', WED_MORNING);
  assert.deepEqual(s.standings.map((x) => x.nick), ['Bob', 'Alice']); // Bob à frente pelo saldo
  assert.equal(s.standings[0].roundBalance, 30);
  assert.equal(s.standings[1].roundBalance, 10);
});

test('settle: paga o top pela colocação, idempotente, respeita janela aberta', async () => {
  const db = new WlFakeDb();
  db.nicks.set('a@x', 'Alice');
  db.nicks.set('b@x', 'Bob');
  await setupPair(db);
  await wlRegister(db.sql, 'c@x', WID, WED_MORNING);
  const a = db.entry('a@x', WID)!; a.wins = 8; a.losses = 2; a.roundsFor = 104; a.roundsAgainst = 60;
  const b = db.entry('b@x', WID)!; b.wins = 8; b.losses = 2; b.roundsFor = 104; b.roundsAgainst = 40; // mesmo W: saldo decide → Bob 1º
  const c = db.entry('c@x', WID)!; c.wins = 3; c.losses = 5;
  // janela aberta sem force → recusa
  const early = await wlSettle(db.sql, WID, WED_MORNING, false);
  assert.deepEqual(early, { ok: false, error: 'window_still_open' });
  // aberta COM force (dono fecha no CRM) → paga por colocação
  const r = await wlSettle(db.sql, WID, WED_MORNING, true);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.paid.map((p) => [p.rank, p.email, p.prize]), [[1, 'b@x', 70000], [2, 'a@x', 40000], [3, 'c@x', 25000]]);
  }
  assert.equal(db.wallets.get('b@x'), 70000);
  assert.equal(db.wallets.get('a@x'), 40000);
  assert.equal(db.wallets.get('c@x'), 25000);
  // idempotência: segundo settle replaya (op_id wl:<windowId>) — carteiras intactas
  const again = await wlSettle(db.sql, WID, SUN_START, false);
  assert.ok(again.ok);
  if (again.ok) assert.ok(again.paid.every((p) => p.replayed));
  assert.equal(db.wallets.get('b@x'), 70000);
  assert.equal(WL_PLACEMENT_PRIZES[0], 70000);
  assert.equal(WL_PLACEMENT_PRIZES.length, 10);
});

test('schema: DDL idempotente roda no fake sem erro', async () => {
  const db = new WlFakeDb();
  for (const q of wlSchemaQueries(db.sql)) await q;
  assert.ok(db.executed.some((t) => t.startsWith('CREATE TABLE IF NOT EXISTS rtm_wl_entries')));
  assert.equal(WL_MAX_MATCHES, 60);
});
