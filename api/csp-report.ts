// Coletor da CSP Report-Only (O1-11): o report-uri do vercel.json aponta pra cá.
//
// Antes os relatórios iam pro /api/error, um handler (req, res): o runtime da
// Vercel só parseia JSON, texto, form e octet-stream, então o corpo
// application/csp-report chegava vazio e TODO relatório voltava 400 ("empty")
// sem gravar nada. Aqui o handler é Web (Request), lê o corpo cru e grava cada
// violação como kind 'csp' em client_errors, deduplicada por instância
// (server/csp-report.ts). Responde 204: o navegador não lê a resposta.
import { neon } from '@neondatabase/serverless';
import { cspReportsFromRaw, cspSeenRecently } from '../server/csp-report.js';
import { clientIp, memoryRateHit } from '../server/rate-limit.js';

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const cut = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const LIMIT_PER_MIN = 20; // mesmo teto do /api/error por IP
const MAX_BODY = 64 * 1024;

let schemaReady = false;

async function fetchHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 });
  const url = clean(process.env.DATABASE_URL);
  if (!url) return Response.json({ error: 'no db' }, { status: 500 });
  const headers = Object.fromEntries(request.headers);
  if (memoryRateHit({ key: `csp:ip:${clientIp(headers)}`, limit: LIMIT_PER_MIN, windowSec: 60 }).limited) {
    return new Response(null, { status: 429 });
  }
  const raw = (await request.text()).slice(0, MAX_BODY);
  const reports = cspReportsFromRaw(raw);
  if (!reports.length) return new Response(null, { status: 400 });
  const fresh = reports.filter((r) => !cspSeenRecently(r.message));
  if (!fresh.length) return new Response(null, { status: 204 });
  const country = cut(headers['x-vercel-ip-country'], 2).toLowerCase();
  const ua = cut(headers['user-agent'], 300);
  const sql = neon(url);
  if (!schemaReady) {
    await sql`CREATE TABLE IF NOT EXISTS client_errors (
      id serial PRIMARY KEY, ts timestamptz DEFAULT now(),
      sid text, kind text, message text, stack text, page text, ua text, country text
    )`;
    schemaReady = true;
  }
  for (const r of fresh) {
    await sql`INSERT INTO client_errors (sid, kind, message, stack, page, ua, country)
      VALUES ('', 'csp', ${cut(r.message, 500)}, ${cut(r.stack, 2000)}, ${cut(r.page, 300)}, ${ua}, ${country})`;
  }
  return new Response(null, { status: 204 });
}

export default { fetch: fetchHandler };
