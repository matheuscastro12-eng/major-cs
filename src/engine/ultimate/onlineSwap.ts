// [UT-REW] "Trocar pelas melhores online": quando a ranqueada recusa cartas
// (só do aparelho), troca cada uma pela melhor cópia que o SERVIDOR conhece e
// que ainda não está no squad — mesma função do slot primeiro, depois OVR.
import type { UltCard } from './cards.js';

export interface SwapSlot { slot: number; ownedId: string | null; role: string }
export interface SwapOwned { id: string; cardKey: string; boost?: number }

export function bestOnlineSwap(
  slots: SwapSlot[],
  inventory: SwapOwned[],
  serverIds: Set<string>,
  rejected: string[],
  lookup: (key: string) => UltCard | undefined,
): { slot: number; ownedId: string }[] {
  const bad = new Set(rejected);
  const used = new Set(slots.map((s) => s.ownedId).filter((x): x is string => !!x && !bad.has(x)));
  const usedPlayers = new Set([...used].map((id) => inventory.find((o) => o.id === id)).map((o) => (o ? lookup(o.cardKey)?.playerId : undefined)).filter(Boolean));
  const pool = inventory
    .filter((o) => serverIds.has(o.id) && !used.has(o.id) && !bad.has(o.id))
    .map((o) => ({ o, c: lookup(o.cardKey) }))
    .filter((x): x is { o: SwapOwned; c: UltCard } => !!x.c)
    .sort((a, b) => (b.c.ovr + (b.o.boost ?? 0)) - (a.c.ovr + (a.o.boost ?? 0)));
  const out: { slot: number; ownedId: string }[] = [];
  for (const s of slots) {
    if (!s.ownedId || !bad.has(s.ownedId)) continue;
    const free = (x: { c: UltCard }) => !usedPlayers.has(x.c.playerId);
    let i = pool.findIndex((x) => free(x) && x.c.role === s.role);
    if (i < 0) i = pool.findIndex(free);
    if (i < 0) continue;
    const [pick] = pool.splice(i, 1);
    usedPlayers.add(pick.c.playerId);
    out.push({ slot: s.slot, ownedId: pick.o.id });
  }
  return out;
}
