// Edições (overrides) dos times/jogadores reais importados do bo3.gg, usados
// só no modo carreira. Guardadas em localStorage e aplicadas em runtime sobre
// CS2_REAL_2026 - assim dá pra ajustar OVR/role/tag sem reimportar a API.
import type { Player, Role, TeamSeason } from '../types';

const KEY = 'rtm-bo3-edits-v1';

export interface PlayerEdit {
  ovr?: number; role?: Role; role2?: Role | null; nick?: string; age?: number;
  // stats individuais: têm prioridade sobre o OVR derivado (edição fina no CRM)
  aim?: number; consistency?: number; clutch?: number; awp?: number; igl?: number;
}
const STAT_KEYS = ['aim', 'consistency', 'clutch', 'awp', 'igl'] as const;
export interface TeamEdit { teamwork?: number; tag?: string; name?: string }
export interface Bo3Edits {
  players: Record<string, PlayerEdit>;
  teams: Record<string, TeamEdit>;
}

export function loadBo3Edits(): Bo3Edits {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const e = JSON.parse(raw) as Bo3Edits;
      return { players: e.players ?? {}, teams: e.teams ?? {} };
    }
  } catch { /* ignore */ }
  return { players: {}, teams: {} };
}

export function saveBo3Edits(e: Bo3Edits): void {
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* sem storage */ }
}

// junta edições: `over` (local do editor) tem prioridade sobre `base` (servidor).
// Assim o sync do servidor NUNCA apaga uma edição local que o admin acabou de fazer.
export function mergeBo3Edits(base: Bo3Edits, over: Bo3Edits): Bo3Edits {
  return {
    players: { ...base.players, ...over.players },
    teams: { ...base.teams, ...over.teams },
  };
}

// recompõe os atributos a partir do OVR + role (mesma lógica da importação).
// role2 conta junto: um AWP+IGL ganha os dois stats altos a partir do OVR.
export function attrsFromOvr(ovr: number, role: Role, role2?: Role | null): Pick<Player, 'aim' | 'consistency' | 'clutch' | 'awp' | 'igl'> {
  const isAwp = role === 'AWP' || role2 === 'AWP';
  const isIgl = role === 'IGL' || role2 === 'IGL';
  return {
    aim: ovr,
    consistency: ovr,
    clutch: Math.max(40, ovr - 2),
    awp: isAwp ? ovr : Math.max(40, ovr - 26),
    igl: isIgl ? ovr : Math.max(35, ovr - 30),
  };
}

// aplica os overrides sobre a lista de times reais
export function applyBo3Edits(teams: TeamSeason[], e: Bo3Edits = loadBo3Edits()): TeamSeason[] {
  return teams.map((t) => {
    const te = e.teams[t.id];
    const players = t.players.map((p) => {
      const pe = e.players[p.id];
      if (!pe) return p;
      const role = pe.role ?? p.role;
      const role2 = pe.role2 === null ? undefined : (pe.role2 ?? p.role2);
      let np = { ...p, role, role2, nick: pe.nick ?? p.nick };
      if (pe.age != null) np.age = pe.age;
      if (pe.ovr != null) np = { ...np, ...attrsFromOvr(pe.ovr, role, role2) };
      // stats individuais sobrescrevem o OVR derivado (edição fina do admin)
      for (const k of STAT_KEYS) if (pe[k] != null) np[k] = Math.max(40, Math.min(99, pe[k]!));
      return np;
    });
    if (!te) return { ...t, players };
    return {
      ...t,
      players,
      teamwork: te.teamwork ?? t.teamwork,
      tag: te.tag ?? t.tag,
      team: te.name ?? t.team,
    };
  });
}

// ----- edições GLOBAIS (servem pra TODOS os usuários, via Neon) -----
const API = '/api/bo3-edits';
// busca as edições globais do servidor (fonte da verdade). Retorna null offline.
export async function fetchBo3Edits(): Promise<Bo3Edits | null> {
  try {
    const r = await fetch(API, { cache: 'no-store', signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { edits?: Bo3Edits };
    const e = j?.edits;
    if (e && typeof e === 'object') return { players: e.players ?? {}, teams: e.teams ?? {} };
  } catch { /* offline: cai no cache local */ }
  return null;
}
// salva as edições globalmente (só o admin; senha do AdminGate)
export async function pushBo3Edits(edits: Bo3Edits, password: string): Promise<boolean> {
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, edits }),
      signal: AbortSignal.timeout(12000),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
    return r.ok && j?.ok === true;
  } catch {
    return false;
  }
}
