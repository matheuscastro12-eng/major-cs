// Conta do jogador (e-mail + senha) + entitlement da conta vitalícia R$20.
// Token fica no localStorage; o backend (api/account.ts) valida e diz se é paga.
//
// [O0-10/O1-33] Estado da conta é UM só (store Zustand `useAccountStore`): um
// /me deduplicado, refresh e logout globais e o último Account válido em cache.
// O token só é apagado num 401 explícito do servidor ("Sessão inválida" /
// "Conta não encontrada"). Rede caída, timeout ou 5xx do Neon mantêm o token e
// o Account em cache (status 'offline'): o pagante não vira grátis por um blip,
// e o polling do Pix continua de onde estava quando a rede volta.
import { trackUltFunnel } from './track';
import { useEffect } from 'react';
import { create } from 'zustand';
import { ct } from './career-i18n';

const TOKEN_KEY = 'rtm-acct-token-v1';
const CACHE_KEY = 'rtm-acct-cache-v1';
const ME_TIMEOUT_MS = 10_000;
export interface Account { email: string; nick: string; paid: boolean; founder: boolean; founderNo: number | null; admin: boolean; }

export function getToken(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t: string) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* sem storage */ } }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sem storage */ } }

// Erro do /api/account com o status HTTP. status 0 = nem chegou no servidor
// (offline, troca de rede, timeout). Quem chama decide o que fazer com cada um.
export class AccountError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
  }
}

async function post(body: Record<string, unknown>, timeoutMs = 0): Promise<Record<string, unknown>> {
  const ctrl = timeoutMs > 0 && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let r: Response;
  try {
    r = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl?.signal });
  } catch {
    throw new AccountError(ct('Erro de conexão. Tente de novo.'), 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new AccountError(typeof data?.error === 'string' ? data.error : ct('Erro de conexão. Tente de novo.'), r.status);
  return data as Record<string, unknown>;
}
const toAcct = (d: Record<string, unknown>): Account => ({ email: String(d.email ?? ''), nick: String(d.nick ?? ''), paid: !!d.paid, founder: !!d.founder, founderNo: d.founderNo != null ? Number(d.founderNo) : null, admin: !!d.admin });

// Só um 401 prova que o token morreu. Qualquer outra falha (0 = rede, 429,
// 5xx, 4xx inesperado) é "não sei agora": mantém o token e o cache.
export function meFailureKind(status: number): 'unauthorized' | 'offline' {
  return status === 401 ? 'unauthorized' : 'offline';
}

// Último Account confirmado pelo servidor. Serve de verdade provisória quando
// o /me não responde (e evita o flash de "grátis" no boot do pagante).
export function readCachedAccount(): Account | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    return d && typeof d === 'object' && typeof d.email === 'string' ? toAcct(d) : null;
  } catch { return null; }
}
function writeCachedAccount(a: Account): void { try { localStorage.setItem(CACHE_KEY, JSON.stringify(a)); } catch { /* cache é best-effort */ } }
function clearCachedAccount(): void { try { localStorage.removeItem(CACHE_KEY); } catch { /* sem storage */ } }

// Resultado do /me já classificado. 'offline' carrega o Account em cache (ou
// null se este aparelho nunca viu um /me bom desta conta).
export type MeOutcome =
  | { kind: 'online'; account: Account }
  | { kind: 'anon' }
  | { kind: 'offline'; account: Account | null };

export async function fetchMeOutcome(): Promise<MeOutcome> {
  const token = getToken(); if (!token) return { kind: 'anon' };
  try {
    const account = toAcct(await post({ action: 'me', token }, ME_TIMEOUT_MS));
    writeCachedAccount(account);
    return { kind: 'online', account };
  } catch (e) {
    const status = e instanceof AccountError ? e.status : 0;
    if (meFailureKind(status) === 'unauthorized') {
      clearToken();
      clearCachedAccount();
      return { kind: 'anon' };
    }
    return { kind: 'offline', account: readCachedAccount() };
  }
}

// ── Store única da conta ─────────────────────────────────────────────────────
// status: 'checking' (tem token, /me em voo), 'online' (confirmado agora),
// 'offline' (tem token mas o servidor não respondeu: vale o cache) e 'anon'
// (sem token). `ready` = já dá pra decidir demo/paywall (tudo menos checking).
export type AccountStatus = 'checking' | 'online' | 'offline' | 'anon';
interface AccountStoreState { account: Account | null; status: AccountStatus; ready: boolean }

function initialAccountState(): AccountStoreState {
  if (!getToken()) return { account: null, status: 'anon', ready: true };
  return { account: readCachedAccount(), status: 'checking', ready: false };
}

export const useAccountStore = create<AccountStoreState>(() => initialAccountState());

function applyOutcome(o: MeOutcome): Account | null {
  if (o.kind === 'online') { useAccountStore.setState({ account: o.account, status: 'online', ready: true }); return o.account; }
  if (o.kind === 'anon') { useAccountStore.setState({ account: null, status: 'anon', ready: true }); return null; }
  useAccountStore.setState({ account: o.account, status: 'offline', ready: true });
  return o.account;
}

// Um /me por vez no app inteiro: chamadas concorrentes (6 telas montando, o
// polling do Pix, o refresh pós-pagamento) dividem a mesma promise.
let meInFlight: Promise<Account | null> | null = null;
export function refreshAccount(): Promise<Account | null> {
  if (!meInFlight) {
    meInFlight = fetchMeOutcome().then(applyOutcome).finally(() => { meInFlight = null; });
  }
  return meInFlight;
}

// Mantém a assinatura antiga (Account | null). Em rede/5xx devolve o Account em
// cache e NÃO apaga o token: o polling do Pix sobrevive à queda de rede.
export function fetchMe(): Promise<Account | null> { return refreshAccount(); }

export function setAccount(a: Account | null): void {
  if (a) { writeCachedAccount(a); useAccountStore.setState({ account: a, status: 'online', ready: true }); }
  else useAccountStore.setState({ account: null, status: getToken() ? 'offline' : 'anon', ready: true });
}

export function logoutAccount(): void {
  clearToken();
  clearCachedAccount();
  useAccountStore.setState({ account: null, status: 'anon', ready: true });
}

let bootLoaded = false;
let reconnectInstalled = false;
function ensureAccountLoaded(): void {
  if (!bootLoaded) { bootLoaded = true; void refreshAccount(); }
  if (reconnectInstalled || typeof window === 'undefined') return;
  reconnectInstalled = true;
  // voltou a rede com a conta em modo offline: confirma de novo com o servidor
  window.addEventListener('online', () => { if (useAccountStore.getState().status === 'offline') void refreshAccount(); });
}

// Conta admin troca o token pela chave do CRM (ADMIN_PASSWORD). Devolve null se
// não for admin (ou offline). O AdminGate usa isso pra destravar sem senha digitada.
export async function fetchAdminKey(): Promise<string | null> {
  const token = getToken(); if (!token) return null;
  // [O0-16] a "chave" agora é uma SESSÃO de admin curta (12h), conferida contra
  // is_admin no banco — a ADMIN_PASSWORD nunca mais vem pro browser. Ela vai em
  // body.password nas rotas admin, como a senha ia.
  try { const d = await post({ action: 'adminSession', token }); return typeof d.session === 'string' ? d.session : null; } catch { return null; }
}

export async function signup(email: string, password: string, nick: string): Promise<Account> {
  const d = await post({ action: 'signup', email, password, nick });
  setToken(String(d.token));
  const a = toAcct(d); setAccount(a); return a;
}
// Reset de senha em 2 passos: pede o código por e-mail e confirma com a nova
// senha. As duas lançam Error com mensagem amigável do servidor.
export async function requestPasswordReset(email: string): Promise<void> {
  await post({ action: 'resetRequest', email });
}
export async function confirmPasswordReset(email: string, code: string, password: string): Promise<void> {
  await post({ action: 'resetConfirm', email, code, password });
}

export async function login(email: string, password: string): Promise<Account> {
  const d = await post({ action: 'login', email, password });
  setToken(String(d.token));
  const a = toAcct(d); setAccount(a); return a;
}
export async function claim(cs: string): Promise<boolean> {
  const token = getToken(); if (!token) return false;
  try { const d = await post({ action: 'claim', token, cs }); return !!d.paid; } catch { return false; }
}
export async function beginCheckout(): Promise<string | null> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de pagar.'));
  const d = await post({ action: 'checkout', token });
  if (d.paid) return null;
  if (typeof d.url !== 'string' || !d.url) throw new Error(ct('Checkout indisponível. Tente de novo.'));
  return d.url;
}

// Gera uma cobrança Pix no Woovi pra esta conta. O webhook libera o acesso
// automaticamente quando o Pix cair (casado por correlationID/e-mail).
export interface PixCharge { qrCodeImage: string | null; brCode: string | null; paymentLinkUrl: string | null; expiresIn: number | null }
export async function beginPix(): Promise<PixCharge | null> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de pagar.'));
  const d = await post({ action: 'pix', token });
  if (d.paid) return null;
  return {
    qrCodeImage: (d.qrCodeImage as string) ?? null,
    brCode: (d.brCode as string) ?? null,
    paymentLinkUrl: (d.paymentLinkUrl as string) ?? null,
    expiresIn: (d.expiresIn as number) ?? null,
  };
}

// Compra de coins do Ultimate via Pix (Woovi). Tiers definidos no servidor
// (api/account.ts COIN_TIERS): p10 → 30k, p15 → 50k, p30 → 120k coins.
export type CoinTierId = 'p10' | 'p15' | 'p30';
export interface CoinCharge extends PixCharge { coins: number; correlationID: string }
export async function beginCoinsPix(tier: CoinTierId): Promise<CoinCharge> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de comprar coins.'));
  const d = await post({ action: 'coinsPix', token, tier });
  return {
    coins: Number(d.coins) || 0,
    correlationID: String(d.correlationID ?? ''),
    qrCodeImage: (d.qrCodeImage as string) ?? null,
    brCode: (d.brCode as string) ?? null,
    paymentLinkUrl: (d.paymentLinkUrl as string) ?? null,
    expiresIn: (d.expiresIn as number) ?? null,
  };
}
// Compra de coins com CARTÃO (Stripe) — pra quem não tem Pix (gringos). Cria uma
// Checkout Session no servidor e devolve a URL; o app redireciona pra lá. Na volta
// (/ultimate?coins=ok) o webhook já marcou o pedido pago e o claim (paidClaim.ts) credita.
export async function beginCoinsCheckout(tier: CoinTierId): Promise<string> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de comprar coins.'));
  let origin = ''; try { origin = window.location.origin; } catch { /* sem window */ }
  const d = await post({ action: 'coinsCheckout', token, tier, origin });
  if (typeof d.url !== 'string' || !d.url) throw new Error(ct('Checkout indisponível. Tente de novo.'));
  return d.url;
}

// [O0-46] Crédito pago que o SERVIDOR já gravou no ledger do Ultimate
// (opId coins:<corr> | pass:<season>). O save absorve cada voucher 1× (srvSeen).
export interface PaidVoucher { opId: string; kind: 'coins' | 'pass'; credits: number; season?: number; orderId: string }

function parseVouchers(raw: unknown): PaidVoucher[] {
  if (!Array.isArray(raw)) return [];
  const out: PaidVoucher[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const opId = typeof o.opId === 'string' ? o.opId : '';
    const kind = o.kind === 'coins' || o.kind === 'pass' ? o.kind : null;
    if (!opId || !kind) continue;
    const season = Number(o.season);
    out.push({
      opId, kind,
      credits: Math.max(0, Math.trunc(Number(o.credits) || 0)),
      ...(Number.isInteger(season) && season > 0 ? { season } : {}),
      orderId: typeof o.orderId === 'string' ? o.orderId : '',
    });
  }
  return out;
}

// Coleta pedidos pagos (idempotente no servidor, que JÁ credita no ledger).
// Devolve os pedidos recém-claimados + TODOS os vouchers de coins da conta —
// quem soma no save é o serviço único (src/state/paidClaim.ts), só com os
// vouchers que o save ainda não viu. null = offline/deslogado (nada perdido:
// o próximo claim devolve os mesmos vouchers).
export interface PaidCoinsClaim { orders: { orderId: string; coins: number }[]; vouchers: PaidVoucher[] }
export async function claimPaidCoins(): Promise<PaidCoinsClaim | null> {
  const token = getToken(); if (!token) return null;
  try {
    const d = await post({ action: 'coinsClaim', token });
    // [U02] purchase_fulfilled só aqui: o servidor acabou de marcar o pedido como
    // 'claimed' (confirmação autoritativa, 1x por pedido). Sem valor pago, sem e-mail.
    const orders = (Array.isArray(d.orders) ? (d.orders as { orderId?: unknown; coins?: unknown }[]) : [])
      .map((o) => ({ orderId: String(o.orderId ?? ''), coins: Number(o.coins) || 0 }))
      .filter((o) => o.orderId);
    for (const o of orders) trackUltFunnel('purchase_fulfilled', { product_kind: 'coins', orderId: o.orderId });
    return { orders, vouchers: parseVouchers(d.vouchers) };
  } catch { return null; }
}

// ── Passe Premium do Ultimate (R$ 30,00 · dinheiro real) ────────────────────
// Mesmo funil dos coins: pedido pending → paid (webhook Pix/Stripe) → claimed.
// `already: true` = já existe pedido PAGO desta temporada (pula direto pro claim).
export interface PassCharge extends PixCharge { correlationID: string; season: number; already?: boolean }
export async function beginPassPix(season: number): Promise<PassCharge> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de comprar o passe.'));
  const d = await post({ action: 'passPix', token, season });
  return {
    correlationID: String(d.correlationID ?? ''),
    season: Number(d.season) || season,
    already: !!d.already,
    qrCodeImage: (d.qrCodeImage as string) ?? null,
    brCode: (d.brCode as string) ?? null,
    paymentLinkUrl: (d.paymentLinkUrl as string) ?? null,
    expiresIn: (d.expiresIn as number) ?? null,
  };
}
// Passe Premium com CARTÃO (Stripe): Checkout Session dinâmica; na volta
// (/ultimate?pass=ok) o webhook já marcou pago e claimPaidPassOrders desbloqueia.
// Devolve null se o pedido já está pago (already) — basta coletar.
export async function beginPassCheckout(season: number): Promise<string | null> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de comprar o passe.'));
  let origin = ''; try { origin = window.location.origin; } catch { /* sem window */ }
  const d = await post({ action: 'passCheckout', token, season, origin });
  if (d.already) return null;
  if (typeof d.url !== 'string' || !d.url) throw new Error(ct('Checkout indisponível. Tente de novo.'));
  return d.url;
}
// Coleta pedidos de passe pagos e ainda não claimados (idempotente no servidor,
// que JÁ grava pass:<season> no ledger). Devolve os pedidos recém-claimados +
// os vouchers da conta; o premium é ligado pelo serviço único (paidClaim.ts).
export interface PaidPassOrder { orderId: string; season: number }
export interface PaidPassClaim { orders: PaidPassOrder[]; vouchers: PaidVoucher[] }
export async function claimPaidPassOrders(): Promise<PaidPassClaim | null> {
  const token = getToken(); if (!token) return null;
  try {
    const d = await post({ action: 'passClaim', token });
    const arr = Array.isArray(d.orders) ? (d.orders as { orderId?: unknown; season?: unknown }[]) : [];
    const orders = arr
      .map((o) => ({ orderId: String(o.orderId ?? ''), season: Number(o.season) || 0 }))
      .filter((o) => o.orderId && o.season > 0);
    for (const o of orders) trackUltFunnel('purchase_fulfilled', { product_kind: 'pass', orderId: o.orderId }); // [U02] confirmação do servidor
    return { orders, vouchers: parseVouchers(d.vouchers) };
  } catch { return null; }
}

// [O0-04] "Recuperar compras" (coinsSummary/coinsRestore) saiu: com o O0-46 a
// compra já mora no ledger do servidor e os vouchers voltam em todo claim.

export async function exportAccountData(): Promise<Record<string, unknown>> {
  const token = getToken();
  if (!token) throw new Error(ct('Entre novamente na conta para exportar seus dados.'));
  return post({ action: 'export', token });
}

export async function deleteAccount(password: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error(ct('Entre novamente na conta para excluí-la.'));
  await post({ action: 'delete', token, password });
  logoutAccount();
}

// Hook fino sobre a store: todas as telas leem o MESMO estado. O primeiro
// mount dispara o /me do boot (uma vez só, deduplicado).
export function useAccount() {
  const account = useAccountStore((s) => s.account);
  const ready = useAccountStore((s) => s.ready);
  const status = useAccountStore((s) => s.status);
  useEffect(() => { ensureAccountLoaded(); }, []);
  return { account, ready, status, setAccount, refresh: refreshAccount, logout: logoutAccount };
}
