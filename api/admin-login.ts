// Login do administrador do CRM. A senha fica na env ADMIN_PASSWORD (Vercel).
// Também aceita a sessão de admin da conta (server/admin-auth.ts). Comparação em
// tempo constante e rate limit por IP compartilhado no Postgres (O0-16): 10
// credenciais erradas em 15 min travam o IP, inclusive pra senha certa.
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '../server/admin-auth.js';
import { parseJsonBody } from '../server/http.js';
import type { RateSql } from '../server/rate-limit.js';

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (k: string, v: string) => void;
  },
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  if (!clean(process.env.ADMIN_PASSWORD) && !clean(process.env.APP_SECRET)) {
    res.status(500).json({ error: 'admin não configurado' });
    return;
  }
  const body = parseJsonBody(req.body);
  if (!body) { res.status(400).json({ ok: false, error: 'JSON inválido' }); return; }
  const dbUrl = clean(process.env.DATABASE_URL);
  // sem banco o limite cai no fallback em memória (por instância).
  const sql = dbUrl ? (neon(dbUrl) as unknown as RateSql) : null;
  if (!(await requireAdmin(sql, body, req, res))) return;
  res.status(200).json({ ok: true });
}
