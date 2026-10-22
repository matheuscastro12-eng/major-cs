// Identidade do servidor num lugar só: o segredo que assina os tokens
// (APP_SECRET), o token de conta ("body.sig", body = email|exp|versão) e a sessão de
// admin (token curto com claim de admin). Antes cada rota tinha a própria cópia
// de sign/verify e um fallback `fallback:${DATABASE_URL}` — quem visse a
// DATABASE_URL (log, preview, .env vazado) forjava token de QUALQUER e-mail,
// inclusive admin. Agora é FALHA FECHADA: sem APP_SECRET, nada é assinado nem
// aceito e as rotas respondem 500 (SEGU-10).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const cleanEnv = (value?: string): string => value?.replace(new RegExp('^\\uFEFF'), '').trim() ?? '';

// Token de conta: 180 dias (mesmo TTL de sempre; o O1-03 baixa pra 30 com revogação).
export const ACCOUNT_TOKEN_TTL_SEC = 60 * 60 * 24 * 180;
// Sessão de admin: curta de propósito. O CRM renova sozinho a cada abertura.
export const ADMIN_SESSION_TTL_SEC = 60 * 60 * 12;
const ADMIN_PREFIX = 'adm.';

export class AppSecretMissingError extends Error {
  constructor() {
    super('APP_SECRET não configurada');
    this.name = 'AppSecretMissingError';
  }
}

// [SEC 2026-10-22] O reserva legado `fallback:${DATABASE_URL}` (HOTFIX
// 2026-09-29) SAIU: quem visse a DATABASE_URL (env de preview, .env de dev,
// log) forjava token de qualquer conta, inclusive admin. Sem APP_SECRET é falha
// fechada de novo — configure APP_SECRET (>= 32 bytes aleatórios) ANTES do
// deploy. Trocar o segredo desloga todo mundo (tokens antigos param de valer).
export function appSecretConfigured(): boolean {
  return cleanEnv(process.env.APP_SECRET).length > 0;
}

// Lança AppSecretMissingError sem APP_SECRET. Quem chama num caminho público
// deve checar appSecretConfigured() antes (ver respondMissingSecret).
export function appSecret(): string {
  const secret = cleanEnv(process.env.APP_SECRET);
  if (!secret) throw new AppSecretMissingError();
  return secret;
}

// Resposta padrão da falha fechada. Devolve true quando respondeu (a rota para).
export function respondMissingSecret(res: { status: (code: number) => { json: (b: unknown) => void } }): boolean {
  if (appSecretConfigured()) return false;
  console.error('app_secret_missing');
  res.status(500).json({ error: 'Servidor sem configuração de segurança. Tente mais tarde.' });
  return true;
}

const nowSec = (): number => Math.floor(Date.now() / 1000);
const hmac = (body: string): string => createHmac('sha256', appSecret()).update(body).digest('base64url');

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// [SEC 2026-10-22] body = email|exp|token_version. A versão mora no banco
// (rtm_accounts.token_version / rtm_pending_signups.token_version) e sobe no
// cadastro pendente repetido, na ativação (pagamento/grant) e no reset de
// senha: token emitido antes disso morre (ver verifyAccountSession). Token
// antigo sem a 3ª parte vale como versão 0.
export function signAccountToken(email: string, ttlSec = ACCOUNT_TOKEN_TTL_SEC, version = 0): string {
  const v = Math.max(0, Math.trunc(Number(version) || 0));
  const body = `${email}|${nowSec() + ttlSec}|${v}`;
  return `${Buffer.from(body).toString('base64url')}.${hmac(body)}`;
}

// E-mail + versão do token, ou null (inválido, expirado ou servidor sem APP_SECRET).
export function parseAccountToken(token: string): { email: string; version: number } | null {
  if (!appSecretConfigured()) return null;
  const [b64, sig] = String(token ?? '').split('.');
  if (!b64 || !sig) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  if (!safeEqualStr(sig, hmac(body))) return null;
  const [email, exp, ver] = body.split('|');
  if (!email || !(Number(exp) >= nowSec())) return null;
  const version = ver === undefined ? 0 : Number(ver);
  if (!Number.isInteger(version) || version < 0) return null;
  return { email, version };
}

// Só a assinatura/expiração (sem revogação). Rotas devem preferir
// verifyAccountSession, que também confere a token_version no banco.
export function verifyAccountToken(token: string): string | null {
  return parseAccountToken(token)?.email ?? null;
}

// Tag SQL mínima (neon) — evita importar o driver aqui.
export type TokenSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

// Versão atual da conta (ou do cadastro pendente). null = e-mail sem conta nem
// cadastro pendente.
export async function currentTokenVersion(sql: TokenSql, email: string): Promise<number | null> {
  const r = await sql`SELECT COALESCE(token_version, 0) AS v, 0 AS k FROM rtm_accounts WHERE email=${email}
    UNION ALL SELECT COALESCE(token_version, 0) AS v, 1 AS k FROM rtm_pending_signups WHERE email=${email}
    ORDER BY k LIMIT 1`;
  return r.length ? Number(r[0].v ?? 0) : null;
}

// Token assinado com a versão atual do banco (login, cadastro).
export async function issueAccountToken(sql: TokenSql, email: string): Promise<string> {
  return signAccountToken(email, ACCOUNT_TOKEN_TTL_SEC, (await currentTokenVersion(sql, email)) ?? 0);
}

// Verificação com revogação: assinatura + expiração + token_version igual à do
// banco. E-mail sem linha em nenhuma das tabelas segue o comportamento antigo
// (só assinatura) — as rotas já tratam "conta não encontrada".
export async function verifyAccountSession(sql: TokenSql, token: string): Promise<string | null> {
  const parsed = parseAccountToken(token);
  if (!parsed) return null;
  const current = await currentTokenVersion(sql, parsed.email);
  if (current !== null && current !== parsed.version) return null;
  return parsed.email;
}

// ── Sessão de admin (O0-16) ──────────────────────────────────────────────────
// Substitui a action adminKey, que entregava ADMIN_PASSWORD ao browser. O token
// tem prefixo próprio e claim "admin" no corpo: um token de conta comum NUNCA
// passa por sessão de admin (nem o contrário). Mesmo válido, a rota ainda
// confere is_admin no banco a cada request (ver server/admin-auth.ts).
export function signAdminSession(email: string, ttlSec = ADMIN_SESSION_TTL_SEC): string {
  const body = `admin|${email}|${nowSec() + ttlSec}`;
  return `${ADMIN_PREFIX}${Buffer.from(body).toString('base64url')}.${hmac(body)}`;
}

export function verifyAdminSession(token: string): string | null {
  if (!appSecretConfigured()) return null;
  const raw = String(token ?? '');
  if (!raw.startsWith(ADMIN_PREFIX)) return null;
  const [b64, sig] = raw.slice(ADMIN_PREFIX.length).split('.');
  if (!b64 || !sig) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  if (!safeEqualStr(sig, hmac(body))) return null;
  const [claim, email, exp] = body.split('|');
  if (claim !== 'admin' || !email || !(Number(exp) >= nowSec())) return null;
  return email;
}

// Comparação da senha mestra em tempo constante: compara os SHA-256 (tamanho
// fixo), então nem o comprimento da senha vaza. Sem ADMIN_PASSWORD, nada passa.
export function adminPasswordMatches(given: unknown): boolean {
  const expected = cleanEnv(process.env.ADMIN_PASSWORD);
  const candidate = String(given ?? '').trim();
  if (!expected || !candidate) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
