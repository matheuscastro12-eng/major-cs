// "Major da Semana" — Weekend League do Ultimate (fase A: servidor).
// Torneio semanal (qua 00:00 → sáb 23:59 America/Sao_Paulo): registro
// por janela, até 10 partidas com reports PAREADOS (mesma filosofia anti-fraude
// da ranqueada — resultado só conta quando os dois lados batem) e recompensa
// por faixa de vitórias paga pela economia server-authoritative (ledger
// idempotente, op_id wl:<windowId>). Lógica pura em server/weekend-league.ts.
// Ações (POST body.action): status | register | report | claim. Só conta PAGA.
import { neon } from '@neondatabase/serverless';
import { respondMissingSecret, verifyAccountToken } from '../server/auth.js';
import {
  wlSchemaQueries,
  wlStatus,
  wlRegister,
  wlReport,
  wlClaim,
  wlBoard,
  wlSettle,
  weekendWindowFor,
  WL_MATCH_CODE_MAX,
  WL_PLACEMENT_PRIZES,
} from '../server/weekend-league.js';
import { ultEconomySchemaQueries, type SqlTag } from '../server/ultimate-economy.js';
import { bumpCommunityContrib, communityGoalSchemaQueries } from '../server/communityGoal.js'; // [URG-5]
import { requireAdmin } from '../server/admin-auth.js';
import type { RateSql } from '../server/rate-limit.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

const rlBuckets = new Map<string, { count: number; resetAt: number }>();
let schemaReady = false;

function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (rlBuckets.size > 5000) rlBuckets.clear();
  const current = rlBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rlBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function clientIp(headers?: Record<string, string | string[] | undefined>): string {
  const raw = headers?.['x-forwarded-for'] ?? headers?.['x-real-ip'] ?? '';
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  return value.split(',')[0].trim() || 'unknown';
}

// token de conta: server/auth.ts (falha fechada sem APP_SECRET).
const verifyToken = verifyAccountToken;

const WINDOW_ID_RE = /^wl-\d{4}-\d{2}-\d{2}$/;
// limites por conta/minuto: report é o hot path da run; claim/register são raros.
const ACTION_LIMITS: Record<string, number> = { status: 60, register: 10, report: 30, claim: 10 };

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  if (respondMissingSecret(res)) return; // falha fechada (SEGU-10)
  const ip = clientIp(req.headers);
  if (rateLimited(`ip:${ip}`, 180)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  let body: Record<string, unknown>;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  const action = String(body.action ?? '');

  // ---- ações ADMIN (senha do CRM em body.password; sem token de jogador) ----
  // adminBoard = ranking completo com e-mails; settle = FECHAR E PREMIAR o top 10
  // por colocação (idempotente — op_id wl:<windowId> por e-mail no ledger).
  if (action === 'adminBoard' || action === 'settle') {
    const adbUrl = clean(process.env.DATABASE_URL);
    if (!adbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
    const asql = neon(adbUrl) as unknown as SqlTag;
    if (!(await requireAdmin(asql as unknown as RateSql, body, req, res, { error: 'admin' }))) return; // O0-16
    if (!schemaReady) {
      for (const q of [...ultEconomySchemaQueries(asql), ...wlSchemaQueries(asql)]) await q;
      schemaReady = true;
    }
    const anow = new Date();
    const win = weekendWindowFor(anow);
    const windowId = WINDOW_ID_RE.test(String(body.windowId ?? '')) ? String(body.windowId) : win.id;
    if (action === 'adminBoard') {
      res.status(200).json({ ok: true, window: win, windowId, prizes: WL_PLACEMENT_PRIZES, board: await wlBoard(asql, windowId) });
      return;
    }
    const r = await wlSettle(asql, windowId, anow, !!body.force);
    if (!r.ok) { res.status(409).json({ error: r.error }); return; }
    res.status(200).json(r);
    return;
  }

  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra jogar o Major da Semana.' }); return; }
  if (rateLimited(`account:${email}:${action}`, ACTION_LIMITS[action] ?? 30)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl) as unknown as SqlTag;
  if (!schemaReady) {
    for (const q of [...ultEconomySchemaQueries(sql), ...wlSchemaQueries(sql), ...communityGoalSchemaQueries(sql)]) await q;
    schemaReady = true;
  }

  const acc = await (sql`SELECT paid FROM rtm_accounts WHERE email=${email}`);
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  // Major da Semana aberto a QUALQUER conta logada (grátis ou vitalícia) — sem gate de paid.

  const now = new Date();

  if (action === 'status') {
    res.status(200).json(await wlStatus(sql, email, now));
    return;
  }

  if (action === 'register') {
    const windowId = String(body.windowId ?? '').trim();
    if (!WINDOW_ID_RE.test(windowId)) { res.status(400).json({ error: 'windowId inválido' }); return; }
    const r = await wlRegister(sql, email, windowId, now);
    if (!r.ok) {
      if (r.error === 'window_closed') { res.status(409).json({ error: 'window_closed', message: 'A janela do Major da Semana está fechada. Volta na quarta!' }); return; }
      res.status(400).json({ error: 'wrong_window', message: 'Essa não é a janela atual.' });
      return;
    }
    res.status(200).json({ ok: true, replayed: r.replayed, entry: r.entry });
    return;
  }

  if (action === 'report') {
    const windowId = String(body.windowId ?? '').trim();
    if (!WINDOW_ID_RE.test(windowId)) { res.status(400).json({ error: 'windowId inválido' }); return; }
    const matchCode = String(body.matchCode ?? '').trim();
    if (!matchCode || matchCode.length > WL_MATCH_CODE_MAX) { res.status(400).json({ error: 'matchCode inválido' }); return; }
    const oppNick = String(body.oppNick ?? '').slice(0, 60);
    const roundsFor = Math.max(0, Math.trunc(Number(body.roundsFor) || 0));
    const roundsAgainst = Math.max(0, Math.trunc(Number(body.roundsAgainst) || 0));
    const r = await wlReport(sql, email, { windowId, matchCode, won: !!body.won, oppNick, roundsFor, roundsAgainst }, now);
    if (!r.ok) {
      const status = r.error === 'bad_match_code' ? 400 : r.error === 'not_registered' ? 403 : 409;
      res.status(status).json({ error: r.error });
      return;
    }
    // [URG-5] meta comunitária: report ACEITO (não duplicado) do Major da Semana conta 1 partida
    if (r.outcome !== 'duplicate') await bumpCommunityContrib(sql, now.getTime(), email);
    res.status(200).json({ ok: true, outcome: r.outcome, entry: r.entry });
    return;
  }

  if (action === 'claim') {
    const windowId = String(body.windowId ?? '').trim();
    if (!WINDOW_ID_RE.test(windowId)) { res.status(400).json({ error: 'windowId inválido' }); return; }
    const r = await wlClaim(sql, email, windowId, now);
    if (!r.ok) {
      const status = r.error === 'bad_window' ? 400 : r.error === 'not_registered' ? 403 : 409;
      res.status(status).json({ error: r.error });
      return;
    }
    res.status(200).json({ ok: true, replayed: r.replayed, tier: r.tier, wins: r.wins, credits: r.credits });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
