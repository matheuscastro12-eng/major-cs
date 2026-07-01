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
import { pickStarterCards } from '../engine/ultimate/cards';
import { dateKey } from '../engine/ultimate/daily';
import { evaluateTitles } from '../engine/ultimate/titles';
import { checkSbc, sbcById, type SbcReward } from '../engine/ultimate/sbc';
import { objectiveById } from '../engine/ultimate/objectives';
import { seasonTierById } from '../engine/ultimate/seasonRewards';
import {
  addCredits as _addCredits,
  markObjectiveClaimed as _markObjectiveClaimed,
  claimSeasonReward as _claimSeasonReward,
  evolveCard as _evolveCard,
  STARTING_ELO,
  applyMatchResult as _applyMatchResult,
  applySeasonRollover as _applySeasonRollover,
  claimDaily as _claimDaily,
  defaultUltimateState,
  ensureSquad as _ensureSquad,
  equipTitle as _equipTitle,
  grantCard as _grantCard,
  mergeTitles as _mergeTitles,
  migrateUltimate,
  removeOwnedCards as _removeOwnedCards,
  sellCard as _sellCard,
  setFormation as _setFormation,
  setSlot as _setSlot,
  spendCredits as _spendCredits,
  type AcquiredVia,
  type DailyClaim,
  type MatchOutcome,
  type SeasonRollover,
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
  // ranqueada vs IA (P3)
  recordMatch: (won: boolean, oppElo: number, ranked?: boolean) => MatchOutcome;
  // daily + títulos + onboarding (P4)
  claimDaily: () => DailyClaim;
  syncTitles: () => string[]; // slugs recém-conquistados
  equipTitle: (slug: string | null) => void;
  claimStarter: (formationId: string) => UltCard[];
  // SBC + season (P5)
  submitSbc: (sbcId: string, ownedIds: string[]) => { ok: boolean; reason?: string; reward?: SbcReward; grantedCard?: UltCard };
  tickSeason: () => SeasonRollover;
  // bazar (P6)
  buyCard: (cardKey: string, price: number) => boolean;
  // objetivos/missões (profundidade)
  claimObjective: (id: string) => { ok: boolean; reward?: { credits?: number; card?: string }; grantedCard?: UltCard };
  // evolução de cartas
  evolveCard: (ownedId: string) => { ok: boolean; cost?: number; newBoost?: number; reason?: string };
  // recompensas de temporada (ladder de RP)
  claimSeasonReward: (id: string) => { ok: boolean; reward?: { credits?: number; card?: string }; grantedCard?: UltCard };
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
  recordMatch: (won, oppElo, ranked = true) => {
    if (!ranked) {
      // amistoso (sem risco): não mexe em elo/w-l/streak/season; só paga credits.
      const credits = won ? 500 : 150;
      const s = _addCredits(get().state, credits);
      persist(s);
      set({ state: s });
      return { eloDelta: 0, credits };
    }
    const r = _applyMatchResult(get().state, won, oppElo);
    persist(r.state);
    set({ state: r.state });
    return r.outcome;
  },
  claimDaily: () => {
    const r = _claimDaily(get().state, dateKey(new Date()));
    if (r.result.claimed) { persist(r.state); set({ state: r.state }); }
    return r.result;
  },
  syncTitles: () => {
    const st = get().state;
    const idx = ultimateIndex();
    const uniq = new Set(st.inventory.map((o) => o.cardKey));
    let icons = 0;
    for (const key of uniq) if (idx.get(key)?.rarity === 'icon') icons++;
    const earned = evaluateTitles({
      wins: st.profile.w,
      peakElo: st.profile.peakElo,
      streak: st.profile.streak,
      uniqueCards: uniq.size,
      iconsOwned: icons,
      onboarded: st.profile.onboarded,
    });
    const r = _mergeTitles(st, earned);
    if (r.newly.length) { persist(r.state); set({ state: r.state }); }
    return r.newly;
  },
  equipTitle: (slug) =>
    set((st) => {
      const s = _equipTitle(st.state, slug);
      persist(s);
      return { state: s };
    }),
  claimStarter: (formationId) => {
    const roles = formationSlotRoles(formationId);
    const cards = pickStarterCards(ultimateCatalog(), roles, 76);
    let s = _ensureSquad(get().state, formationId, roles);
    cards.forEach((c, i) => {
      const id = `starter_${i}_${Math.random().toString(36).slice(2, 9)}`;
      s = _grantCard(s, c.key, 'starter', { id });
      s = _setSlot(s, i, id);
    });
    s = { ...s, profile: { ...s.profile, onboarded: true } };
    s = _mergeTitles(s, ['rookie']).state;
    persist(s);
    set({ state: s });
    return cards;
  },
  submitSbc: (sbcId, ownedIds) => {
    const def = sbcById(sbcId);
    if (!def) return { ok: false, reason: 'unknown_sbc' };
    if (new Set(ownedIds).size !== ownedIds.length) return { ok: false, reason: 'duplicate_ids' };
    const st = get().state;
    const idx = ultimateIndex();
    const owned = ownedIds.map((id) => st.inventory.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
    if (owned.length !== ownedIds.length) return { ok: false, reason: 'missing' };
    if (owned.some((o) => o.locked === 'squad')) return { ok: false, reason: 'locked' };
    const cards = owned.map((o) => idx.get(o.cardKey)).filter((c): c is UltCard => !!c);
    if (!checkSbc(cards, def.req).ok) return { ok: false, reason: 'requirements' };
    // consome as cartas + paga a recompensa
    let s = _removeOwnedCards(st, ownedIds);
    if (def.reward.credits) s = _addCredits(s, def.reward.credits);
    let grantedCard: UltCard | undefined;
    if (def.reward.card) {
      const pool = ultimateCatalog().filter((c) => c.rarity === def.reward.card);
      if (pool.length) {
        grantedCard = pool[Math.floor(Math.random() * pool.length)];
        const id = `sbc_${Math.random().toString(36).slice(2, 9)}`;
        s = _grantCard(s, grantedCard.key, 'sbc', { id });
      }
    }
    s = { ...s, profile: { ...s.profile, sbcDone: [...s.profile.sbcDone, def.id] } };
    persist(s);
    set({ state: s });
    return { ok: true, reward: def.reward, grantedCard };
  },
  tickSeason: () => {
    const r = _applySeasonRollover(get().state, Date.now());
    // só grava se o estado mudou (evita write no localStorage a cada mount).
    if (r.state !== get().state) { persist(r.state); set({ state: r.state }); }
    return r.result;
  },
  buyCard: (cardKey, price) => {
    const sp = _spendCredits(get().state, price);
    if (!sp.ok) return false;
    const s = _grantCard(sp.state, cardKey, 'market');
    persist(s);
    set({ state: s });
    return true;
  },
  claimObjective: (id) => {
    const def = objectiveById(id);
    if (!def) return { ok: false };
    const st = get().state;
    if (st.profile.objectivesClaimed.includes(id)) return { ok: false };
    let s = _markObjectiveClaimed(st, id);
    if (def.reward.credits) s = _addCredits(s, def.reward.credits);
    let grantedCard: UltCard | undefined;
    if (def.reward.card) {
      const pool = ultimateCatalog().filter((c) => c.rarity === def.reward.card);
      if (pool.length) {
        grantedCard = pool[Math.floor(Math.random() * pool.length)];
        const gid = `obj_${Math.random().toString(36).slice(2, 9)}`;
        s = _grantCard(s, grantedCard.key, 'reward', { id: gid });
      }
    }
    persist(s);
    set({ state: s });
    return { ok: true, reward: def.reward, grantedCard };
  },
  evolveCard: (ownedId) => {
    const r = _evolveCard(get().state, ownedId);
    if (r.ok) { persist(r.state); set({ state: r.state }); }
    return { ok: r.ok, cost: r.cost, newBoost: r.newBoost, reason: r.reason };
  },
  claimSeasonReward: (id) => {
    const def = seasonTierById(id);
    if (!def) return { ok: false };
    const st = get().state;
    const s = st.profile.season;
    if (!s || (s.peak ?? STARTING_ELO) < def.rp || (s.claimed ?? []).includes(id)) return { ok: false };
    let ns = _claimSeasonReward(st, id);
    if (def.reward.credits) ns = _addCredits(ns, def.reward.credits);
    let grantedCard: UltCard | undefined;
    if (def.reward.card) {
      const pool = ultimateCatalog().filter((c) => c.rarity === def.reward.card);
      if (pool.length) {
        grantedCard = pool[Math.floor(Math.random() * pool.length)];
        const gid = `season_${Math.random().toString(36).slice(2, 9)}`;
        ns = _grantCard(ns, grantedCard.key, 'reward', { id: gid });
      }
    }
    persist(ns);
    set({ state: ns });
    return { ok: true, reward: def.reward, grantedCard };
  },
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
