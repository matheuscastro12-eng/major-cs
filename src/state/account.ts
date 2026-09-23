// Conta do jogador (e-mail + senha) + entitlement da conta vitalícia R$20.
// Token fica no localStorage; o backend (api/account.ts) valida e diz se é paga.
import { trackUltFunnel } from './track';
import { useCallback, useEffect, useState } from 'react';
import { ct } from './career-i18n';

const TOKEN_KEY = 'rtm-acct-token-v1';
export interface Account { email: string; nick: string; paid: boolean; founder: boolean; founderNo: number | null; admin: boolean; }

export function getToken(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t: string) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* sem storage */ } }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sem storage */ } }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data?.error === 'string' ? data.error : ct('Erro de conexão. Tente de novo.'));
  return data as Record<string, unknown>;
}
const toAcct = (d: Record<string, unknown>): Account => ({ email: String(d.email ?? ''), nick: String(d.nick ?? ''), paid: !!d.paid, founder: !!d.founder, founderNo: d.founderNo != null ? Number(d.founderNo) : null, admin: !!d.admin });

// Conta admin troca o token pela chave do CRM (ADMIN_PASSWORD). Devolve null se
// não for admin (ou offline). O AdminGate usa isso pra destravar sem senha digitada.
export async function fetchAdminKey(): Promise<string | null> {
  const token = getToken(); if (!token) return null;
  try { const d = await post({ action: 'adminKey', token }); return typeof d.key === 'string' ? d.key : null; } catch { return null; }
}

export async function signup(email: string, password: string, nick: string): Promise<Account> {
  const d = await post({ action: 'signup', email, password, nick });
  setToken(String(d.token)); return toAcct(d);
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
  setToken(String(d.token)); return toAcct(d);
}
export async function fetchMe(): Promise<Account | null> {
  const token = getToken(); if (!token) return null;
  try { return toAcct(await post({ action: 'me', token })); } catch { clearToken(); return null; }
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
  clearToken();
}

export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => { setAccount(await fetchMe()); setReady(true); }, []);
  useEffect(() => {
    let active = true;
    void fetchMe().then((next) => {
      if (!active) return;
      setAccount(next);
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  const logout = useCallback(() => { clearToken(); setAccount(null); }, []);
  return { account, ready, setAccount, refresh, logout };
}
