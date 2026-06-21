// Cliente do CRM de contas pagas (admin). Manda a senha de admin em cada chamada.
export interface AdminAccount { email: string; nick: string | null; paid: boolean; created_at: string; hasRef: boolean; }
export interface OrphanPaid { email: string; created_at: string; }
export interface AccountsList { accounts: AdminAccount[]; orphanPaid: OrphanPaid[]; total: number; paidTotal: number; }
export interface StripeLookup { found: boolean; sessionId?: string; amount?: number | null; currency?: string | null; created?: number | null; paymentStatus?: string | null; error?: string; }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/admin-accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data?.error === 'string' ? data.error : (r.status === 401 ? 'Login de admin necessário.' : 'erro'));
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
export async function lookupStripe(password: string, email: string): Promise<StripeLookup> {
  try { return (await post({ action: 'stripe', password, email })) as unknown as StripeLookup; }
  catch (e) { return { found: false, error: e instanceof Error ? e.message : 'erro' }; }
}
