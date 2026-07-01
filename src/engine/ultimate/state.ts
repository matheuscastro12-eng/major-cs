// Ultimate Squad — estado (inventário + perfil + squads) e reducers PUROS.
// Sem DOM/localStorage aqui (a persistência mora em src/state/ultimate.ts) →
// 100% testável. Ver docs-but-map.md §4/§6.

import { quickSellValue } from './quicksell';
import type { UltCard } from './cards';
import type { Role } from '../../types';

export type AcquiredVia = 'pack' | 'daily' | 'sbc' | 'reward' | 'starter' | 'initial';

export interface OwnedCard {
  id: string;              // uuid da cópia possuída
  cardKey: string;         // → UltCard.key no catálogo
  serial?: number;         // "a Nª cópia que você possui" (cosmético)
  acquiredVia: AcquiredVia;
  acquiredAt: number;
  locked: 'squad' | null;  // travada num squad → não pode vender
}

export interface UltimateSquad {
  id: string;
  name: string;
  formation: string;
  slots: { slot: number; ownedId: string | null; role: string }[];
  active: boolean;
}

export interface UltimateProfile {
  onboarded: boolean;
  credits: number;
  elo: number;
  peakElo: number;
  w: number;
  l: number;
  streak: number;
  daily: { lastClaim: string | null; streakDay: number };
  packSeedCounter: number; // semente incremental p/ RNG reproduzível de pack (P1)
  titles: string[];
  equippedTitle: string | null;
  season: { startedAt: number; endsAt: number } | null;
  sbcDone: string[];
}

export const ULTIMATE_VERSION = 1;
export const STARTING_CREDITS = 15000;
export const STARTING_ELO = 1000;

export interface UltimateState {
  version: number;
  profile: UltimateProfile;
  inventory: OwnedCard[];
  squads: UltimateSquad[];
}

export function defaultUltimateProfile(): UltimateProfile {
  return {
    onboarded: false,
    credits: STARTING_CREDITS,
    elo: STARTING_ELO,
    peakElo: STARTING_ELO,
    w: 0,
    l: 0,
    streak: 0,
    daily: { lastClaim: null, streakDay: 0 },
    packSeedCounter: 0,
    titles: [],
    equippedTitle: null,
    season: null,
    sbcDone: [],
  };
}

export function defaultUltimateState(): UltimateState {
  return { version: ULTIMATE_VERSION, profile: defaultUltimateProfile(), inventory: [], squads: [] };
}

// gerador de id — usa crypto.randomUUID no runtime; tests passam id explícito.
let _uidCounter = 0;
function uid(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* sem crypto */ }
  _uidCounter += 1;
  return `u_${_uidCounter.toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// quantas cópias de um cardKey o jogador possui.
export function countCopies(state: UltimateState, cardKey: string): number {
  let n = 0;
  for (const o of state.inventory) if (o.cardKey === cardKey) n++;
  return n;
}

// concede uma carta ao inventário (retorna NOVO estado — imutável).
// serial = cópia Nª daquele cardKey que você passa a ter.
export function grantCard(
  state: UltimateState,
  cardKey: string,
  via: AcquiredVia,
  opts?: { id?: string; at?: number },
): UltimateState {
  const serial = countCopies(state, cardKey) + 1;
  const owned: OwnedCard = {
    id: opts?.id ?? uid(),
    cardKey,
    serial,
    acquiredVia: via,
    acquiredAt: opts?.at ?? Date.now(),
    locked: null,
  };
  return { ...state, inventory: [...state.inventory, owned] };
}

export interface SellResult {
  state: UltimateState;
  ok: boolean;
  credited: number;
  reason?: 'not_found' | 'locked';
}

// vende (quick-sell) uma cópia. Bloqueia se travada em squad. Duplicata (você
// tem 2+) vale 100%; única vale 70% (regra do BUT). `index` = catalogIndex().
export function sellCard(
  state: UltimateState,
  ownedId: string,
  index: Map<string, UltCard>,
): SellResult {
  const owned = state.inventory.find((o) => o.id === ownedId);
  if (!owned) return { state, ok: false, credited: 0, reason: 'not_found' };
  if (owned.locked) return { state, ok: false, credited: 0, reason: 'locked' };
  const card = index.get(owned.cardKey);
  const isDuplicate = countCopies(state, owned.cardKey) >= 2;
  const credited = card ? quickSellValue(card.rarity, card.ovr, isDuplicate) : 0;
  const inventory = state.inventory.filter((o) => o.id !== ownedId);
  const profile = { ...state.profile, credits: state.profile.credits + credited };
  return { state: { ...state, inventory, profile }, ok: true, credited };
}

export function addCredits(state: UltimateState, n: number): UltimateState {
  return { ...state, profile: { ...state.profile, credits: Math.max(0, state.profile.credits + Math.round(n)) } };
}

export interface SpendResult { state: UltimateState; ok: boolean }

// debita créditos se houver saldo; senão no-op com ok=false.
export function spendCredits(state: UltimateState, n: number): SpendResult {
  const cost = Math.max(0, Math.round(n));
  if (state.profile.credits < cost) return { state, ok: false };
  return { state: { ...state, profile: { ...state.profile, credits: state.profile.credits - cost } }, ok: true };
}

// coage um objeto desserializado (unknown) num UltimateState válido, preenchendo
// defaults — é a "migração"/saneamento do save paralelo. Nunca quebra: entrada
// inválida vira estado default.
export function migrateUltimate(raw: unknown): UltimateState {
  const base = defaultUltimateState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<UltimateState> & { profile?: Partial<UltimateProfile> };
  const dp = base.profile;
  const p: Partial<UltimateProfile> = (r.profile && typeof r.profile === 'object') ? r.profile : {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const profile: UltimateProfile = {
    onboarded: p.onboarded === true,
    credits: num(p.credits, dp.credits),
    elo: num(p.elo, dp.elo),
    peakElo: num(p.peakElo, dp.peakElo),
    w: num(p.w, 0),
    l: num(p.l, 0),
    streak: num(p.streak, 0),
    daily: {
      lastClaim: typeof p.daily?.lastClaim === 'string' ? p.daily.lastClaim : null,
      streakDay: num(p.daily?.streakDay, 0),
    },
    packSeedCounter: num(p.packSeedCounter, 0),
    titles: Array.isArray(p.titles) ? p.titles.filter((x): x is string => typeof x === 'string') : [],
    equippedTitle: typeof p.equippedTitle === 'string' ? p.equippedTitle : null,
    season: p.season && typeof p.season === 'object' && typeof p.season.startedAt === 'number'
      ? { startedAt: p.season.startedAt, endsAt: num(p.season.endsAt, p.season.startedAt) }
      : null,
    sbcDone: Array.isArray(p.sbcDone) ? p.sbcDone.filter((x): x is string => typeof x === 'string') : [],
  };
  const inventory: OwnedCard[] = Array.isArray(r.inventory)
    ? r.inventory.filter((o): o is OwnedCard => !!o && typeof o === 'object' && typeof (o as OwnedCard).cardKey === 'string' && typeof (o as OwnedCard).id === 'string')
    : [];
  const squads: UltimateSquad[] = Array.isArray(r.squads)
    ? r.squads.filter((s): s is UltimateSquad => !!s && typeof s === 'object' && typeof (s as UltimateSquad).id === 'string')
    : [];
  return { version: ULTIMATE_VERSION, profile, inventory, squads };
}

// ─────────────────────────────────────────────────────────────────────────────
// Squad building (P2). Um único squad ativo (id 'main'). Toda mutação re-sincroniza
// os locks: OwnedCard.locked = 'squad' sse referenciado no squad, senão null.

export function activeSquad(state: UltimateState): UltimateSquad | undefined {
  return state.squads[0];
}

function recomputeLocks(state: UltimateState): UltimateState {
  const inSquad = new Set<string>();
  for (const sq of state.squads) for (const s of sq.slots) if (s.ownedId) inSquad.add(s.ownedId);
  let changed = false;
  const inventory = state.inventory.map((o) => {
    const shouldLock = inSquad.has(o.id);
    if (shouldLock && o.locked !== 'squad') { changed = true; return { ...o, locked: 'squad' as const }; }
    if (!shouldLock && o.locked === 'squad') { changed = true; return { ...o, locked: null }; }
    return o;
  });
  return changed ? { ...state, inventory } : state;
}

export function makeSquad(formationId: string, slotRoles: Role[]): UltimateSquad {
  return {
    id: 'main',
    name: 'Meu Squad',
    formation: formationId,
    slots: slotRoles.map((role, i) => ({ slot: i, ownedId: null, role })),
    active: true,
  };
}

// garante que existe um squad ativo (cria vazio se não houver).
export function ensureSquad(state: UltimateState, formationId: string, slotRoles: Role[]): UltimateState {
  if (state.squads.length) return state;
  return { ...state, squads: [makeSquad(formationId, slotRoles)] };
}

// coloca (ownedId) num slot — ou limpa (null). Garante que a carta não fica em
// dois slots ao mesmo tempo. Re-sincroniza locks.
export function setSlot(state: UltimateState, slot: number, ownedId: string | null): UltimateState {
  const sq = state.squads[0];
  if (!sq) return state;
  const slots = sq.slots.map((s) => {
    if (ownedId && s.ownedId === ownedId && s.slot !== slot) return { ...s, ownedId: null };
    if (s.slot === slot) return { ...s, ownedId };
    return s;
  });
  return recomputeLocks({ ...state, squads: [{ ...sq, slots }, ...state.squads.slice(1)] });
}

// troca a formação, mantendo as cartas por índice (as que não encaixarem na nova
// função apenas não dão bônus de role — a química cuida disso).
export function setFormation(state: UltimateState, formationId: string, slotRoles: Role[]): UltimateState {
  const sq = state.squads[0];
  if (!sq) return ensureSquad(state, formationId, slotRoles);
  const slots = slotRoles.map((role, i) => ({ slot: i, role, ownedId: sq.slots[i]?.ownedId ?? null }));
  return recomputeLocks({ ...state, squads: [{ ...sq, formation: formationId, slots }, ...state.squads.slice(1)] });
}
