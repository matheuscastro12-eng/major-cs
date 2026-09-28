// Save na nuvem (conta vitalícia): sincroniza chaves do localStorage com a conta,
// last-write-wins por timestamp. O grátis ignora tudo isso (save só local).
import { getToken } from './account';
import { encodeCloudPayload, hashCloudPayload } from './cloudCodec';
import { captureError } from './errlog';
import { writeWithQuotaRescue } from './storageQuota';
import { clearCloudBlock, getCloudBlock, setCloudBlock } from './saveHealth';

const TS = (key: string) => `${key}.cloudts`;
const FIRST_PUSH_DELAY_MS = 2500;
const MIN_PUSH_INTERVAL_MS = 30_000;
export const localSavedAt = (key: string): number => { try { return Number(localStorage.getItem(TS(key)) || 0); } catch { return 0; } };
export const markSavedAt = (key: string, ts = Date.now()): void => { try { localStorage.setItem(TS(key), String(ts)); } catch { /* sem storage */ } };

// ── Trava de sincronização por chave (persistida em `${key}.cloudhold`) ──────
// 'quota' [O0-27]: a nuvem tem um save MAIS NOVO que não coube no aparelho.
//   Enquanto a trava existir, o autosave daquele slot não sobe (o save local é
//   o velho) e o próximo sync ignora o timestamp local e tenta baixar de novo.
//   Persistida porque o RtP e o Ultimate carimbam `.cloudts` a cada gravação:
//   sem ela, o boot seguinte acharia o local "mais novo" e sobrescreveria a nuvem.
// 'reset' [O0-12]: o jogador recomeçou o modo pela tela de erro. Sem lápide na
//   nuvem: o sync não restaura (senão o save que quebrou voltaria) nem sobe
//   nada, até o primeiro save novo daquele slot, que destrava e sobe normal.
export type CloudHold = 'quota' | 'reset';
const HOLD = (key: string) => `${key}.cloudhold`;
const memHolds = new Map<string, CloudHold>(); // fallback quando nem 1 byte cabe no storage
export function cloudHold(localKey: string): CloudHold | null {
  try {
    const v = localStorage.getItem(HOLD(localKey));
    if (v === 'quota' || v === 'reset') return v;
  } catch { /* sem storage */ }
  return memHolds.get(localKey) ?? null;
}
export function setCloudHold(localKey: string, hold: CloudHold | null): void {
  if (hold) {
    memHolds.set(localKey, hold);
    writeWithQuotaRescue(HOLD(localKey), hold); // best-effort; a memória cobre a sessão
  } else {
    memHolds.delete(localKey);
    try { localStorage.removeItem(HOLD(localKey)); } catch { /* sem storage */ }
  }
}

let enabled = false; // ligado só quando a conta é paga
export function setCloudEnabled(v: boolean) { enabled = v; }
export function cloudEnabled() { return enabled && !!getToken(); }

// status 0 = nem chegou no servidor (offline). O corpo de erro pode não ser
// JSON (ex.: 413 da própria plataforma quando o body passa do limite dela).
type PostResult = { status: number; data: Record<string, unknown> | null };
async function postRaw(body: Record<string, unknown>, keepalive = false): Promise<PostResult> {
  try {
    const r = await fetch('/api/cloud-save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive,
    });
    const data = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: r.status, data };
  } catch { return { status: 0, data: null }; }
}
async function post(body: Record<string, unknown>, keepalive = false): Promise<Record<string, unknown> | null> {
  const r = await postRaw(body, keepalive);
  return r.status >= 200 && r.status < 300 ? r.data : null;
}

// `since` (opcional): timestamp que o cliente já tem. Se o servidor não tiver nada
// mais novo (e não for tombstone), devolve unchanged sem o blob — economiza banda.
export async function pullCloud(slot: string, since = 0): Promise<{ data: string | null; updatedAt: number; unchanged?: boolean } | null> {
  if (!cloudEnabled()) return null;
  const d = await post({ action: 'pull', token: getToken(), slot, since });
  if (!d) return null;
  if (d.unchanged) return { data: null, updatedAt: Number(d.updatedAt ?? since), unchanged: true };
  return { data: (d.data as string) ?? null, updatedAt: Number(d.updatedAt ?? 0) };
}

export type PushResult = { ok: true } | { ok: false; status: number; error: string; bytes: number };
export async function pushCloudDetailed(slot: string, data: string, updatedAt: number, keepalive = false): Promise<PushResult> {
  const bytes = new TextEncoder().encode(data).byteLength;
  if (!cloudEnabled()) return { ok: false, status: 0, error: 'nuvem desligada', bytes };
  const wire = await encodeCloudPayload(data);
  const r = await postRaw({ action: 'push', token: getToken(), slot, updatedAt, ...wire }, keepalive);
  if (r.status >= 200 && r.status < 300 && r.data?.ok) return { ok: true };
  // [O0-29] 409 = o servidor já tem versão mais nova deste slot. Conta como
  // "resolvido": re-tentar o mesmo snapshot a cada 30s não adianta (o servidor
  // sempre vai recusar); o próximo sync/pull reconcilia.
  if (r.status === 409 && r.data?.conflict) return { ok: true };
  const error = typeof r.data?.error === 'string' ? r.data.error : `HTTP ${r.status}`;
  return { ok: false, status: r.status, error, bytes };
}

export async function pushCloud(slot: string, data: string, updatedAt: number, keepalive = false): Promise<boolean> {
  return (await pushCloudDetailed(slot, data, updatedAt, keepalive)).ok;
}

// [O0-14/DADO-02] 413 NÃO é transitório: o mesmo payload volta 413 pra sempre.
// Antes o slot reenviava o save inteiro a cada 30s enquanto a aba vivesse
// (~1.300 chamadas/dia, sem aviso). Agora: para de tentar nesta sessão, mostra
// o aviso e registra a mensagem do servidor + o tamanho — o 413 cobre também
// JSON/UTF-8/payload inválido, então a causa "save > 2 MB" precisa ser provada.
export function isPermanentPushFailure(status: number): boolean {
  return status === 413;
}
function blockTooLarge(slot: string, localKey: string, error: string, bytes: number): void {
  cancelCloudSave(slot);
  setCloudBlock({ slot, localKey, reason: 'too-large', message: error, bytes, at: Date.now() });
  captureError(new Error(`cloud-save 413 [${slot}]: ${error} · ${bytes} bytes`), 'cloud-save-413');
}
// push fora da fila (reconciliação do sync): mesmo tratamento do 413.
function pushTracked(slot: string, localKey: string, data: string, updatedAt: number): void {
  void pushCloudDetailed(slot, data, updatedAt).then((r) => {
    if (!r.ok && isPermanentPushFailure(r.status)) blockTooLarge(slot, localKey, r.error, r.bytes);
  });
}

type PendingPush = { data: string; updatedAt: number; localKey: string };
type SlotSyncState = {
  pending?: PendingPush;
  timer?: ReturnType<typeof setTimeout>;
  inFlight: boolean;
  lastAttemptAt: number;
  lastUploadedHash?: string;
  lastUploadedAt?: number;
};

const slotStates = new Map<string, SlotSyncState>();
let lifecycleListenersInstalled = false;

function stateFor(slot: string): SlotSyncState {
  const existing = slotStates.get(slot);
  if (existing) return existing;
  const created: SlotSyncState = { inFlight: false, lastAttemptAt: 0 };
  slotStates.set(slot, created);
  return created;
}

function schedulePendingPush(slot: string): void {
  const state = stateFor(slot);
  if (!state.pending || state.timer || state.inFlight) return;
  const sinceAttempt = Date.now() - state.lastAttemptAt;
  const delay = state.lastAttemptAt === 0
    ? FIRST_PUSH_DELAY_MS
    : Math.max(FIRST_PUSH_DELAY_MS, MIN_PUSH_INTERVAL_MS - sinceAttempt);
  state.timer = setTimeout(() => {
    state.timer = undefined;
    void flushPendingPush(slot);
  }, delay);
}

function restoreFailedPush(slot: string, failed: PendingPush): void {
  const state = stateFor(slot);
  if (!state.pending || state.pending.updatedAt < failed.updatedAt) state.pending = failed;
}

async function flushPendingPush(slot: string, keepalive = false): Promise<void> {
  const state = stateFor(slot);
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }
  if (state.inFlight || !state.pending) return;

  const pending = state.pending;
  state.pending = undefined;
  state.inFlight = true;
  state.lastAttemptAt = Date.now();

  const hash = await hashCloudPayload(pending.data);
  if (hash && hash === state.lastUploadedHash) {
    // Persist redundante: mantém o timestamp da versão realmente enviada.
    if (state.lastUploadedAt && localSavedAt(pending.localKey) === pending.updatedAt) {
      markSavedAt(pending.localKey, state.lastUploadedAt);
    }
  } else {
    const res = await pushCloudDetailed(slot, pending.data, pending.updatedAt, keepalive);
    if (res.ok) {
      state.lastUploadedHash = hash ?? undefined;
      state.lastUploadedAt = pending.updatedAt;
    } else if (isPermanentPushFailure(res.status)) {
      // 413: parar. Reenviar o mesmo save só gasta invocação e banda.
      blockTooLarge(slot, pending.localKey, res.error, res.bytes);
    } else {
      // Falha transitória: conserva o snapshot mais novo para uma tentativa futura.
      restoreFailedPush(slot, pending);
    }
  }

  state.inFlight = false;
  if (!getCloudBlock(slot)) schedulePendingPush(slot);
}

function flushAllPending(keepalive: boolean): void {
  for (const slot of slotStates.keys()) void flushPendingPush(slot, keepalive);
}

function installLifecycleListeners(): void {
  if (lifecycleListenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
  lifecycleListenersInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAllPending(true);
  });
  window.addEventListener('pagehide', () => flushAllPending(true));
}

// cancela um push pendente do slot (ex.: ao apagar, pra não ressuscitar o save).
export function cancelCloudSave(slot: string) {
  const state = slotStates.get(slot);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  state.pending = undefined;
}

export function cloudOnLocalSave(slot: string, localKey: string, getData: () => string | null) {
  if (!cloudEnabled()) return;
  // slot travado nesta sessão (413 ou restore que não coube): não sobe nada.
  if (getCloudBlock(slot)) return;
  const hold = cloudHold(localKey);
  // restore pendente: o save local é o VELHO; subir agora apagaria o da nuvem.
  if (hold === 'quota') return;
  // primeiro save depois de recomeçar pela tela de erro: volta a sincronizar
  // (é este save novo que substitui o da nuvem — a lápide nunca é gravada).
  if (hold === 'reset') setCloudHold(localKey, null);
  const data = getData();
  if (!data) return;
  const ts = Date.now();
  markSavedAt(localKey, ts);
  const state = stateFor(slot);
  state.pending = { data, updatedAt: ts, localKey };
  installLifecycleListeners();
  schedulePendingPush(slot);
}

// no login (conta paga): reconcilia a nuvem com o local. Devolve o que aconteceu.
// 'restored' = a nuvem era mais nova e foi gravada no localStorage (recarregar a tela).
// 'quota' = a nuvem era mais nova mas NÃO coube no aparelho [O0-27]: o slot fica
// travado (nada sobe) e a UI pede pra liberar espaço.
export type SyncResult = 'restored' | 'pushed' | 'none' | 'deleted' | 'quota';

function restoreFailedByQuota(slot: string, localKey: string, error: unknown): SyncResult {
  setCloudHold(localKey, 'quota');
  cancelCloudSave(slot);
  const message = error instanceof Error ? error.message : String(error ?? 'quota');
  setCloudBlock({ slot, localKey, reason: 'quota', message, at: Date.now() });
  captureError(new Error(`cloud restore sem espaço [${slot}]: ${message}`), 'cloud-restore-quota');
  return 'quota';
}

// Grava o save baixado da nuvem com resgate de cota (libera .corrupt/.bak antes
// de desistir). Exportado pro caminho legado do RtP usar a mesma regra.
export function writeCloudRestore(slot: string, localKey: string, data: string, updatedAt: number): SyncResult {
  const w = writeWithQuotaRescue(localKey, data);
  if (!w.ok) return restoreFailedByQuota(slot, localKey, w.error);
  if (w.rescued) captureError(new Error(`quota rescue: ${w.freed} artefato(s) descartado(s) pra restaurar ${localKey}`), 'cloud-restore-quota-rescue');
  markSavedAt(localKey, updatedAt);
  if (cloudHold(localKey) === 'quota') setCloudHold(localKey, null);
  if (getCloudBlock(slot)?.reason === 'quota') clearCloudBlock(slot);
  return 'restored';
}

export async function syncSlot(slot: string, localKey: string): Promise<SyncResult> {
  if (!cloudEnabled()) return 'none';
  const hold = cloudHold(localKey);
  // recomeçou pela tela de erro: nem restaura o save que quebrou nem sobe nada.
  if (hold === 'reset') return 'none';
  // restore pendente por falta de espaço: o local é sabidamente o mais velho,
  // então o timestamp dele não vale — pede o save inteiro e tenta de novo.
  const restorePending = hold === 'quota';
  let localData: string | null = null;
  try { localData = localStorage.getItem(localKey); } catch { /* sem storage */ }
  const localTs = restorePending ? 0 : localSavedAt(localKey);
  const cloud = await pullCloud(slot, localTs); // manda o ts local -> pull condicional
  if (restorePending && !cloud) return 'quota'; // sem rede: mantém a trava, tenta no próximo sync

  // nuvem sem novidade (tem versão <= a minha e não é tombstone): não restaura.
  // Só re-sobe se o local for ESTRITAMENTE mais novo (mantém o servidor em dia);
  // igual = nada. Evita baixar o save inteiro de novo quando já está sincronizado.
  if (cloud?.unchanged) {
    if (localData && localTs > cloud.updatedAt) { markSavedAt(localKey, localTs); pushTracked(slot, localKey, localData, localTs); return 'pushed'; }
    return 'none';
  }

  // tombstone na nuvem (data === '') mais nova/igual que o local: a exclusão venceu.
  // Apaga o local e NÃO re-sobe nada, senão o save ressuscitaria neste aparelho.
  const isTombstone = !!cloud && cloud.data === '';
  if (isTombstone && cloud.updatedAt >= localTs) {
    try { localStorage.removeItem(localKey); localStorage.removeItem(localKey + '.bak'); } catch { /* sem storage */ }
    markSavedAt(localKey, cloud.updatedAt);
    if (restorePending) { setCloudHold(localKey, null); clearCloudBlock(slot); }
    return 'deleted';
  }

  if (cloud?.data && (!localData || cloud.updatedAt > localTs)) {
    return writeCloudRestore(slot, localKey, cloud.data, cloud.updatedAt);
  }
  if (restorePending) {
    // a nuvem ficou vazia: não há o que baixar, destrava e segue com o local.
    setCloudHold(localKey, null);
    clearCloudBlock(slot);
    return 'none';
  }
  // só re-sobe o local quando ele é genuinamente mais novo (inclusive que um tombstone).
  if (localData && (cloud?.data == null || localTs > cloud.updatedAt)) {
    const ts = localTs || Date.now();
    markSavedAt(localKey, ts);
    pushTracked(slot, localKey, localData, ts);
    return 'pushed';
  }
  return 'none';
}
