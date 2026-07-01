// Captura de erros do client em produção: o jogo manda erro de runtime
// (window.onerror / unhandledrejection) pra cá, deduplicado e limitado no client,
// então o volume é baixo. GET lista os mais recentes (debug pelo admin).
import { neon } from '@neondatabase/serverless';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const cut = (v: unknown, n: number) => String(v ?? '').slice(0, n);

// cria a tabela 1x por instância, não em todo POST de telemetria (evita 1 round-trip
// ao Neon por erro reportado). CREATE ... IF NOT EXISTS segue idempotente.
let schemaReady = false;
async function ensureSchema(sql: ReturnType<typeof neon>): Promise<void> {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS client_errors (
    id serial PRIMARY KEY, ts timestamptz DEFAULT now(),
    sid text, kind text, message text, stack text, page text, ua text, country text
  )`;
  schemaReady = true;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  res.setHeader('Cache-Control', 'no-store');
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'no db' });
    return;
  }
  const sql = neon(url);
  await ensureSchema(sql);

  if (req.method === 'POST') {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown>;
    const message = cut(body.message, 500);
    if (!message) { res.status(400).json({ error: 'empty' }); return; }
    const ccHeader = req.headers?.['x-vercel-ip-country'];
    const country = cut(Array.isArray(ccHeader) ? ccHeader[0] : ccHeader, 2).toLowerCase();
    try {
      await sql`WITH inserted AS (
        INSERT INTO client_errors (sid, kind, message, stack, page, ua, country)
        VALUES (${cut(body.sid, 40)}, ${cut(body.kind, 20)}, ${message}, ${cut(body.stack, 2000)}, ${cut(body.url, 300)}, ${cut(body.ua, 300)}, ${country})
        RETURNING 1
      ) DELETE FROM client_errors WHERE ts < now() - interval '90 days'`;
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  if (req.method === 'GET' || !req.method) {
    // protege a leitura com a senha de admin (mesma do CRM)
    const pw = clean(Array.isArray(req.query?.pw) ? req.query?.pw[0] : (req.query?.pw as string | undefined));
    const expected = clean(process.env.ADMIN_PASSWORD);
    if (!expected || pw !== expected) { res.status(401).json({ error: 'unauthorized' }); return; }
    try {
      const rows = await sql`SELECT ts, kind, message, stack, page, ua, country FROM client_errors ORDER BY id DESC LIMIT 100`;
      res.status(200).json({ errors: rows });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
