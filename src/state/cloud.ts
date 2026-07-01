// Save na nuvem (conta vitalícia): sincroniza chaves do localStorage com a conta,
// last-write-wins por timestamp. O grátis ignora tudo isso (save só local).
import { getToken } from './account';

const TS = (key: string) => `${key}.cloudts`;
export const localSavedAt = (key: string): number => { try { return Number(localStorage.getItem(TS(key)) || 0); } catch { return 0; } };
export const markSavedAt = (key: string, ts = Date.now()): void => { try { localStorage.setItem(TS(key), String(ts)); } catch { /* sem storage */ } };

let enabled = false; // ligado só quando a conta é paga
export function setCloudEnabled(v: boolean) { enabled = v; }
export function cloudEnabled() { return enabled && !!getToken(); }

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/cloud-save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return null;
    return (await r.json().catch(() => null)) as Record<string, unknown> | null;
  } catch { return null; }
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

export async function pushCloud(slot: string, data: string, updatedAt: number): Promise<boolean> {
  if (!cloudEnabled()) return false;
  const d = await post({ action: 'push', token: getToken(), slot, data, updatedAt });
  return !!d?.ok;
}

// push com debounce: chamado a cada gravação local enquanto joga.
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
// cancela um push pendente do slot (ex.: ao apagar, pra não ressuscitar o save).
export function cancelCloudSave(slot: string) { clearTimeout(timers[slot]); delete timers[slot]; }
export function cloudOnLocalSave(slot: string, localKey: string, getData: () => string | null) {
  if (!cloudEnabled()) return;
  const ts = Date.now();
  markSavedAt(localKey, ts);
  clearTimeout(timers[slot]);
  timers[slot] = setTimeout(() => {
    const data = getData();
    if (data) void pushCloud(slot, data, ts);
  }, 2500);
}

// no login (conta paga): reconcilia a nuvem com o local. Devolve o que aconteceu.
// 'restored' = a nuvem era mais nova e foi gravada no localStorage (recarregar a tela).
export async function syncSlot(slot: string, localKey: string): Promise<'restored' | 'pushed' | 'none' | 'deleted'> {
  if (!cloudEnabled()) return 'none';
  let localData: string | null = null;
  try { localData = localStorage.getItem(localKey); } catch { /* sem storage */ }
  const localTs = localSavedAt(localKey);
  const cloud = await pullCloud(slot, localTs); // manda o ts local -> pull condicional

  // nuvem sem novidade (tem versão <= a minha e não é tombstone): não restaura.
  // Só re-sobe se o local for ESTRITAMENTE mais novo (mantém o servidor em dia);
  // igual = nada. Evita baixar o save inteiro de novo quando já está sincronizado.
  if (cloud?.unchanged) {
    if (localData && localTs > cloud.updatedAt) { markSavedAt(localKey, localTs); void pushCloud(slot, localData, localTs); return 'pushed'; }
    return 'none';
  }

  // tombstone na nuvem (data === '') mais nova/igual que o local: a exclusão venceu.
  // Apaga o local e NÃO re-sobe nada, senão o save ressuscitaria neste aparelho.
  const isTombstone = !!cloud && cloud.data === '';
  if (isTombstone && cloud.updatedAt >= localTs) {
    try { localStorage.removeItem(localKey); localStorage.removeItem(localKey + '.bak'); } catch { /* sem storage */ }
    markSavedAt(localKey, cloud.updatedAt);
    return 'deleted';
  }

  if (cloud?.data && (!localData || cloud.updatedAt > localTs)) {
    try { localStorage.setItem(localKey, cloud.data); } catch { return 'none'; }
    markSavedAt(localKey, cloud.updatedAt);
    return 'restored';
  }
  // só re-sobe o local quando ele é genuinamente mais novo (inclusive que um tombstone).
  if (localData && (cloud?.data == null || localTs > cloud.updatedAt)) {
    const ts = localTs || Date.now();
    markSavedAt(localKey, ts);
    void pushCloud(slot, localData, ts);
    return 'pushed';
  }
  return 'none';
}
