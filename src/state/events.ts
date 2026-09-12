// [U12] eventos: status/resgate por conta (servidor) — conta vitalícia (token).
import { getToken } from './account';
async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/ranking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch { return null; }
}
export interface EventStatus { wins: number; losses: number; claimed: boolean; reward: number; maxMatches: number; closed: boolean }
export async function fetchEventStatus(eventId: string): Promise<EventStatus | null> {
  const token = getToken(); if (!token) return null;
  const d = await post({ action: 'eventStatus', token, eventId });
  if (!d) return null;
  return { wins: Number(d.wins) || 0, losses: Number(d.losses) || 0, claimed: !!d.claimed, reward: Number(d.reward) || 0, maxMatches: Number(d.maxMatches) || 20, closed: !!d.closed };
}
export async function claimEvent(eventId: string): Promise<{ ok: boolean; credits: number }> {
  const token = getToken(); if (!token) return { ok: false, credits: 0 };
  const d = await post({ action: 'eventClaim', token, eventId });
  return { ok: !!d?.ok, credits: Number(d?.credits) || 0 };
}
