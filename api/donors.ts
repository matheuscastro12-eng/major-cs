// Lista pública de apoiadores (GET) e registro de doações pelo admin (POST).
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '../server/admin-auth.js';
import { internalError, parseJsonBody } from '../server/http.js';
import type { RateSql } from '../server/rate-limit.js';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }
  const sql = neon(url);

  if (req.method === 'GET' || !req.method) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    try {
      const rows = await sql`
        SELECT name, amount, message, source, created_at
        FROM donors ORDER BY created_at DESC LIMIT 100`;
      const total = await sql`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM donors`;
      res.status(200).json({ donors: rows, total: Number(total[0].total), count: Number(total[0].n) });
    } catch (e) {
      internalError(res, e, 'donors_get');
    }
    return;
  }

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    const parsed = parseJsonBody(req.body);
    if (!parsed) { res.status(400).json({ ok: false, error: 'JSON inválido' }); return; }
    if (!(await requireAdmin(sql as unknown as RateSql, parsed, req, res))) return; // O0-16
    const body = parsed as {
      name?: string;
      amount?: number;
      message?: string;
      source?: string;
    };
    const name = String(body.name ?? '').slice(0, 60).trim();
    if (!name) {
      res.status(400).json({ error: 'nome obrigatório' });
      return;
    }
    const amount = Math.max(0, Math.min(100000, Number(body.amount) || 0));
    const message = String(body.message ?? '').slice(0, 200);
    const source = ['pixgg', 'kofi', 'outro'].includes(String(body.source)) ? String(body.source) : 'pixgg';
    try {
      await sql`INSERT INTO donors (name, amount, message, source) VALUES (${name}, ${amount}, ${message}, ${source})`;
      res.status(200).json({ ok: true });
    } catch (e) {
      internalError(res, e, 'donors_post');
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
