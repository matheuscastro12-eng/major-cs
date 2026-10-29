// [CSM-1] Drop de escolha do Ultimate — lado SERVIDOR (fonte da verdade).
//
// Fluxo:
//   dropStatus → estoque (1 a cada 20 min, máx. 3) + drop pendente; liquida o
//                pendente vencido (entrega a opção de MENOR valor).
//   dropOpen   → saca 1 do estoque, sorteia a seed NO SERVIDOR, grava as 3
//                opções com prazo de 30 min. Com pendente aberto devolve o
//                MESMO (não sorteia de novo; não consome estoque).
//   dropPick   → entrega a carta escolhida pelo ledger (applyUltTransaction,
//                op_id `drop:<dropId>`) e limpa o pendente. Vencido → menor valor.
//
// Idempotência: o crédito tem op_id derivado do servidor (`drop:<dropId>`), o
// mesmo para escolha manual e liquidação automática — nunca entrega 2×. Replay
// devolve a carta gravada no ledger (não a do pedido novo).
//
// Concorrência: a linha por conta (rtm_ult_drops) é escrita só com CAS
// (`WHERE version = $v`). Ordem segura: o ledger aplica ANTES de limpar o
// pendente; se a limpeza falhar, o próximo acesso re-aplica o mesmo op_id
// (replay sem efeito) e limpa.
import { randomUUID } from 'node:crypto';
import {
  autoPickIndex, consumeDrop, dropOptionValue, dropStock, nextSinceGold, rollDropOffers,
  DROP_CHOICE_MS, DROP_ENGINE_VERSION, DROP_EXPIRY_RULE, DROP_INTERVAL_MS, DROP_MAX_STOCK, DROP_OPTIONS, DROP_PITY_N,
  type DropCardLike,
} from '../src/engine/ultimate/drops.js';
import { applyUltTransaction, type SqlQuery, type SqlTag } from './ultimate-economy.js';

export interface DropPending {
  dropId: string;
  seed: number;
  offers: string[];     // cardKeys, na ordem mostrada
  expiresAt: number;    // ms
  createdAt: number;    // ms
  eventId: string | null;
  pityUsed: boolean;
}

export interface DropRow {
  available: number;
  refillBase: number;
  sinceGold: number;
  version: number;      // 0 = linha ainda não existe
  pending: DropPending | null;
}

export interface DropStore {
  get(email: string): Promise<DropRow | null>;
  /** CAS: grava `next` se a versão atual for `expected` (0 = inserir). */
  write(email: string, next: DropRow, expected: number): Promise<boolean>;
}

export type DropCard = DropCardLike & { nick?: string; role?: string; eventLabel?: string };

export interface DropCatalog {
  pool(now: Date): DropCard[];                 // elegíveis (com evento aplicado)
  lookup(key: string): DropCard | undefined;   // resolve qualquer key (inclui evento)
  eventId(now: Date): string | null;
}

export interface DropOfferView { cardKey: string; card: DropCard | null; value: number }
export interface DropStatusView {
  available: number;
  max: number;
  nextAt: number | null;
  intervalMs: number;
  pityIn: number;       // drops até o pity disparar (0 = o próximo garante Ouro+)
  pending: { dropId: string; expiresAt: number; offers: DropOfferView[]; autoIndex: number; rule: string } | null;
  serverNow: number;
}

export type DropResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const RETRIES = 5;

export function dropOpId(dropId: string): string {
  return `drop:${dropId}`;
}

function freshRow(now: number): DropRow {
  // conta nova começa com 1 drop pronto (primeira experiência imediata)
  return { available: 1, refillBase: now, sinceGold: 0, version: 0, pending: null };
}

function offersView(p: DropPending, cat: DropCatalog): DropOfferView[] {
  return p.offers.map((k) => {
    const card = cat.lookup(k) ?? null;
    return { cardKey: k, card, value: card ? dropOptionValue(card) : 0 };
  });
}

function autoIndexOf(p: DropPending, cat: DropCatalog): number {
  const cards = p.offers.map((k) => cat.lookup(k));
  if (cards.some((c) => !c)) return 0;
  return autoPickIndex(cards as DropCard[]);
}

export function statusView(row: DropRow, now: number, cat: DropCatalog): DropStatusView {
  const st = dropStock(row, now);
  return {
    available: st.available, max: DROP_MAX_STOCK, nextAt: st.nextAt, intervalMs: DROP_INTERVAL_MS,
    pityIn: Math.max(0, DROP_PITY_N - 1 - row.sinceGold),
    pending: row.pending ? {
      dropId: row.pending.dropId, expiresAt: row.pending.expiresAt, offers: offersView(row.pending, cat),
      autoIndex: autoIndexOf(row.pending, cat), rule: DROP_EXPIRY_RULE,
    } : null,
    serverNow: now,
  };
}

export interface DropGrant { dropId: string; index: number; auto: boolean; cardId: string; cardKey: string; card: DropCard | null; replayed: boolean; credits: number }

// Entrega a opção `index` do pendente pelo ledger (idempotente por dropId).
async function grantPending(sql: SqlTag, email: string, p: DropPending, index: number, auto: boolean, cat: DropCatalog, uuid: () => string): Promise<DropResult<DropGrant>> {
  const cardKey = p.offers[index];
  const cardId = uuid();
  const r = await applyUltTransaction(sql, email, {
    opId: dropOpId(p.dropId),
    kind: 'grant',
    creditsDelta: 0,
    cards: [{ op: 'add', cardId, cardKey, meta: { acquiredVia: 'drop', dropId: p.dropId } }],
    meta: { source: 'drop', dropId: p.dropId, seed: p.seed, index, auto, offers: p.offers, engineVersion: DROP_ENGINE_VERSION, eventId: p.eventId, pityUsed: p.pityUsed },
  });
  if (!r.ok) return { ok: false, status: 409, error: r.error };
  if (!r.replayed) return { ok: true, value: { dropId: p.dropId, index, auto, cardId, cardKey, card: cat.lookup(cardKey) ?? null, replayed: false, credits: r.credits } };
  return recordedGrant(sql, email, p.dropId, cat, r.credits);
}

// Resultado GRAVADO no ledger (replay devolve a primeira entrega, não o pedido novo).
async function recordedGrant(sql: SqlTag, email: string, dropId: string, cat: DropCatalog, credits?: number): Promise<DropResult<DropGrant>> {
  const rows = await sql`SELECT kind, cards, meta FROM rtm_ult_ledger WHERE email=${email} AND op_id=${dropOpId(dropId)}`;
  const row = rows[0];
  if (!row) return { ok: false, status: 404, error: 'drop não encontrado' };
  const meta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<string, unknown>;
  if (String(row.kind) !== 'grant' || meta.source !== 'drop') return { ok: false, status: 409, error: 'op_conflict' };
  const op = ((Array.isArray(row.cards) ? row.cards : [])[0] ?? {}) as { cardId?: string; cardKey?: string };
  const cardKey = String(op.cardKey ?? '');
  let bal = credits;
  if (bal == null) {
    const w = await sql`SELECT credits FROM rtm_ult_wallet WHERE email=${email}`;
    bal = Number(w[0]?.credits ?? 0);
  }
  return { ok: true, value: { dropId, index: Number(meta.index ?? 0), auto: meta.auto === true, cardId: String(op.cardId ?? ''), cardKey, card: cat.lookup(cardKey) ?? null, replayed: true, credits: bal } };
}

// Liquida o pendente vencido (menor valor) e devolve a linha limpa.
async function settleExpired(store: DropStore, sql: SqlTag, email: string, row: DropRow, now: number, cat: DropCatalog, uuid: () => string): Promise<{ row: DropRow; grant: DropGrant | null } | null> {
  const p = row.pending;
  if (!p || now < p.expiresAt) return { row, grant: null };
  const g = await grantPending(sql, email, p, autoIndexOf(p, cat), true, cat, uuid);
  if (!g.ok) return null;
  const next = { ...row, pending: null, version: row.version + 1 };
  if (!(await store.write(email, next, row.version))) return null; // outro request limpou: relê
  return { row: next, grant: g.value };
}

export interface DropOpts { now?: number; seed?: number; uuid?: () => string }

export async function dropStatus(store: DropStore, sql: SqlTag, email: string, cat: DropCatalog, opts: DropOpts = {}): Promise<DropResult<DropStatusView & { settled: DropGrant | null }>> {
  const now = opts.now ?? Date.now();
  const uuid = opts.uuid ?? randomUUID;
  for (let i = 0; i < RETRIES; i++) {
    const row = (await store.get(email)) ?? freshRow(now);
    const s = await settleExpired(store, sql, email, row, now, cat, uuid);
    if (!s) continue;
    return { ok: true, value: { ...statusView(s.row, now, cat), settled: s.grant } };
  }
  return { ok: false, status: 409, error: 'ocupado, tente de novo' };
}

export async function dropOpen(store: DropStore, sql: SqlTag, email: string, cat: DropCatalog, opts: DropOpts = {}): Promise<DropResult<DropStatusView & { opened: boolean }>> {
  const now = opts.now ?? Date.now();
  const uuid = opts.uuid ?? randomUUID;
  for (let i = 0; i < RETRIES; i++) {
    const loaded = (await store.get(email)) ?? freshRow(now);
    const s = await settleExpired(store, sql, email, loaded, now, cat, uuid);
    if (!s) continue;
    const row = s.row;
    // pendente aberto: devolve o MESMO (não sorteia nem consome)
    if (row.pending) return { ok: true, value: { ...statusView(row, now, cat), opened: false } };
    const consumed = consumeDrop(row, now);
    if (!consumed) return { ok: false, status: 409, error: 'sem drop disponível' };
    const seed = (opts.seed ?? randomSeed32()) >>> 0;
    const roll = rollDropOffers(seed, cat.pool(new Date(now)), row.sinceGold);
    // pool insuficiente: recusa SEM consumir nada (regra do original)
    if (roll.offers.length < DROP_OPTIONS) return { ok: false, status: 503, error: 'sem cartas elegíveis agora; nada foi consumido' };
    const pending: DropPending = {
      dropId: uuid(), seed, offers: roll.offers.map((c) => c.key), expiresAt: now + DROP_CHOICE_MS, createdAt: now,
      eventId: cat.eventId(new Date(now)), pityUsed: roll.pityUsed,
    };
    const next: DropRow = { ...consumed, sinceGold: nextSinceGold(row.sinceGold, roll), version: row.version + 1, pending };
    if (await store.write(email, next, row.version)) return { ok: true, value: { ...statusView(next, now, cat), opened: true } };
  }
  return { ok: false, status: 409, error: 'ocupado, tente de novo' };
}

export async function dropPick(store: DropStore, sql: SqlTag, email: string, req: { dropId: string; index: number }, cat: DropCatalog, opts: DropOpts = {}): Promise<DropResult<DropGrant>> {
  const now = opts.now ?? Date.now();
  const uuid = opts.uuid ?? randomUUID;
  if (!req.dropId || req.dropId.length > 64) return { ok: false, status: 400, error: 'dropId inválido' };
  for (let i = 0; i < RETRIES; i++) {
    const row = await store.get(email);
    const p = row?.pending;
    if (!row || !p || p.dropId !== req.dropId) {
      // já entregue (ou nunca existiu): devolve o resultado gravado
      return recordedGrant(sql, email, req.dropId, cat);
    }
    const expired = now >= p.expiresAt;
    if (!expired && !(Number.isInteger(req.index) && req.index >= 0 && req.index < p.offers.length)) {
      return { ok: false, status: 400, error: 'opção inválida' };
    }
    const index = expired ? autoIndexOf(p, cat) : req.index;
    const g = await grantPending(sql, email, p, index, expired, cat, uuid);
    if (!g.ok) return g;
    if (await store.write(email, { ...row, pending: null, version: row.version + 1 }, row.version)) return g;
    // outra requisição mexeu na linha: o ledger já tem a entrega; relê e limpa
  }
  return { ok: false, status: 409, error: 'ocupado, tente de novo' };
}

function randomSeed32(): number {
  return Number.parseInt(randomUUID().replace(/-/g, '').slice(0, 8), 16) >>> 0;
}

// ───────────────────────────────────────────────────────────── SQL (Neon)

export function ultDropSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_ult_drops (
      email TEXT PRIMARY KEY,
      available INT NOT NULL DEFAULT 0,
      refill_base BIGINT NOT NULL,
      since_gold INT NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 1,
      pending JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function pendingFromDb(v: unknown): DropPending | null {
  const o = typeof v === 'string' ? JSON.parse(v) : v;
  if (!isObj(o) || typeof o.dropId !== 'string' || !Array.isArray(o.offers)) return null;
  return {
    dropId: o.dropId, seed: Number(o.seed) >>> 0, offers: o.offers.map(String),
    expiresAt: Number(o.expiresAt), createdAt: Number(o.createdAt),
    eventId: typeof o.eventId === 'string' ? o.eventId : null, pityUsed: o.pityUsed === true,
  };
}

export function sqlDropStore(sql: SqlTag): DropStore {
  return {
    async get(email) {
      const rows = await sql`SELECT available, refill_base, since_gold, version, pending FROM rtm_ult_drops WHERE email=${email}`;
      if (!rows.length) return null;
      const r = rows[0];
      return {
        available: Number(r.available), refillBase: Number(r.refill_base), sinceGold: Number(r.since_gold),
        version: Number(r.version), pending: r.pending == null ? null : pendingFromDb(r.pending),
      };
    },
    async write(email, n, expected) {
      const pending = n.pending ? JSON.stringify(n.pending) : null;
      if (expected === 0) {
        const ins = await sql`INSERT INTO rtm_ult_drops (email, available, refill_base, since_gold, version, pending)
          VALUES (${email}, ${n.available}, ${n.refillBase}, ${n.sinceGold}, ${n.version}, ${pending}::jsonb)
          ON CONFLICT (email) DO NOTHING RETURNING email`;
        return ins.length > 0;
      }
      const up = await sql`UPDATE rtm_ult_drops SET available=${n.available}, refill_base=${n.refillBase}, since_gold=${n.sinceGold},
          version=${n.version}, pending=${pending}::jsonb, updated_at=now()
        WHERE email=${email} AND version=${expected} RETURNING email`;
      return up.length > 0;
    },
  };
}

/** Store em memória (testes). */
export function memoryDropStore(): DropStore & { rows: Map<string, DropRow> } {
  const rows = new Map<string, DropRow>();
  return {
    rows,
    async get(email) { const r = rows.get(email); return r ? structuredClone(r) : null; },
    async write(email, next, expected) {
      const cur = rows.get(email);
      if ((cur?.version ?? 0) !== expected) return false;
      rows.set(email, structuredClone(next));
      return true;
    },
  };
}
