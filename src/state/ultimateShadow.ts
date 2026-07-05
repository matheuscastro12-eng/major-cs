// Ultimate Squad — espelho "sombra" da economia (fase 3a) + FLIP (fase 3b).
// O save local/cloud-save continua sendo a FONTE DA VERDADE pro jogador; este
// módulo reflete cada mutação de credits/cartas como uma transação idempotente
// em /api/ultimate-economy (action 'tx'), pra que o ledger no Neon convirja.
// A fase 3b (aqui) vira os caminhos cheat-críticos pro servidor:
//   - pack open de conta paga rola NO SERVIDOR (openPackOnServer, action
//     'packOpen') com op_id crash-safe — fallback local se a rede falhar;
//   - no boot, reconciliação defensiva servidor↔local (reconcileFlip):
//     LOCAL VENCE e o servidor é trazido até ele via tx 'admin' auditável.
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

// kinds aceitos pela rota (subset de ULT_TX_KINDS do servidor). 'admin' entrou
// na fase 3b: é o kind da tx de reconciliação (meta {src:'reconcile-3b'}).
export type UltShadowKind = 'grant' | 'spend' | 'pack' | 'quicksell' | 'sbc' | 'reward' | 'admin';

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

async function fetchServerState(): Promise<{ credits: number; cards: { cardId: string; cardKey: string }[]; ledgerTail: unknown[] } | null> {
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
    // desbloqueio do Passe Premium PAGO (R$ 30,00): não muda credits nem
    // cartas, mas o ledger PRECISA registrar a compra (auditoria de dinheiro
    // real — meta carrega o orderId do pedido pass-s<N>).
    if (creditsDelta === 0 && cards.length === 0 && meta?.src !== 'pass-premium-paid') return;
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
export async function openPackOnServer(packId: string): Promise<ServerPackResult | null> {
  try {
    if (!cloudEnabled()) return null;
    let pending = readPendingOpen();
    // pendente de OUTRO pack (crash antigo + jogador mudou de pack): descarta.
    // Se o servidor tiver aplicado aquela tx, a reconciliação do boot desfaz
    // (local vence) — não seguramos o jogador refém de um registro velho.
    if (pending && pending.packId !== packId) { clearPendingOpen(); pending = null; }
    let opId = pending?.opId ?? makeOpId();
    writePendingOpen({ opId, packId, t: Date.now() });
    let r = await postPackOpen(opId, packId);
    if (r.status === 409 && r.data?.error === 'op_conflict') {
      opId = makeOpId();
      writePendingOpen({ opId, packId, t: Date.now() });
      r = await postPackOpen(opId, packId);
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
        // reproduzir localmente → fallback local + drift (o boot reconcilia).
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

// Política v1 (defensiva): LOCAL VENCE, reconciliando o servidor PRA CIMA.
// Racional: o shadow/ledger acabou de nascer e NÃO teve tempo de "assar" — o
// servidor tem, na melhor hipótese, dias de dados; o save local (sincronizado
// via cloud-save há meses) é a fonte madura. Divergiu → enfileira UMA tx
// 'admin' (meta {src:'reconcile-3b'}) com o diff exato (delta de credits +
// add/remove de cartas) que traz o servidor até o local. O ledger continua
// append-only e auditável — nada é apagado nem reescrito.
// Guardas defensivos:
//   - fila-sombra não drenada → pula (as txs pendentes ainda vão mudar o
//     servidor; comparar agora geraria um diff falso/duplicado — o próximo
//     boot, com a fila vazia, reconcilia);
//   - save local virgem → pula (default de boot não "vence" nada);
//   - servidor inacessível → pula (tenta no próximo boot).
async function reconcileFlip(): Promise<void> {
  try {
    if (!cloudEnabled()) return;
    if (loadQueue().length > 0) return;
    const server = await fetchServerState();
    if (!server) return;
    let local: UltimateState | null = null;
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      local = raw ? (JSON.parse(raw) as UltimateState) : null;
    } catch { local = null; }
    if (!local || !local.profile || !Array.isArray(local.inventory)) return;
    const pristine = !local.profile.onboarded && local.inventory.length === 0 && (local.profile.w + local.profile.l) === 0;
    if (pristine) return;

    const localCredits = Math.max(0, Math.trunc(local.profile.credits) || 0);
    const serverIds = new Set(server.cards.map((c) => c.cardId));
    const localIds = new Set(local.inventory.map((o) => o.id));
    const creditsDelta = localCredits - server.credits;
    const adds: ShadowCardOp[] = local.inventory
      .filter((o) => !serverIds.has(o.id))
      .map((o) => ({
        op: 'add' as const,
        cardId: o.id,
        cardKey: o.cardKey,
        meta: { via: o.acquiredVia, ...(o.boost ? { boost: o.boost } : {}), ...(o.serial != null ? { serial: o.serial } : {}) },
      }));
    const removes: ShadowCardOp[] = server.cards
      .filter((c) => !localIds.has(c.cardId))
      .map((c) => ({ op: 'remove' as const, cardId: c.cardId }));

    if (creditsDelta === 0 && adds.length === 0 && removes.length === 0) {
      clearFlipDrift(); // convergiu — qualquer drift anotado já foi absorvido
      return;
    }
    // log só com TAMANHOS (nunca despeja cartas/coleção no errlog)
    captureError(
      new Error(`ult-flip divergência: creditsΔ=${creditsDelta} adds=${adds.length} removes=${removes.length} local=${localIds.size} server=${serverIds.size}`),
      'ult-flip-reconcile',
    );
    // shadowTx fatia >200 card-ops em várias txs e já dispara o flush
    shadowTx('admin', creditsDelta, [...adds, ...removes], { src: 'reconcile-3b' });
    clearFlipDrift();
  } catch (e) {
    captureError(e, 'ult-flip-reconcile');
  }
}

// Boot do espelho: migração one-time (se preciso), drena a fila que sobrou de
// sessões anteriores e roda a reconciliação defensiva da fase 3b (servidor é
// trazido até o local — ver reconcileFlip). Fire-and-forget — chamado após a
// reconciliação do slot 'ultimate' com a nuvem, nunca bloqueia a UI.
export function bootUltimateShadow(): void {
  void (async () => {
    try {
      await migrateIfNeeded();
      await flushShadowQueue();
      await reconcileFlip();
    } catch (e) {
      captureError(e, 'ult-shadow');
    }
  })();
}
