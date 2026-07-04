// Roll de pack SERVER-SIDE (fase 2 da economia server-authoritative do
// Ultimate). Reusa o MESMO motor do cliente — src/engine/ultimate/packs.ts
// (odds/garantias/fallback), src/engine/rng.ts (mulberry32) e a MESMA derivação
// de catálogo (src/engine/ultimate/catalog.ts sobre CS2_REAL_2026) — zero
// duplicação de odds: mudou o engine, mudou o servidor junto.
//
// Auditabilidade: o seed de 32 bits do roll vai pro meta do ledger
// ({ packId, seed, engineVersion }); qualquer roll pode ser reproduzido depois
// com rollPackServer({ packId, seed, catalog }) sobre o catálogo do mês.
//
// Idempotência: replay do mesmo op_id NÃO re-rola — as cartas voltam do
// próprio ledger (rtm_ult_ledger.cards), idênticas às da primeira resposta.
import { randomBytes, randomUUID } from 'node:crypto';
import { CS2_REAL_2026 } from '../src/data/bo3.js';
import { makeRng } from '../src/engine/rng.js';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.js';
import { catalogIndex, type UltCard } from '../src/engine/ultimate/cards.js';
import { packById, rollPack, type PackDef } from '../src/engine/ultimate/packs.js';
import { monthIndex } from '../src/engine/ultimate/promos.js';
import { applyUltTransaction, type SqlTag, type UltCardOp, type UltTx } from './ultimate-economy.js';

// versão do motor de roll gravada no ledger — se as odds/engine mudarem um dia,
// dá pra saber COM QUAL versão cada pack foi rolado.
export const ULT_PACK_ENGINE_VERSION = 'ult-pack-v1';

// ------------------------------------------------------------------ catálogo

// Catálogo do servidor: MESMA derivação do cliente (base + tots + major +
// promos até o mês corrente), cacheado por monthIndex — igual ao ensureCatalog
// de src/state/ultimate.ts.
let _catalog: UltCard[] | null = null;
let _index: Map<string, UltCard> | null = null;
let _month = -1;

export function buildServerCatalog(now: Date = new Date()): UltCard[] {
  const mi = monthIndex(now);
  if (!_catalog || _month !== mi) {
    _catalog = buildFullCatalog(CS2_REAL_2026, mi).catalog;
    _index = catalogIndex(_catalog);
    _month = mi;
  }
  return _catalog;
}

export function serverCatalogIndex(now: Date = new Date()): Map<string, UltCard> {
  buildServerCatalog(now);
  return _index!;
}

// ---------------------------------------------------------------------- roll

// PackDef validada pelo ENGINE (id/custo/odds nunca vêm do request do cliente).
export function serverPackDef(packId: string): PackDef | undefined {
  return packById(packId);
}

// seed de 32 bits crypto-random — cabe em INT/JSONB e reproduz o mulberry32.
export function randomSeed32(): number {
  return randomBytes(4).readUInt32BE(0);
}

// Roll determinístico: mesma (packId, seed, catálogo) ⇒ mesmas cartas, na
// mesma ordem. É EXATAMENTE o rollPack do cliente com o rng seedado.
export function rollPackServer(args: { packId: string; seed: number; catalog: UltCard[] }): UltCard[] | null {
  const pack = serverPackDef(args.packId);
  if (!pack) return null;
  return rollPack(args.catalog, pack, makeRng(args.seed >>> 0));
}

// ------------------------------------------------------------------ packOpen

export interface PackOpenCard {
  cardId: string;          // uuid da CÓPIA (OwnedCard.id) inserida em rtm_ult_cards
  cardKey: string;         // → catálogo
  card: UltCard | null;    // resolvida do catálogo do mês (null se o key sumiu)
}

export type PackOpenResult =
  | { ok: true; replayed: boolean; credits: number; packId: string; cost: number; seed: number; cards: PackOpenCard[] }
  | { ok: false; error: 'unknown_pack' }
  | { ok: false; error: 'insufficient_credits'; credits: number }
  | { ok: false; error: 'op_conflict' }; // op_id já usado por outra tx que não é pack

// Abre um pack de forma atômica e idempotente:
//   1. valida packId/custo contra o ENGINE;
//   2. rola server-side com seed crypto-random;
//   3. UMA transação (applyUltTransaction): debita o custo, grava o ledger
//      (kind 'pack', meta { packId, seed, engineVersion }) e insere as cópias;
//   4. replay do mesmo op_id devolve as MESMAS cartas lidas do ledger.
// `opts` só existe pros testes (relógio/seed/uuid determinísticos).
export async function openPack(
  sql: SqlTag,
  email: string,
  req: { opId: string; packId: string },
  opts?: { now?: Date; seed?: number; uuid?: () => string },
): Promise<PackOpenResult> {
  const pack = serverPackDef(req.packId);
  if (!pack) return { ok: false, error: 'unknown_pack' };
  const now = opts?.now ?? new Date();
  const catalog = buildServerCatalog(now);
  const index = serverCatalogIndex(now);
  const seed = (opts?.seed ?? randomSeed32()) >>> 0;
  const uuid = opts?.uuid ?? randomUUID;

  const rolled = rollPack(catalog, pack, makeRng(seed));
  const cardOps: UltCardOp[] = rolled.map((c) => ({
    op: 'add',
    cardId: uuid(),
    cardKey: c.key,
    meta: { acquiredVia: 'pack', packId: pack.id },
  }));
  const tx: UltTx = {
    opId: req.opId,
    kind: 'pack',
    creditsDelta: -pack.cost,
    cards: cardOps,
    meta: { packId: pack.id, seed, engineVersion: ULT_PACK_ENGINE_VERSION },
  };
  const r = await applyUltTransaction(sql, email, tx);
  if (!r.ok) return { ok: false, error: 'insufficient_credits', credits: r.credits };

  if (!r.replayed) {
    return {
      ok: true, replayed: false, credits: r.credits, packId: pack.id, cost: pack.cost, seed,
      cards: cardOps.map((op, i) => ({ cardId: op.cardId, cardKey: op.cardKey ?? '', card: rolled[i] ?? null })),
    };
  }

  // Replay: NÃO re-rola — lê as cartas gravadas na primeira execução direto do
  // ledger (fonte da verdade), inclusive o seed original do meta.
  const rows = await sql`SELECT kind, cards, meta FROM rtm_ult_ledger WHERE email=${email} AND op_id=${req.opId}`;
  const row = rows[0];
  if (!row || String(row.kind) !== 'pack') return { ok: false, error: 'op_conflict' };
  const priorOps = (Array.isArray(row.cards) ? row.cards : []) as { cardId?: string; cardKey?: string }[];
  const priorMeta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<string, unknown>;
  return {
    ok: true, replayed: true, credits: r.credits, packId: pack.id, cost: pack.cost,
    seed: Number(priorMeta.seed ?? seed) >>> 0,
    cards: priorOps.map((op) => {
      const key = String(op.cardKey ?? '');
      return { cardId: String(op.cardId ?? ''), cardKey: key, card: index.get(key) ?? null };
    }),
  };
}
