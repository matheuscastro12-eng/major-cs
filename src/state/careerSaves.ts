// Gerência de saves da carreira. Conta vitalícia (apoiador) pode ter até 5 saves
// e apagar qualquer um quando quiser. O grátis usa só o slot 1 (save local único).
import { getToken } from './account';
import { pushCloud, pullCloud, cloudEnabled } from './cloud';

export const CAREER_SLOTS = 5;
const BASE = 'rtm-career-v1';      // slot 1 = chave legada (preserva o save de quem já jogava)
const ACTIVE = 'rtm-career-active';

// chave de localStorage do save de um slot (1 = legada; 2..5 = sufixadas)
export function slotKey(n: number): string { return n <= 1 ? BASE : `${BASE}__s${n}`; }
// slot da nuvem correspondente (1 = 'career' legado; 2..5 = 'career-N')
export function cloudSlot(n: number): string { return n <= 1 ? 'career' : `career-${n}`; }

export function getActiveSlot(): number {
  try { return Math.min(CAREER_SLOTS, Math.max(1, Number(localStorage.getItem(ACTIVE)) || 1)); } catch { return 1; }
}
export function setActiveSlot(n: number): void {
  try { localStorage.setItem(ACTIVE, String(Math.min(CAREER_SLOTS, Math.max(1, n)))); } catch { /* sem storage */ }
}

export interface SlotSummary {
  slot: number;
  exists: boolean;
  fromCloud?: boolean; // existe só na nuvem (ainda não baixado neste aparelho)
  org?: string;
  tag?: string;
  colors?: [string, string];
  logo?: string;
  split?: number;
  titles?: number;
  tier?: number;
  budget?: number;
}

// extrai um resumo do JSON cru de um save de carreira
function summaryFromRaw(n: number, raw: string): SlotSummary {
  try {
    const s = JSON.parse(raw) as {
      org?: { name?: string; tag?: string; colors?: [string, string]; logo?: string } | null;
      split?: number; titles?: number; tier?: number; budget?: number;
    };
    return {
      slot: n, exists: true,
      org: s.org?.name, tag: s.org?.tag, colors: s.org?.colors, logo: s.org?.logo,
      split: s.split, titles: s.titles, tier: s.tier, budget: s.budget,
    };
  } catch {
    return { slot: n, exists: true }; // existe mas ilegível
  }
}

export function readSlot(n: number): SlotSummary {
  let raw: string | null;
  try { raw = localStorage.getItem(slotKey(n)); } catch { return { slot: n, exists: false }; }
  if (!raw) return { slot: n, exists: false };
  return summaryFromRaw(n, raw);
}

export function listSlots(): SlotSummary[] {
  return Array.from({ length: CAREER_SLOTS }, (_, i) => readSlot(i + 1));
}

// resumo do save na nuvem de um slot (null se vazio/tombstone ou sem conta)
async function readCloudSlot(n: number): Promise<SlotSummary | null> {
  if (!cloudEnabled()) return null;
  const c = await pullCloud(cloudSlot(n));
  if (!c?.data) return null; // '' = tombstone (apagado) → conta como vazio
  return { ...summaryFromRaw(n, c.data), fromCloud: true };
}

// lista os slots mesclando local + nuvem: um save que só existe na nuvem
// (ex.: outro aparelho) aparece aqui pra não ser sobrescrito por engano.
export async function listSlotsCloudMerged(): Promise<SlotSummary[]> {
  const local = listSlots();
  if (!cloudEnabled()) return local;
  return Promise.all(local.map(async (l) => {
    if (l.exists) return l; // local sempre ganha na exibição (reconcilia ao continuar)
    const c = await readCloudSlot(l.slot).catch(() => null);
    return c ?? l;
  }));
}

// apaga um save (local + tombstone na nuvem pra não restaurar no próximo login)
export function deleteSlot(n: number): void {
  const key = slotKey(n);
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(key + '.bak');
    localStorage.removeItem(key + '.corrupt');
    localStorage.removeItem(key + '.cloudts');
  } catch { /* sem storage */ }
  if (getToken()) void pushCloud(cloudSlot(n), '', Date.now());
}
