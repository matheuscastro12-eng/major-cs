// [UT-REW] Prêmios de carta AUTORITATIVOS do servidor (fix B do bug "cartas
// que não estão na sua conta online", 02/11). Antes, a SBC/objetivo criavam a
// carta SÓ no save do aparelho (O0-02) e a ranqueada recusava o squad.
//
// Regras (nunca confia no cliente):
//   - SBC: o servidor confere que as cópias enviadas são DELE (rtm_ult_cards),
//     valida os requisitos com o catálogo DELE (checkSbc), sorteia a carta do
//     prêmio e aplica tudo numa tx só (remove insumos + add prêmio + crédito).
//     requireOwned garante que o prêmio só sai se os insumos saem juntos.
//   - Objetivo: só a CARTA (crédito segue no fluxo de hoje), 1× por conta
//     (op_id `obj:<id>`), e só objetivos cuja métrica o servidor consegue
//     conferir (coleção do servidor ou vitórias em ult_match).
//   - Cura na ranqueada (heal): carta `sbc_*` do aparelho entra no servidor
//     SE existe uma tx 'sbc' antiga, legítima (insumos vieram de 'add' do
//     ledger, requisitos batem) e ainda sem prêmio — 1 carta por tx
//     (op_id `heal:sbc:<ledgerId>`), raridade igual à do prêmio da SBC.
//
// Puro onde dá: planSbc/planSbcHeal recebem lookup/pool/rng injetados.
import { randomUUID } from 'node:crypto';
import { checkSbc, sbcById, type SbcDef } from '../src/engine/ultimate/sbc.js';
import { objectiveById } from '../src/engine/ultimate/objectives.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';
import { applyUltTransaction, ultPayloadHash, type SqlTag, type UltCardOp } from './ultimate-economy.js';

export type CardLookup = (cardKey: string) => UltCard | null | undefined;
export type RarityPool = (rarity: string) => UltCard[];
export interface RewardDeps {
  lookup: CardLookup; pool: RarityPool; rng?: () => number; uuid?: () => string;
  // [UT-REW2] SBC agendada do live-ops ('lo-<id>'): def lida do rtm_liveops ATIVO no servidor
  liveSbc?: (sbcId: string) => Promise<SbcDef | undefined>;
}

export type RewardError = 'unknown_sbc' | 'bad_input' | 'duplicate_ids' | 'not_owner' | 'requirements' | 'empty_pool'
  | 'unknown_objective' | 'no_card_reward' | 'unverifiable' | 'not_reached' | 'op_conflict';

export interface GrantedCard { cardId: string; cardKey: string }
export type RewardResult =
  | { ok: true; replayed: boolean; credits: number; creditsDelta: number; card: GrantedCard | null }
  | { ok: false; error: RewardError };

const MAX_OP = 64;
const pick = <T>(arr: T[], rng: () => number): T => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

// ------------------------------------------------------------------ SBC

export interface OwnedKey { cardId: string; cardKey: string }

export function planSbc(
  def: SbcDef | undefined,
  cardIds: unknown,
  owned: OwnedKey[],
  deps: RewardDeps,
): { ok: true; cards: UltCardOp[]; creditsDelta: number; reward: GrantedCard | null; requireOwned: OwnedKey[] } | { ok: false; error: RewardError } {
  if (!def) return { ok: false, error: 'unknown_sbc' };
  if (!Array.isArray(cardIds) || !cardIds.length || cardIds.length > 12 || cardIds.some((x) => typeof x !== 'string' || !x || x.length > 80)) return { ok: false, error: 'bad_input' };
  const ids = cardIds as string[];
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'duplicate_ids' };
  const byId = new Map(owned.map((o) => [o.cardId, o] as const));
  if (ids.some((id) => !byId.has(id))) return { ok: false, error: 'not_owner' };
  const cards = ids.map((id) => deps.lookup(byId.get(id)!.cardKey));
  if (cards.some((c) => !c)) return { ok: false, error: 'requirements' };
  if (!checkSbc(cards as UltCard[], def.req).ok) return { ok: false, error: 'requirements' };
  const ops: UltCardOp[] = ids.map((id) => ({ op: 'remove', cardId: id, cardKey: byId.get(id)!.cardKey }));
  let reward: GrantedCard | null = null;
  if (def.reward.card) {
    const pool = deps.pool(def.reward.card);
    if (!pool.length) return { ok: false, error: 'empty_pool' };
    const c = pick(pool, deps.rng ?? Math.random);
    reward = { cardId: `sbc_${(deps.uuid ?? randomUUID)()}`, cardKey: c.key };
    ops.push({ op: 'add', cardId: reward.cardId, cardKey: reward.cardKey, meta: { acquiredVia: 'sbc', sbcId: def.id } });
  }
  return { ok: true, cards: ops, creditsDelta: Math.max(0, Math.trunc(def.reward.credits ?? 0)), reward, requireOwned: ids.map((id) => byId.get(id)!) };
}

// cartas adicionadas numa tx gravada (replay devolve o MESMO prêmio)
async function recordedAdd(sql: SqlTag, email: string, opId: string): Promise<GrantedCard | null> {
  const rows = await sql`SELECT cards FROM rtm_ult_ledger WHERE email=${email} AND op_id=${opId}`;
  const list = Array.isArray(rows[0]?.cards) ? rows[0].cards as Record<string, unknown>[] : [];
  const a = list.find((c) => c?.op === 'add');
  return a ? { cardId: String(a.cardId ?? ''), cardKey: String(a.cardKey ?? '') } : null;
}

export async function submitSbcServer(
  sql: SqlTag,
  email: string,
  req: { opId: unknown; sbcId: unknown; cardIds: unknown },
  deps: RewardDeps,
): Promise<RewardResult> {
  const opId = typeof req.opId === 'string' ? req.opId.trim() : '';
  if (!opId || opId.length > MAX_OP) return { ok: false, error: 'bad_input' };
  const sbcId = typeof req.sbcId === 'string' ? req.sbcId : '';
  const ids = Array.isArray(req.cardIds) ? req.cardIds.filter((x): x is string => typeof x === 'string') : [];
  const reqHash = ultPayloadHash({ a: 'sbcSubmit', sbcId, cardIds: ids });
  // replay ANTES de olhar posse (os insumos já saíram na 1ª vez)
  const prior = await sql`SELECT meta->>'reqHash' AS h, credits_after FROM rtm_ult_ledger WHERE email=${email} AND op_id=${opId}`;
  if (prior.length) {
    if (prior[0].h != null && String(prior[0].h) !== reqHash) return { ok: false, error: 'op_conflict' };
    return { ok: true, replayed: true, credits: Number(prior[0].credits_after ?? 0), creditsDelta: 0, card: await recordedAdd(sql, email, opId) };
  }
  const rows = ids.length ? await sql`SELECT card_id, card_key FROM rtm_ult_cards WHERE email=${email} AND card_id = ANY(${ids})` : [];
  const owned = rows.map((r) => ({ cardId: String(r.card_id ?? ''), cardKey: String(r.card_key ?? '') }));
  const def = sbcById(sbcId) ?? (sbcId.startsWith('lo-') && deps.liveSbc ? await deps.liveSbc(sbcId) : undefined);
  const plan = planSbc(def, req.cardIds, owned, deps);
  if (!plan.ok) return plan;
  const r = await applyUltTransaction(sql, email, {
    opId, kind: 'sbc', creditsDelta: plan.creditsDelta, cards: plan.cards, meta: { sbcId, source: 'sbcSubmit', rewarded: true },
  }, { requireOwned: plan.requireOwned, reqHash });
  if (!r.ok) return { ok: false, error: r.error === 'not_owner' ? 'not_owner' : r.error === 'op_conflict' ? 'op_conflict' : 'bad_input' };
  return { ok: true, replayed: r.replayed, credits: r.credits, creditsDelta: plan.creditsDelta, card: r.replayed ? await recordedAdd(sql, email, opId) : plan.reward };
}

// ------------------------------------------------------------- objetivo

// métricas que o servidor confere sozinho
export interface ServerFacts { uniqueCards: number; totalCards: number; iconsOwned: number; histIconsOwned: number; wins: number }
const VERIFIABLE = new Set<keyof ServerFacts>(['uniqueCards', 'totalCards', 'iconsOwned', 'histIconsOwned', 'wins']);

export function objectiveOpId(id: string): string { return `obj:${id}`; }

export function planObjective(objectiveId: string, facts: ServerFacts, deps: RewardDeps):
  { ok: true; card: GrantedCard } | { ok: false; error: RewardError } {
  const def = objectiveById(objectiveId);
  if (!def) return { ok: false, error: 'unknown_objective' };
  if (!def.reward.card) return { ok: false, error: 'no_card_reward' };
  if (!VERIFIABLE.has(def.metric as keyof ServerFacts)) return { ok: false, error: 'unverifiable' };
  if ((facts[def.metric as keyof ServerFacts] ?? 0) < def.target) return { ok: false, error: 'not_reached' };
  const pool = deps.pool(def.reward.card);
  if (!pool.length) return { ok: false, error: 'empty_pool' };
  const c = pick(pool, deps.rng ?? Math.random);
  return { ok: true, card: { cardId: `obj_${(deps.uuid ?? randomUUID)()}`, cardKey: c.key } };
}

export async function serverFacts(sql: SqlTag, email: string, lookup: CardLookup): Promise<ServerFacts> {
  const rows = await sql`SELECT card_key FROM rtm_ult_cards WHERE email=${email}`;
  const uniq = new Set<string>(); let icons = 0; const hist = new Set<string>();
  for (const r of rows) {
    const key = String(r.card_key ?? ''); const c = lookup(key);
    if (!c) continue;
    if (!uniq.has(c.playerId)) { uniq.add(c.playerId); if (c.rarity === 'icon') icons++; }
    if (c.rarity === 'histIcon') hist.add(c.playerId);
  }
  const w = await sql`SELECT count(*)::int AS n FROM ult_match WHERE ranked AND winner IS NOT NULL AND ((winner=0 AND email_a=${email}) OR (winner=1 AND email_b=${email}))`;
  return { uniqueCards: uniq.size, totalCards: rows.length, iconsOwned: icons, histIconsOwned: hist.size, wins: Number(w[0]?.n ?? 0) };
}

export async function claimObjectiveServer(sql: SqlTag, email: string, objectiveId: unknown, deps: RewardDeps): Promise<RewardResult> {
  const id = typeof objectiveId === 'string' ? objectiveId : '';
  const opId = objectiveOpId(id);
  const prior = await sql`SELECT credits_after FROM rtm_ult_ledger WHERE email=${email} AND op_id=${opId}`;
  if (prior.length) return { ok: true, replayed: true, credits: Number(prior[0].credits_after ?? 0), creditsDelta: 0, card: await recordedAdd(sql, email, opId) };
  const plan = planObjective(id, await serverFacts(sql, email, deps.lookup), deps);
  if (!plan.ok) return plan;
  const r = await applyUltTransaction(sql, email, {
    opId, kind: 'reward', creditsDelta: 0,
    cards: [{ op: 'add', cardId: plan.card.cardId, cardKey: plan.card.cardKey, meta: { acquiredVia: 'objective', objectiveId: id } }],
    meta: { source: 'objective', objectiveId: id },
  });
  if (!r.ok) return { ok: false, error: 'op_conflict' };
  return { ok: true, replayed: r.replayed, credits: r.credits, creditsDelta: 0, card: r.replayed ? await recordedAdd(sql, email, opId) : plan.card };
}

// ------------------------------------------------ SBC antiga sem prêmio

export interface LedgerRow { id: number; opId: string; kind: string; cards: { op: string; cardId: string; cardKey?: string }[]; meta: Record<string, unknown> }

export function healOpId(ledgerId: number): string { return `heal:sbc:${ledgerId}`; }

// SBCs antigas (remove-only, sem prêmio) que o ledger JUSTIFICA: os insumos
// entraram antes por 'add' no ledger da conta e os requisitos batem no
// catálogo do servidor. Devolve uma "vaga" por tx, com a raridade do prêmio.
export function justifiedSbcSlots(ledger: LedgerRow[], lookup: CardLookup): { ledgerId: number; sbcId: string; rarity: string }[] {
  const sorted = [...ledger].sort((a, b) => a.id - b.id);
  const added = new Map<string, string>(); // cardId → cardKey (entrou pelo servidor)
  const healed = new Set<number>();
  for (const r of sorted) { const m = /^heal:sbc:(\d+)$/.exec(r.opId); if (m) healed.add(Number(m[1])); }
  const slots: { ledgerId: number; sbcId: string; rarity: string }[] = [];
  for (const r of sorted) {
    if (r.kind === 'sbc' && r.meta?.rewarded !== true) {
      const def = sbcById(String(r.meta?.sbcId ?? ''));
      const removes = r.cards.filter((c) => c.op === 'remove');
      if (def?.reward.card && !healed.has(r.id) && removes.length === def.req.count && removes.every((c) => added.has(c.cardId))) {
        const cards = removes.map((c) => lookup(added.get(c.cardId)!));
        if (cards.every(Boolean) && checkSbc(cards as UltCard[], def.req).ok) slots.push({ ledgerId: r.id, sbcId: def.id, rarity: def.reward.card });
      }
    }
    for (const c of r.cards) {
      if (c.op === 'add' && c.cardKey) added.set(c.cardId, c.cardKey);
      if (c.op === 'remove') added.delete(c.cardId);
    }
  }
  return slots;
}

// casa cartas `sbc_*` do aparelho com as vagas (mesma raridade, 1:1)
export function planSbcHeal(
  local: { cardId: string; cardKey: string }[],
  slots: { ledgerId: number; rarity: string }[],
  serverIds: Set<string>,
  lookup: CardLookup,
): { cardId: string; cardKey: string; ledgerId: number }[] {
  const free = [...slots];
  const out: { cardId: string; cardKey: string; ledgerId: number }[] = [];
  for (const l of local) {
    if (!/^sbc_/.test(l.cardId) || serverIds.has(l.cardId)) continue;
    const c = lookup(l.cardKey); if (!c) continue;
    const i = free.findIndex((s) => s.rarity === c.rarity);
    if (i < 0) continue;
    out.push({ cardId: l.cardId, cardKey: l.cardKey, ledgerId: free[i].ledgerId });
    free.splice(i, 1);
  }
  return out;
}

export async function loadLedger(sql: SqlTag, email: string): Promise<LedgerRow[]> {
  const rows = await sql`SELECT id, op_id, kind, cards, meta FROM rtm_ult_ledger WHERE email=${email} ORDER BY id`;
  return rows.map((r) => ({
    id: Number(r.id), opId: String(r.op_id ?? ''), kind: String(r.kind ?? ''),
    cards: Array.isArray(r.cards) ? (r.cards as Record<string, unknown>[]).map((c) => ({ op: String(c?.op ?? ''), cardId: String(c?.cardId ?? ''), cardKey: c?.cardKey == null ? undefined : String(c.cardKey) })) : [],
    meta: (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>,
  }));
}

// aplica a cura: cada carta vira uma tx idempotente própria
export async function healSbcCards(sql: SqlTag, email: string, local: { cardId: string; cardKey: string }[], lookup: CardLookup): Promise<string[]> {
  if (!local.length) return [];
  const ledger = await loadLedger(sql, email);
  const own = await sql`SELECT card_id FROM rtm_ult_cards WHERE email=${email}`;
  const plan = planSbcHeal(local, justifiedSbcSlots(ledger, lookup), new Set(own.map((r) => String(r.card_id ?? ''))), lookup);
  const healed: string[] = [];
  for (const h of plan) {
    const r = await applyUltTransaction(sql, email, {
      opId: healOpId(h.ledgerId), kind: 'grant', creditsDelta: 0,
      cards: [{ op: 'add', cardId: h.cardId, cardKey: h.cardKey, meta: { acquiredVia: 'sbc', healOf: h.ledgerId } }],
      meta: { source: 'heal-sbc', ledgerId: h.ledgerId },
    });
    if (r.ok && !r.replayed) healed.push(h.cardId);
  }
  return healed;
}
