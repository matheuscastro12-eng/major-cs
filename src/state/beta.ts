// Cliente do controle de acesso ao beta do modo carreira.
export type BetaStatus = 'none' | 'pending' | 'approved' | 'rejected';
export interface BetaRequest { nick: string; status: BetaStatus; created_at: string; updated_at: string }

const NICK_KEY = 'rtm-career-nick';
const OK_KEY = 'rtm-beta-v1'; // liberação por código (atalho)

export function savedCareerNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}
export function saveCareerNick(n: string): void {
  try { localStorage.setItem(NICK_KEY, n); } catch { /* sem storage */ }
}
export function hasCodeAccess(): boolean {
  try { return localStorage.getItem(OK_KEY) === '1'; } catch { return false; }
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  return (await r.json()) as Record<string, unknown>;
}

export async function requestAccess(nick: string): Promise<BetaStatus> {
  const j = await post({ action: 'request', nick });
  return (j.status as BetaStatus) ?? 'pending';
}
export async function checkAccess(nick: string): Promise<BetaStatus> {
  if (!nick.trim()) return 'none';
  try {
    const j = await post({ action: 'check', nick });
    return (j.status as BetaStatus) ?? 'none';
  } catch {
    return 'none';
  }
}
export async function listRequests(password: string): Promise<BetaRequest[] | null> {
  const j = await post({ action: 'list', password });
  if (Array.isArray(j.requests)) return j.requests as BetaRequest[];
  return null;
}
export async function decideAccess(password: string, nick: string, decision: 'approve' | 'reject'): Promise<boolean> {
  const j = await post({ action: 'decide', password, nick, decision });
  return j.ok === true;
}
