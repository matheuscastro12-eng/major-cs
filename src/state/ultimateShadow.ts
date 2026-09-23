// Ultimate Squad — espelho "sombra" da economia (fase 3a) + FLIP (fase 3b).
// O save local/cloud-save continua sendo a FONTE DA VERDADE pro jogador; este
// módulo reflete as SAÍDAS de credits/cartas como transações idempotentes em
// /api/ultimate-economy (action 'tx'). A fase 3b vira os caminhos
// cheat-críticos pro servidor:
//   - pack open de conta paga rola NO SERVIDOR (openPackOnServer, action
//     'packOpen') com op_id crash-safe — fallback local se a rede falhar;
//   - no boot, leitura servidor↔local (reconcileFlip) — só diagnóstico.
//
// [O0-02] A rota `tx` só aceita do cliente spend/pack/sbc/quicksell, sem
// op:'add' e sem crédito positivo (o quicksell é valorado no servidor).
// Então o espelho manda SÓ a perna de saída (serverBoundTx): prêmios locais
// (daily, streak, meta, missões, Draft, evento…) e cartas ganhas no cliente
// ficam só no save até o O1-01 (vouchers do servidor). A reconciliação não
// sobe mais diferença nenhuma ("LOCAL VENCE" desligado) e a migração v1 (que
// mandava 'grant' com a coleção inteira) saiu. Crédito PAGO nasce no servidor
// (O0-46 — ver paidClaim.ts).
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

// kinds que o STORE usa pra rotular mutações. Só os de SERVER_KINDS saem pra
// rede ('grant'/'reward'/'admin' ficam locais desde o O0-02).
export type UltShadowKind = 'grant' | 'spend' | 'pack' | 'quicksell' | 'sbc' | 'reward' | 'admin';
const SERVER_KINDS: readonly UltShadowKind[] = ['spend', 'pack', 'sbc', 'quicksell']; // espelho de ULT_TX_CLIENT_KINDS

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
const PENDING_OPEN_KEY = 'rtm-ult-pending-open-v1'; // pack open server em voo (crash-safety do op_id)
const FLIP_DRIFT_KEY = 'rtm-ult-flip-drift'; // '1' = fallback/saldo divergente no flip → reconciliar no boot
const PACK_OPEN_TIMEOUT_MS = 10_000; // acima disso o jogador não espera: cai pro roll local
const FROZEN_KEY = 'rtm-ult-frozen-msg'; // [O0-02] mensagem de carteira congelada (vem do state)
const DIVERGE_LOG_KEY = 'rtm-ult-diverge-log-at'; // último log de divergência (1×/semana por aparelho)
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

// [O0-02] Recorta uma mutação local na parte que a rota aceita do cliente:
// kind de saída, só op:'remove', creditsDelta ≤ 0 (quicksell: ≥ 0 e só
// informativo — o servidor recalcula pelo card_key). null = nada a mandar
// (mutação 100% local: prêmio, carta ganha no cliente…).
export function serverBoundTx(kind: UltShadowKind, creditsDelta: number, cards: ShadowCardOp[]): { creditsDelta: number; cards: ShadowCardOp[] } | null {
  if (!SERVER_KINDS.includes(kind)) return null;
  const removes = cards.filter((c) => c.op === 'remove').map((c) => ({ op: 'remove' as const, cardId: c.cardId }));
  if (kind === 'quicksell') return removes.length ? { creditsDelta: Math.max(0, creditsDelta), cards: removes } : null;
  const delta = Math.min(0, creditsDelta);
  if (delta === 0 && removes.length === 0) return null;
  return { creditsDelta: delta, cards: removes };
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

async function fetchServerState(): Promise<{ credits: number; cards: { cardId: string; cardKey: string }[]; ledgerTail: unknown[]; frozenMessage: string | null } | null> {
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
    // cards normalizados pra {cardId, cardKey} — a reconciliação 3b compara por id
    const cards = (Array.isArray(d.cards) ? d.cards : []).map((c) => {
      const cc = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return {
        cardId: typeof cc.cardId === 'string' ? cc.cardId : '',
        cardKey: typeof cc.cardKey === 'string' ? cc.cardKey : '',
      };
    }).filter((c) => c.cardId);
    return {
      credits: Number(d.credits ?? 0),
      cards,
      ledgerTail: Array.isArray(d.ledgerTail) ? d.ledgerTail : [],
      frozenMessage: d.frozen === true && typeof d.frozenMessage === 'string' ? d.frozenMessage : null,
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
      // fila persistida por uma versão anterior pode ter 'grant'/'admin'/add:
      // recorta na regra do O0-02; se não sobrar nada, é só local — descarta.
      const bound = serverBoundTx(entry.kind, entry.creditsDelta, entry.cards);
      if (!bound) { q.shift(); saveQueue(); continue; }
      const status = await postTx({
        opId: entry.opId,
        kind: entry.kind,
        creditsDelta: bound.creditsDelta,
        cards: bound.cards,
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
    const bound = serverBoundTx(kind, creditsDelta, cards);
    if (!bound) return; // [O0-02] mutação só local (prêmio / carta ganha no cliente)
    ({ creditsDelta, cards } = bound);
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
        meta: { via: o.acquiredVia, ...(o.boost ? { boost: o.boost } : {}), ...(o.serial != null ? { serial: o.serial } : {}), ...(o.ed != null ? { ed: o.ed } : {}), ...(o.ev ? { ev: o.ev } : {}) }, // [URG-1] ed vai no JSON de meta (sem coluna nova)
      });
    }
    for (const o of prev.inventory) {
      if (!nextIds.has(o.id)) cards.push({ op: 'remove', cardId: o.id });
    }
    // (o desbloqueio do Passe Premium PAGO não passa mais por aqui: o servidor
    // grava pass:<season> no passClaim — O0-46)
    shadowTx(kind, creditsDelta, cards, meta);
  } catch (e) {
    captureError(e, 'ult-shadow');
  }
}

// --------------------------------------------------------------- migração

// [O0-02] A migração v1 (upload one-time da coleção como 'grant' com
// op_ids 'migrate-v1:<i>') saiu: a rota não aceita mais crédito nem carta do
// cliente. A coleção antiga continua no save; o servidor conhece só o que
// nasceu nele (packOpen, mercado, compras, prêmios do servidor).

// ------------------------------------------- fase 3b: pack open no servidor

// Flag de drift do FLIP: setada quando um packOpen server-side caiu pro
// fallback local (o servidor PODE ter aplicado a tx) ou quando o saldo
// devolvido divergiu do esperado. Puramente informativa — a reconciliação do
// boot roda sempre e converge; a flag só é limpa quando os lados batem.
export function markFlipDrift(reason: string): void {
  try { localStorage.setItem(FLIP_DRIFT_KEY, '1'); } catch { /* best-effort */ }
  captureError(new Error(`ult-flip drift: ${reason}`), 'ult-flip');
}

export function flipDrifted(): boolean {
  try { return localStorage.getItem(FLIP_DRIFT_KEY) === '1'; } catch { return false; }
}

function clearFlipDrift(): void {
  try { localStorage.removeItem(FLIP_DRIFT_KEY); } catch { /* best-effort */ }
}

// Registro do pack open EM VOO: persistido ANTES do fetch. Se a página morrer
// com a resposta no ar, a PRÓXIMA abertura do MESMO pack reusa o op_id e o
// servidor devolve as MESMAS cartas (replay do ledger) — nunca rola/debita 2×.
interface PendingOpen { opId: string; packId: string; t: number }

function readPendingOpen(): PendingOpen | null {
  try {
    const raw = localStorage.getItem(PENDING_OPEN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PendingOpen>;
    if (typeof p?.opId === 'string' && p.opId && typeof p.packId === 'string') {
      return { opId: p.opId, packId: p.packId, t: Number(p.t ?? 0) };
    }
    return null;
  } catch { return null; }
}

function writePendingOpen(p: PendingOpen): void {
  try { localStorage.setItem(PENDING_OPEN_KEY, JSON.stringify(p)); } catch { /* best-effort */ }
}

function clearPendingOpen(): void {
  try { localStorage.removeItem(PENDING_OPEN_KEY); } catch { /* best-effort */ }
}

export interface ServerPackCard { cardId: string; cardKey: string }
export interface ServerPackResult { credits: number; seed: number; replayed: boolean; cards: ServerPackCard[] }

// POST action 'packOpen' com timeout — o jogador está com o dedo no botão,
// não pode ficar pendurado (acima do timeout cai pro roll local).
async function postPackOpen(opId: string, packId: string): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const token = getToken();
  if (!token) return { status: 401, data: null };
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), PACK_OPEN_TIMEOUT_MS) : null;
  try {
    const r = await fetch('/api/ultimate-economy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'packOpen', token, op_id: opId, packId }),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    const data = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: r.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Abre um pack NO SERVIDOR (roll autoritativo — fase 3b). Devolve null quando
// o chamador deve usar o FALLBACK local (rede/rota indisponível, conta sem
// direito, saldo divergente) — nunca lança, nunca bloqueia.
// Crash-safety: op_id persistido em PENDING_OPEN_KEY ANTES do fetch; retry após
// crash reenvia o MESMO op_id e recebe as mesmas cartas (replay idempotente).
// 'op_conflict' (op_id já usado por tx que NÃO é pack — registro corrompido):
// descarta o pendente, gera op_id novo e tenta UMA vez.
export async function openPackOnServer(packId: string): Promise<ServerPackResult | { unavailable: true } | null> {
  try {
    if (!cloudEnabled()) return null;
    let pending = readPendingOpen();
    // pendente de OUTRO pack (crash antigo + jogador mudou de pack): descarta.
    // Se o servidor tiver aplicado aquela tx, fica como divergência só-log
    // (O0-02) — não seguramos o jogador refém de um registro velho.
    if (pending && pending.packId !== packId) { clearPendingOpen(); pending = null; }
    let opId = pending?.opId ?? makeOpId();
    writePendingOpen({ opId, packId, t: Date.now() });
    let r = await postPackOpen(opId, packId);
    if (r.status === 409 && r.data?.error === 'op_conflict') {
      opId = makeOpId();
      writePendingOpen({ opId, packId, t: Date.now() });
      r = await postPackOpen(opId, packId);
    }
    if (r.status === 409 && r.data?.error === 'pack_unavailable') {
      clearPendingOpen();
      return { unavailable: true };
    }
    if (r.status >= 200 && r.status < 300 && r.data) {
      const rawCards = Array.isArray(r.data.cards) ? r.data.cards : [];
      const cards: ServerPackCard[] = [];
      for (const c of rawCards) {
        if (!c || typeof c !== 'object') continue;
        const cc = c as Record<string, unknown>;
        const cardId = typeof cc.cardId === 'string' ? cc.cardId : '';
        const cardKey = typeof cc.cardKey === 'string' ? cc.cardKey : '';
        if (cardId && cardKey) cards.push({ cardId, cardKey });
      }
      clearPendingOpen();
      if (!cards.length) {
        // 2xx sem cartas aproveitáveis: o servidor aplicou algo que não dá pra
        // reproduzir localmente → fallback local + drift (só diagnóstico).
        markFlipDrift('packOpen 2xx sem cartas');
        return null;
      }
      return {
        credits: Number(r.data.credits ?? 0),
        seed: Number(r.data.seed ?? 0) >>> 0,
        replayed: r.data.replayed === true,
        cards,
      };
    }
    // Falha de rede/timeout (0), 5xx/429, 401/403 ou 409 de saldo: NUNCA
    // bloqueia — o chamador cai pro roll local (que espelha via shadow, como
    // sempre). O servidor PODE ter aplicado a tx (timeout) ou estar divergido
    // (409 insufficient): marca o drift e deixa a reconciliação do boot
    // convergir. O pendente é limpo: esta op não será re-tentada — o roll
    // local que sai agora é a versão que vale.
    clearPendingOpen();
    markFlipDrift(`packOpen fallback status=${r.status}`);
    return null;
  } catch (e) {
    captureError(e, 'ult-flip');
    clearPendingOpen();
    return null;
  }
}

// ---------------------------------------------- fase 3b: reconciliação boot

// [O0-02] Política atual: SÓ LEITURA. O "LOCAL VENCE" (tx 'admin' com o diff
// inteiro) transformava localStorage editado em crédito no servidor (ECON-02)
// e, com o O0-46, poderia até APAGAR crédito pago (local < servidor → delta
// negativo). Até o O1-01/O0-03 os dois lados divergem por desenho: prêmios
// ganhos no cliente ficam só no save. Aqui só:
//   - lê o state (e o aviso de carteira congelada, se houver);
//   - limpa a flag de drift do flip quando os lados batem;
//   - registra divergência (só TAMANHOS) no errlog no máximo 1×/semana por
//     aparelho, pra triagem — nunca manda tx.
async function reconcileFlip(): Promise<void> {
  try {
    if (!cloudEnabled()) return;
    if (loadQueue().length > 0) return;
    const server = await fetchServerState();
    if (!server) return;
    try {
      if (server.frozenMessage) localStorage.setItem(FROZEN_KEY, server.frozenMessage);
      else localStorage.removeItem(FROZEN_KEY);
    } catch { /* best-effort */ }
    let local: UltimateState | null = null;
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      local = raw ? (JSON.parse(raw) as UltimateState) : null;
    } catch { local = null; }
    if (!local || !local.profile || !Array.isArray(local.inventory)) return;
    const localCredits = Math.max(0, Math.trunc(local.profile.credits) || 0);
    const serverIds = new Set(server.cards.map((c) => c.cardId));
    const localIds = new Set(local.inventory.map((o) => o.id));
    const creditsDelta = localCredits - server.credits;
    const onlyLocal = local.inventory.filter((o) => !serverIds.has(o.id)).length;
    const onlyServer = server.cards.filter((c) => !localIds.has(c.cardId)).length;
    if (creditsDelta === 0 && onlyLocal === 0 && onlyServer === 0) {
      clearFlipDrift();
      return;
    }
    let last = 0;
    try { last = Number(localStorage.getItem(DIVERGE_LOG_KEY) ?? 0) || 0; } catch { /* segue */ }
    if (Date.now() - last < 7 * 24 * 3600_000) return;
    try { localStorage.setItem(DIVERGE_LOG_KEY, String(Date.now())); } catch { /* best-effort */ }
    captureError(
      new Error(`ult-flip divergência (só log): creditsΔ=${creditsDelta} soLocal=${onlyLocal} soServidor=${onlyServer}`),
      'ult-flip-reconcile',
    );
  } catch (e) {
    captureError(e, 'ult-flip-reconcile');
  }
}

// [O0-02] Carteira congelada pelo admin: mensagem padrão (7 dias pra
// contestar) lida no último boot. null = carteira ativa.
export function ultFrozenNotice(): string | null {
  try { return localStorage.getItem(FROZEN_KEY); } catch { return null; }
}

// Boot do espelho: drena a fila que sobrou de sessões anteriores e roda a
// leitura servidor↔local (só diagnóstico — ver reconcileFlip). Fire-and-forget
// — chamado após a reconciliação do slot 'ultimate' com a nuvem, nunca
// bloqueia a UI.
export function bootUltimateShadow(): void {
  void (async () => {
    try {
      await flushShadowQueue();
      await reconcileFlip();
    } catch (e) {
      captureError(e, 'ult-shadow');
    }
  })();
}
