// Ponte Carreira → Legado (puro). Monta o pool da cena a partir dos times do
// mundo (o currentEra + o seu time) e fecha o ano: calcula os prêmios da cena
// do último ano fechado e grava no bloco `legado`. O CareerScreen só chama
// `closeLegadoYear` num efeito e passa os times — diff mínimo lá.

import type { Player, Role } from '../../types';
import type { SeasonStats } from '../career/seasonStats';
import type { WorldEventResult } from '../mundo/model';
import { computeSceneAwards, type ScenePlayer, type SceneTeam } from './premios';
import { legadoOf, pendingAwardYear, withYear, type LegadoState } from './model';

export interface LegadoTeamLike {
  id: string;
  tag: string;
  players: Player[];
  coach?: { nick: string };
  defunct?: boolean;
}

export interface LegadoWorldCtx {
  teams: LegadoTeamLike[];          // o seu time ('user') + os da IA
  ovrOf: (p: Player) => number;
  ageOf: (p: Player) => number | undefined;
  roleOf?: (p: Player, teamId: string) => Role;
  userCoachNick?: string;
  seasonStats: SeasonStats | undefined;
  results: WorldEventResult[];
}

const USER = 'user';

/** Pool da cena: titulares dos times (os 5 primeiros), um id por jogador. */
export function scenePool(ctx: LegadoWorldCtx): { players: ScenePlayer[]; teams: SceneTeam[] } {
  const players: ScenePlayer[] = [];
  const teams: SceneTeam[] = [];
  const seen = new Set<string>();
  for (const t of ctx.teams) {
    if (t.defunct || t.id === '__free__') continue;
    teams.push({ id: t.id, tag: t.tag, coachNick: t.id === USER ? (ctx.userCoachNick ?? t.coach?.nick ?? '—') : (t.coach?.nick ?? '—') });
    for (const p of t.players.slice(0, 5)) {
      const id = p.id.replace(/^user__/, '');
      if (seen.has(id)) continue;
      seen.add(id);
      players.push({
        id,
        statsId: t.id === USER ? `user__${id}` : p.id,
        nick: p.nick,
        country: p.country,
        role: ctx.roleOf?.(p, t.id) ?? p.role,
        age: ctx.ageOf(p),
        ovr: ctx.ovrOf(p),
        teamId: t.id,
        team: t.tag,
      });
    }
  }
  return { players, teams };
}

/**
 * Fecha o ano no legado: se há um ano fechado sem prêmios, calcula e devolve o
 * bloco novo; senão null (nada a gravar). Idempotente.
 */
export function closeLegadoYear(raw: unknown, split: number, ctx: LegadoWorldCtx): LegadoState | null {
  const lg = legadoOf(raw);
  const year = pendingAwardYear(lg, split);
  if (year == null) return null;
  const pool = scenePool(ctx);
  if (pool.players.length < 5) return null;
  const awards = computeSceneAwards({ year, players: pool.players, teams: pool.teams, seasonStats: ctx.seasonStats, results: ctx.results });
  return withYear(lg, awards);
}
