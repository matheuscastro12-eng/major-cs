// Ultimate Squad — espelho "sombra" da economia (fase 3a do cutover server-side).
// O save local/cloud-save continua sendo a FONTE DA VERDADE pro jogador; este
// módulo apenas reflete cada mutação de credits/cartas como uma transação
// idempotente em /api/ultimate-economy (action 'tx'), pra que o ledger no Neon
// convirja em segundo plano. A fase 3b (futura) vira as leituras pro servidor.
//
// Regras de ouro:
//   - NUNCA bloqueia nem lança pro caminho da UI (tudo fire-and-forget + try/catch);
//   - conta GRÁTIS/deslogada: no-op total, zero rede (mesmo gate do cloud-save);
//   - op_id é gerado UMA vez no enqueue e PERSISTIDO junto da entrada — retry
//     reusa o mesmo op_id, e o UNIQUE (email, op_id) do servidor deduplica;
//   - NUNCA apaga/modifica o save local nem o cloud-save.

import { getToken } from './account';
import { cloudEnabled } from './cloud';
import { captureError } from './errlog';
import type { UltimateState } from '../engine/ultimate/state';

// kinds aceitos pela rota (subset de ULT_TX_KINDS do servidor — 'admin' é só dele)
export type UltShadowKind = 'grant' | 'spend' | 'pack' | 'quicksell' | 'sbc' | 'reward';

export interface ShadowCardOp {
  op: 'add' | 'remove';
  cardId: string;
  cardKey?: string;
  meta?: Record<string, unknown>;
}

interface ShadowEntry {
  opId: string; // gerado no enqueue e persistido — estável entre retries/reloads
  kind: UltShadowKind;
  creditsDelta: number;
  cards: ShadowCardOp[];
  meta?: Record<string, unknown>;
  t: number;
}

const QKEY = 'rtm-ultimate-shadow-q1'; // fila pendente (sobrevive a reload)
const DRIFT_KEY = 'rtm-ultimate-shadow-drift'; // '1' = perdemos txs → ledger divergiu
const MIGRATED_PREFIX = 'rtm-ultimate-shadow-migrated-v1:'; // + email (cache local; o guard real é o op_id)
const LOCAL_SAVE_KEY = 'rtm-ultimate-v1'; // espelho de KEY em ultimate.ts (só LEITURA aqui)
const QUEUE_CAP = 500; // acima disso derruba o mais antigo + marca drift
const TX_MAX_CARDS = 200; // espelho de ULT_TX_MAX_CARDS da rota
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// ------------------------------------------------------------------ estado

let queue: ShadowEntry[] | null = null; // lazy-load do localStorage
let flushing = false;
let failStreak = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function loadQueue(): ShadowEntry[] {
  if (queue) return queue;
  try {
    const raw = localStorage.getItem(QKEY);
    queue = raw ? (JSON.parse(raw) as ShadowEntry[]) : [];
    if (!Array.isArray(queue)) queue = [];
  } catch {
    queue = [];
  }
  return queue;
}

function saveQueue(): void {
  try { localStorage.setItem(QKEY, JSON.stringify(queue ?? [])); } catch { /* storage cheio — fila só em memória */ }
}

function markDrift(reason: string): void {
  // txs foram descartadas → o ledger do servidor NÃO reflete mais o save local.
  // A fase 3b usa esta flag pra saber que precisa de reconciliação completa.
  try { localStorage.setItem(DRIFT_KEY, '1'); } catch { /* best-effort */ }
  captureError(new Error(`ultimate-shadow drift: ${reason}`), 'ult-shadow');
}

export function shadowDrifted(): boolean {
  try { return localStorage.getItem(DRIFT_KEY) === '1'; } catch { return false; }
}

// uuid v4 (crypto.randomUUID quando existe; fallback pra ambientes antigos)
function makeOpId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* segue pro fallback */ }
  return `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// e-mail da conta logada, decodificado do próprio token (base64url("email|exp").sig)
// — só pra chavear a flag local de migração; o servidor re-verifica a assinatura.
function shadowEmail(): string | null {
  const t = getToken();
  if (!t) return null;
  try {
    const body = atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'));
    const email = body.split('|')[0];
    return email || null;
  } catch { return null; }
}

// -------------------------------------------------------------------- rede

// POST cru na rota da economia. Devolve o status HTTP (0 = falha de rede).
async function postTx(tx: { opId: string; kind: string; creditsDelta: number; cards: ShadowCardOp[]; meta?: Record<string, unknown> }): Promise<number> {
  const token = getToken();
  if (!token) return 401;
  try {
    const r = await fetch('/api/ultimate-economy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'tx', token, tx }),
    });
    return r.status;
  } catch { return 0; }
}

async function fetchServerState(): Promise<{ credits: number; cards: unknown[]; ledgerTail: unknown[] } | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const r = await fetch('/api/ultimate-economy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'state', token }),
    });
    if (!r.ok) return null;
    const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!d) return null;
    return {
      credits: Number(d.credits ?? 0),
      cards: Array.isArray(d.cards) ? d.cards : [],
      ledgerTail: Array.isArray(d.ledgerTail) ? d.ledgerTail : [],
    };
  } catch { return null; }
}

// -------------------------------------------------------------------- fila

function scheduleRetry(): void {
  if (retryTimer) return;
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(failStreak, 10));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushShadowQueue();
  }, delay);
}

// Drena a fila sequencialmente (uma tx por vez, na ordem). Nunca lança.
// - 2xx → remove da fila, zera o backoff;
// - 400/409 → tx irrecuperável (forma inválida / saldo do ledger divergiu):
//   descarta + marca drift, mas segue pras próximas;
// - 401/403 → conta deslogou/deixou de ser paga: para (fila fica pro próximo boot);
// - rede/429/5xx → para e agenda retry com backoff exponencial (op_id preservado).
export async function flushShadowQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    if (!cloudEnabled()) return;
    const q = loadQueue();
    while (q.length > 0) {
      const entry = q[0];
      const status = await postTx({
        opId: entry.opId,
        kind: entry.kind,
        creditsDelta: entry.creditsDelta,
        cards: entry.cards,
        meta: entry.meta,
      });
      if (status >= 200 && status < 300) {
        q.shift();
        saveQueue();
        failStreak = 0;
        continue;
      }
      if (status === 400 || status === 409) {
        // replay de op_id devolve 200; 409 aqui é insufficient_credits — o ledger
        // divergiu do save local (spend antes da migração etc.). Não tem retry útil.
        q.shift();
        saveQueue();
        markDrift(`tx dropped status=${status} kind=${entry.kind}`);
        continue;
      }
      if (status === 401 || status === 403) return; // sem conta paga — fila espera
      failStreak++;
      scheduleRetry();
      return;
    }
  } catch (e) {
    captureError(e, 'ult-shadow');
  } finally {
    flushing = false;
  }
}

// Enfileira uma tx-sombra e dispara o flush (fire-and-forget). Conta grátis ou
// deslogada: retorna sem tocar em NADA (nem storage de fila, nem rede).
export function shadowTx(kind: UltShadowKind, creditsDelta: number, cards: ShadowCardOp[] = [], meta?: Record<string, unknown>): void {
  try {
    if (!cloudEnabled()) return;
    if (creditsDelta === 0 && cards.length === 0) return;
    const q = loadQueue();
    // a rota aceita ≤200 card-ops por tx → fatia em várias txs (credits só na 1ª)
    for (let i = 0; i < Math.max(1, Math.ceil(cards.length / TX_MAX_CARDS)); i++) {
      q.push({
        opId: makeOpId(),
        kind,
        creditsDelta: i === 0 ? creditsDelta : 0,
        cards: cards.slice(i * TX_MAX_CARDS, (i + 1) * TX_MAX_CARDS),
        meta,
        t: Date.now(),
      });
    }
    while (q.length > QUEUE_CAP) {
      q.shift(); // derruba o mais antigo — e registra que o espelho quebrou
      markDrift('queue cap — oldest dropped');
    }
    saveQueue();
    void flushShadowQueue();
  } catch (e) {
    captureError(e, 'ult-shadow');
  }
}

// Diff entre dois estados do Ultimate → uma tx-sombra. É o funil usado pelo
// store: cada ação econômica chama isto com (antes, depois, kind, meta) e o
// delta de credits + cartas adicionadas/removidas sai do próprio estado —
// não dá pra "esquecer" um campo. Nunca lança.
export function mirrorUltimateChange(prev: UltimateState, next: UltimateState, kind: UltShadowKind, meta?: Record<string, unknown>): void {
  try {
    if (!cloudEnabled()) return;
    const creditsDelta = next.profile.credits - prev.profile.credits;
    const prevIds = new Set(prev.inventory.map((o) => o.id));
    const nextIds = new Set(next.inventory.map((o) => o.id));
    const cards: ShadowCardOp[] = [];
    for (const o of next.inventory) {
      if (prevIds.has(o.id)) continue;
      cards.push({
        op: 'add',
        cardId: o.id,
        cardKey: o.cardKey,
        meta: { via: o.acquiredVia, ...(o.boost ? { boost: o.boost } : {}), ...(o.serial != null ? { serial: o.serial } : {}) },
      });
    }
    for (const o of prev.inventory) {
      if (!nextIds.has(o.id)) cards.push({ op: 'remove', cardId: o.id });
    }
    if (creditsDelta === 0 && cards.length === 0) return;
    shadowTx(kind, creditsDelta, cards, meta);
  } catch (e) {
    captureError(e, 'ult-shadow');
  }
}

// --------------------------------------------------------------- migração

// Upload ONE-TIME da coleção existente pro ledger do servidor. Roda no boot
// (depois da reconciliação com o cloud-save, então o local já é o save "real").
//   - servidor NÃO-vazio → alguém já migrou (ou já operou lá): só grava a flag;
//   - save local virgem → nada a migrar (não grava flag: pode onboardar depois);
//   - senão manda a coleção em chunks de ≤200 cartas com op_ids DETERMINÍSTICOS
//     'migrate-v1:0', 'migrate-v1:1', … (credits só no chunk 0). Re-rodar é
//     seguro: o UNIQUE (email, op_id) faz o replay ser no-op no servidor.
// NUNCA modifica o save local nem o cloud-save.
export async function migrateIfNeeded(): Promise<'done' | 'skipped' | 'failed'> {
  try {
    if (!cloudEnabled()) return 'skipped';
    const email = shadowEmail();
    if (!email) return 'skipped';
    const flagKey = MIGRATED_PREFIX + email;
    try { if (localStorage.getItem(flagKey) === '1') return 'skipped'; } catch { /* segue sem cache */ }

    const server = await fetchServerState();
    if (!server) return 'failed'; // offline/erro — tenta de novo no próximo boot
    if (server.credits > 0 || server.cards.length > 0 || server.ledgerTail.length > 0) {
      try { localStorage.setItem(flagKey, '1'); } catch { /* best-effort */ }
      return 'skipped';
    }

    // lê o save local direto do storage (nunca escreve nele)
    let local: UltimateState | null = null;
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      local = raw ? (JSON.parse(raw) as UltimateState) : null;
    } catch { local = null; }
    if (!local || !local.profile) return 'skipped';
    // virgem (nunca onboardou, sem cartas nem partidas) → nada a migrar ainda
    const pristine = !local.profile.onboarded && local.inventory.length === 0 && (local.profile.w + local.profile.l) === 0;
    if (pristine) return 'skipped';

    const inv = local.inventory;
    const chunks = Math.max(1, Math.ceil(inv.length / TX_MAX_CARDS));
    for (let i = 0; i < chunks; i++) {
      const slice = inv.slice(i * TX_MAX_CARDS, (i + 1) * TX_MAX_CARDS);
      const status = await postTx({
        opId: `migrate-v1:${i}`, // determinístico → replay idempotente por chunk
        kind: 'grant',
        creditsDelta: i === 0 ? Math.max(0, Math.trunc(local.profile.credits) || 0) : 0,
        cards: slice.map((o) => ({
          op: 'add' as const,
          cardId: o.id,
          cardKey: o.cardKey,
          meta: { via: o.acquiredVia, ...(o.boost ? { boost: o.boost } : {}), ...(o.serial != null ? { serial: o.serial } : {}) },
        })),
        meta: { migrate: 'v1', chunk: i, of: chunks },
      });
      // 2xx (aplicou ou replay) segue; qualquer outra coisa aborta — o próximo
      // boot recomeça do zero e os chunks já gravados viram replays no-op.
      if (!(status >= 200 && status < 300)) return 'failed';
    }
    try { localStorage.setItem(flagKey, '1'); } catch { /* best-effort */ }
    return 'done';
  } catch (e) {
    captureError(e, 'ult-shadow');
    return 'failed';
  }
}

// Boot do espelho: migração one-time (se preciso) e depois drena a fila que
// sobrou de sessões anteriores. Fire-and-forget — chamado após a reconciliação
// do slot 'ultimate' com a nuvem, nunca bloqueia a UI.
export function bootUltimateShadow(): void {
  void (async () => {
    try {
      await migrateIfNeeded();
      await flushShadowQueue();
    } catch (e) {
      captureError(e, 'ult-shadow');
    }
  })();
}
