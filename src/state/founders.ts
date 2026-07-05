// Contagem PÚBLICA de Fundadores (prova social real do checkout da vitalícia).
// SWR barato: cache em memória + localStorage (TTL 5 min), fetch deduplicado e
// que NUNCA bloqueia nem quebra a UI — se falhar, os componentes rendem nada
// (número falso jamais aparece na tela).
import { useEffect, useState } from 'react';

export interface FounderStats { founders: number; limit: number }

const KEY = 'rtm-founders-v1';
const TTL_MS = 5 * 60_000;

let memory: { at: number; stats: FounderStats } | null = null;
let inflight: Promise<FounderStats | null> | null = null;

function readCache(): { at: number; stats: FounderStats } | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { at?: number; founders?: number; limit?: number };
    if (typeof p.at !== 'number' || typeof p.founders !== 'number' || typeof p.limit !== 'number') return null;
    memory = { at: p.at, stats: { founders: p.founders, limit: p.limit } };
    return memory;
  } catch { return null; }
}

function writeCache(stats: FounderStats): void {
  memory = { at: Date.now(), stats };
  try { localStorage.setItem(KEY, JSON.stringify({ at: memory.at, ...stats })); } catch { /* storage bloqueado */ }
}

async function fetchFounders(): Promise<FounderStats | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/account', { method: 'GET' });
      if (!r.ok) return null;
      const d = (await r.json()) as { founders?: unknown; limit?: unknown };
      const founders = Number(d.founders);
      const limit = Number(d.limit);
      if (!Number.isFinite(founders) || !Number.isFinite(limit) || founders < 0 || limit <= 0) return null;
      const stats = { founders: Math.floor(founders), limit: Math.floor(limit) };
      writeCache(stats);
      return stats;
    } catch { return null; } finally { inflight = null; }
  })();
  return inflight;
}

/** Hook SWR: devolve o cache imediatamente (se houver) e revalida se estiver
 *  velho. `null` = sem dado confiável → o chamador NÃO renderiza nada. */
export function useFounders(): FounderStats | null {
  const cached = readCache();
  const [stats, setStats] = useState<FounderStats | null>(cached ? cached.stats : null);
  useEffect(() => {
    const c = readCache();
    if (c && Date.now() - c.at < TTL_MS) { setStats(c.stats); return; }
    let alive = true;
    void fetchFounders().then((s) => { if (alive && s) setStats(s); });
    return () => { alive = false; };
  }, []);
  return stats;
}
