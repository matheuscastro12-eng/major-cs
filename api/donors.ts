// Lista pública de apoiadores (GET) e registro de doações pelo admin (POST).
import { neon } from '@neondatabase/serverless';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }
  const sql = neon(url);

  if (req.method === 'GET' || !req.method) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    try {
      const rows = await sql`
        SELECT name, amount, message, source, created_at
        FROM donors ORDER BY created_at DESC LIMIT 100`;
      const total = await sql`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM donors`;
      res.status(200).json({ donors: rows, total: Number(total[0].total), count: Number(total[0].n) });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    const expected = clean(process.env.ADMIN_PASSWORD);
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      password?: string;
      name?: string;
      amount?: number;
      message?: string;
      source?: string;
    };
    if (!expected || (body.password ?? '').trim() !== expected) {
      res.status(401).json({ ok: false });
      return;
    }
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
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
