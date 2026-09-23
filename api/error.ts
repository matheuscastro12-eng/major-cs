// Captura de erros do client em produção: o jogo manda erro de runtime
// (window.onerror / unhandledrejection) pra cá, deduplicado e limitado no client,
// então o volume é baixo. GET lista os mais recentes (debug pelo admin).
//
// Endurecimento (O0-36/O0-16): POST anônimo agora tem rate limit por IP e body
// inválido dá 400 (antes 500); o GET de admin lê a credencial do header
// x-admin-key (ou body.password), nunca mais de ?pw= na URL — que ia parar em
// log de borda e histórico do navegador.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { requireAdmin } from '../server/admin-auth.js';
import { internalError, parseJsonBody } from '../server/http.js';
import { clientIp, memoryRateHit, respondLimited, type RateSql } from '../server/rate-limit.js';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const cut = (v: unknown, n: number) => String(v ?? '').slice(0, n);

// cria a tabela 1x por instância, não em todo POST de telemetria (evita 1 round-trip
// ao Neon por erro reportado). CREATE ... IF NOT EXISTS segue idempotente.
let schemaReady = false;

// CUSTO NEON: a retenção de 90 dias vinha grudada no INSERT, então cada erro
// reportado varria client_errors inteira (36k linhas, 38 MB, sem índice em ts)
// pra apagar ZERO linha — ~661 MILHÕES de tuplas lidas à toa. Agora: throttled
// 1x/12h por instância, apoiada em idx_client_errors_ts.
let lastRetentionAt = 0;
const RETENTION_MS = 12 * 60 * 60_000;
// Limite do POST por IP (o client já deduplica; isto segura script de flood).
// TODO(O0-36): em memória POR INSTÂNCIA de propósito — pôr um UPSERT no Postgres
// por erro reportado dobraria as escritas da telemetria. A barreira
// compartilhada é a regra de rate limit do Vercel Firewall pra /api/error
// (configurar no painel; ver notas do PR).
const POST_LIMIT_PER_MIN = 20;

async function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
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
  if (req.method !== 'POST' && req.method !== 'GET' && req.method) {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'no db' });
    return;
  }

  if (req.method === 'POST') {
    const ip = clientIp(req.headers);
    if (respondLimited(res, memoryRateHit({ key: `error:ip:${ip}`, limit: POST_LIMIT_PER_MIN, windowSec: 60 }), 'muitos erros reportados')) return;
    const body = parseJsonBody(req.body);
    if (!body) { res.status(400).json({ error: 'JSON inválido' }); return; }
    const message = cut(body.message, 500);
    if (!message) { res.status(400).json({ error: 'empty' }); return; }
    const ccHeader = req.headers?.['x-vercel-ip-country'];
    const country = cut(Array.isArray(ccHeader) ? ccHeader[0] : ccHeader, 2).toLowerCase();
    try {
      const sql = neon(url);
      await ensureSchema(sql);
      await sql`INSERT INTO client_errors (sid, kind, message, stack, page, ua, country)
        VALUES (${cut(body.sid, 40)}, ${cut(body.kind, 20)}, ${message}, ${cut(body.stack, 2000)}, ${cut(body.url, 300)}, ${cut(body.ua, 300)}, ${country})`;
      if (Date.now() - lastRetentionAt > RETENTION_MS) {
        lastRetentionAt = Date.now();
        await sql`DELETE FROM client_errors WHERE ts < now() - interval '90 days'`;
      }
      res.status(200).json({ ok: true });
    } catch (e) {
      internalError(res, e, 'client_error_insert');
    }
    return;
  }

  // GET: leitura restrita ao admin (header x-admin-key com a sessão de admin ou a senha).
  const sql = neon(url);
  if (!(await requireAdmin(sql as unknown as RateSql, null, req, res, { error: 'unauthorized' }))) return;
  try {
    await ensureSchema(sql);
    const rows = await sql`SELECT ts, kind, message, stack, page, ua, country FROM client_errors ORDER BY id DESC LIMIT 100`;
    res.status(200).json({ errors: rows });
  } catch (e) {
    internalError(res, e, 'client_error_list');
  }
}
