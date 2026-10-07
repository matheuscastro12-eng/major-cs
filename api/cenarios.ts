// Desafio da Semana do Modo Cenário (Carreira). Lógica em server/cenarios.ts.
// GET  ?action=board&week=wk-AAAA-SS  → top 50 (público, cacheado no edge)
// POST { action: 'start'|'submit'|'me', token, week, run? } → exige conta (qualquer, paga ou não)
// Segurança: token assinado (server/auth), rate limit no Postgres por conta e IP,
// pontuação recalculada no servidor a partir do log (o número do cliente é ignorado).
import { neon } from '@neondatabase/serverless';
import { respondMissingSecret, verifyAccountToken } from '../server/auth.js';
import { cenarioBoard, cenarioMe, cenarioSchemaQueries, cenarioStart, cenarioSubmit, maybeCleanup } from '../server/cenarios.js';
import { parseJsonBody } from '../server/http.js';
import { internalError } from '../server/internalError.js';
import { normalizeNick } from '../server/nick.js';
import { clientIp, rateLimitHit, respondLimited, type RateSql } from '../server/rate-limit.js';
import type { SqlTag } from '../server/ultimate-economy.js';
import { weeklyFromId, weeklyId } from '../src/engine/cenarios/weekly.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void }
interface Req { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined>; headers?: Record<string, string | string[] | undefined> }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

let schemaReady = false;
async function ensureSchema(sql: SqlTag): Promise<void> {
  if (schemaReady) return;
  for (const q of cenarioSchemaQueries(sql)) await q;
  schemaReady = true;
}

export default async function handler(req: Req, res: Res) {
  try { await handle(req, res); } catch (e) { internalError(res, 'cenarios', e); }
}

async function handle(req: Req, res: Res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const neonSql = neon(dbUrl);
  const sql = neonSql as unknown as SqlTag;
  await ensureSchema(sql);
  const now = Date.now();

  if (req.method === 'GET') {
    const raw = req.query?.week;
    const wk = String((Array.isArray(raw) ? raw[0] : raw) ?? weeklyId(now));
    const weekId = weeklyFromId(wk) ? wk : weeklyId(now);
    await maybeCleanup(sql, now);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ ok: true, ...(await cenarioBoard(sql, weekId)) });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  if (respondMissingSecret(res)) return;
  const body = parseJsonBody(req.body) ?? {};
  const email = verifyAccountToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra disputar o Desafio da Semana.' }); return; }
  const action = String(body.action ?? '');
  const weekId = String(body.week ?? '').slice(0, 16);
  const rsql = neonSql as unknown as RateSql;
  const ip = clientIp(req.headers);

  if (action === 'me') {
    if (!weeklyFromId(weekId)) { res.status(400).json({ error: 'bad_week' }); return; }
    res.status(200).json({ ok: true, ...(await cenarioMe(sql, email, weekId)) });
    return;
  }
  if (action === 'start') {
    if (respondLimited(res, await rateLimitHit(rsql, [{ key: `cen:start:${email}`, limit: 20, windowSec: 86_400 }, { key: `cen:ip:${ip}`, limit: 120, windowSec: 3600 }]))) return;
    const acc = await neonSql`SELECT nick FROM rtm_accounts WHERE email=${email}`;
    if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
    const nick = normalizeNick(acc[0].nick) || 'manager';
    const r = await cenarioStart(sql, now, email, nick, weekId);
    if (!r.ok) { res.status(400).json(r); return; }
    res.status(200).json(r);
    return;
  }
  if (action === 'submit') {
    if (respondLimited(res, await rateLimitHit(rsql, [{ key: `cen:submit:${email}`, limit: 12, windowSec: 3600 }, { key: `cen:ip:${ip}`, limit: 120, windowSec: 3600 }]))) return;
    const r = await cenarioSubmit(sql, now, email, weekId, body.run);
    if (!r.ok) { res.status(r.error === 'not_started' ? 409 : 400).json(r); return; }
    res.status(200).json(r);
    return;
  }
  res.status(400).json({ error: 'action' });
}
