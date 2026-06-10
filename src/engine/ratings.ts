import { liquipediaTeamUrl, logoForTeam } from '../data/media';
import type { Coach, Game, Player, TeamSeason, TPlayer, TTeam } from '../types';
import { MAP_POOL } from '../types';

export function playerSkill(p: Pick<Player, 'aim' | 'clutch' | 'consistency'>): number {
  return p.aim * 0.6 + p.consistency * 0.25 + p.clutch * 0.15;
}

export function playerOvr(p: Pick<Player, 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'>): number {
  const spec = Math.max(p.awp, p.igl, p.aim);
  return Math.round(p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25);
}

export function toTPlayer(
  p: Player,
  meta: {
    fromTeam?: string;
    originTeam?: string;
    originTeamId?: string;
    originEra?: string;
    originGame?: Game;
    runtimeId?: string;
  } = {},
): TPlayer {
  return {
    ...p,
    id: meta.runtimeId ?? p.id,
    sourcePlayerId: p.id,
    skill: playerSkill(p),
    ovr: playerOvr(p),
    fromTeam: meta.fromTeam,
    originTeam: meta.originTeam,
    originTeamId: meta.originTeamId,
    originEra: meta.originEra,
    originGame: meta.originGame,
  };
}

function defaultPref(game: Game, map: string): number {
  if (game === 'CS2') return 0;
  if (map === 'ancient' || map === 'anubis') return game === 'CS:GO' ? -1.5 : -2.5;
  if (map === 'mirage' && (game === 'CS 1.6' || game === 'CS:Source')) return -1;
  return 0;
}

export function fullMapPrefs(game: Game | 'MIX', prefs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MAP_POOL) {
    out[m] = prefs[m] ?? (game === 'MIX' ? 0 : defaultPref(game, m));
  }
  return out;
}

export function teamStrengthFromPlayers(players: TPlayer[], teamwork: number): number {
  const avgSkill = players.reduce((s, p) => s + p.skill, 0) / players.length;
  const maxAwp = Math.max(...players.map((p) => p.awp));
  const maxIgl = Math.max(...players.map((p) => p.igl));
  const awpBonus = Math.max(0, (maxAwp - 70) / 9);
  const iglBonus = Math.max(0, (maxIgl - 70) / 8);
  return avgSkill * 0.72 + teamwork * 0.28 + awpBonus + iglBonus;
}

export interface SynergyReport {
  total: number;
  items: { label: string; value: number }[];
  hasAwp: boolean;
  hasIgl: boolean;
}

export function draftSynergy(players: TPlayer[]): SynergyReport {
  const items: { label: string; value: number }[] = [];

  const hasAwp = players.some((p) => p.awp >= 80);
  const hasIgl = players.some((p) => p.igl >= 80);
  const awpMains = players.filter((p) => p.role === 'AWP').length;
  const iglMains = players.filter((p) => p.role === 'IGL').length;
  const hasEntry = players.some((p) => p.role === 'Entry');
  const hasSupport = players.some((p) => p.role === 'Support' || p.role === 'Lurker');
  const distinctRoles = new Set(players.map((p) => p.role)).size;

  if (hasAwp) items.push({ label: 'AWPer dedicado segurando os lados', value: 2.5 });
  else items.push({ label: 'SEM AWPER: CT vira sofrimento', value: -8 });

  if (hasIgl) items.push({ label: 'IGL no comando das rondas', value: 3 });
  else items.push({ label: 'SEM IGL: sem leitura tatica em rounds fechados', value: -10 });

  if (awpMains >= 3) items.push({ label: 'AWPers demais brigando pela arma', value: -6 });
  else if (awpMains === 2) items.push({ label: 'Dois AWPers principais dividem o orcamento', value: -2.5 });
  if (iglMains >= 2) items.push({ label: 'Vozes de comando em conflito', value: -3 });
  if (hasEntry) items.push({ label: 'Entry fragger abrindo espaco', value: 2 });
  if (hasSupport) items.push({ label: 'Suporte/lurker fechando o mapa', value: 2 });
  if (distinctRoles === 5) items.push({ label: 'Composicao completa: cinco funcoes distintas', value: 3 });

  const byGame = new Map<string, number>();
  for (const p of players) {
    const g = p.originGame ?? p.fromTeam?.split('•')[0]?.trim() ?? '?';
    byGame.set(g, (byGame.get(g) ?? 0) + 1);
  }
  let eraPairs = 0;
  for (const n of byGame.values()) eraPairs += (n * (n - 1)) / 2;
  if (eraPairs > 0) items.push({ label: 'Quimica de era entre os jogadores', value: Math.min(3, eraPairs * 0.4) });

  const byCountry = new Map<string, number>();
  for (const p of players) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);
  let countryPairs = 0;
  let countryStack = 0;
  for (const n of byCountry.values()) {
    countryPairs += (n * (n - 1)) / 2;
    countryStack = Math.max(countryStack, n);
  }
  if (countryPairs > 0) {
    items.push({
      label: `${countryStack} jogadores do mesmo pais aceleram a comunicacao`,
      value: Math.min(3.5, countryPairs * 0.45),
    });
  }

  const total = items.reduce((s, i) => s + i.value, 0);
  return { total, items, hasAwp, hasIgl };
}

export function teamSeasonToTTeam(ts: TeamSeason): TTeam {
  const players = ts.players.slice(0, 5).map((p) =>
    toTPlayer(p, {
      originTeam: ts.team,
      originTeamId: ts.id,
      originEra: ts.era,
      originGame: ts.game,
    }),
  );
  return {
    id: ts.id,
    name: `${ts.team} ${ts.era}`,
    tag: ts.tag,
    country: ts.country,
    isUser: false,
    game: ts.game,
    colors: ts.colors,
    logoUrl: ts.logoUrl ?? logoForTeam(ts),
    liquipediaUrl: ts.liquipediaUrl ?? liquipediaTeamUrl(ts),
    strength: teamStrengthFromPlayers(players, ts.teamwork) + coachBaseBonus(ts.coach),
    teamwork: ts.teamwork,
    mapPrefs: fullMapPrefs(ts.game, ts.mapPrefs),
    coach: ts.coach,
    players,
    wins: 0,
    losses: 0,
    roundDiff: 0,
    status: 'alive',
  };
}

export function coachBaseBonus(coach: Coach): number {
  return Math.max(0, (coach.rating - 75) / 10);
}

export function buildUserTeam(name: string, picks: { player: Player; from: TeamSeason }[], coach: Coach): TTeam {
  const players = picks.map(({ player, from }) =>
    toTPlayer(player, {
      runtimeId: `user__${player.id}`,
      fromTeam: `${from.game} • ${from.team} ${from.era}`,
      originTeam: from.team,
      originTeamId: from.id,
      originEra: from.era,
      originGame: from.game,
    }),
  );
  const synergy = draftSynergy(players);
  const teamwork = 78 + Math.max(-14, Math.min(12, synergy.total * 1.2));
  const mapPrefs = fullMapPrefs('MIX', {});
  const strength = teamStrengthFromPlayers(players, teamwork) + synergy.total * 0.7 + coachBaseBonus(coach);
  return {
    id: 'user',
    name,
    tag:
      name
        .replace(/[^A-Za-z0-9 ]/g, '')
        .split(' ')
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 4) || 'MEU',
    country: 'br',
    isUser: true,
    game: 'MIX',
    colors: ['#1a1d2e', '#5ba0d0'],
    strength,
    teamwork,
    mapPrefs,
    coach,
    players,
    wins: 0,
    losses: 0,
    roundDiff: 0,
    status: 'alive',
  };
}
