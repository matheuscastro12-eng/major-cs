// Ultimate Squad — store Zustand (P0). Casca fina sobre os reducers puros de
// src/engine/ultimate/state.ts, persistida numa chave PARALELA de localStorage
// (`rtm-ultimate-v1`) — NÃO toca no save de carreira. Cloud sync opcional entra
// numa fase posterior. Ver docs-but-map.md §4/§6.

import { create } from 'zustand';
import { CS2_REAL_2026 } from '../data/bo3';
import { makeRng } from '../engine/rng';
import { buildCatalog, catalogIndex, type UltCard } from '../engine/ultimate/cards';
import { packById, rollPack } from '../engine/ultimate/packs';
import { DEFAULT_FORMATION, formationSlotRoles } from '../engine/ultimate/formations';
import {
  addCredits as _addCredits,
  defaultUltimateState,
  ensureSquad as _ensureSquad,
  grantCard as _grantCard,
  migrateUltimate,
  sellCard as _sellCard,
  setFormation as _setFormation,
  setSlot as _setSlot,
  spendCredits as _spendCredits,
  type AcquiredVia,
  type UltimateState,
} from '../engine/ultimate/state';

const KEY = 'rtm-ultimate-v1';

function load(): UltimateState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultUltimateState();
    return migrateUltimate(JSON.parse(raw));
  } catch {
    return defaultUltimateState();
  }
}

function persist(s: UltimateState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage cheio/indisponível — modo é opcional, não trava o app */
  }
}

// Catálogo derivado do dataset no build (nunca do localStorage) → todo cliente
// reconstrói igual. Lazy: só monta na 1ª vez que a Ultimate Squad é aberta.
let _catalog: UltCard[] | null = null;
let _index: Map<string, UltCard> | null = null;
export function ultimateCatalog(): UltCard[] {
  if (!_catalog) _catalog = buildCatalog(CS2_REAL_2026);
  return _catalog;
}
export function ultimateIndex(): Map<string, UltCard> {
  if (!_index) _index = catalogIndex(ultimateCatalog());
  return _index;
}

interface UltimateStore {
  state: UltimateState;
  grant: (cardKey: string, via: AcquiredVia) => void;
  openPack: (packId: string) => { ok: boolean; cards: UltCard[]; reason?: 'unknown_pack' | 'insufficient' };
  sell: (ownedId: string) => { ok: boolean; credited: number };
  spend: (n: number) => boolean;
  addCredits: (n: number) => void;
  // squad building (P2)
  ensureSquad: () => void;
  placeInSquad: (slot: number, ownedId: string | null) => void;
  setFormation: (formationId: string) => void;
  setState: (s: UltimateState) => void;
  reset: () => void;
}

export const useUltimate = create<UltimateStore>((set, get) => ({
  state: load(),
  grant: (cardKey, via) =>
    set((st) => {
      const s = _grantCard(st.state, cardKey, via);
      persist(s);
      return { state: s };
    }),
  openPack: (packId) => {
    const pack = packById(packId);
    if (!pack) return { ok: false, cards: [], reason: 'unknown_pack' };
    const spent = _spendCredits(get().state, pack.cost);
    if (!spent.ok) return { ok: false, cards: [], reason: 'insufficient' };
    // seed incremental gravado ANTES do reveal → reload não re-rola (anti-reroll)
    const seed = spent.state.profile.packSeedCounter + 1;
    const rng = makeRng(((seed * 2654435761) >>> 0) || 1);
    const cards = rollPack(ultimateCatalog(), pack, rng);
    let s = { ...spent.state, profile: { ...spent.state.profile, packSeedCounter: seed } };
    for (const c of cards) s = _grantCard(s, c.key, 'pack');
    persist(s);
    set({ state: s });
    return { ok: true, cards };
  },
  sell: (ownedId) => {
    const res = _sellCard(get().state, ownedId, ultimateIndex());
    if (res.ok) {
      persist(res.state);
      set({ state: res.state });
    }
    return { ok: res.ok, credited: res.credited };
  },
  spend: (n) => {
    const r = _spendCredits(get().state, n);
    if (r.ok) {
      persist(r.state);
      set({ state: r.state });
    }
    return r.ok;
  },
  addCredits: (n) =>
    set((st) => {
      const s = _addCredits(st.state, n);
      persist(s);
      return { state: s };
    }),
  ensureSquad: () =>
    set((st) => {
      const s = _ensureSquad(st.state, DEFAULT_FORMATION, formationSlotRoles(DEFAULT_FORMATION));
      if (s === st.state) return {};
      persist(s);
      return { state: s };
    }),
  placeInSquad: (slot, ownedId) =>
    set((st) => {
      const s = _setSlot(st.state, slot, ownedId);
      persist(s);
      return { state: s };
    }),
  setFormation: (formationId) =>
    set((st) => {
      const s = _setFormation(st.state, formationId, formationSlotRoles(formationId));
      persist(s);
      return { state: s };
    }),
  setState: (s) => {
    persist(s);
    set({ state: s });
  },
  reset: () => {
    const s = defaultUltimateState();
    persist(s);
    set({ state: s });
  },
}));
