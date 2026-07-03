// Ultimate Squad — estado (inventário + perfil + squads) e reducers PUROS.
// Sem DOM/localStorage aqui (a persistência mora em src/state/ultimate.ts) →
// 100% testável. Ver docs-but-map.md §4/§6.

import { quickSellValue } from './quicksell';
import { computeNextDaily, dailyCredits } from './daily';
import { divisionFor, DIV_TIER_MULT } from './divisions';
import type { UltCard } from './cards';
import type { Role } from '../../types';

// registro de partida (histórico das últimas HISTORY_MAX, todos os modos).
export interface MatchRecord {
  t: number;                                   // timestamp (ms)
  mode: 'rivals' | 'casual' | 'gauntlet';
  won: boolean;
  score: string;                               // "13-9"
  eloDelta: number;                            // 0 fora do rivals
  credits: number;
}
export const HISTORY_MAX = 20;

// missões diárias: baseline dos contadores no início do dia (progresso = atual - base).
export interface MissionsState {
  day: string;                                 // dateKey do dia das missões
  base: { w: number; l: number; packs: number; sbc: number };
  claimed: string[];
}

export type AcquiredVia = 'pack' | 'daily' | 'sbc' | 'reward' | 'starter' | 'initial' | 'market';

export interface OwnedCard {
  id: string;              // uuid da cópia possuída
  cardKey: string;         // → UltCard.key no catálogo
  serial?: number;         // "a Nª cópia que você possui" (cosmético)
  acquiredVia: AcquiredVia;
  acquiredAt: number;
  locked: 'squad' | null;  // travada num squad → não pode vender
  boost?: number;          // nível de evolução (+OVR/atributos por nível), 0..EVO_MAX
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
  // wl0 = w+l no INÍCIO da season (pra saber se jogou nela e não pagar bônus
  // de fim de temporada a uma conta dormente — ver applySeasonRollover).
  season: { startedAt: number; endsAt: number; wl0?: number; peak?: number; claimed?: string[]; n?: number } | null;
  sbcDone: string[];
  objectivesClaimed: string[]; // ids de objetivos/missões já resgatados (profundidade)
  gauntlet: { date: string | null; wins: number; active: boolean; best: number }; // Elite Gauntlet (1 run/dia)
  history: MatchRecord[];      // últimas partidas (cap HISTORY_MAX)
  bazaarBought: { day: number; ids: string[] }; // listagens do bazar compradas no day-bucket (anti-restock)
  missions: MissionsState | null; // missões diárias rotativas
}

export const ULTIMATE_VERSION = 1;
export const STARTING_CREDITS = 6000;   // começa com ~1 pack Prata, não um Ouro de cara
export const STARTING_ELO = 1000;
// evolução de cartas: teto de níveis + custo (em credits) p/ ir de boost b → b+1.
// Encarecida (era 4k/9k/18k): empurrar uma carta pra 95+ é investimento, não trivial.
export const EVO_MAX = 3;
export const EVO_COSTS = [8000, 18000, 36000];

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
    objectivesClaimed: [],
    gauntlet: { date: null, wins: 0, active: false, best: 0 },
    history: [],
    bazaarBought: { day: 0, ids: [] },
    missions: null,
  };
}

export function defaultUltimateState(): UltimateState {
  return { version: ULTIMATE_VERSION, profile: defaultUltimateProfile(), inventory: [], squads: [] };
}

// marca um objetivo como resgatado (idempotente). A recompensa em credits/carta
// é aplicada na store (que tem catálogo) — como no submitSbc. O "cumprido" é
// checado na UI (single-player, sem anti-cheat — igual a daily/season).
export function markObjectiveClaimed(state: UltimateState, id: string): UltimateState {
  if (state.profile.objectivesClaimed.includes(id)) return state;
  return { ...state, profile: { ...state.profile, objectivesClaimed: [...state.profile.objectivesClaimed, id] } };
}

// evolui UMA carta possuída: gasta credits e sobe o boost em +1 (até EVO_MAX).
// O boost soma no OVR/atributos exibidos (aplicado na UI via boostCard).
export function evolveCard(
  state: UltimateState,
  ownedId: string,
): { ok: boolean; state: UltimateState; cost?: number; newBoost?: number; reason?: 'missing' | 'maxed' | 'insufficient' } {
  const owned = state.inventory.find((o) => o.id === ownedId);
  if (!owned) return { ok: false, state, reason: 'missing' };
  const boost = Math.min(EVO_MAX, Math.max(0, owned.boost ?? 0));
  if (boost >= EVO_MAX) return { ok: false, state, reason: 'maxed' };
  const cost = EVO_COSTS[boost];
  const spent = spendCredits(state, cost);
  if (!spent.ok) return { ok: false, state, reason: 'insufficient' };
  const inventory = spent.state.inventory.map((o) => (o.id === ownedId ? { ...o, boost: boost + 1 } : o));
  return { ok: true, state: { ...spent.state, inventory }, cost, newBoost: boost + 1 };
}

// marca uma faixa da ladder de temporada como resgatada (idempotente). A
// validação de "pico atingido" + recompensa ficam na store (que tem catálogo).
export function claimSeasonReward(state: UltimateState, id: string): UltimateState {
  const s = state.profile.season;
  if (!s || (s.claimed ?? []).includes(id)) return state;
  return { ...state, profile: { ...state.profile, season: { ...s, claimed: [...(s.claimed ?? []), id] } } };
}

// ── Elite Gauntlet: desafio diário de sequência de vitórias ──
export const GAUNTLET_TARGET = 5;
export const GAUNTLET_WIN_CREDITS = [800, 1200, 2000, 3200, 4500]; // credits por vitória (index = wins-1); topo aparado (era 6000)

// inicia um run do Gauntlet (1 por dia). No-op se já iniciou hoje.
export function gauntletStart(state: UltimateState, today: string): UltimateState {
  const g = state.profile.gauntlet;
  if (g.date === today) return state;
  return { ...state, profile: { ...state.profile, gauntlet: { date: today, wins: 0, active: true, best: g.best } } };
}

// registra o resultado de uma partida do Gauntlet. Vitória avança; derrota OU
// completar (GAUNTLET_TARGET) encerra o run. best = maior sequência já feita.
export function gauntletRecord(state: UltimateState, won: boolean): { state: UltimateState; wins: number; completed: boolean; over: boolean; advanced: boolean } {
  const g = state.profile.gauntlet;
  // advanced=false → run inativo: quem chamar NÃO deve pagar recompensa.
  if (!g.active) return { state, wins: g.wins, completed: false, over: true, advanced: false };
  const wins = won ? g.wins + 1 : g.wins;
  const completed = won && wins >= GAUNTLET_TARGET;
  const over = !won || completed;
  const best = Math.max(g.best, wins);
  const gauntlet = { ...g, wins, best, active: !over };
  return { state: { ...state, profile: { ...state.profile, gauntlet } }, wins, completed, over, advanced: true };
}

// ── histórico de partidas (alimenta "Histórico de ELO" e "Últimas Ranqueadas") ──
export function pushHistory(state: UltimateState, rec: MatchRecord): UltimateState {
  const history = [rec, ...state.profile.history].slice(0, HISTORY_MAX);
  return { ...state, profile: { ...state.profile, history } };
}

// ── bazar: marca listagem comprada no day-bucket (anti-restock por remount/F5) ──
export function markBazaarBought(state: UltimateState, day: number, id: string): UltimateState {
  const b = state.profile.bazaarBought;
  const ids = b.day === day ? [...b.ids, id] : [id];
  return { ...state, profile: { ...state.profile, bazaarBought: { day, ids } } };
}

// ── missões diárias: abre o dia (baseline dos contadores) + resgate idempotente ──
export function ensureMissions(state: UltimateState, day: string): UltimateState {
  const p = state.profile;
  if (p.missions?.day === day) return state;
  const missions: MissionsState = { day, base: { w: p.w, l: p.l, packs: p.packSeedCounter, sbc: p.sbcDone.length }, claimed: [] };
  return { ...state, profile: { ...p, missions } };
}

export function markMissionClaimed(state: UltimateState, id: string): UltimateState {
  const m = state.profile.missions;
  if (!m || m.claimed.includes(id)) return state;
  return { ...state, profile: { ...state.profile, missions: { ...m, claimed: [...m.claimed, id] } } };
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

// maior serial já emitido pra um cardKey (monotônico — sobrevive a vendas).
function maxSerialOf(state: UltimateState, cardKey: string): number {
  let m = 0;
  for (const o of state.inventory) if (o.cardKey === cardKey && (o.serial ?? 0) > m) m = o.serial ?? 0;
  return m;
}

// concede uma carta ao inventário (retorna NOVO estado — imutável).
// serial = próximo número monotônico daquele cardKey (não colide após vender).
export function grantCard(
  state: UltimateState,
  cardKey: string,
  via: AcquiredVia,
  opts?: { id?: string; at?: number },
): UltimateState {
  const serial = maxSerialOf(state, cardKey) + 1;
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
      ? { startedAt: p.season.startedAt, endsAt: num(p.season.endsAt, p.season.startedAt), wl0: num(p.season.wl0, 0), peak: num(p.season.peak, STARTING_ELO), claimed: Array.isArray(p.season.claimed) ? p.season.claimed.filter((x): x is string => typeof x === 'string') : [], n: Math.max(1, num(p.season.n, 1)) }
      : null,
    sbcDone: Array.isArray(p.sbcDone) ? p.sbcDone.filter((x): x is string => typeof x === 'string') : [],
    objectivesClaimed: Array.isArray(p.objectivesClaimed) ? p.objectivesClaimed.filter((x): x is string => typeof x === 'string') : [],
    gauntlet: p.gauntlet && typeof p.gauntlet === 'object'
      ? { date: typeof p.gauntlet.date === 'string' ? p.gauntlet.date : null, wins: num(p.gauntlet.wins, 0), active: !!p.gauntlet.active, best: num(p.gauntlet.best, 0) }
      : { date: null, wins: 0, active: false, best: 0 },
    history: Array.isArray(p.history)
      ? p.history
          .filter((h): h is MatchRecord => !!h && typeof h === 'object' && typeof (h as MatchRecord).won === 'boolean' && ['rivals', 'casual', 'gauntlet'].includes((h as MatchRecord).mode))
          .map((h) => ({ t: num(h.t, 0), mode: h.mode, won: h.won, score: typeof h.score === 'string' ? h.score : '', eloDelta: num(h.eloDelta, 0), credits: num(h.credits, 0) }))
          .slice(0, HISTORY_MAX)
      : [],
    bazaarBought: p.bazaarBought && typeof p.bazaarBought === 'object'
      ? { day: num(p.bazaarBought.day, 0), ids: Array.isArray(p.bazaarBought.ids) ? p.bazaarBought.ids.filter((x): x is string => typeof x === 'string') : [] }
      : { day: 0, ids: [] },
    missions: p.missions && typeof p.missions === 'object' && typeof p.missions.day === 'string'
      ? {
          day: p.missions.day,
          base: { w: num(p.missions.base?.w, 0), l: num(p.missions.base?.l, 0), packs: num(p.missions.base?.packs, 0), sbc: num(p.missions.base?.sbc, 0) },
          claimed: Array.isArray(p.missions.claimed) ? p.missions.claimed.filter((x): x is string => typeof x === 'string') : [],
        }
      : null,
  };
  const inventory: OwnedCard[] = Array.isArray(r.inventory)
    ? r.inventory
        .filter((o): o is OwnedCard => !!o && typeof o === 'object' && typeof (o as OwnedCard).cardKey === 'string' && typeof (o as OwnedCard).id === 'string')
        .map((o) => {
          const b = o.boost;
          if (typeof b !== 'number' || !Number.isFinite(b) || b <= 0) return { ...o, boost: undefined };
          return { ...o, boost: Math.min(EVO_MAX, Math.floor(b)) };
        })
    : [];
  // sanitiza squads: recomputeLocks itera sq.slots — um save corrompido com
  // squads sem `slots` (ou com entradas lixo) lançava TypeError no load.
  const squads: UltimateSquad[] = Array.isArray(r.squads)
    ? r.squads
        .filter((s): s is UltimateSquad => !!s && typeof s === 'object' && typeof (s as UltimateSquad).id === 'string')
        .map((s) => ({
          ...s,
          slots: Array.isArray(s.slots)
            ? s.slots
                .filter((sl): sl is UltimateSquad['slots'][number] => !!sl && typeof sl === 'object' && typeof (sl as { slot?: unknown }).slot === 'number')
                .map((sl) => ({ ...sl, ownedId: typeof sl.ownedId === 'string' ? sl.ownedId : null }))
            : [],
        }))
    : [];
  // re-sincroniza locks no load: um save corrompido pode ter carta locked:'squad'
  // que não está em slot nenhum (ficaria invendável pra sempre). recomputeLocks
  // conserta pelos slots reais.
  return recomputeLocks({ version: ULTIMATE_VERSION, profile, inventory, squads });
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
  // jogador (não só a cópia) que está entrando — o MESMO jogador não pode ocupar
  // dois slots (viraria id duplicado no motor de partida). cardKey = `${playerId}:${rarity}`.
  const ownedOf = (id: string | null) => (id ? state.inventory.find((o) => o.id === id) : undefined);
  const playerOf = (id: string | null): string | undefined => ownedOf(id)?.cardKey.split(':')[0];
  const incomingPlayer = ownedId ? playerOf(ownedId) : undefined;
  const slots = sq.slots.map((s) => {
    if (s.slot === slot) return { ...s, ownedId };
    // limpa qualquer outro slot com a MESMA cópia ou o MESMO jogador
    if (ownedId && (s.ownedId === ownedId || (incomingPlayer && playerOf(s.ownedId) === incomingPlayer))) return { ...s, ownedId: null };
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

// ─────────────────────────────────────────────────────────────────────────────
// Partida ranqueada vs IA (P3): ELO local + recompensa de credits. Puro.

export interface MatchOutcome { eloDelta: number; credits: number }

// ELO estilo padrão (K=24, expectativa logística, delta clampado ±40). Recompensa
// de credits só na vitória, com bônus por rival mais forte, MULTIPLICADOR da
// divisão atual (Bronze 1.0× → Elite 1.8×) e bônus de sequência (+5%/win, cap 25%).
export function computeMatchOutcome(userElo: number, oppElo: number, won: boolean, streak = 0): MatchOutcome {
  const K = 24;
  const expected = 1 / (1 + Math.pow(10, (oppElo - userElo) / 400));
  const raw = Math.round(K * ((won ? 1 : 0) - expected));
  const eloDelta = Math.max(-40, Math.min(40, raw));
  const divMult = DIV_TIER_MULT[divisionFor(userElo).def.tier];
  const streakMult = 1 + Math.min(Math.max(0, streak), 5) * 0.05;
  const credits = won ? Math.round((300 + Math.max(0, Math.round((oppElo - userElo) / 4))) * divMult * streakMult) : 0;
  return { eloDelta, credits };
}

// aplica o resultado no perfil (elo/peak/w-l/streak/credits). Retorna o novo
// estado + o outcome (pra UI mostrar +ELO / +credits).
export function applyMatchResult(state: UltimateState, won: boolean, oppElo: number): { state: UltimateState; outcome: MatchOutcome } {
  const p = state.profile;
  const outcome = computeMatchOutcome(p.elo, oppElo, won, p.streak);
  const elo = Math.max(0, p.elo + outcome.eloDelta);
  const profile: UltimateProfile = {
    ...p,
    elo,
    peakElo: Math.max(p.peakElo, elo),
    w: p.w + (won ? 1 : 0),
    l: p.l + (won ? 0 : 1),
    streak: won ? p.streak + 1 : 0,
    credits: p.credits + outcome.credits,
    // pico da TEMPORADA (p/ ladder de recompensas) — distinto do peakElo all-time
    season: p.season ? { ...p.season, peak: Math.max(p.season.peak ?? p.elo, elo) } : p.season,
  };
  return { state: { ...state, profile }, outcome };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily reward + títulos (P4). Puros.

export interface DailyClaim { claimed: boolean; day: number; credits: number; wasReset: boolean }

export function claimDaily(state: UltimateState, todayKey: string): { state: UltimateState; result: DailyClaim } {
  const st = computeNextDaily(state.profile.daily.streakDay, state.profile.daily.lastClaim, todayKey);
  if (!st.canClaim) return { state, result: { claimed: false, day: st.day, credits: 0, wasReset: false } };
  const credits = dailyCredits(st.day);
  const profile: UltimateProfile = {
    ...state.profile,
    credits: state.profile.credits + credits,
    daily: { lastClaim: todayKey, streakDay: st.day },
  };
  return { state: { ...state, profile }, result: { claimed: true, day: st.day, credits, wasReset: st.wasReset } };
}

// funde os títulos conquistados (união); auto-equipa o 1º título de todos.
export function mergeTitles(state: UltimateState, earned: string[]): { state: UltimateState; newly: string[] } {
  const have = new Set(state.profile.titles);
  const newly = earned.filter((s) => !have.has(s));
  if (!newly.length) return { state, newly: [] };
  const titles = [...state.profile.titles, ...newly];
  const equippedTitle = state.profile.equippedTitle ?? newly[0];
  return { state: { ...state, profile: { ...state.profile, titles, equippedTitle } }, newly };
}

export function equipTitle(state: UltimateState, slug: string | null): UltimateState {
  if (slug !== null && !state.profile.titles.includes(slug)) return state;
  return { ...state, profile: { ...state.profile, equippedTitle: slug } };
}

// remove cartas do inventário (SBC/consumo) e limpa qualquer slot de squad que
// as referenciava. Não mexe no lock das demais (que seguem corretas).
export function removeOwnedCards(state: UltimateState, ids: string[]): UltimateState {
  const set = new Set(ids);
  const inventory = state.inventory.filter((o) => !set.has(o.id));
  const squads = state.squads.map((sq) => ({
    ...sq,
    slots: sq.slots.map((s) => (s.ownedId && set.has(s.ownedId) ? { ...s, ownedId: null } : s)),
  }));
  return { ...state, inventory, squads };
}

// ─────────────────────────────────────────────────────────────────────────────
// Season (P5): janelas de 30 dias, rollover por RELÓGIO local no load. Soft-reset
// do ELO (1000 + (elo-1000)*0.5), zera a sequência, paga bônus por pico. Puro.

export const SEASON_DAYS = 30;

export function startSeason(nowMs: number, wl0 = 0, peak = STARTING_ELO, n = 1): { startedAt: number; endsAt: number; wl0: number; peak: number; claimed: string[]; n: number } {
  return { startedAt: nowMs, endsAt: nowMs + SEASON_DAYS * 86400000, wl0, peak, claimed: [], n };
}

export interface SeasonRollover { rolled: boolean; credits: number; newElo: number }

export function applySeasonRollover(state: UltimateState, nowMs: number): { state: UltimateState; result: SeasonRollover } {
  const p = state.profile;
  const s = p.season;
  const wlNow = p.w + p.l;
  if (!s) {
    // 1ª vez: abre a season marcando o baseline de jogos (não paga nada).
    return { state: { ...state, profile: { ...p, season: startSeason(nowMs, wlNow) } }, result: { rolled: false, credits: 0, newElo: p.elo } };
  }
  if (nowMs <= s.endsAt) return { state, result: { rolled: false, credits: 0, newElo: p.elo } };
  // só paga bônus se JOGOU nesta season (conta dormente não vira fonte de credits).
  // recompensa proporcional ao RP CONQUISTADO na season (elo atual, não pico eterno).
  const playedThisSeason = wlNow - (s.wl0 ?? 0) > 0;
  const credits = playedThisSeason ? 2000 + Math.max(0, Math.round((p.elo - 1000) / 2)) : 0;
  const newElo = Math.round(1000 + (p.elo - 1000) * 0.5);
  const profile: UltimateProfile = {
    ...p,
    elo: newElo,
    streak: 0,
    credits: p.credits + credits,
    // pico da nova season começa em STARTING_ELO (não em newElo) — senão o
    // soft-reset já nasceria acima dos thresholds e liberaria re-resgate das
    // faixas SEM jogar. O jogador precisa re-escalar na temporada nova.
    season: startSeason(nowMs, wlNow, STARTING_ELO, (s.n ?? 1) + 1), // novo baseline (peak = STARTING_ELO)
  };
  return { state: { ...state, profile }, result: { rolled: true, credits, newElo } };
}
