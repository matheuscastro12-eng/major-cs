// [U11] rivais por CONTA (servidor): head-to-head agregado no pareamento dos
// reports (ranqueada e duelo privado). Conta vitalícia (token) — convidado não tem.
import { getToken } from './account';
import type { H2H } from '../engine/ultimate/duelInvite';

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/ranking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch { return null; }
}
export async function fetchRivals(): Promise<H2H[]> {
  const token = getToken(); if (!token) return [];
  const d = await post({ action: 'rivals', token });
  const arr = Array.isArray(d?.rivals) ? (d!.rivals as Partial<H2H>[]) : [];
  return arr.map((r) => ({ oppNick: String(r.oppNick ?? 'rival'), wins: Number(r.wins) || 0, losses: Number(r.losses) || 0, games: Number(r.games) || 0, lastAt: Number(r.lastAt) || 0 }));
}
/** Report do DUELO PRIVADO (não vale RP): só alimenta o head-to-head. Idempotente por (code, conta). */
export async function reportDuel(won: boolean, code: string, lobbyNick: string): Promise<void> {
  const token = getToken(); if (!token) return;
  await post({ action: 'duelReport', token, code, won, lobbyNick });
}
