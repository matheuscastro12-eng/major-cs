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
import { missionsForDay, missionProgress } from '../engine/ultimate/missions';
import {
  addCredits as _addCredits,
  markObjectiveClaimed as _markObjectiveClaimed,
  claimSeasonReward as _claimSeasonReward,
  evolveCard as _evolveCard,
  gauntletStart as _gauntletStart,
  gauntletRecord as _gauntletRecord,
  GAUNTLET_WIN_CREDITS,
  STARTING_ELO,
  pushHistory as _pushHistory,
  markBazaarBought as _markBazaarBought,
  ensureMissions as _ensureMissions,
  markMissionClaimed as _markMissionClaimed,
  type MatchRecord,
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
// Specials TOTS: os 11 maiores OVR do catálogo base ganham uma versão "Time da
// Temporada" (+2 OVR) — determinístico, alimenta o Pacote TOTS.
let _catalog: UltCard[] | null = null;
let _index: Map<string, UltCard> | null = null;
export function ultimateCatalog(): UltCard[] {
  if (!_catalog) {
    const base = buildCatalog(CS2_REAL_2026);
    const tots = [...base]
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 11)
      .map((c) => ({ playerId: c.playerId, rarity: 'tots' as const, ovrBoost: 2 }));
    _catalog = buildCatalog(CS2_REAL_2026, tots);
  }
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
  sellMany: (ownedIds: string[]) => { sold: number; credited: number };
  spend: (n: number) => boolean;
  addCredits: (n: number) => void;
  // squad building (P2)
  ensureSquad: () => void;
  placeInSquad: (slot: number, ownedId: string | null) => void;
  setFormation: (formationId: string) => void;
  // ranqueada vs IA (P3)
  recordMatch: (won: boolean, oppElo: number, ranked?: boolean, score?: string) => MatchOutcome;
  // daily + títulos + onboarding (P4)
  claimDaily: () => DailyClaim;
  syncTitles: () => string[]; // slugs recém-conquistados
  equipTitle: (slug: string | null) => void;
  claimStarter: (formationId: string) => UltCard[];
  // SBC + season (P5)
  submitSbc: (sbcId: string, ownedIds: string[]) => { ok: boolean; reason?: string; reward?: SbcReward; grantedCard?: UltCard };
  tickSeason: () => SeasonRollover;
  // bazar (P6) — listingId/day marcam a listagem como comprada no save (anti-restock)
  buyCard: (cardKey: string, price: number, listingId?: string, day?: number) => boolean;
  // objetivos/missões (profundidade)
  claimObjective: (id: string) => { ok: boolean; reward?: { credits?: number; card?: string }; grantedCard?: UltCard };
  // evolução de cartas
  evolveCard: (ownedId: string) => { ok: boolean; cost?: number; newBoost?: number; reason?: string };
  // recompensas de temporada (ladder de RP)
  claimSeasonReward: (id: string) => { ok: boolean; reward?: { credits?: number; card?: string }; grantedCard?: UltCard };
  // Elite Gauntlet (desafio diário)
  gauntletStart: (today: string) => void;
  gauntletRecord: (won: boolean, score?: string) => { wins: number; completed: boolean; over: boolean; credits: number; grantedCard?: UltCard };
  // missões diárias rotativas
  syncMissions: (today: string) => void;
  claimMission: (id: string) => { ok: boolean; credits?: number };
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
  sellMany: (ownedIds) => {
    // vende em lote com UM persist/set no final — N vendas individuais faziam
    // N serializações completas do save no mesmo click (jank em coleção grande).
    const idx = ultimateIndex();
    let s = get().state;
    let sold = 0;
    let credited = 0;
    for (const id of ownedIds) {
      const r = _sellCard(s, id, idx);
      if (r.ok) { s = r.state; sold++; credited += r.credited; }
    }
    if (sold > 0) { persist(s); set({ state: s }); }
    return { sold, credited };
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
  recordMatch: (won, oppElo, ranked = true, score = '') => {
    const rec = (mode: MatchRecord['mode'], eloDelta: number, credits: number): MatchRecord =>
      ({ t: Date.now(), mode, won, score, eloDelta, credits });
    if (!ranked) {
      // amistoso (sem risco): não mexe em elo/w-l/streak/season; só paga credits.
      const credits = won ? 500 : 150;
      let s = _addCredits(get().state, credits);
      s = _pushHistory(s, rec('casual', 0, credits));
      persist(s);
      set({ state: s });
      return { eloDelta: 0, credits };
    }
    const r = _applyMatchResult(get().state, won, oppElo);
    const s = _pushHistory(r.state, rec('rivals', r.outcome.eloDelta, r.outcome.credits));
    persist(s);
    set({ state: s });
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
  buyCard: (cardKey, price, listingId, day) => {
    const sp = _spendCredits(get().state, price);
    if (!sp.ok) return false;
    let s = _grantCard(sp.state, cardKey, 'market');
    // grava a compra no save — o bazar é determinístico por dia, então sem isso
    // a listagem comprada "restocava" a cada remount/F5 (faucet de credits).
    if (listingId && day != null) s = _markBazaarBought(s, day, listingId);
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
  gauntletStart: (today) =>
    set((st) => {
      const s = _gauntletStart(st.state, today);
      if (s === st.state) return {};
      persist(s);
      return { state: s };
    }),
  gauntletRecord: (won, score = '') => {
    const r = _gauntletRecord(get().state, won);
    // run inativo (advanced=false) → reducer no-opou; NÃO paga nada.
    if (!r.advanced) return { wins: r.wins, completed: r.completed, over: r.over, credits: 0 };
    let s = r.state;
    const credits = won && r.wins >= 1 ? (GAUNTLET_WIN_CREDITS[r.wins - 1] ?? 0) : 0;
    if (credits) s = _addCredits(s, credits);
    let grantedCard: UltCard | undefined;
    if (r.completed) {
      const pool = ultimateCatalog().filter((c) => c.rarity === 'elite');
      if (pool.length) {
        grantedCard = pool[Math.floor(Math.random() * pool.length)];
        s = _grantCard(s, grantedCard.key, 'reward', { id: `gaunt_${Math.random().toString(36).slice(2, 9)}` });
      }
    }
    s = _pushHistory(s, { t: Date.now(), mode: 'gauntlet', won, score, eloDelta: 0, credits });
    persist(s);
    set({ state: s });
    return { wins: r.wins, completed: r.completed, over: r.over, credits, grantedCard };
  },
  syncMissions: (today) =>
    set((st) => {
      const s = _ensureMissions(st.state, today);
      if (s === st.state) return {};
      persist(s);
      return { state: s };
    }),
  claimMission: (id) => {
    const st = get().state;
    const m = st.profile.missions;
    if (!m || m.claimed.includes(id)) return { ok: false };
    const def = missionsForDay(m.day).find((d) => d.id === id);
    if (!def) return { ok: false };
    const p = st.profile;
    const facts = {
      winsToday: p.w - m.base.w,
      matchesToday: (p.w + p.l) - (m.base.w + m.base.l),
      packsToday: p.packSeedCounter - m.base.packs,
      sbcToday: p.sbcDone.length - m.base.sbc,
    };
    if (!missionProgress(def, facts).done) return { ok: false };
    let s = _markMissionClaimed(st, id);
    s = _addCredits(s, def.credits);
    persist(s);
    set({ state: s });
    return { ok: true, credits: def.credits };
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

// Sync entre abas: outra aba do site persistiu → rehidrata esta store (evita
// last-writer-wins sobrescrever resgates one-time feitos na outra aba).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || e.newValue == null) return;
    try {
      useUltimate.setState({ state: migrateUltimate(JSON.parse(e.newValue)) });
    } catch {
      /* payload corrompido de outra aba — ignora, mantém o estado atual */
    }
  });
}
