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
// RUNTIME DA VERCEL (sem bundle): este módulo só pode importar arquivos cuja
// cadeia de imports relativos usa extensão .js — a cadeia COMPLETA do engine
// (cards → data/regions → bo3.json) não resolve no Node ESM em runtime e já
// derrubou a rota inteira (2026-07-05). Por isso o catálogo vem MATERIALIZADO
// do snapshot gerado (ultimate-catalog.snapshot.ts, regen via
// npm run gen:ult-catalog; drift guardado por teste) e o roll importa apenas
// packs.js/rng.js/promos.js, que têm cadeia runtime-safe (sufixos .js).
import { randomBytes, randomUUID } from 'node:crypto';
import { makeRng } from '../src/engine/rng.js';
import type { UltCard } from '../src/engine/ultimate/cards.js';
import { packById, rollPack, type PackDef } from '../src/engine/ultimate/packs.js';
import { monthIndex } from '../src/engine/ultimate/promos.js';
import { openingPool } from '../src/engine/ultimate/packPool.js';
import { activeEventVersionDecl, applyEventVersions, parseEventVersionKey } from '../src/engine/ultimate/eventVersions.js';
import { dropPool } from '../src/engine/ultimate/drops.js';
import type { DropCatalog } from './ultimate-drops.js';
import { CardIndex } from '../src/engine/ultimate/cardIndex.js';
import { ULT_CATALOG_MONTHS, ULT_SNAPSHOT_FIRST_MONTH, ULT_SNAPSHOT_LAST_MONTH, type SnapCard } from './ultimate-catalog.snapshot.js';
import { applyUltTransaction, type SqlTag, type UltCardOp, type UltTx } from './ultimate-economy.js';

// versão do motor de roll gravada no ledger — se as odds/engine mudarem um dia,
// dá pra saber COM QUAL versão cada pack foi rolado.
// v3: versões de evento [CSM-2] substituem a base no pool durante o evento.
export const ULT_PACK_ENGINE_VERSION = 'ult-pack-v3-evento';

// ------------------------------------------------------------------ catálogo

// Catálogo do servidor: MESMA derivação do cliente, MATERIALIZADA no snapshot
// (o gerador roda buildFullCatalog(CS2_REAL_2026, mi) mês a mês; o teste de
// drift garante igualdade byte a byte com o engine). Fora da faixa coberta,
// clampa no mês mais próximo — packs continuam funcionando com o catálogo mais
// recente disponível, e o teste de cobertura avisa pra regenerar.
let _catalog: SnapCard[] | null = null;
let _index: Map<string, SnapCard> | null = null;
let _month = -1;

function snapshotMonth(mi: number): SnapCard[] {
  const clamped = Math.max(ULT_SNAPSHOT_FIRST_MONTH, Math.min(ULT_SNAPSHOT_LAST_MONTH, mi));
  return ULT_CATALOG_MONTHS[clamped] ?? [];
}

export function buildServerCatalog(now: Date = new Date()): SnapCard[] {
  const mi = monthIndex(now);
  if (!_catalog || _month !== mi) {
    _catalog = snapshotMonth(mi);
    _index = new CardIndex(_catalog); // [realismo FM] apelido de raridade base (cardIndex.ts)
    _month = mi;
  }
  return _catalog;
}

// [URG-2] catálogo do mês de uma data QUALQUER sem tocar o cache mensal (a carta
// exclusiva do fim de semana é sorteada no snapshot do mês da sexta do evento).
export function serverCatalogAt(at: Date): SnapCard[] {
  return snapshotMonth(monthIndex(at));
}

export function serverCatalogIndex(now: Date = new Date()): Map<string, SnapCard> {
  buildServerCatalog(now);
  return _index!;
}

// [F1] carta por key em QUALQUER mês do snapshot (o mais recente vence). Cópias
// antigas (promo/totw de meses passados) seguem válidas no squad e no import.
let _anyMonth: Map<string, SnapCard> | null = null;
export function serverCardByKeyAnyMonth(key: string): SnapCard | undefined {
  if (!_anyMonth) {
    const m = new Map<string, SnapCard>();
    const months = Object.keys(ULT_CATALOG_MONTHS).map(Number).sort((a, b) => a - b);
    for (const mi of months) for (const c of ULT_CATALOG_MONTHS[mi] ?? []) m.set(c.key, c);
    _anyMonth = m;
  }
  // [CSM-2] versão de evento não está no snapshot: deriva da base do mês corrente
  return _anyMonth.get(key) ?? (parseEventVersionKey(key) ? serverCatalogIndex().get(key) : undefined);
}

// lookup pro squad autoritativo: mês corrente primeiro, depois qualquer mês.
export function serverSquadLookup(now: Date = new Date()): (key: string) => SnapCard | undefined {
  const idx = serverCatalogIndex(now);
  return (key: string) => idx.get(key) ?? serverCardByKeyAnyMonth(key);
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
export function rollPackServer(args: { packId: string; seed: number; catalog: UltCard[]; now?: Date }): UltCard[] | null {
  const pack = serverPackDef(args.packId);
  if (!pack) return null;
  // sem `now` não há como saber o evento/semana: só packs fixos, sem evento.
  const pool = args.now ? openingPool(args.catalog, pack.id, args.now) : pack.id === 'totw' ? null : args.catalog;
  return pool ? rollPack(pool, pack, makeRng(args.seed >>> 0)) : null;
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
  | { ok: false; error: 'pack_unavailable' }
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

  const rolled = rollPackServer({ packId: pack.id, seed, catalog, now });
  if (!rolled) {
    // Mesmo com pool expirado, retry de operação já paga deve recuperar o
    // ledger original. Não criar transação nem debitar em abertura nova.
    const prior = await sql`SELECT kind, cards, meta FROM rtm_ult_ledger WHERE email=${email} AND op_id=${req.opId}`;
    const row = prior[0];
    if (!row) return { ok: false, error: 'pack_unavailable' };
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    if (row.kind !== 'pack' || meta.packId !== pack.id) return { ok: false, error: 'op_conflict' };
    const wallet = await sql`SELECT credits FROM rtm_ult_wallet WHERE email=${email}`;
    const ops = (Array.isArray(row.cards) ? row.cards : []) as { cardId: string; cardKey: string }[];
    return { ok: true, replayed: true, credits: Number(wallet[0]?.credits ?? 0), packId: pack.id, cost: pack.cost,
      seed: Number(meta.seed ?? 0) >>> 0,
      cards: ops.map((op) => ({ ...op, card: index.get(op.cardKey) ?? null })) };
  }
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
    meta: { packId: pack.id, seed, engineVersion: ULT_PACK_ENGINE_VERSION, eventId: activeEventVersionDecl(now.getTime(), catalog)?.eventId ?? null },
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

// ------------------------------------------------------------------- drops

// [CSM-1] catálogo do drop de escolha: pool elegível do mês (tiers base com
// peso) com as versões de evento aplicadas [CSM-2] — a MESMA função que o
// cliente usaria (teste de drift em ultimate-event-versions.test.ts).
export function serverDropCatalog(): DropCatalog {
  return {
    pool(now) {
      const cat = buildServerCatalog(now);
      return dropPool(applyEventVersions(cat, activeEventVersionDecl(now.getTime(), cat)));
    },
    lookup(key) {
      return serverSquadLookup()(key);
    },
    eventId(now) {
      return activeEventVersionDecl(now.getTime(), buildServerCatalog(now))?.eventId ?? null;
    },
  };
}
