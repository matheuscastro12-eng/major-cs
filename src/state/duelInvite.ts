// [U11] convite de duelo pendente (localStorage) — capturado no boot pelo App,
// consumido pelo Ultimate ao abrir a aba Duelo. Expira em 6h (tempo máximo de
// vida de uma sala no servidor). Sem conta, sem PII.
import { parseDuelInvite } from '../engine/ultimate/duelInvite';
const KEY = 'rtm-ult-duel-invite-v1';
const TTL = 6 * 60 * 60 * 1000;
export function captureDuelInviteFromUrl(): string | null {
  try {
    const u = new URL(window.location.href);
    const code = parseDuelInvite(u.searchParams.get('duelo'));
    if (!code) return null;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    u.searchParams.delete('duelo');
    window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    return code;
  } catch { return null; }
}
export function loadDuelInvite(): string | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    const o = JSON.parse(raw) as { code?: unknown; at?: unknown };
    const code = parseDuelInvite(o.code); const at = Number(o.at) || 0;
    if (!code || Date.now() - at > TTL) { localStorage.removeItem(KEY); return null; }
    return code;
  } catch { return null; }
}
export function clearDuelInvite(): void { try { localStorage.removeItem(KEY); } catch { /* sem storage */ } }
export function hasDuelInvite(): boolean { return loadDuelInvite() !== null; }
