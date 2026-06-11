// Edições (overrides) dos times/jogadores reais importados do bo3.gg, usados
// só no modo carreira. Guardadas em localStorage e aplicadas em runtime sobre
// CS2_REAL_2026 - assim dá pra ajustar OVR/role/tag sem reimportar a API.
import type { Player, Role, TeamSeason } from '../types';

const KEY = 'rtm-bo3-edits-v1';

export interface PlayerEdit { ovr?: number; role?: Role; nick?: string }
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

// recompõe os atributos a partir do OVR + role (mesma lógica da importação)
export function attrsFromOvr(ovr: number, role: Role): Pick<Player, 'aim' | 'consistency' | 'clutch' | 'awp' | 'igl'> {
  return {
    aim: ovr,
    consistency: ovr,
    clutch: Math.max(40, ovr - 2),
    awp: role === 'AWP' ? ovr : Math.max(40, ovr - 26),
    igl: role === 'IGL' ? ovr : Math.max(35, ovr - 30),
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
      const withMeta = { ...p, role, nick: pe.nick ?? p.nick };
      return pe.ovr != null ? { ...withMeta, ...attrsFromOvr(pe.ovr, role) } : withMeta;
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
