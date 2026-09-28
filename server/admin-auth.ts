// Autenticação das rotas de admin (O0-16, etapa 1 do SEGU-07/ONLI-13).
//
// A credencial chega em body.password (ou no header x-admin-key) e pode ser:
//   - a SESSÃO de admin ("adm.<corpo>.<sig>", 12h), emitida pela action
//     adminSession de api/account.ts pra conta com is_admin. É o caminho do CRM:
//     o browser nunca mais recebe a ADMIN_PASSWORD. A conta ainda precisa ter
//     is_admin no banco a CADA request (tirou o cargo, a sessão morre na hora).
//   - a senha mestra ADMIN_PASSWORD, comparada em tempo constante. Fica como
//     acesso de emergência (curl/admin-login) até a etapa 2 (O1-04) aposentá-la.
//
// Força bruta: cada credencial errada conta em admin-fail:ip:<ip> (compartilhado
// no Postgres). Estourou, o IP leva 429 ANTES da validação — inclusive com a
// senha certa, senão o atacante veria o 200 quando acertasse.
import { adminPasswordMatches, verifyAdminSession } from './auth.js';
import { clientIp, rateLimitHit, rateLimitPeek, type RateRule, type RateSql } from './rate-limit.js';

export const ADMIN_FAIL_LIMIT = 10;
export const ADMIN_FAIL_WINDOW_SEC = 15 * 60;
// teto geral por IP nas rotas admin (o CRM faz várias chamadas por tela).
export const ADMIN_IP_LIMIT = 300;
export const ADMIN_IP_WINDOW_SEC = 10 * 60;

export type AdminAuth =
  | { ok: true; actor: string; via: 'session' | 'password' }
  | { ok: false; status: 401 | 429; retryAfterSec?: number };

type Headers = Record<string, string | string[] | undefined> | undefined;

function headerValue(headers: Headers, name: string): string {
  const raw = headers?.[name];
  return String(Array.isArray(raw) ? raw[0] : (raw ?? '')).trim();
}

// credencial do request: body.password (padrão atual do CRM) ou header x-admin-key
// (pra GET/curl sem pôr a senha na URL — o ?pw= do api/error.ts morreu).
export function adminCredential(body: Record<string, unknown> | null | undefined, headers?: Headers): string {
  const fromBody = String(body?.password ?? '').trim();
  return fromBody || headerValue(headers, 'x-admin-key');
}

async function sessionIsAdmin(sql: RateSql, email: string): Promise<boolean> {
  try {
    const r = await sql`SELECT is_admin FROM rtm_accounts WHERE email=${email}`;
    return r.length > 0 && Boolean(r[0].is_admin);
  } catch (error) {
    console.error('admin_session_lookup_failed', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function checkAdmin(sql: RateSql | null, credential: string, headers?: Headers): Promise<AdminAuth> {
  const ip = clientIp(headers);
  const failRule: RateRule = { key: `admin-fail:ip:${ip}`, limit: ADMIN_FAIL_LIMIT, windowSec: ADMIN_FAIL_WINDOW_SEC };
  const ipRule: RateRule = { key: `admin:ip:${ip}`, limit: ADMIN_IP_LIMIT, windowSec: ADMIN_IP_WINDOW_SEC };

  const blocked = await rateLimitPeek(sql, [failRule]);
  if (blocked.limited) return { ok: false, status: 429, retryAfterSec: blocked.retryAfterSec };
  const flood = await rateLimitHit(sql, [ipRule]);
  if (flood.limited) return { ok: false, status: 429, retryAfterSec: flood.retryAfterSec };

  const sessionEmail = verifyAdminSession(credential);
  if (sessionEmail && sql && (await sessionIsAdmin(sql, sessionEmail))) {
    return { ok: true, actor: sessionEmail, via: 'session' };
  }
  if (!sessionEmail && adminPasswordMatches(credential)) return { ok: true, actor: 'admin-password', via: 'password' };

  const fail = await rateLimitHit(sql, [failRule]);
  if (fail.limited) return { ok: false, status: 429, retryAfterSec: fail.retryAfterSec };
  return { ok: false, status: 401 };
}

// Atalho pras rotas: responde 401/429 no formato que a rota já usava e devolve
// true quando a credencial passou.
export async function requireAdmin(
  sql: RateSql | null,
  body: Record<string, unknown> | null | undefined,
  req: { headers?: Headers },
  res: { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void },
  deniedBody: unknown = { ok: false },
): Promise<boolean> {
  const auth = await checkAdmin(sql, adminCredential(body, req.headers), req.headers);
  if (auth.ok) return true;
  if (auth.status === 429) {
    res.setHeader('Retry-After', String(Math.max(1, auth.retryAfterSec ?? 60)));
    res.status(429).json({ ok: false, error: 'Muitas tentativas de admin. Espere alguns minutos.' });
    return false;
  }
  res.status(401).json(deniedBody);
  return false;
}
