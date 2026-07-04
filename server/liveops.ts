// LIVE-OPS do Ultimate — agendamento de promos/SBCs/avisos pelo CRM sem deploy
// (fase A: servidor; a fase B liga o cliente e a UI do CRM). Módulo PURO: recebe
// o tag `sql` (mesmo padrão de server/ultimate-economy.ts) — testável com FakeDb.
//
// Modelo: rtm_liveops guarda EVENTOS com janela (starts_at..ends_at) e payload
// jsonb validado ESTRITAMENTE por kind. O jogo lê só os ativos (activeLiveops),
// endpoint público e cacheável; o CRM faz CRUD autenticado por senha de admin.
//
// Segurança do payload: NADA aqui vira código. Os filtros das promos do engine
// (src/engine/ultimate/promos.ts) são FUNÇÕES; uma promo agendada só pode
// referenciar um `filterKey` de uma allowlist fixa que espelha os ids dos temas
// — o cliente resolve a chave para o filtro já compilado. Payload desconhecido
// ou campo fora da allowlist é rejeitado ANTES de tocar no banco.

// ------------------------------------------------------------------ constantes

export const LIVEOPS_KINDS = ['promo', 'sbc', 'notice'] as const;
export type LiveopsKind = (typeof LIVEOPS_KINDS)[number];

// máx. de eventos ativos devolvidos ao jogo (payload pequeno e previsível)
export const LIVEOPS_MAX_ACTIVE = 20;
// janela máxima de um evento (45 dias) — evento "eterno" é bug de agendamento
export const LIVEOPS_MAX_WINDOW_DAYS = 45;

// allowlist de filtros de promo — ESPELHA os ids de PROMO_THEMES em
// src/engine/ultimate/promos.ts (os filtros são código no cliente; aqui só a chave).
export const LIVEOPS_PROMO_FILTER_KEYS = ['br', 'eu', 'cis', 'americas', 'awp', 'igl', 'entry'] as const;
export type LiveopsPromoFilterKey = (typeof LIVEOPS_PROMO_FILTER_KEYS)[number];

// raridades válidas de recompensa — espelha UltRarity (src/engine/ultimate/rarities.ts)
export const LIVEOPS_RARITIES = [
  'bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon', 'tots', 'major', 'promo',
] as const;
export type LiveopsRarity = (typeof LIVEOPS_RARITIES)[number];

// limites da promo agendada — mesmos teto/piso da economia do engine:
// ovrBoost 1..3 (PROMO_BOOST=2 é o padrão), custo do pack entre o Bronze (2500)
// com folga e o teto Premium (40000) com margem pra promos caras.
export const LIVEOPS_PROMO_BOOST_MIN = 1;
export const LIVEOPS_PROMO_BOOST_MAX = 3;
export const LIVEOPS_PROMO_PACK_COST_MIN = 5_000;
export const LIVEOPS_PROMO_PACK_COST_MAX = 100_000;

// limites da SBC agendada — mesmos bounds das SBCS do engine (sbc.ts): count 3..5,
// minTier 1..7 (tiers base), minOvrAvg 60..95, credits até 30000 (acima do
// 'regional' de 12000 com folga, mas longe de virar faucet infinito).
export const LIVEOPS_SBC_COUNT_MIN = 3;
export const LIVEOPS_SBC_COUNT_MAX = 5;
export const LIVEOPS_SBC_TIER_MIN = 1;
export const LIVEOPS_SBC_TIER_MAX = 7;
export const LIVEOPS_SBC_OVR_MIN = 60;
export const LIVEOPS_SBC_OVR_MAX = 95;
export const LIVEOPS_SBC_CREDITS_MAX = 30_000;

// ------------------------------------------------------------------ tipos

export interface LiveopsPromoPayload {
  name: string;                     // título do card na Loja (≤40)
  desc: string;                     // subtítulo (≤140)
  color: string;                    // accent hex (#rrggbb)
  filterKey: LiveopsPromoFilterKey; // → PROMO_THEMES no cliente (nunca código)
  ovrBoost: number;                 // +OVR da versão promo (1..3)
  packCost: number;                 // custo do Pacote Promo em credits
}

export interface LiveopsSbcPayload {
  name: string;
  desc: string;
  req: {
    count: number;
    sameOrg?: boolean;
    sameCountry?: boolean;
    sameRegion?: boolean;
    minOvrAvg?: number;
    minTier?: number;
  };
  reward: { credits?: number; card?: LiveopsRarity };
}

export interface LiveopsNoticePayload {
  title: string; // ≤60
  body: string;  // ≤280
}

export type LiveopsPayload = LiveopsPromoPayload | LiveopsSbcPayload | LiveopsNoticePayload;

export interface LiveopsRow {
  id: string;
  kind: LiveopsKind;
  payload: LiveopsPayload;
  startsAt: string;   // ISO
  endsAt: string;     // ISO
  enabled: boolean;
  createdBy: string;
  updatedAt: string;  // ISO
}

export interface LiveopsUpsertInput {
  id: string;
  kind: string;
  payload: unknown;
  startsAt: string;
  endsAt: string;
  enabled?: boolean;
  createdBy?: string;
}

// erro SEMPRE com o campo que falhou — o CRM destaca o input correspondente.
export type LiveopsValidation<T> = { ok: true; payload: T } | { ok: false; field: string; error: string };
export type LiveopsUpsertResult = { ok: true; row: LiveopsRow } | { ok: false; field: string; error: string };

// Interface mínima do tag do @neondatabase/serverless (mesma de ultimate-economy.ts).
type Row = Record<string, unknown>;
export type SqlQuery = PromiseLike<Row[]>;
export interface SqlTag {
  (strings: TemplateStringsArray, ...params: unknown[]): SqlQuery;
  transaction(queries: SqlQuery[]): Promise<Row[][]>;
}

// ------------------------------------------------------------------ helpers

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// string obrigatória, trim, 1..max chars
function readStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

// inteiro obrigatório dentro de [min, max]
function readInt(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// slug: minúsculas/dígitos/hífen, 2..64 chars, começa com alfanumérico
const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/;

const bad = (field: string, error: string): { ok: false; field: string; error: string } => ({ ok: false, field, error });

// ------------------------------------------------------------------ validadores

// Promo agendada: só campos da allowlist, nada de código/filtros arbitrários.
export function validatePromoPayload(raw: unknown): LiveopsValidation<LiveopsPromoPayload> {
  if (!isPlainObject(raw)) return bad('payload', 'payload precisa ser um objeto');
  const name = readStr(raw.name, 40);
  if (!name) return bad('name', 'nome obrigatório (1..40 caracteres)');
  const desc = readStr(raw.desc, 140);
  if (!desc) return bad('desc', 'descrição obrigatória (1..140 caracteres)');
  const color = typeof raw.color === 'string' ? raw.color.trim() : '';
  if (!HEX_COLOR.test(color)) return bad('color', 'cor precisa ser hex #rrggbb');
  const filterKey = String(raw.filterKey ?? '');
  if (!(LIVEOPS_PROMO_FILTER_KEYS as readonly string[]).includes(filterKey)) {
    return bad('filterKey', `filterKey precisa ser um de: ${LIVEOPS_PROMO_FILTER_KEYS.join(', ')}`);
  }
  const ovrBoost = readInt(raw.ovrBoost, LIVEOPS_PROMO_BOOST_MIN, LIVEOPS_PROMO_BOOST_MAX);
  if (ovrBoost == null) return bad('ovrBoost', `ovrBoost precisa ser inteiro ${LIVEOPS_PROMO_BOOST_MIN}..${LIVEOPS_PROMO_BOOST_MAX}`);
  const packCost = readInt(raw.packCost, LIVEOPS_PROMO_PACK_COST_MIN, LIVEOPS_PROMO_PACK_COST_MAX);
  if (packCost == null) return bad('packCost', `packCost precisa ser inteiro ${LIVEOPS_PROMO_PACK_COST_MIN}..${LIVEOPS_PROMO_PACK_COST_MAX}`);
  return { ok: true, payload: { name, desc, color: color.toLowerCase(), filterKey: filterKey as LiveopsPromoFilterKey, ovrBoost, packCost } };
}

// SBC agendada: mesma forma de SbcDef (sbc.ts), com bounds sãos — SBCs são
// repetíveis no cliente, então exigimos ao menos UMA restrição além do count
// (senão 5 bronzes quaisquer viram faucet de credits) e recompensa não-vazia.
export function validateSbcPayload(raw: unknown): LiveopsValidation<LiveopsSbcPayload> {
  if (!isPlainObject(raw)) return bad('payload', 'payload precisa ser um objeto');
  const name = readStr(raw.name, 40);
  if (!name) return bad('name', 'nome obrigatório (1..40 caracteres)');
  const desc = readStr(raw.desc, 140);
  if (!desc) return bad('desc', 'descrição obrigatória (1..140 caracteres)');

  if (!isPlainObject(raw.req)) return bad('req', 'req precisa ser um objeto');
  const count = readInt(raw.req.count, LIVEOPS_SBC_COUNT_MIN, LIVEOPS_SBC_COUNT_MAX);
  if (count == null) return bad('req.count', `count precisa ser inteiro ${LIVEOPS_SBC_COUNT_MIN}..${LIVEOPS_SBC_COUNT_MAX}`);
  const req: LiveopsSbcPayload['req'] = { count };
  for (const flag of ['sameOrg', 'sameCountry', 'sameRegion'] as const) {
    const v = raw.req[flag];
    if (v !== undefined && typeof v !== 'boolean') return bad(`req.${flag}`, `${flag} precisa ser booleano`);
    if (v === true) req[flag] = true;
  }
  if (raw.req.minOvrAvg !== undefined) {
    const minOvrAvg = readInt(raw.req.minOvrAvg, LIVEOPS_SBC_OVR_MIN, LIVEOPS_SBC_OVR_MAX);
    if (minOvrAvg == null) return bad('req.minOvrAvg', `minOvrAvg precisa ser inteiro ${LIVEOPS_SBC_OVR_MIN}..${LIVEOPS_SBC_OVR_MAX}`);
    req.minOvrAvg = minOvrAvg;
  }
  if (raw.req.minTier !== undefined) {
    const minTier = readInt(raw.req.minTier, LIVEOPS_SBC_TIER_MIN, LIVEOPS_SBC_TIER_MAX);
    if (minTier == null) return bad('req.minTier', `minTier precisa ser inteiro ${LIVEOPS_SBC_TIER_MIN}..${LIVEOPS_SBC_TIER_MAX}`);
    req.minTier = minTier;
  }
  if (!req.sameOrg && !req.sameCountry && !req.sameRegion && req.minOvrAvg == null && req.minTier == null) {
    return bad('req', 'SBC precisa de ao menos uma restrição além do count (senão vira faucet de credits)');
  }

  if (!isPlainObject(raw.reward)) return bad('reward', 'reward precisa ser um objeto');
  const reward: LiveopsSbcPayload['reward'] = {};
  if (raw.reward.credits !== undefined) {
    const credits = readInt(raw.reward.credits, 0, LIVEOPS_SBC_CREDITS_MAX);
    if (credits == null) return bad('reward.credits', `credits precisa ser inteiro 0..${LIVEOPS_SBC_CREDITS_MAX}`);
    if (credits > 0) reward.credits = credits;
  }
  if (raw.reward.card !== undefined) {
    const card = String(raw.reward.card ?? '');
    if (!(LIVEOPS_RARITIES as readonly string[]).includes(card)) {
      return bad('reward.card', `card precisa ser uma raridade válida: ${LIVEOPS_RARITIES.join(', ')}`);
    }
    reward.card = card as LiveopsRarity;
  }
  if (reward.credits == null && reward.card == null) return bad('reward', 'reward precisa de credits > 0 ou card');

  return { ok: true, payload: { name, desc, req, reward } };
}

// Aviso: texto puro curto — sem HTML, sem link ativo (o cliente renderiza como texto).
export function validateNoticePayload(raw: unknown): LiveopsValidation<LiveopsNoticePayload> {
  if (!isPlainObject(raw)) return bad('payload', 'payload precisa ser um objeto');
  const title = readStr(raw.title, 60);
  if (!title) return bad('title', 'título obrigatório (1..60 caracteres)');
  const body = readStr(raw.body, 280);
  if (!body) return bad('body', 'corpo obrigatório (1..280 caracteres)');
  return { ok: true, payload: { title, body } };
}

// dispatcher por kind — o upsert e a rota usam este.
export function validateLiveopsPayload(kind: string, raw: unknown): LiveopsValidation<LiveopsPayload> {
  if (kind === 'promo') return validatePromoPayload(raw);
  if (kind === 'sbc') return validateSbcPayload(raw);
  if (kind === 'notice') return validateNoticePayload(raw);
  return bad('kind', `kind precisa ser um de: ${LIVEOPS_KINDS.join(', ')}`);
}

// janela: datas válidas, fim depois do início, duração ≤ 45 dias.
export function validateLiveopsWindow(startsAt: string, endsAt: string): LiveopsValidation<{ startsAt: string; endsAt: string }> {
  const start = Date.parse(String(startsAt ?? ''));
  if (!Number.isFinite(start)) return bad('startsAt', 'startsAt precisa ser data ISO válida');
  const end = Date.parse(String(endsAt ?? ''));
  if (!Number.isFinite(end)) return bad('endsAt', 'endsAt precisa ser data ISO válida');
  if (end <= start) return bad('endsAt', 'endsAt precisa ser depois de startsAt');
  if (end - start > LIVEOPS_MAX_WINDOW_DAYS * 86_400_000) {
    return bad('endsAt', `janela máxima é ${LIVEOPS_MAX_WINDOW_DAYS} dias`);
  }
  return { ok: true, payload: { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() } };
}

// ------------------------------------------------------------------ schema

// DDL idempotente (padrão ensureSchema das rotas; a rota roda 1× por instância).
export function liveopsSchemaQueries(sql: SqlTag): SqlQuery[] {
  return [
    sql`CREATE TABLE IF NOT EXISTS rtm_liveops (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by TEXT NOT NULL DEFAULT 'admin'
    )`,
    sql`CREATE INDEX IF NOT EXISTS rtm_liveops_window_idx ON rtm_liveops (enabled, starts_at, ends_at)`,
  ];
}

// ------------------------------------------------------------------ CRUD

function mapRow(r: Row): LiveopsRow {
  return {
    id: String(r.id ?? ''),
    kind: String(r.kind ?? '') as LiveopsKind,
    payload: (isPlainObject(r.payload) ? r.payload : {}) as unknown as LiveopsPayload,
    startsAt: String(r.starts_at ?? ''),
    endsAt: String(r.ends_at ?? ''),
    enabled: !!r.enabled,
    createdBy: String(r.created_by ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

// eventos ATIVOS agora: enabled + dentro da janela, ordenados por início (e id
// pra desempate estável), capados em LIVEOPS_MAX_ACTIVE. É o payload do jogo.
export async function activeLiveops(sql: SqlTag, now: Date): Promise<LiveopsRow[]> {
  const nowIso = now.toISOString();
  const rows = await sql`SELECT id, kind, payload, starts_at, ends_at, enabled, created_by, updated_at
    FROM rtm_liveops
    WHERE enabled AND starts_at <= ${nowIso} AND ends_at > ${nowIso}
    ORDER BY starts_at, id
    LIMIT ${LIVEOPS_MAX_ACTIVE}`;
  return rows.map(mapRow);
}

// lista COMPLETA pro CRM (inclui desabilitados/expirados), mais recentes primeiro.
export async function listLiveops(sql: SqlTag): Promise<LiveopsRow[]> {
  const rows = await sql`SELECT id, kind, payload, starts_at, ends_at, enabled, created_by, updated_at
    FROM rtm_liveops ORDER BY starts_at DESC, id LIMIT 200`;
  return rows.map(mapRow);
}

// cria/atualiza um evento — VALIDA TUDO (id, kind, payload, janela) antes do banco.
export async function upsertLiveop(sql: SqlTag, input: LiveopsUpsertInput): Promise<LiveopsUpsertResult> {
  const id = String(input.id ?? '').trim().toLowerCase();
  if (!SLUG.test(id)) return bad('id', 'id precisa ser slug (a-z, 0-9, hífen; 2..64 caracteres)');
  const kind = String(input.kind ?? '');
  if (!(LIVEOPS_KINDS as readonly string[]).includes(kind)) {
    return bad('kind', `kind precisa ser um de: ${LIVEOPS_KINDS.join(', ')}`);
  }
  const payload = validateLiveopsPayload(kind, input.payload);
  if (!payload.ok) return payload;
  const window = validateLiveopsWindow(input.startsAt, input.endsAt);
  if (!window.ok) return window;

  const enabled = input.enabled !== false; // default true
  const createdBy = readStr(input.createdBy, 80) ?? 'admin';
  const payloadJson = JSON.stringify(payload.payload);
  const rows = await sql`INSERT INTO rtm_liveops (id, kind, payload, starts_at, ends_at, enabled, created_by, updated_at)
    VALUES (${id}, ${kind}, ${payloadJson}::jsonb, ${window.payload.startsAt}, ${window.payload.endsAt}, ${enabled}, ${createdBy}, now())
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind,
      payload = EXCLUDED.payload,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      enabled = EXCLUDED.enabled,
      updated_at = now()
    RETURNING id, kind, payload, starts_at, ends_at, enabled, created_by, updated_at`;
  return { ok: true, row: mapRow(rows[0] ?? {}) };
}

// remove um evento; devolve se existia.
export async function deleteLiveop(sql: SqlTag, id: string): Promise<boolean> {
  const slug = String(id ?? '').trim().toLowerCase();
  if (!SLUG.test(slug)) return false;
  const rows = await sql`DELETE FROM rtm_liveops WHERE id=${slug} RETURNING id`;
  return rows.length > 0;
}
