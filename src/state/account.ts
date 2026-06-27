// Conta do jogador (e-mail + senha) + entitlement da conta vitalícia R$20.
// Token fica no localStorage; o backend (api/account.ts) valida e diz se é paga.
import { useCallback, useEffect, useState } from 'react';
import { ct } from './career-i18n';

const TOKEN_KEY = 'rtm-acct-token-v1';
export interface Account { email: string; nick: string; paid: boolean; founder: boolean; founderNo: number | null; }

export function getToken(): string | null { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t: string) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* sem storage */ } }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* sem storage */ } }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data?.error === 'string' ? data.error : ct('Erro de conexão. Tente de novo.'));
  return data as Record<string, unknown>;
}
const toAcct = (d: Record<string, unknown>): Account => ({ email: String(d.email ?? ''), nick: String(d.nick ?? ''), paid: !!d.paid, founder: !!d.founder, founderNo: d.founderNo != null ? Number(d.founderNo) : null });

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
