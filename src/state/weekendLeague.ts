// Cliente do "Major da Semana" (Weekend League) — fala com api/weekend-league.ts.
// Mesmo padrão de ranking.ts: POST com token da conta, erro vira Error com a
// mensagem do servidor. Além do CRUD da tela, expõe o ESPELHO de report:
// quando uma ranqueada 1v1 termina, o cliente também manda o resultado pra
// weekend league — gateado por um marcador LOCAL barato de inscrição (janela
// corrente), fire-and-forget. O gate local pode ficar stale sem problema:
// o servidor é quem decide (janela, registro, pareamento, cap de 10).
import { getToken } from './account';

export interface WlWindow { id: string; startsAt: string; endsAt: string; open: boolean; }
export interface WlEntry {
  windowId: string; division: string; elo: number;
  wins: number; losses: number; claimed: boolean; runComplete: boolean;
}
export interface WlStanding { rank: number; nick: string; division: string; wins: number; losses: number; }
export interface WlRewardTier { minWins: number; credits: number; card?: string; name: string; }
export interface WlStatus { window: WlWindow; entry: WlEntry | null; standings: WlStanding[]; rewardTiers: WlRewardTier[]; }
export interface WlClaimOutcome { replayed: boolean; tier: WlRewardTier; wins: number; credits: number; }

export const WL_MAX_MATCHES = 10;

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch('/api/weekend-league', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, token: getToken() ?? '' }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : 'erro';
    throw new Error(msg);
  }
  return data;
}

// ------------------------------------------------- gate local de inscrição
// Marcador {windowId, endsAt} no localStorage: o hook do espelho de report lê
// isso em vez de bater no servidor a cada partida. Atualizado pelo status e
// pelo register da tela WeekendLeague.

const REG_KEY = 'rtm-wl-reg-v1';

function rememberRegistration(win: WlWindow): void {
  try { localStorage.setItem(REG_KEY, JSON.stringify({ windowId: win.id, endsAt: win.endsAt })); } catch { /* sem storage */ }
}
function forgetRegistration(): void {
  try { localStorage.removeItem(REG_KEY); } catch { /* sem storage */ }
}
export function localWlRegistration(): { windowId: string } | null {
  try {
    const raw = localStorage.getItem(REG_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { windowId?: unknown; endsAt?: unknown };
    if (typeof p.windowId !== 'string' || typeof p.endsAt !== 'string') return null;
    if (Date.now() >= Date.parse(p.endsAt)) return null; // janela já fechou
    return { windowId: p.windowId };
  } catch { return null; }
}

// --------------------------------------------------------------------- API

export async function fetchWlStatus(): Promise<WlStatus> {
  const d = (await post({ action: 'status' })) as unknown as WlStatus;
  // sincroniza o gate local do espelho de report com a verdade do servidor
  if (d.window?.open && d.entry) rememberRegistration(d.window);
  else if (d.window?.open) forgetRegistration();
  return d;
}

export async function wlRegister(win: WlWindow): Promise<WlEntry> {
  const d = await post({ action: 'register', windowId: win.id });
  rememberRegistration(win);
  return d.entry as WlEntry;
}

export async function wlClaim(windowId: string): Promise<WlClaimOutcome> {
  const d = await post({ action: 'claim', windowId });
  return { replayed: !!d.replayed, tier: d.tier as WlRewardTier, wins: Number(d.wins ?? 0), credits: Number(d.credits ?? 0) };
}

// Espelho do report da ranqueada: fire-and-forget, NUNCA lança nem perturba o
// fluxo do ranking. Só dispara se o gate local diz que estou inscrito na
// janela corrente (stale ok — o servidor rejeita o que não vale).
export function wlMirrorReport(won: boolean, matchCode: string, oppNick: string): void {
  try {
    const reg = localWlRegistration();
    if (!reg || !matchCode || !getToken()) return;
    void post({ action: 'report', windowId: reg.windowId, matchCode, won, oppNick }).catch(() => { /* espelho best-effort */ });
  } catch { /* nunca propaga pro fluxo da ranqueada */ }
}
