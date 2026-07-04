// Conta do jogador (e-mail + senha) + entitlement da conta vitalícia R$20.
// Token fica no localStorage; o backend (api/account.ts) valida e diz se é paga.
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
// (/ultimate?coins=ok) o webhook já marcou o pedido pago e claimPaidCoins credita.
export async function beginCoinsCheckout(tier: CoinTierId): Promise<string> {
  const token = getToken(); if (!token) throw new Error(ct('Faça login antes de comprar coins.'));
  let origin = ''; try { origin = window.location.origin; } catch { /* sem window */ }
  const d = await post({ action: 'coinsCheckout', token, tier, origin });
  if (typeof d.url !== 'string' || !d.url) throw new Error(ct('Checkout indisponível. Tente de novo.'));
  return d.url;
}

// Coleta pedidos pagos e ainda não creditados (idempotente no servidor).
// Retorna o total de coins a creditar agora (0 se nada novo).
export async function claimPaidCoins(): Promise<number> {
  const token = getToken(); if (!token) return 0;
  try { const d = await post({ action: 'coinsClaim', token }); return Number(d.coins) || 0; } catch { return 0; }
}

// Resumo das compras de coins da conta: purchased = total já comprado (pedidos
// creditados) e restorable = quanto ainda pode ser re-emitido (1× por coin) pra
// quem perdeu o save local. null se deslogado/offline.
export async function fetchCoinsSummary(): Promise<{ purchased: number; restorable: number } | null> {
  const token = getToken(); if (!token) return null;
  try {
    const d = await post({ action: 'coinsSummary', token });
    return { purchased: Number(d.purchased) || 0, restorable: Number(d.restorable) || 0 };
  } catch { return null; }
}

// Re-emite os coins comprados que ainda não foram restaurados (o servidor limita
// a 1× por coin comprado, pra sempre). Retorna quantos coins creditar agora.
export async function restorePurchasedCoins(): Promise<number> {
  const token = getToken(); if (!token) return 0;
  try { const d = await post({ action: 'coinsRestore', token }); return Number(d.coins) || 0; } catch { return 0; }
}

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
