// LIVE-OPS (fase B, cliente) — consome o endpoint público /api/liveops ('active')
// com cache stale-while-revalidate: serve o cache (memória + localStorage) NA HORA
// e atualiza em segundo plano a cada 5 min. NUNCA bloqueia o jogo: offline/erro
// devolve o cache (ou lista vazia). Também expõe as chamadas ADMIN pro CRM
// (LiveopsCRM.tsx) — list/upsert/delete com senha de admin, erros de validação
// chegam como { field, error } pra destacar o input certo.
//
// Formas de payload ESPELHAM server/liveops.ts (a validação forte é do servidor;
// aqui só um guard estrutural pra nunca renderizar lixo de um cache antigo).

import type { SbcDef } from '../engine/ultimate/sbc';
import type { UltRarity } from '../engine/ultimate/rarities';

// ------------------------------------------------------------------ tipos

export const LIVEOPS_PROMO_FILTER_KEYS = ['br', 'eu', 'cis', 'americas', 'awp', 'igl', 'entry'] as const;
export type LiveopsPromoFilterKey = (typeof LIVEOPS_PROMO_FILTER_KEYS)[number];

export interface LiveopsPromoPayload {
  name: string;
  desc: string;
  color: string;                    // hex #rrggbb
  filterKey: LiveopsPromoFilterKey; // → PROMO_THEMES (o filtro compilado vive no cliente)
  ovrBoost: number;                 // 1..3
  packCost: number;                 // custo do Pacote Promo agendado
}

export interface LiveopsSbcPayload {
  name: string;
  desc: string;
  req: { count: number; sameOrg?: boolean; sameCountry?: boolean; sameRegion?: boolean; minOvrAvg?: number; minTier?: number };
  reward: { credits?: number; card?: UltRarity };
}

export interface LiveopsNoticePayload { title: string; body: string }

export type LiveopsItem =
  | { id: string; kind: 'promo'; payload: LiveopsPromoPayload; startsAt: string; endsAt: string }
  | { id: string; kind: 'sbc'; payload: LiveopsSbcPayload; startsAt: string; endsAt: string }
  | { id: string; kind: 'notice'; payload: LiveopsNoticePayload; startsAt: string; endsAt: string };

// linha completa do CRM (inclui enabled/janela de itens fora do ar)
export interface LiveopsRow {
  id: string;
  kind: 'promo' | 'sbc' | 'notice';
  payload: LiveopsPromoPayload | LiveopsSbcPayload | LiveopsNoticePayload;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  createdBy: string;
  updatedAt: string;
}

// ------------------------------------------------------------------ guards

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const int = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseItem(raw: unknown): LiveopsItem | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.startsAt) || !str(raw.endsAt)) return null;
  const base = { id: raw.id, startsAt: raw.startsAt, endsAt: raw.endsAt };
  const p = raw.payload;
  if (!isObj(p)) return null;
  if (raw.kind === 'promo') {
    if (!str(p.name) || !str(p.desc) || !str(p.color) || !int(p.ovrBoost) || !int(p.packCost)) return null;
    if (!(LIVEOPS_PROMO_FILTER_KEYS as readonly string[]).includes(String(p.filterKey))) return null;
    return { ...base, kind: 'promo', payload: { name: p.name, desc: p.desc, color: p.color, filterKey: p.filterKey as LiveopsPromoFilterKey, ovrBoost: p.ovrBoost, packCost: p.packCost } };
  }
  if (raw.kind === 'sbc') {
    if (!str(p.name) || !str(p.desc) || !isObj(p.req) || !int(p.req.count) || !isObj(p.reward)) return null;
    const req = p.req as LiveopsSbcPayload['req'];
    const reward = p.reward as LiveopsSbcPayload['reward'];
    return { ...base, kind: 'sbc', payload: { name: p.name, desc: p.desc, req, reward } };
  }
  if (raw.kind === 'notice') {
    if (!str(p.title) || !str(p.body)) return null;
    return { ...base, kind: 'notice', payload: { title: p.title, body: p.body } };
  }
  return null;
}

function parseItems(raw: unknown): LiveopsItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseItem).filter((x): x is LiveopsItem => x !== null);
}

// item dentro da janela AGORA — cache velho pode carregar item já expirado.
function withinWindow(it: LiveopsItem, now = Date.now()): boolean {
  const start = Date.parse(it.startsAt);
  const end = Date.parse(it.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now;
}

// ------------------------------------------------------------------ cache SWR

const LS_KEY = 'rtm-liveops-v1';
const TTL_MS = 5 * 60_000; // 5 min — mesmo max-age do endpoint

let mem: { items: LiveopsItem[]; fetchedAt: number } | null = null;
let inflight: Promise<LiveopsItem[]> | null = null;

type LiveopsListener = (items: LiveopsItem[]) => void;
const listeners = new Set<LiveopsListener>();

// avisa a UI quando um refresh em segundo plano muda os itens (SWR de verdade).
export function subscribeLiveops(fn: LiveopsListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function readCache(): { items: LiveopsItem[]; fetchedAt: number } | null {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: unknown; fetchedAt?: unknown };
    mem = { items: parseItems(parsed.items), fetchedAt: Number(parsed.fetchedAt) || 0 };
    return mem;
  } catch { return null; }
}

function writeCache(items: LiveopsItem[]): void {
  const prevJson = JSON.stringify(mem?.items ?? null);
  mem = { items, fetchedAt: Date.now() };
  try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); } catch { /* storage cheio — cache só em memória */ }
  if (JSON.stringify(items) !== prevJson) {
    for (const fn of listeners) { try { fn(items); } catch { /* listener quebrado não derruba os demais */ } }
  }
}

async function refresh(): Promise<LiveopsItem[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/liveops', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`liveops ${res.status}`);
      const data = (await res.json()) as { items?: unknown };
      const items = parseItems(data.items);
      writeCache(items);
      return items;
    } catch {
      // offline/erro: fica no cache (ou vazio) — o jogo nunca depende disto
      return readCache()?.items ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// leitura SÍNCRONA (memória/localStorage), filtrada pela janela — é o que o
// ensureCatalog/submitSbc usam sem esperar rede.
export function liveopsSnapshot(): LiveopsItem[] {
  return (readCache()?.items ?? []).filter((it) => withinWindow(it));
}

// SWR: cache fresco → devolve direto; cache velho → devolve JÁ e revalida em
// segundo plano; sem cache → espera a rede (com timeout; erro → []).
export async function fetchActiveLiveops(): Promise<LiveopsItem[]> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.items.filter((it) => withinWindow(it));
  if (cached) {
    void refresh();
    return cached.items.filter((it) => withinWindow(it));
  }
  return (await refresh()).filter((it) => withinWindow(it));
}

// ------------------------------------------------------------------ derivados

export interface ScheduledPromo { id: string; payload: LiveopsPromoPayload; endsAtMs: number }

// a promo agendada ativa (a 1ª, se o admin agendar mais de uma) — sobrepõe a mensal.
export function scheduledPromo(items: LiveopsItem[] = liveopsSnapshot()): ScheduledPromo | null {
  for (const it of items) {
    if (it.kind !== 'promo') continue;
    const end = Date.parse(it.endsAt);
    if (!Number.isFinite(end)) continue;
    return { id: it.id, payload: it.payload, endsAtMs: end };
  }
  return null;
}

export interface ScheduledSbc { def: SbcDef; endsAt: string }

// SBCs agendadas → SbcDef com id prefixado 'lo-' (nunca colide com as SBCS
// embutidas). checkSbc/submitSbc trabalham em cima da def — nada muda no engine.
export function scheduledSbcs(items: LiveopsItem[] = liveopsSnapshot()): ScheduledSbc[] {
  const out: ScheduledSbc[] = [];
  for (const it of items) {
    if (it.kind !== 'sbc') continue;
    out.push({
      def: { id: `lo-${it.id}`, name: it.payload.name, desc: it.payload.desc, req: it.payload.req, reward: it.payload.reward },
      endsAt: it.endsAt,
    });
  }
  return out;
}

// resolve uma SBC agendada pelo id 'lo-<slug>' (usado pelo submitSbc da store).
export function scheduledSbcById(sbcId: string): SbcDef | undefined {
  if (!sbcId.startsWith('lo-')) return undefined;
  return scheduledSbcs().find((s) => s.def.id === sbcId)?.def;
}

export interface ActiveNotice { id: string; payload: LiveopsNoticePayload; endsAt: string }

export function activeNotices(items: LiveopsItem[] = liveopsSnapshot()): ActiveNotice[] {
  return items.filter((it): it is Extract<LiveopsItem, { kind: 'notice' }> => it.kind === 'notice')
    .map((it) => ({ id: it.id, payload: it.payload, endsAt: it.endsAt }));
}

// dispensa de avisos: por id, persistida (o aviso não volta a cada visita).
const DISMISS_KEY = 'rtm-liveops-dismissed-v1';

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export function isNoticeDismissed(id: string): boolean {
  return readDismissed().includes(id);
}

export function dismissNotice(id: string): void {
  try {
    const cur = readDismissed();
    if (!cur.includes(id)) localStorage.setItem(DISMISS_KEY, JSON.stringify([...cur, id].slice(-50)));
  } catch { /* best-effort */ }
}

// ------------------------------------------------------------------ admin (CRM)

export interface LiveopsUpsertBody {
  id: string;
  kind: string;
  payload: unknown;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
}

export type LiveopsUpsertResult =
  | { ok: true; item: LiveopsRow }
  | { ok: false; error: string; field?: string };

async function adminPost(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/liveops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function adminListLiveops(password: string): Promise<LiveopsRow[] | null> {
  try {
    const res = await adminPost({ action: 'list', password });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: unknown };
    return Array.isArray(data.items) ? (data.items as LiveopsRow[]) : [];
  } catch { return null; }
}

export async function adminUpsertLiveop(password: string, input: LiveopsUpsertBody): Promise<LiveopsUpsertResult> {
  try {
    const res = await adminPost({ action: 'upsert', password, ...input });
    const data = (await res.json().catch(() => ({}))) as { item?: LiveopsRow; error?: string; field?: string };
    if (res.ok && data.item) return { ok: true, item: data.item };
    if (res.status === 401) return { ok: false, error: 'Senha de admin inválida — saia e entre de novo na área administrativa.' };
    return { ok: false, error: data.error ?? 'Erro ao salvar.', field: data.field };
  } catch {
    return { ok: false, error: 'API indisponível (em localhost o live-ops só funciona no deploy).' };
  }
}

export async function adminDeleteLiveop(password: string, id: string): Promise<boolean> {
  try {
    const res = await adminPost({ action: 'delete', password, id });
    return res.ok;
  } catch { return false; }
}
