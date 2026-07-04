// LIVE-OPS do Ultimate (fase A — servidor). Duas faces numa rota só:
//   - 'active' (PÚBLICA): o jogo lê os eventos ativos ANTES mesmo do login —
//     sem token, rate limit por IP, resposta pequena e cacheável (max-age=300).
//     Também aceita GET (equivale a action=active) pra caches de borda.
//   - 'list' | 'upsert' | 'delete' (ADMIN): CRM agenda promos/SBCs/avisos —
//     senha de admin no body (env ADMIN_PASSWORD, mesmo padrão do
//     api/admin-accounts.ts). Erro de validação → 400 com {field, error}.
import { neon } from '@neondatabase/serverless';
import {
  activeLiveops,
  deleteLiveop,
  listLiveops,
  liveopsSchemaQueries,
  upsertLiveop,
  type SqlTag,
} from '../server/liveops.js';

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

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  const ip = clientIp(req.headers);
  if (rateLimited(`ip:${ip}`, 120)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
  } else if (req.method !== 'GET') {
    res.status(405).json({ error: 'method' });
    return;
  }
  // GET = leitura pública dos ativos (cacheável na borda); POST escolhe pela action.
  const action = req.method === 'GET' ? 'active' : String(body.action ?? '');

  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl) as unknown as SqlTag;
  if (!schemaReady) {
    for (const q of liveopsSchemaQueries(sql)) await q;
    schemaReady = true;
  }

  // ---------------------------------------------------------------- pública
  if (action === 'active') {
    // só o que o jogo precisa: id/kind/payload/janela — nada de created_by/enabled.
    const rows = await activeLiveops(sql, new Date());
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      items: rows.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, startsAt: r.startsAt, endsAt: r.endsAt })),
    });
    return;
  }

  // ------------------------------------------------------------------ admin
  res.setHeader('Cache-Control', 'no-store');
  const adminPass = clean(process.env.ADMIN_PASSWORD);
  if (!adminPass || String(body.password ?? '').trim() !== adminPass) { res.status(401).json({ ok: false }); return; }

  if (action === 'list') {
    const rows = await listLiveops(sql);
    res.status(200).json({ items: rows });
    return;
  }

  if (action === 'upsert') {
    const result = await upsertLiveop(sql, {
      id: String(body.id ?? ''),
      kind: String(body.kind ?? ''),
      payload: body.payload,
      startsAt: String(body.startsAt ?? ''),
      endsAt: String(body.endsAt ?? ''),
      enabled: body.enabled !== false,
      createdBy: typeof body.createdBy === 'string' ? body.createdBy : 'admin',
    });
    if (!result.ok) { res.status(400).json({ error: result.error, field: result.field }); return; }
    res.status(200).json({ ok: true, item: result.row });
    return;
  }

  if (action === 'delete') {
    const removed = await deleteLiveop(sql, String(body.id ?? ''));
    res.status(200).json({ ok: true, removed });
    return;
  }

  res.status(400).json({ error: 'ação inválida' });
}
