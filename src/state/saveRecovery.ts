// Backup e recuperação de save pelo jogador [O0-12/O0-26].
//
// "Baixar backup (JSON)" aparece ANTES de qualquer opção destrutiva: na tela de
// erro de cada modo e no banner "Não consegui salvar". O arquivo guarda as
// chaves cruas do localStorage (parseadas quando são JSON), então dá pra
// reconstruir o save à mão ou pelo suporte, mesmo de um save que quebra a tela.
import { CAREER_SLOTS, getActiveSlot, slotKey } from './careerSaves';

export type SaveMode = 'career' | 'rtp' | 'ultimate' | 'daily';

const RTP_KEY = 'rtm-rtp-v1';
const ULTIMATE_KEY = 'rtm-ultimate-v1';
const DAILY_KEYS = ['rtm-daily-v1', 'rtm-daily-streak', 'rtm-serie-do-dia-v1'];
const SESSION_KEY = 'major-session-v3'; // campanha do Draft/Major (App.tsx)
const MANAGER_KEY = 'rtm-manager-v1';

// Chaves do save de UM modo (o que o reset daquele modo mexe).
export function modeSaveKeys(mode: SaveMode, careerSlot = getActiveSlot()): string[] {
  if (mode === 'career') { const k = slotKey(careerSlot); return [k, `${k}.bak`]; }
  if (mode === 'rtp') return [RTP_KEY, `${RTP_KEY}.bak`];
  if (mode === 'ultimate') return [ULTIMATE_KEY, `${ULTIMATE_KEY}.bak`];
  return [...DAILY_KEYS];
}

// Todas as chaves de progresso do jogador (backup completo do banner/crash global).
export function allSaveKeys(): string[] {
  const career = Array.from({ length: CAREER_SLOTS }, (_, i) => slotKey(i + 1));
  return [...career, RTP_KEY, ULTIMATE_KEY, ...DAILY_KEYS, SESSION_KEY, MANAGER_KEY];
}

export interface SaveBackup {
  app: 'major-cs';
  kind: 'save-backup';
  v: 1;
  mode: SaveMode | 'all';
  exportedAt: string;
  entries: Record<string, unknown>;
}

// Puro: monta o backup a partir de um leitor de chave. Chave ausente fica de
// fora; valor que não é JSON vai cru (string) — nada é descartado.
export function buildSaveBackup(mode: SaveMode | 'all', keys: string[], read: (k: string) => string | null, now: number): SaveBackup {
  const entries: Record<string, unknown> = {};
  for (const k of keys) {
    const raw = read(k);
    if (raw == null) continue;
    try { entries[k] = JSON.parse(raw); } catch { entries[k] = raw; }
  }
  return { app: 'major-cs', kind: 'save-backup', v: 1, mode, exportedAt: new Date(now).toISOString(), entries };
}

export function backupFileName(mode: SaveMode | 'all', now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `major-cs-backup-${mode}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

const readLocal = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };

// Dispara o download no navegador. Devolve false se não havia nada pra salvar
// ou o navegador recusou (a UI avisa).
export function downloadSaveBackup(mode: SaveMode | 'all'): boolean {
  const now = Date.now();
  const keys = mode === 'all' ? allSaveKeys() : modeSaveKeys(mode);
  const backup = buildSaveBackup(mode, keys, readLocal, now);
  if (Object.keys(backup.entries).length === 0) return false;
  try {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(mode, now);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
