// "Major da Semana" — Weekend League do Ultimate (estilo FUT, adaptado).
// Lógica PURA do lado do servidor: janela de fim de semana, registro, reports
// pareados (mesma filosofia anti-fraude da ranqueada: resultado só conta quando
// os DOIS lados batem; conflito não conta pra ninguém) e claim de recompensa
// por faixa de vitórias pago via applyUltTransaction (ledger auditável).
//
// JANELA: toda quarta 00:00 → sábado 23:59:59 em America/Sao_Paulo. O Brasil
// aboliu o horário de verão em 2019, então São Paulo é UTC-3 FIXO — a conta é
// feita em offset fixo de -03:00 (se o DST voltar um dia, este módulo precisa
// migrar pra Intl/tz db; documentado de propósito).
//
// RUN: até 10 partidas por janela (WL_MAX_MATCHES). Report entra EXCLUSIVAMENTE
// pareado — reutiliza decidePair (api/_reportPairing.ts). Aqui NÃO existe
// carência solo ('applied-solo'): sem par, o resultado simplesmente não conta
// (a janela fecha e acabou). Tabela própria rtm_wl_reports porque a chave é
// (window_id, match_code, email) e o ciclo de vida é o da janela — misturar com
// rtm_match_reports (chaveada em lobby + ladder mensal) acoplaria os dois modos.
//
// CLAIM: só depois da janela fechar OU do run completar (10 partidas). Paga a
// MAIOR faixa atingida, uma única vez por janela — idempotência dupla:
// op_id `wl:<windowId>` no ledger (UNIQUE email+op_id) + claimed_at na entry.
// Ordem pay-first: paga (idempotente) e SÓ ENTÃO marca claimed_at — crash no
// meio não perde recompensa nem paga duas vezes.

import { decidePair } from '../api/_reportPairing.js';
import { divisionFor } from '../src/engine/ultimate/divisions.js';
import { applyUltTransaction, type SqlTag, type SqlQuery } from './ultimate-economy.js';

export const WL_MAX_MATCHES = 60;
export const WL_MATCH_CODE_MIN = 4;
export const WL_MATCH_CODE_MAX = 24;

// ------------------------------------------------------------------ janela

const SP_OFFSET_MS = 3 * 3600_000; // America/Sao_Paulo = UTC-3 fixo (sem DST)
const DAY_MS = 86_400_000;

export interface WlWindow {
  id: string; // 'wl-YYYY-MM-DD' (data da quarta, em -03:00)
  startsAt: string; // ISO UTC da quarta 00:00 -03
  endsAt: string; // ISO UTC do domingo 00:00 -03 (exclusivo)
  open: boolean;
}

// Janela corrente se aberta; senão a PRÓXIMA (dom→ter → quarta seguinte).
// Determinística a partir de `now`.
export function weekendWindowFor(now: Date): WlWindow {
  const local = new Date(now.getTime() - SP_OFFSET_MS); // "relógio de SP" em campos UTC
  const dow = local.getUTCDay(); // 0=dom … 6=sáb
  // Âncora = quarta (dow 3). Qua/qui/sex/sáb pertencem à janela corrente; dom→ter
  // apontam pra PRÓXIMA quarta.
  const daysToWed = dow === 3 ? 0 : dow === 4 ? -1 : dow === 5 ? -2 : dow === 6 ? -3 : (3 - dow + 7) % 7;
  const wedMidnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToWed);
  const startsMs = wedMidnightLocal + SP_OFFSET_MS; // 00:00 -03 = 03:00 UTC
  const endsMs = startsMs + 4 * DAY_MS; // qua 00:00 → dom 00:00 -03 (qua+qui+sex+sáb)
  const wed = new Date(wedMidnightLocal);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    id: `wl-${wed.getUTCFullYear()}-${pad(wed.getUTCMonth() + 1)}-${pad(wed.getUTCDate())}`,
    startsAt: new Date(startsMs).toISOString(),
    endsAt: new Date(endsMs).toISOString(),
    open: now.getTime() >= startsMs && now.getTime() < endsMs,
  };
}

// Valida 'wl-YYYY-MM-DD' e devolve os limites da janela (a data PRECISA ser uma
// quarta-feira real — id forjado com outro dia é rejeitado).
export function parseWindowId(id: string): { startsAt: Date; endsAt: Date } | null {
  const m = /^wl-(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wedMidnightLocal = Date.UTC(y, mo - 1, d);
  const wed = new Date(wedMidnightLocal);
  if (wed.getUTCFullYear() !== y || wed.getUTCMonth() !== mo - 1 || wed.getUTCDate() !== d) return null;
  if (wed.getUTCDay() !== 3) return null;
  const startsMs = wedMidnightLocal + SP_OFFSET_MS;
  return { startsAt: new Date(startsMs), endsAt: new Date(startsMs + 4 * DAY_MS) };
}

// -------------------------------------------------------------- recompensas

// Faixas por vitórias, avaliadas NA HORA do claim (paga só a maior atingida).
// Rebalance iter47 (+50% em todas as faixas): a auditoria da economia mostrou a
// renda passiva de login (~22,3k/semana) superando a renda de JOGAR — o pico
// semanal competitivo precisava pagar como pico. Âncoras: w-win10 (missão
// semanal mais dura) = 8.000; 5 vitórias pareadas (13.500 + carta) superam com
// folga a w-win10; o topo (9-10 de 10, raríssimo em PvP pareado) fica em 37.500
// — acima do Elite mensal da season (28.000) de propósito: exige performance
// quase perfeita TODA semana, não uma escalada única por mês. Cartas: 'rareGold'
// espelha a faixa Ouro da season; 'tots' só no quase-perfeito (não vira faucet
// do pack de 38k).
export interface WlRewardTier {
  minWins: number;
  credits: number;
  card?: string; // raridade (UltRarity) — meta pro cliente na fase B
  name: string;
}

export const WL_REWARD_TIERS: WlRewardTier[] = [
  { minWins: 1, credits: 3000, name: 'Participante' },
  { minWins: 3, credits: 7500, name: 'Competidor' },
  { minWins: 5, credits: 13500, card: 'rareGold', name: 'Contender' },
  { minWins: 7, credits: 22500, card: 'rareGold', name: 'Elite da Semana' },
  { minWins: 9, credits: 37500, card: 'tots', name: 'Campeão do Major' },
];

export function rewardForWins(wins: number): WlRewardTier | null {
  const w = Math.max(0, Math.trunc(wins));
  let best: WlRewardTier | null = null;
  for (const t of WL_REWARD_TIERS) if (w >= t.minWins) best = t;
  return best;
}

// ------------------------------------------------------------------- schema

export function wlSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_wl_entries (
      email TEXT NOT NULL,
      window_id TEXT NOT NULL,
      division TEXT NOT NULL DEFAULT '',
      elo INT NOT NULL DEFAULT 1000,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      rounds_for INT NOT NULL DEFAULT 0,
      rounds_against INT NOT NULL DEFAULT 0,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_at TIMESTAMPTZ,
      PRIMARY KEY (email, window_id)
    )`,
    sql`ALTER TABLE rtm_wl_entries ADD COLUMN IF NOT EXISTS rounds_for INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE rtm_wl_entries ADD COLUMN IF NOT EXISTS rounds_against INT NOT NULL DEFAULT 0`,
    sql`CREATE TABLE IF NOT EXISTS rtm_wl_reports (
      window_id TEXT NOT NULL,
      match_code TEXT NOT NULL,
      email TEXT NOT NULL,
      opp_nick TEXT NOT NULL DEFAULT '',
      won BOOLEAN NOT NULL,
      rounds_for INT NOT NULL DEFAULT 0,
      rounds_against INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (window_id, match_code, email)
    )`,
    sql`ALTER TABLE rtm_wl_reports ADD COLUMN IF NOT EXISTS rounds_for INT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE rtm_wl_reports ADD COLUMN IF NOT EXISTS rounds_against INT NOT NULL DEFAULT 0`,
    sql`CREATE INDEX IF NOT EXISTS rtm_wl_entries_window_idx ON rtm_wl_entries (window_id, wins DESC)`,
  ];
}

// ------------------------------------------------------------------ registro

export interface WlEntry {
  windowId: string;
  division: string;
  elo: number;
  wins: number;
  losses: number;
  roundsFor: number;
  roundsAgainst: number;
  roundBalance: number;
  claimed: boolean;
  runComplete: boolean;
}

const entryFromRow = (windowId: string, r: Record<string, unknown>): WlEntry => {
  const wins = Number(r.wins ?? 0);
  const losses = Number(r.losses ?? 0);
  const roundsFor = Number(r.rounds_for ?? 0);
  const roundsAgainst = Number(r.rounds_against ?? 0);
  return {
    windowId,
    division: String(r.division ?? ''),
    elo: Number(r.elo ?? 1000),
    wins,
    losses,
    roundsFor,
    roundsAgainst,
    roundBalance: roundsFor - roundsAgainst,
    claimed: r.claimed_at != null,
    runComplete: wins + losses >= WL_MAX_MATCHES,
  };
};

export type WlRegisterResult =
  | { ok: true; replayed: boolean; entry: WlEntry }
  | { ok: false; error: 'window_closed' | 'wrong_window' };

// Registra 1x por janela (grátis na v1). Snapshot da divisão/elo vem da
// ranqueada (rtm_ranking.mmr) se existir; senão elo default 1000.
export async function wlRegister(sql: SqlTag, email: string, windowId: string, now: Date): Promise<WlRegisterResult> {
  const win = weekendWindowFor(now);
  if (!win.open) return { ok: false, error: 'window_closed' };
  if (windowId !== win.id) return { ok: false, error: 'wrong_window' };
  const rk = await sql`SELECT mmr FROM rtm_ranking WHERE email=${email}`;
  const elo = rk.length ? Number(rk[0].mmr ?? 1000) : 1000;
  const division = divisionFor(elo).def.name;
  const ins = await sql`INSERT INTO rtm_wl_entries (email, window_id, division, elo)
    VALUES (${email}, ${windowId}, ${division}, ${elo})
    ON CONFLICT (email, window_id) DO NOTHING RETURNING wins`;
  const rows = await sql`SELECT division, elo, wins, losses, rounds_for, rounds_against, claimed_at FROM rtm_wl_entries WHERE email=${email} AND window_id=${windowId}`;
  return { ok: true, replayed: ins.length === 0, entry: entryFromRow(windowId, rows[0] ?? {}) };
}

// -------------------------------------------------------------------- report

export interface WlReportParams {
  windowId: string;
  matchCode: string;
  won: boolean;
  oppNick: string;
  roundsFor?: number;
  roundsAgainst?: number;
}

export type WlReportResult =
  | { ok: true; outcome: 'pending' | 'applied' | 'conflict' | 'duplicate'; entry: WlEntry }
  | { ok: false; error: 'window_closed' | 'wrong_window' | 'not_registered' | 'run_complete' | 'bad_match_code' };

// Report pareado: 1 por jogador por matchCode (PK). Aplica SÓ quando os dois
// lados existem e são consistentes (exatamente um venceu) — decidePair, a mesma
// máquina de estados da ranqueada. Conflito marca as duas linhas e NINGUÉM
// pontua. Cap de 10 partidas checado no submit (meu run) E no apply (o run do
// oponente pode ter completado entre o report dele e o pareamento — o UPDATE
// guarda `wins+losses < 10`, então lado capado simplesmente não conta).
export async function wlReport(sql: SqlTag, email: string, p: WlReportParams, now: Date): Promise<WlReportResult> {
  const win = weekendWindowFor(now);
  if (!win.open) return { ok: false, error: 'window_closed' };
  if (p.windowId !== win.id) return { ok: false, error: 'wrong_window' };
  const code = p.matchCode.trim();
  if (code.length < WL_MATCH_CODE_MIN || code.length > WL_MATCH_CODE_MAX) return { ok: false, error: 'bad_match_code' };

  const my = await sql`SELECT division, elo, wins, losses, rounds_for, rounds_against, claimed_at FROM rtm_wl_entries WHERE email=${email} AND window_id=${p.windowId}`;
  if (!my.length) return { ok: false, error: 'not_registered' };
  const entryNow = () => entryFromRow(p.windowId, my[0]);
  if (Number(my[0].wins ?? 0) + Number(my[0].losses ?? 0) >= WL_MAX_MATCHES) return { ok: false, error: 'run_complete' };

  const freshEntry = async (): Promise<WlEntry> => {
    const r = await sql`SELECT division, elo, wins, losses, rounds_for, rounds_against, claimed_at FROM rtm_wl_entries WHERE email=${email} AND window_id=${p.windowId}`;
    return r.length ? entryFromRow(p.windowId, r[0]) : entryNow();
  };

  const rf = Math.max(0, Math.min(200, Math.trunc(Number(p.roundsFor) || 0)));
  const ra = Math.max(0, Math.min(200, Math.trunc(Number(p.roundsAgainst) || 0)));
  const ins = await sql`INSERT INTO rtm_wl_reports (window_id, match_code, email, opp_nick, won, rounds_for, rounds_against)
    VALUES (${p.windowId}, ${code}, ${email}, ${p.oppNick.slice(0, 60)}, ${p.won}, ${rf}, ${ra})
    ON CONFLICT (window_id, match_code, email) DO NOTHING RETURNING match_code`;
  if (!ins.length) return { ok: true, outcome: 'duplicate', entry: entryNow() };

  const other = await sql`SELECT email, won, status FROM rtm_wl_reports WHERE window_id=${p.windowId} AND match_code=${code} AND email<>${email} LIMIT 1`;
  const outcome = decidePair(
    p.won,
    other.length ? !!other[0].won : null,
    other.length ? (String(other[0].status) as 'pending' | 'applied' | 'applied-solo' | 'conflict') : null,
  );

  if (outcome === 'wait') return { ok: true, outcome: 'pending', entry: entryNow() };
  if (outcome === 'conflict') {
    await sql`UPDATE rtm_wl_reports SET status='conflict' WHERE window_id=${p.windowId} AND match_code=${code}`;
    return { ok: true, outcome: 'conflict', entry: entryNow() };
  }
  // consistente ('apply-both'; 'apply-mine' não existe aqui — sem carência solo).
  // CLAIM atômico pending→applied: só a invocação que transicionar credita
  // (dois requests quase simultâneos não contam a partida em dobro).
  const claimed = await sql`UPDATE rtm_wl_reports SET status='applied' WHERE window_id=${p.windowId} AND match_code=${code} AND status='pending' RETURNING email, won, rounds_for, rounds_against`;
  for (const row of claimed) {
    const em = String(row.email);
    const w = !!row.won;
    const rrf = Number(row.rounds_for ?? 0);
    const rra = Number(row.rounds_against ?? 0);
    await sql`UPDATE rtm_wl_entries SET wins = wins + ${w ? 1 : 0}, losses = losses + ${w ? 0 : 1}, rounds_for = rounds_for + ${rrf}, rounds_against = rounds_against + ${rra}
      WHERE email=${em} AND window_id=${p.windowId} AND wins + losses < ${WL_MAX_MATCHES}`;
  }
  return { ok: true, outcome: 'applied', entry: await freshEntry() };
}

// --------------------------------------------------------------------- claim

export type WlClaimResult =
  | { ok: true; replayed: boolean; tier: WlRewardTier; wins: number; credits: number }
  | { ok: false; error: 'bad_window' | 'not_registered' | 'window_still_open' | 'no_reward' | 'already_claimed' };

// Claim da recompensa da janela: só após fechar OU run completo. Paga a maior
// faixa atingida via applyUltTransaction, op_id `wl:<windowId>` — UMA vez por
// janela pra sempre (replay devolve o resultado gravado, nada re-aplica).
export async function wlClaim(sql: SqlTag, email: string, windowId: string, now: Date): Promise<WlClaimResult> {
  const bounds = parseWindowId(windowId);
  if (!bounds) return { ok: false, error: 'bad_window' };
  const rows = await sql`SELECT division, elo, wins, losses, rounds_for, rounds_against, claimed_at FROM rtm_wl_entries WHERE email=${email} AND window_id=${windowId}`;
  if (!rows.length) return { ok: false, error: 'not_registered' };
  const entry = entryFromRow(windowId, rows[0]);
  if (entry.claimed) return { ok: false, error: 'already_claimed' };
  const windowClosed = now.getTime() >= bounds.endsAt.getTime();
  if (!windowClosed && !entry.runComplete) return { ok: false, error: 'window_still_open' };
  const tier = rewardForWins(entry.wins);
  if (!tier) return { ok: false, error: 'no_reward' };

  // pay-first: o ledger é a fonte de verdade da idempotência; claimed_at é só
  // marcador de UI. Crash entre pagar e marcar → retry replaya o op e marca.
  const pay = await applyUltTransaction(sql, email, {
    opId: `wl:${windowId}`,
    kind: 'reward',
    creditsDelta: tier.credits,
    cards: [],
    meta: { source: 'weekend-league', windowId, wins: entry.wins, tierName: tier.name, ...(tier.card ? { card: tier.card } : {}) },
  });
  if (!pay.ok) return { ok: false, error: 'no_reward' }; // inatingível com delta positivo; defensivo
  await sql`UPDATE rtm_wl_entries SET claimed_at=now() WHERE email=${email} AND window_id=${windowId} AND claimed_at IS NULL`;
  return { ok: true, replayed: pay.replayed, tier, wins: entry.wins, credits: pay.credits };
}

// -------------------------------------------------------------------- status

export interface WlStanding {
  rank: number;
  nick: string;
  division: string;
  wins: number;
  losses: number;
  roundBalance: number;
}

export interface WlStatus {
  window: WlWindow;
  entry: WlEntry | null;
  standings: WlStanding[];
  rewardTiers: WlRewardTier[];
}

export async function wlStatus(sql: SqlTag, email: string, now: Date): Promise<WlStatus> {
  const win = weekendWindowFor(now);
  const mine = await sql`SELECT division, elo, wins, losses, rounds_for, rounds_against, claimed_at FROM rtm_wl_entries WHERE email=${email} AND window_id=${win.id}`;
  const top = await sql`SELECT e.wins, e.losses, e.rounds_for, e.rounds_against, e.division, COALESCE(a.nick, 'manager') AS nick
    FROM rtm_wl_entries e LEFT JOIN rtm_accounts a ON a.email = e.email
    WHERE e.window_id=${win.id} ORDER BY e.wins DESC, (e.rounds_for - e.rounds_against) DESC, e.losses ASC, e.registered_at ASC LIMIT 20`;
  return {
    window: win,
    entry: mine.length ? entryFromRow(win.id, mine[0]) : null,
    standings: top.map((r, i) => ({
      rank: i + 1,
      nick: String(r.nick ?? 'manager'),
      division: String(r.division ?? ''),
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      roundBalance: Number(r.rounds_for ?? 0) - Number(r.rounds_against ?? 0),
    })),
    rewardTiers: WL_REWARD_TIERS,
  };
}

// ------------------------------------------------------------ fecho (admin)

// Prêmios por COLOCAÇÃO no fim da janela (top 10). Fonte canônica — o client
// espelha esses valores na UI. Pagos pelo DONO via wlSettle (CRM).
export const WL_PLACEMENT_PRIZES = [70000, 40000, 25000, 15000, 10000, 7000, 5000, 4000, 3000, 2000];

export interface WlBoardRow {
  rank: number;
  email: string;
  nick: string;
  division: string;
  wins: number;
  losses: number;
  roundBalance: number;
  prize: number;
  paid: boolean; // claimed_at marcado (settle já pagou esta entry)
}

// Ranking COMPLETO da janela com e-mails (só admin). Mesmo critério do público:
// vitórias > saldo de rounds > menos derrotas > inscrição mais antiga.
export async function wlBoard(sql: SqlTag, windowId: string): Promise<WlBoardRow[]> {
  const rows = await sql`SELECT e.email, e.wins, e.losses, e.rounds_for, e.rounds_against, e.division, e.claimed_at, COALESCE(a.nick, 'manager') AS nick
    FROM rtm_wl_entries e LEFT JOIN rtm_accounts a ON a.email = e.email
    WHERE e.window_id=${windowId} ORDER BY e.wins DESC, (e.rounds_for - e.rounds_against) DESC, e.losses ASC, e.registered_at ASC LIMIT 100`;
  return rows.map((r, i) => ({
    rank: i + 1,
    email: String(r.email),
    nick: String(r.nick ?? 'manager'),
    division: String(r.division ?? ''),
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    roundBalance: Number(r.rounds_for ?? 0) - Number(r.rounds_against ?? 0),
    prize: i < WL_PLACEMENT_PRIZES.length ? WL_PLACEMENT_PRIZES[i] : 0,
    paid: r.claimed_at != null,
  }));
}

export type WlSettleResult =
  | { ok: true; windowId: string; paid: { rank: number; email: string; nick: string; prize: number; replayed: boolean }[] }
  | { ok: false; error: 'bad_window' | 'window_still_open' | 'empty' };

// Fecha a janela e PAGA o top 10 por colocação. Idempotente em dois níveis:
// op_id `wl:<windowId>` por e-mail no ledger (o MESMO do claim legado — rodar o
// settle duas vezes, ou settle depois de um claim antigo, nunca paga em dobro)
// + claimed_at na entry como marcador de UI. `force` permite fechar antes do
// fim da janela (decisão do dono no CRM).
export async function wlSettle(sql: SqlTag, windowId: string, now: Date, force = false): Promise<WlSettleResult> {
  const bounds = parseWindowId(windowId);
  if (!bounds) return { ok: false, error: 'bad_window' };
  if (!force && now.getTime() < bounds.endsAt.getTime()) return { ok: false, error: 'window_still_open' };
  const board = await wlBoard(sql, windowId);
  if (!board.length) return { ok: false, error: 'empty' };
  const paid: { rank: number; email: string; nick: string; prize: number; replayed: boolean }[] = [];
  for (const row of board.slice(0, WL_PLACEMENT_PRIZES.length)) {
    if (row.prize <= 0) continue;
    const pay = await applyUltTransaction(sql, row.email, {
      opId: `wl:${windowId}`,
      kind: 'reward',
      creditsDelta: row.prize,
      cards: [],
      meta: { source: 'weekend-league-settle', windowId, rank: row.rank, wins: row.wins, roundBalance: row.roundBalance },
    });
    if (!pay.ok) continue; // defensivo — delta positivo não falha
    await sql`UPDATE rtm_wl_entries SET claimed_at=now() WHERE email=${row.email} AND window_id=${windowId} AND claimed_at IS NULL`;
    paid.push({ rank: row.rank, email: row.email, nick: row.nick, prize: row.prize, replayed: pay.replayed });
  }
  return { ok: true, windowId, paid };
}
