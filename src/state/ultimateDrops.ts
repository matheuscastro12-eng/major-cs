// [CSM-1] Drop de escolha — cliente (só REDE). Estoque, seed, opções e entrega
// são do servidor (server/ultimate-drops.ts). A carta entregue entra no save
// local com o MESMO uuid do servidor (useUltimate.serverCardGrant), sem passar
// pelo espelho-sombra: o 'grant' já nasceu no ledger.
// Nunca lança: sem conta → 'needAccount'; rede/5xx → 'offline'.
import { getToken } from './account';
import type { UltCard } from '../engine/ultimate/cards';

export interface DropOfferView { cardKey: string; card: UltCard | null; value: number }
export interface DropPendingView { dropId: string; expiresAt: number; offers: DropOfferView[]; autoIndex: number; rule: string }
export interface DropStatusView {
  available: number;
  max: number;
  nextAt: number | null;
  intervalMs: number;
  pityIn: number;
  pending: DropPendingView | null;
  serverNow: number;
  settled?: DropGrantView | null;
  opened?: boolean;
}
export interface DropGrantView { dropId: string; index: number; auto: boolean; cardId: string; cardKey: string; card: UltCard | null; replayed: boolean }

export type DropFail = { ok: false; error: 'needAccount' | 'offline' | 'frozen' | 'noStock' | 'other'; message?: string };

async function post(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const token = getToken();
  if (!token) return { status: 401, data: null };
  try {
    const r = await fetch('/api/ultimate-economy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, token }),
    });
    return { status: r.status, data: (await r.json().catch(() => null)) as Record<string, unknown> | null };
  } catch { return { status: 0, data: null }; }
}

function fail(status: number, data: Record<string, unknown> | null): DropFail {
  if (status === 401 || status === 403) return { ok: false, error: 'needAccount' };
  if (status === 423) return { ok: false, error: 'frozen', message: typeof data?.message === 'string' ? data.message : undefined };
  if (status === 409 && data?.error === 'sem drop disponível') return { ok: false, error: 'noStock' };
  if (status === 0 || status === 429 || status >= 500) return { ok: false, error: 'offline' };
  return { ok: false, error: 'other', message: typeof data?.error === 'string' ? data.error : undefined };
}

export async function fetchDropStatus(): Promise<{ ok: true; view: DropStatusView } | DropFail> {
  const r = await post({ action: 'dropStatus' });
  if (r.status !== 200 || !r.data) return fail(r.status, r.data);
  return { ok: true, view: r.data as unknown as DropStatusView };
}

export async function openDrop(): Promise<{ ok: true; view: DropStatusView } | DropFail> {
  const r = await post({ action: 'dropOpen' });
  if (r.status !== 200 || !r.data) return fail(r.status, r.data);
  return { ok: true, view: r.data as unknown as DropStatusView };
}

export async function pickDrop(dropId: string, index: number): Promise<{ ok: true; grant: DropGrantView } | DropFail> {
  const r = await post({ action: 'dropPick', dropId, index });
  if (r.status !== 200 || !r.data) return fail(r.status, r.data);
  return { ok: true, grant: r.data as unknown as DropGrantView };
}
