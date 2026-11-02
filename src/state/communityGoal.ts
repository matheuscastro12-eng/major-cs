// [URG-5] META COMUNITÁRIA DA SEMANA — cliente (api/ranking.ts).
// Leitura pública (GET, cacheada no edge) pra landing/hub deslogado; com conta
// vai por POST com token e traz a minha contribuição e o prêmio pendente da
// semana passada. O claim segue o padrão coinsClaim (state/events.ts): o
// servidor marca `claimed`, o CALLER credita no save (useUltimate.claimCommunityGoal).
import { useEffect, useState } from 'react';
import { getToken } from './account';
import type { CommunityGoalReward, CommunityPackTier } from '../engine/ultimate/communityGoal';

export interface CommunityWeek {
  id: string; target: number; total: number; pct: number; remaining: number; reached: boolean; closed: boolean;
  startsAt: number; endsAt: number; reward: CommunityGoalReward;
}
export interface CommunityMine { myMatches: number; claimed: boolean; claimable: boolean; credits: number; packTier: CommunityPackTier | null }
export interface CommunityGoalView { week: CommunityWeek; mine: CommunityMine | null; lastWeek: (CommunityWeek & CommunityMine) | null }

function parseWeek(w: unknown): CommunityWeek | null {
  if (!w || typeof w !== 'object') return null;
  const o = w as Record<string, unknown>;
  const target = Number(o.target); const total = Number(o.total);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(total)) return null;
  const rw = (o.reward ?? {}) as Record<string, unknown>;
  return {
    id: String(o.id ?? ''), target, total: Math.max(0, total), pct: Number(o.pct) || 0, remaining: Number(o.remaining) || 0,
    reached: !!o.reached, closed: !!o.closed, startsAt: Number(o.startsAt) || 0, endsAt: Number(o.endsAt) || 0,
    reward: { credits: Number(rw.credits) || 5000, minMatches: Number(rw.minMatches) || 3, packTier: 'gold', packMinMatches: Number(rw.packMinMatches) || 10 },
  };
}
function parseMine(m: unknown): CommunityMine | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  return { myMatches: Number(o.myMatches) || 0, claimed: !!o.claimed, claimable: !!o.claimable, credits: Number(o.credits) || 0, packTier: o.packTier === 'gold' ? 'gold' : null };
}

export async function fetchCommunityGoal(): Promise<CommunityGoalView | null> {
  try {
    const token = getToken();
    const r = token
      ? await fetch('/api/ranking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'communityGoal', token }), signal: AbortSignal.timeout(9000) })
      : await fetch('/api/ranking?action=communityGoal', { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const d = (await r.json()) as Record<string, unknown>;
    const week = parseWeek(d.week); if (!week) return null;
    const lw = parseWeek(d.lastWeek); const lm = parseMine(d.lastWeek);
    return { week, mine: parseMine(d.mine), lastWeek: lw && lm ? { ...lw, ...lm } : null };
  } catch { return null; }
}

export async function claimCommunityGoal(weekId: string): Promise<{ ok: boolean; credits: number; packTier: CommunityPackTier | null; replayed: boolean; error?: string }> {
  const token = getToken(); if (!token) return { ok: false, credits: 0, packTier: null, replayed: false, error: 'token' };
  try {
    const r = await fetch('/api/ranking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'communityGoalClaim', token, weekId }) });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, credits: 0, packTier: null, replayed: false, error: String(d.error ?? r.status) };
    return { ok: !!d.ok, credits: Number(d.credits) || 0, packTier: d.packTier === 'gold' ? 'gold' : null, replayed: !!d.replayed };
  } catch { return { ok: false, credits: 0, packTier: null, replayed: false, error: 'rede' }; }
}

// ── prova social na landing (SWR barato, nunca bloqueia o render) ───────────
const KEY = 'rtm-community-goal-v1';
const TTL_MS = 2 * 60_000;
let memory: { at: number; week: CommunityWeek } | null = null;
let inflight: Promise<CommunityWeek | null> | null = null;

function readCache(): { at: number; week: CommunityWeek } | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const p = JSON.parse(raw) as { at?: number; week?: unknown };
    const week = parseWeek(p.week);
    if (typeof p.at !== 'number' || !week) return null;
    memory = { at: p.at, week };
    return memory;
  } catch { return null; }
}

async function fetchPublicWeek(): Promise<CommunityWeek | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/ranking?action=communityGoal', { signal: AbortSignal.timeout(9000) });
      if (!r.ok) return null;
      const d = (await r.json()) as Record<string, unknown>;
      const week = parseWeek(d.week); if (!week) return null;
      memory = { at: Date.now(), week };
      try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* storage bloqueado */ }
      return week;
    } catch { return null; } finally { inflight = null; }
  })();
  return inflight;
}

/** Hook SWR pra landing: cache imediato (se houver) e revalida se velho. `null` = não renderiza nada. */
export function useCommunityGoalPublic(): CommunityWeek | null {
  const cached = readCache();
  const [week, setWeek] = useState<CommunityWeek | null>(cached ? cached.week : null);
  useEffect(() => {
    const c = readCache();
    if (c && Date.now() - c.at < TTL_MS) { setWeek(c.week); return; }
    let alive = true;
    void fetchPublicWeek().then((w) => { if (alive && w) setWeek(w); });
    return () => { alive = false; };
  }, []);
  return week;
}
