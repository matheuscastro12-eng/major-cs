// [UT-REW2] Fase 2 do fix "cartas que não estão na sua conta online" (02/11).
// Todo prêmio que ainda nascia SÓ no aparelho (diária, sequência, missões,
// semanais + pack bônus, Gauntlet, Draft, ladder/marco da temporada, passe,
// lendas, objetivos sem métrica no servidor, starter, comunidade e os packs
// Promo/Temporada) passa a ser GRAVADO no servidor pela action 'rewardClaim'.
//
// Modelo "adoção limitada": o cliente diz QUAL prêmio (src + chave) e QUAIS
// cópias criou (ids/keys); o servidor:
//   - calcula os CRÉDITOS pela tabela do engine (nunca do request);
//   - confere quantidade + raridade de cada carta contra a regra do prêmio;
//   - packs (bônus semanal, passe, comunidade) são RE-ROLADOS com o seed e
//     têm de bater carta a carta;
//   - idempotência: op_id `rw:<src>:<chave>` (UNIQUE no ledger) → 1× por
//     dia/semana/temporada/nível/run; replay devolve ok sem duplicar;
//   - progresso do servidor: diária (dia da sequência vem do ledger), Gauntlet
//     (estágio N exige o N-1 gravado), bônus semanal (exige as 3 semanais
//     gravadas), Draft (≤ inscrições pagas no dia), premium do passe (exige
//     `pass:<season>`), janelas de data/semana, seed de pack pago monotônico.
// O que o servidor AINDA não consegue provar (vitórias contra IA, pico de RP,
// sequência de login) fica limitado por chave única + janela + raridade fixa.
import { createHash } from 'node:crypto';
import { makeRng } from '../src/engine/rng.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';
import { packById, rollPack, PROMO_PACK, type PackDef } from '../src/engine/ultimate/packs.js';
import { SEASON_PACK } from '../src/engine/ultimate/seasonEdition.js';
import { dailyCredits } from '../src/engine/ultimate/daily.js';
import { missionsForDay } from '../src/engine/ultimate/missions.js';
import { missionsForWeek, WEEKLY_BONUS_PACK, weekKey } from '../src/engine/ultimate/weeklyMissions.js';
import { streakRewardFor } from '../src/engine/daily/streak.js';
import { DRAFT_REWARDS } from '../src/engine/ultimate/draft.js';
import { seasonTierById, SEASON_MILESTONE } from '../src/engine/ultimate/seasonRewards.js';
import { passLevelDef } from '../src/engine/ultimate/seasonPass.js';
import { objectiveById } from '../src/engine/ultimate/objectives.js';
import { applyUltTransaction, ultPayloadHash, type SqlTag, type UltCardOp } from './ultimate-economy.js';

export const CLAIM_SOURCES = ['daily', 'streak', 'mission', 'weekly', 'weekly-bonus', 'gauntlet', 'draft', 'season-tier',
  'season-milestone', 'pass', 'legacy', 'objective', 'starter', 'community', 'pack-paid'] as const;
export type ClaimSource = (typeof CLAIM_SOURCES)[number];

export type ClaimError = 'bad_input' | 'unknown_reward' | 'out_of_window' | 'not_reached' | 'bad_cards' | 'pack_mismatch'
  | 'locked' | 'rate_limited' | 'op_conflict' | 'insufficient_credits';

export interface ClaimCard { cardId: string; cardKey: string; ed?: number }
export interface ClaimInput {
  src: ClaimSource;
  key: string;                    // identifica o prêmio (vira o op_id)
  cards: ClaimCard[];
  p: Record<string, string | number | boolean>; // parâmetros do prêmio (data, nível, seed…)
}

// fatos do servidor que o plano consulta (carregados do ledger por loadClaimCtx)
export interface ClaimCtx {
  now: Date;
  lookup: (key: string) => UltCard | null | undefined;
  catalogs: UltCard[][];          // catálogo do mês atual e do anterior (re-roll de pack)
  hasOp: (opId: string) => boolean;
  lastDaily: { date: string; day: number } | null;
  draftEntries24h: number;
  draftClaims24h: number;
  unpaidPacks24h: number;
  lastPaidSeed: number;
  promoCost: number | null;       // custo do Promo em vigor no live-ops (null = padrão)
}

export interface ClaimPlan { opId: string; kind: 'reward' | 'pack'; creditsDelta: number; cards: UltCardOp[]; meta: Record<string, unknown> }

const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;
const MAX_OP = 64;
// = LEGACY_PLAYER_PREFIX (legacyBridge.ts) — copiado: a cadeia do bridge não carrega no runtime da Vercel
// = GAUNTLET_TARGET / GAUNTLET_WIN_CREDITS (state.ts) — copiados pelo mesmo motivo (teste de drift no .test)
export const GAUNTLET_TARGET_SRV = 5;
export const GAUNTLET_WIN_CREDITS_SRV = [800, 1200, 2000, 3200, 4500];
const LEGACY_PREFIX = 'rtp_legacy_';
const isLegacyCard = (c: UltCard | null | undefined): boolean => !!c && c.playerId.startsWith(LEGACY_PREFIX);

// data/semana no fuso do jogo (BRT, UTC-3) — o cliente usa o relógio local
export function brtDate(now: Date, deltaDays = 0): string {
  return new Date(now.getTime() - 3 * 3600_000 + deltaDays * 86400_000).toISOString().slice(0, 10);
}
function brtWeek(now: Date, deltaWeeks = 0): string {
  const d = new Date(now.getTime() - 3 * 3600_000 + deltaWeeks * 7 * 86400_000);
  return weekKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const dayOk = (now: Date, d: unknown): d is string => typeof d === 'string' && DAY_RE.test(d) && [-1, 0, 1].some((k) => brtDate(now, k) === d);
const weekOk = (now: Date, w: unknown): w is string => typeof w === 'string' && WEEK_RE.test(w) && [-1, 0, 1].some((k) => brtWeek(now, k) === w);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);

export function claimOpId(src: string, key: string): string {
  const raw = `rw:${src}:${key}`;
  return raw.length <= MAX_OP ? raw : `rw:${src}:#${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
}

export function parseClaim(body: unknown): ClaimInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.src !== 'string' || !(CLAIM_SOURCES as readonly string[]).includes(b.src)) return null;
  if (typeof b.key !== 'string' || !b.key || b.key.length > 120) return null;
  const rawCards = Array.isArray(b.cards) ? b.cards : [];
  if (rawCards.length > 12) return null;
  const cards: ClaimCard[] = [];
  for (const c of rawCards) {
    if (!c || typeof c !== 'object') return null;
    const o = c as Record<string, unknown>;
    if (typeof o.cardId !== 'string' || !ID_RE.test(o.cardId) || typeof o.cardKey !== 'string' || !o.cardKey || o.cardKey.length > 120) return null;
    cards.push({ cardId: o.cardId, cardKey: o.cardKey, ...(int(o.ed) != null && (o.ed as number) >= 1 ? { ed: o.ed as number } : {}) });
  }
  if (new Set(cards.map((c) => c.cardId)).size !== cards.length) return null;
  const p: ClaimInput['p'] = {};
  if (b.p && typeof b.p === 'object') {
    for (const [k, v] of Object.entries(b.p as Record<string, unknown>).slice(0, 12)) {
      if ((typeof v === 'string' && v.length <= 120) || typeof v === 'number' || typeof v === 'boolean') p[k] = v;
    }
  }
  return { src: b.src as ClaimSource, key: b.key, cards, p };
}

// re-rola o pack com o MESMO rng do cliente (seed incremental do save) e
// confere carta a carta — mês atual ou anterior (virada de mês no meio).
export function packMatches(pack: PackDef, seed: number, keys: string[], catalogs: UltCard[][]): boolean {
  const rngSeed = ((seed * 2654435761) >>> 0) || 1;
  return catalogs.some((cat) => {
    const rolled = rollPack(cat, pack, makeRng(rngSeed)).map((c) => c.key);
    return rolled.length === keys.length && rolled.every((k, i) => k === keys[i]);
  });
}

type Plan = { ok: true; plan: ClaimPlan } | { ok: false; error: ClaimError };

export function planClaim(input: ClaimInput, ctx: ClaimCtx): Plan {
  const { src, p, cards } = input;
  const now = ctx.now;
  const resolved = cards.map((c) => ctx.lookup(c.cardKey));
  if (resolved.some((c) => !c)) return { ok: false, error: 'bad_cards' };
  const rar = resolved.map((c) => c!.rarity as string);
  const oneOf = (rarity: string | undefined): boolean => (rarity ? cards.length === 1 && rar[0] === rarity : cards.length === 0);
  const ops = (via: string): UltCardOp[] => cards.map((c) => ({ op: 'add', cardId: c.cardId, cardKey: c.cardKey,
    meta: { acquiredVia: via, src, ...(c.ed ? { ed: c.ed } : {}) } }));
  const done = (key: string, creditsDelta: number, via = 'reward', kind: ClaimPlan['kind'] = 'reward', extra: Record<string, unknown> = {}): Plan =>
    ({ ok: true, plan: { opId: claimOpId(src, key), kind, creditsDelta, cards: ops(via), meta: { src, key, source: 'rewardClaim', ...extra } } });
  const packKeys = cards.map((c) => c.cardKey);

  switch (src) {
    case 'daily': {
      if (!dayOk(now, p.date) || cards.length) return { ok: false, error: 'out_of_window' };
      const asked = int(p.day);
      if (asked == null || asked < 1 || asked > 7) return { ok: false, error: 'bad_input' };
      // progresso NO SERVIDOR: dia da sequência = último claim do ledger (+1 se foi ontem)
      const prev = ctx.lastDaily;
      const yesterday = new Date(new Date(`${p.date}T12:00:00Z`).getTime() - 86400_000).toISOString().slice(0, 10);
      const day = !prev ? asked : prev.date === yesterday ? (prev.day >= 7 ? 1 : prev.day + 1) : 1;
      return done(p.date, dailyCredits(day), 'reward', 'reward', { day });
    }
    case 'streak': {
      const days = int(p.days);
      const def = days != null ? streakRewardFor(days) : null;
      if (!def || cards.length) return { ok: false, error: 'unknown_reward' };
      return done(String(days), def.coins ?? 0);
    }
    case 'mission': {
      if (!dayOk(now, p.day)) return { ok: false, error: 'out_of_window' };
      const def = missionsForDay(p.day).find((m) => m.id === p.id);
      if (!def || cards.length) return { ok: false, error: 'unknown_reward' };
      return done(`${p.day}:${def.id}`, def.credits);
    }
    case 'weekly': {
      if (!weekOk(now, p.week)) return { ok: false, error: 'out_of_window' };
      const def = missionsForWeek(p.week).find((m) => m.id === p.id);
      if (!def || cards.length) return { ok: false, error: 'unknown_reward' };
      return done(`${p.week}:${def.id}`, def.credits);
    }
    case 'weekly-bonus': {
      if (!weekOk(now, p.week)) return { ok: false, error: 'out_of_window' };
      const week = p.week;
      if (!missionsForWeek(week).every((m) => ctx.hasOp(claimOpId('weekly', `${week}:${m.id}`)))) return { ok: false, error: 'not_reached' };
      const pack = packById(WEEKLY_BONUS_PACK);
      const seed = int(p.seed);
      if (!pack || seed == null || seed < 1 || !packMatches(pack, seed, packKeys, ctx.catalogs)) return { ok: false, error: 'pack_mismatch' };
      return done(week, 0, 'reward', 'reward', { seed });
    }
    case 'gauntlet': {
      if (!dayOk(now, p.date)) return { ok: false, error: 'out_of_window' };
      const wins = int(p.wins);
      if (wins == null || wins < 1 || wins > GAUNTLET_TARGET_SRV) return { ok: false, error: 'bad_input' };
      if (wins > 1 && !ctx.hasOp(claimOpId('gauntlet', `${p.date}:${wins - 1}`))) return { ok: false, error: 'not_reached' };
      if (!oneOf(wins === GAUNTLET_TARGET_SRV ? 'elite' : undefined)) return { ok: false, error: 'bad_cards' };
      return done(`${p.date}:${wins}`, GAUNTLET_WIN_CREDITS_SRV[wins - 1] ?? 0);
    }
    case 'draft': {
      const wins = int(p.wins);
      const seed = int(p.seed);
      const def = wins != null ? DRAFT_REWARDS[wins] : undefined;
      if (!def || seed == null || seed < 0) return { ok: false, error: 'bad_input' };
      // ≤ inscrições pagas (spend 'draft-entry' no ledger) nas últimas 24h; sem espelho de inscrição, 1/dia
      if (ctx.draftClaims24h >= Math.max(1, ctx.draftEntries24h)) return { ok: false, error: 'rate_limited' };
      if (!oneOf(def.card)) return { ok: false, error: 'bad_cards' };
      return done(String(seed), def.credits, 'reward', 'reward', { wins });
    }
    case 'season-tier': {
      const season = int(p.season);
      const tier = typeof p.id === 'string' ? seasonTierById(p.id) : undefined;
      if (!tier || season == null || season < 1) return { ok: false, error: 'unknown_reward' };
      if (!oneOf(tier.reward.card)) return { ok: false, error: 'bad_cards' };
      return done(`${season}:${tier.id}`, tier.reward.credits ?? 0);
    }
    case 'season-milestone': {
      const season = int(p.season);
      if (season == null || season < 1) return { ok: false, error: 'bad_input' };
      if (!oneOf(SEASON_MILESTONE.rewardRarity)) return { ok: false, error: 'bad_cards' };
      return done(String(season), 0);
    }
    case 'pass': {
      const season = int(p.season);
      const level = int(p.level);
      const track = p.track === 'premium' ? 'premium' : p.track === 'free' ? 'free' : null;
      const def = level != null ? passLevelDef(level) : undefined;
      if (!def || !track || season == null || season < 1) return { ok: false, error: 'unknown_reward' };
      if (track === 'premium' && !ctx.hasOp(`pass:${season}`)) return { ok: false, error: 'locked' };
      const reward = track === 'premium' ? def.premium : def.free;
      const pk = reward.pack ? packById(reward.pack) : undefined;
      if (pk) {
        const seed = int(p.seed);
        const packPart = cards.slice(reward.card ? 1 : 0).map((c) => c.cardKey);
        if (seed == null || seed < 1 || !packMatches(pk, seed, packPart, ctx.catalogs)) return { ok: false, error: 'pack_mismatch' };
        if (reward.card && rar[0] !== reward.card) return { ok: false, error: 'bad_cards' };
      } else if (!oneOf(reward.card)) return { ok: false, error: 'bad_cards' };
      return done(`${season}:${track}:${level}`, reward.credits ?? 0);
    }
    case 'legacy': {
      if (cards.length !== 1 || !isLegacyCard(resolved[0]) || resolved[0]!.key !== input.key || !cards[0].cardId.startsWith('legacy_')) return { ok: false, error: 'bad_cards' };
      return done(input.key, 0);
    }
    case 'objective': {
      const def = typeof p.id === 'string' ? objectiveById(p.id) : undefined;
      if (!def) return { ok: false, error: 'unknown_reward' };
      // a carta de objetivo conferível já saiu pelo objectiveClaim (op `obj:<id>`): aqui só crédito
      const serverCard = ctx.hasOp(`obj:${def.id}`);
      if (serverCard ? cards.length !== 0 : !oneOf(def.reward.card)) return { ok: false, error: 'bad_cards' };
      return done(def.id, def.reward.credits ?? 0);
    }
    case 'starter': {
      if (cards.length < 1 || cards.length > 5) return { ok: false, error: 'bad_cards' };
      if (resolved.some((c) => c!.ovr > 82 || !['bronze', 'silver', 'gold', 'rareGold'].includes(c!.rarity))) return { ok: false, error: 'bad_cards' };
      if (cards.some((c) => !c.cardId.startsWith('starter_'))) return { ok: false, error: 'bad_cards' };
      return done('v1', 0, 'starter');
    }
    case 'community': {
      if (typeof p.weekId !== 'string' || !p.weekId || p.weekId.length > 20) return { ok: false, error: 'bad_input' };
      const pk = typeof p.packTier === 'string' ? packById(p.packTier) : undefined;
      const seed = int(p.seed);
      if (!pk || seed == null || seed < 1 || !packMatches(pk, seed, packKeys, ctx.catalogs)) return { ok: false, error: 'pack_mismatch' };
      return done(p.weekId, 0);
    }
    case 'pack-paid': {
      // Promo/Temporada (o roll fica no aparelho — o servidor não carimba `ed`
      // nem tem o filtro de promo do live-ops): debita o custo DO SERVIDOR,
      // confere tamanho/raridades e exige seed crescente (anti re-roll).
      const pack = p.packId === PROMO_PACK.id ? PROMO_PACK : p.packId === SEASON_PACK.id ? SEASON_PACK : null;
      const seed = int(p.seed);
      if (!pack || seed == null || seed < 1) return { ok: false, error: 'unknown_reward' };
      if (seed <= ctx.lastPaidSeed) return { ok: false, error: 'rate_limited' };
      if (cards.length !== pack.cards) return { ok: false, error: 'bad_cards' };
      const allowed = new Set(Object.keys(pack.weights));
      if (rar.filter((r) => !allowed.has(r)).length > 1) return { ok: false, error: 'bad_cards' };
      const cost = pack === PROMO_PACK ? (ctx.promoCost ?? PROMO_PACK.cost) : SEASON_PACK.cost;
      return done(`${pack.id}:${seed}`, -cost, 'pack', 'pack', { packId: pack.id, seed, cost });
    }
  }
  return { ok: false, error: 'unknown_reward' };
}

const UNPAID_CAP_24H = 6;

export async function loadClaimCtx(sql: SqlTag, email: string, base: Pick<ClaimCtx, 'now' | 'lookup' | 'catalogs' | 'promoCost'>): Promise<ClaimCtx> {
  const since = new Date(base.now.getTime() - 86400_000).toISOString();
  const rows = await sql`SELECT op_id, kind, credits_delta, meta, created_at FROM rtm_ult_ledger
    WHERE email=${email} AND (op_id LIKE 'rw:%' OR op_id LIKE 'pass:%' OR op_id LIKE 'obj:%'
      OR (kind='spend' AND meta->>'src'='draft-entry' AND created_at > ${since}))
    ORDER BY id DESC LIMIT 2000`;
  const ops = new Set<string>();
  let lastDaily: ClaimCtx['lastDaily'] = null;
  let draftEntries24h = 0; let draftClaims24h = 0; let unpaidPacks24h = 0; let lastPaidSeed = 0;
  for (const r of rows) {
    const op = String(r.op_id ?? '');
    const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
    const recent = new Date(String(r.created_at)).getTime() > Date.parse(since);
    ops.add(op);
    if (op.startsWith('rw:daily:') && !lastDaily) lastDaily = { date: op.slice(9), day: Number(meta.day ?? 1) || 1 };
    if (String(r.kind) === 'spend' && meta.src === 'draft-entry' && recent) draftEntries24h++;
    if (op.startsWith('rw:draft:') && recent) draftClaims24h++;
    if (op.startsWith('rw:pack-paid:')) {
      lastPaidSeed = Math.max(lastPaidSeed, Number(meta.seed ?? 0) || 0);
      if (meta.unpaid === true && recent) unpaidPacks24h++;
    }
  }
  return { ...base, hasOp: (o) => ops.has(o), lastDaily, draftEntries24h, draftClaims24h, unpaidPacks24h, lastPaidSeed };
}

export type ClaimResult = { ok: true; replayed: boolean; credits: number; creditsDelta: number; opId: string; unpaid?: boolean } | { ok: false; error: ClaimError };

export async function claimRewardServer(sql: SqlTag, email: string, body: unknown, base: Pick<ClaimCtx, 'now' | 'lookup' | 'catalogs' | 'promoCost'>): Promise<ClaimResult> {
  const input = parseClaim(body);
  if (!input) return { ok: false, error: 'bad_input' };
  const reqHash = ultPayloadHash({ a: 'rewardClaim', src: input.src, key: input.key, cards: input.cards, p: input.p });
  // replay ANTES de qualquer regra de progresso (a 1ª vez já passou por elas)
  const opGuess = claimOpId(input.src, input.key);
  const prior = await sql`SELECT meta->>'reqHash' AS h, credits_after, credits_delta FROM rtm_ult_ledger WHERE email=${email} AND op_id=${opGuess}`;
  if (prior.length) {
    if (prior[0].h != null && String(prior[0].h) !== reqHash) return { ok: false, error: 'op_conflict' };
    return { ok: true, replayed: true, credits: Number(prior[0].credits_after ?? 0), creditsDelta: 0, opId: opGuess };
  }
  const ctx = await loadClaimCtx(sql, email, base);
  const planned = planClaim(input, ctx);
  if (!planned.ok) return planned;
  const plan = planned.plan;
  if (plan.opId !== opGuess) return { ok: false, error: 'bad_input' }; // chave do cliente ≠ chave canônica
  let r = await applyUltTransaction(sql, email, { opId: plan.opId, kind: plan.kind, creditsDelta: plan.creditsDelta, cards: plan.cards, meta: plan.meta }, { reqHash });
  let unpaid = false;
  if (!r.ok && r.error === 'insufficient_credits' && plan.kind === 'pack') {
    // saldo do servidor < do aparelho (divergência antiga): grava as cartas
    // mesmo assim, SEM débito, marcado pra auditoria — com teto por dia.
    if (ctx.unpaidPacks24h >= UNPAID_CAP_24H) return { ok: false, error: 'insufficient_credits' };
    unpaid = true;
    r = await applyUltTransaction(sql, email, { opId: plan.opId, kind: plan.kind, creditsDelta: 0, cards: plan.cards, meta: { ...plan.meta, unpaid: true } }, { reqHash });
  }
  if (!r.ok) return { ok: false, error: r.error === 'op_conflict' ? 'op_conflict' : r.error === 'insufficient_credits' ? 'insufficient_credits' : 'bad_input' };
  return { ok: true, replayed: r.replayed, credits: r.credits, creditsDelta: unpaid ? 0 : plan.creditsDelta, opId: plan.opId, ...(unpaid ? { unpaid } : {}) };
}
