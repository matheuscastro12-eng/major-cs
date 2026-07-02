// Cliente do CRM de contas pagas (admin). Manda a senha de admin em cada chamada.
import { ct } from './career-i18n';
export interface AdminAccount { email: string; nick: string | null; paid: boolean; isFounder: boolean; founderNo: number | null; created_at: string; hasRef: boolean; }
export interface OrphanPaid { email: string; created_at: string; }
export interface TrendPoint { day: string; signups: number; sales: number; }
export interface AccountsList { accounts: AdminAccount[]; orphanPaid: OrphanPaid[]; total: number; paidTotal: number; foundersTotal?: number; founderLimit?: number; new7?: number; new30?: number; paid30?: number; orphanTotal?: number; withRefTotal?: number; trend?: TrendPoint[]; }
export interface StripeLookup { found: boolean; sessionId?: string; amount?: number | null; currency?: string | null; created?: number | null; paymentStatus?: string | null; error?: string; }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/admin-accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data?.error === 'string' ? data.error : (r.status === 401 ? ct('Login de admin necessário.') : ct('erro')));
  return data as Record<string, unknown>;
}

export async function listAccounts(password: string, query = ''): Promise<AccountsList | null> {
  try { return (await post({ action: 'list', password, query })) as unknown as AccountsList; } catch { return null; }
}
export async function grantAccess(password: string, email: string): Promise<boolean> {
  try { const d = await post({ action: 'grant', password, email }); return !!d.ok; } catch { return false; }
}
export async function revokeAccess(password: string, email: string): Promise<boolean> {
  try { const d = await post({ action: 'revoke', password, email }); return !!d.ok; } catch { return false; }
}
// reseta/define a senha de um usuário (suporte: pagou e esqueceu a senha)
export async function setUserPassword(password: string, email: string, newPassword: string): Promise<{ ok: boolean; applied?: boolean; error?: string }> {
  try { const d = await post({ action: 'setpassword', password, email, newPassword }); return { ok: !!d.ok, applied: !!d.applied, error: d.error as string | undefined }; }
  catch { return { ok: false, error: 'falha de rede' }; }
}
export async function lookupStripe(password: string, email: string): Promise<StripeLookup> {
  try { return (await post({ action: 'stripe', password, email })) as unknown as StripeLookup; }
  catch (e) { return { found: false, error: e instanceof Error ? e.message : ct('erro') }; }
}

// ── CRM financeiro: contas vitalícias por método de pagamento + compras de coins ──
export interface MethodCount { method: string; n: number; }
export interface CoinMethodRow { method: string; orders: number; coins: number; cents: number; }
export interface CoinTierRow { tier: string; orders: number; coins: number; cents: number; }
export interface CoinOrderRow { email: string; tier: string; coins: number; cents: number; method: string; status: string; at: string; }
export interface CoinTrendPoint { day: string; orders: number; cents: number; }
export interface FinanceData {
  lifetime: { paid: number; founders: number; total: number; revenueCents: number; byMethod: MethodCount[]; };
  coins: {
    paidOrders: number; coinsSold: number; revenueCents: number; pendingOrders: number; buyers: number;
    byMethod: CoinMethodRow[]; byTier: CoinTierRow[]; recent: CoinOrderRow[]; trend: CoinTrendPoint[];
  };
}
export async function getFinance(password: string): Promise<FinanceData | null> {
  try { return (await post({ action: 'finance', password })) as unknown as FinanceData; } catch { return null; }
}
