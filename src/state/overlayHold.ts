// [integração SA2] trava de sobreposição: enquanto uma cena de tela cheia está
// aberta (abertura do Major, cerimônia), o tour e as Novidades esperam fechar.
import { useSyncExternalStore } from 'react';

const holds = new Set<string>();
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

export function setOverlayHold(key: string, on: boolean): void {
  const had = holds.has(key);
  if (on === had) return;
  if (on) holds.add(key); else holds.delete(key);
  emit();
}
export const overlayHeld = (): boolean => holds.size > 0;
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useOverlayHeld(): boolean {
  return useSyncExternalStore(subscribe, overlayHeld, () => false);
}
