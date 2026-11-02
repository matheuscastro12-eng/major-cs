// Identidade do servidor num lugar só: o segredo que assina os tokens
// (APP_SECRET), o token de conta ("body.sig", body = email|exp) e a sessão de
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

// HOTFIX 2026-09-29: a produção nunca teve APP_SECRET e todos os tokens de conta
// (e referências de pagamento) em circulação foram assinados com o reserva
// legado `fallback:${DATABASE_URL}`. A falha fechada derrubou o login de todo
// mundo no lançamento. Enquanto APP_SECRET não estiver configurada, volta o
// reserva legado — mesma segurança de antes do lançamento, sessões preservadas.
// Sem APP_SECRET E sem DATABASE_URL continua falha fechada. Configurar
// APP_SECRET = o valor do reserva mantém as sessões; um valor novo desloga todos.
function legacyFallbackSecret(): string {
  const db = cleanEnv(process.env.DATABASE_URL);
  return db ? `fallback:${db}` : '';
}
let warnedFallback = false;

export function appSecretConfigured(): boolean {
  return cleanEnv(process.env.APP_SECRET).length > 0 || legacyFallbackSecret().length > 0;
}

// Lança AppSecretMissingError sem APP_SECRET e sem o reserva. Quem chama num
// caminho público deve checar appSecretConfigured() antes (ver respondMissingSecret).
export function appSecret(): string {
  const secret = cleanEnv(process.env.APP_SECRET);
  if (secret) return secret;
  const legacy = legacyFallbackSecret();
  if (!legacy) throw new AppSecretMissingError();
  if (!warnedFallback) { warnedFallback = true; console.warn('app_secret_legacy_fallback'); }
  return legacy;
}

// Resposta padrão da falha fechada. Devolve true quando respondeu (a rota para).
export function respondMissingSecret(res: { status: (code: number) => { json: (b: unknown) => void } }): boolean {
  if (appSecretConfigured()) return false;
  console.error('app_secret_missing');
  res.status(500).json({ error: 'Servidor sem configuração de segurança. Tente mais tarde.' });
  return true;
}

// ── Dupla chave (etapa 1 do #107) ────────────────────────────────────────────
// Com APP_SECRET configurada, tudo que é NOVO é assinado com ela, mas tokens
// assinados com o reserva legado continuam aceitos (ninguém é deslogado) e o
// `me` devolve um token novo para trocar o antigo no navegador. Sem APP_SECRET,
// o comportamento é idêntico ao de antes (só o reserva). A etapa 2 (outro PR,
// com data de corte) deixa de aceitar o reserva.
function acceptedSecrets(): string[] {
  const out = [cleanEnv(process.env.APP_SECRET), legacyFallbackSecret()].filter(Boolean);
  return [...new Set(out)];
}

/** Segredo das REFERÊNCIAS de pagamento (accountReference): estável de propósito.
 *  stripe_ref fica gravado em rtm_accounts e vai ao Stripe como
 *  client_reference_id; trocar a chave mudaria a referência e o webhook deixaria
 *  de achar a conta. Fica no reserva enquanto ele existir. Não é token de login. */
export function referenceSecret(): string {
  return legacyFallbackSecret() || appSecret();
}

const nowSec = (): number => Math.floor(Date.now() / 1000);
const hmacWith = (secret: string, body: string): string => createHmac('sha256', secret).update(body).digest('base64url');
const hmac = (body: string): string => hmacWith(appSecret(), body);
/** a assinatura bate com alguma chave aceita? devolve a chave usada (ou null) */
function matchSecret(sig: string, body: string): string | null {
  for (const k of acceptedSecrets()) if (safeEqualStr(sig, hmacWith(k, body))) return k;
  return null;
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function signAccountToken(email: string, ttlSec = ACCOUNT_TOKEN_TTL_SEC): string {
  const body = `${email}|${nowSec() + ttlSec}`;
  return `${Buffer.from(body).toString('base64url')}.${hmac(body)}`;
}

// E-mail do token, ou null (inválido, expirado ou servidor sem APP_SECRET).
export function verifyAccountToken(token: string): string | null {
  if (!appSecretConfigured()) return null;
  const [b64, sig] = String(token ?? '').split('.');
  if (!b64 || !sig) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  if (!matchSecret(sig, body)) return null;
  const [email, exp] = body.split('|');
  if (!email || !(Number(exp) >= nowSec())) return null;
  return email;
}

/** token de conta válido mas assinado com uma chave que não é a de assinatura
 *  atual (o reserva, depois de configurar APP_SECRET): o `me` troca por um novo */
export function accountTokenNeedsRefresh(token: string): boolean {
  if (!verifyAccountToken(token)) return false;
  const [b64, sig] = String(token).split('.');
  const body = Buffer.from(b64, 'base64url').toString();
  return matchSecret(sig, body) !== appSecret();
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
  if (!matchSecret(sig, body)) return null;
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
