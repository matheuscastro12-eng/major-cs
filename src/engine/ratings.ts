import { liquipediaTeamUrl, logoForTeam } from '../data/media';
import type { Coach, Game, Player, Playstyle, Role, TeamSeason, TPlayer, TTeam } from '../types';
import { derivePlaystyle, MAP_POOL } from '../types';
import { hashStr } from '../state/hash';
import { ct } from '../state/career-i18n';
import earningsData from '../data/bo3-earnings.json';

// premiação real de carreira (Liquipedia) → PRÊMIO MODESTO no valor de mercado:
// astro consagrado custa um pouco mais, mas o OVR continua mandando (teto +15%).
const EARNINGS = earningsData as Record<string, number>;
function earningsPremium(nick?: string): number {
  const e = nick ? EARNINGS[nick] : undefined;
  if (!e) return 1;
  if (e >= 2_000_000) return 1.15;
  if (e >= 1_000_000) return 1.10;
  if (e >= 500_000) return 1.06;
  if (e >= 200_000) return 1.03;
  return 1;
}

// Dream team montado no draft nunca treinou junto: leva um malus de
// entrosamento que torna o título mais difícil (egos, falta de rotina).
export const DREAM_TEAM_MALUS = 4.5;

export function playerSkill(p: Pick<Player, 'aim' | 'clutch' | 'consistency'>): number {
  return p.aim * 0.6 + p.consistency * 0.25 + p.clutch * 0.15;
}

export function playerOvr(p: Pick<Player, 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'>): number {
  const spec = Math.max(p.awp, p.igl, p.aim);
  return Math.round(p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25);
}

// valor de mercado do jogador (R$), estilo Brasfoot: cresce rápido com o
// overall e tem prêmio para AWPer/IGL de elite; forma quente valoriza um pouco.
export function playerValue(p: Pick<Player, 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'> & { ovr?: number; form?: number; nick?: string }): number {
  const ovr = typeof p.ovr === 'number' ? p.ovr : playerOvr(p);
  // curva íngreme: medianos custam pouco e só craques disparam de preço.
  // ovr 73 ~ R$240k · 80 ~ R$820k · 85 ~ R$1,5M · 90 ~ R$2,5M · 96 ~ R$4M
  const base = Math.max(0, ovr - 62);
  let v = Math.pow(base, 2.5) * 600;
  if (p.awp >= 88) v *= 1.18; // sniper de elite valoriza
  if (p.igl >= 88) v *= 1.1; // IGL de elite valoriza
  v *= earningsPremium(p.nick); // legado de carreira (premiação real): prêmio modesto
  if (p.form) v *= p.form; // 0.9..1.1
  return Math.max(30000, Math.round(v / 10000) * 10000);
}

// ---- características derivadas do jogador (para o veto e a tática) ----
export type Trait = 'sniper' | 'caller' | 'aim' | 'clutch' | 'consistency' | 'entry' | 'anchor' | 'lurker';

export function playerTraits(p: {
  role: Role;
  playstyle?: Playstyle;
  aim: number;
  clutch: number;
  consistency: number;
  awp: number;
  igl: number;
}): Trait[] {
  const ps = p.playstyle ?? derivePlaystyle(p.role);
  const out: Trait[] = [];
  if (p.awp >= 88) out.push('sniper');
  if (p.igl >= 85) out.push('caller');
  if (p.aim >= 90) out.push('aim');
  if (p.clutch >= 88) out.push('clutch');
  if (p.consistency >= 88) out.push('consistency');
  if (ps === 'aggressive' || p.role === 'Entry') out.push('entry');
  if (p.role === 'Lurker') out.push('lurker');
  if (ps === 'passive' && p.consistency >= 84) out.push('anchor');
  return out.slice(0, 3);
}

// perfil do IGL do time: define a tendência tática natural do time
export function iglProfile(players: { nick: string; role: Role; playstyle?: Playstyle; igl: number }[]): {
  nick: string;
  style: Playstyle;
  rating: number;
} | null {
  if (!players.length) return null;
  const igl = [...players].sort((a, b) => b.igl - a.igl)[0];
  return { nick: igl.nick, style: igl.playstyle ?? derivePlaystyle(igl.role), rating: igl.igl };
}

// salário do jogador por split (folha do modo carreira). ~6% do valor de
// mercado: um craque de R$2,5M custa ~R$150k por split de salário.
export function playerWage(p: Pick<Player, 'aim' | 'clutch' | 'consistency' | 'awp' | 'igl'> & { ovr?: number }): number {
  return Math.max(20000, Math.round((playerValue(p) * 0.06) / 5000) * 5000);
}

// formata valores monetários de forma curta (R$ 2.4M, R$ 750k)
export function formatMoney(n: number): string {
  const neg = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${neg}R$ ${(a / 1_000_000).toFixed(a % 1_000_000 === 0 ? 0 : 1)}M`;
  if (a >= 1_000) return `${neg}R$ ${Math.round(a / 1000)}k`;
  return `${neg}R$ ${a}`;
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
    playstyle: p.playstyle ?? derivePlaystyle(p.role),
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

// perfil de mapa determinístico para times SEM prefs explícitas (os times reais
// de CS2 do bo3 vêm com mapPrefs vazio). Cada time fica forte em alguns mapas e
// fraco em outros, estável por id — assim a análise pré-jogo e o veto mostram de
// fato quem é melhor em cada mapa (igual ao draft, onde os times têm força/mapa).
function genMapPrefs(seed: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MAP_POOL) {
    const h = hashStr(`${seed}:mappref:${m}`);
    out[m] = Math.round((((h % 1000) / 1000) * 5 - 2.5) * 10) / 10; // -2.5..+2.5
  }
  return out;
}

export function fullMapPrefs(game: Game | 'MIX', prefs: Record<string, number>, seed?: string): Record<string, number> {
  // gera um perfil só quando o time é CS2 e não trouxe nenhuma pref própria
  const gen = seed && game === 'CS2' && Object.keys(prefs).length === 0 ? genMapPrefs(seed) : null;
  const out: Record<string, number> = {};
  for (const m of MAP_POOL) {
    out[m] = prefs[m] ?? (gen ? gen[m] : game === 'MIX' ? 0 : defaultPref(game, m));
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

  // ter a FUNÇÃO já conta (um AWPer de OVR menor ainda é o AWPer do time);
  // o stat alto é um caminho alternativo. Antes só olhava awp>=80 e dizia
  // "sem AWP" mesmo com um AWPer no time.
  const awpMains = players.filter((p) => p.role === 'AWP' || p.role2 === 'AWP').length;
  const iglMains = players.filter((p) => p.role === 'IGL' || p.role2 === 'IGL').length;
  const hasAwp = awpMains > 0 || players.some((p) => p.awp >= 80);
  const hasIgl = iglMains > 0 || players.some((p) => p.igl >= 80);
  const hasEntry = players.some((p) => p.role === 'Entry');
  const hasSupport = players.some((p) => p.role === 'Support' || p.role === 'Lurker');
  const distinctRoles = new Set(players.map((p) => p.role)).size;

  if (hasAwp) items.push({ label: ct('AWPer dedicado segurando os lados'), value: 2.5 });
  else items.push({ label: ct('SEM AWPER: CT vira sofrimento'), value: -8 });

  if (hasIgl) items.push({ label: ct('IGL no comando das rondas'), value: 3 });
  else items.push({ label: ct('SEM IGL: sem leitura tatica em rounds fechados'), value: -10 });

  if (awpMains >= 3) items.push({ label: ct('AWPers demais brigando pela arma'), value: -6 });
  else if (awpMains === 2) items.push({ label: ct('Dois AWPers principais dividem o orcamento'), value: -2.5 });
  if (iglMains >= 2) items.push({ label: ct('Vozes de comando em conflito'), value: -3 });
  if (hasEntry) items.push({ label: ct('Entry fragger abrindo espaco'), value: 2 });
  if (hasSupport) items.push({ label: ct('Suporte/lurker fechando o mapa'), value: 2 });
  if (distinctRoles === 5) items.push({ label: ct('Composicao completa: cinco funcoes distintas'), value: 3 });

  const byGame = new Map<string, number>();
  for (const p of players) {
    const g = p.originGame ?? p.fromTeam?.split('•')[0]?.trim() ?? '?';
    byGame.set(g, (byGame.get(g) ?? 0) + 1);
  }
  let eraPairs = 0;
  for (const n of byGame.values()) eraPairs += (n * (n - 1)) / 2;
  if (eraPairs > 0) items.push({ label: ct('Quimica de era entre os jogadores'), value: Math.min(3, eraPairs * 0.4) });

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
      label: `${countryStack} ${ct('jogadores do mesmo pais aceleram a comunicacao')}`,
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
    name: ts.team,
    tag: ts.tag,
    country: ts.country,
    isUser: false,
    game: ts.game,
    colors: ts.colors,
    logoUrl: ts.logoUrl ?? logoForTeam(ts),
    liquipediaUrl: ts.liquipediaUrl ?? liquipediaTeamUrl(ts),
    strength: teamStrengthFromPlayers(players, ts.teamwork) + coachBaseBonus(ts.coach),
    teamwork: ts.teamwork,
    mapPrefs: fullMapPrefs(ts.game, ts.mapPrefs, ts.id),
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

// Aplica as funções escolhidas pelo técnico (save.roles) no time JÁ montado da
// liga/major. O time do usuário é um snapshot tirado no começo do split, então
// trocar a função no Elenco no meio da temporada não chegava à partida/análise
// pré-jogo. Isto reescreve a função de cada jogador e recalcula sinergia/força
// preservando o estado da temporada (vitórias, saldo, forma). O id de runtime é
// "user__<idOriginal>", então a busca de função usa o id original.
export function resyncUserRoles(user: TTeam, roleOf: (originalId: string) => Role | undefined): TTeam {
  let changed = false;
  const players = user.players.map((p) => {
    const oid = p.id.startsWith('user__') ? p.id.slice('user__'.length) : p.id;
    const r = roleOf(oid);
    if (r && r !== p.role) { changed = true; return { ...p, role: r }; }
    return p;
  });
  if (!changed) return user;
  const synergy = draftSynergy(players);
  const teamwork = 78 + Math.max(-14, Math.min(12, synergy.total * 1.2));
  const strength = teamStrengthFromPlayers(players, teamwork) + synergy.total * 0.7 + coachBaseBonus(user.coach) - DREAM_TEAM_MALUS;
  return { ...user, players, teamwork, strength };
}

// Recalcula derivados (skill/ovr/sinergia/força) após mudanças no elenco do
// usuário - usado na virada de temporada do modo carreira.
export function refreshUserTeam(user: TTeam): TTeam {
  const players = user.players.map((p) => ({ ...p, skill: playerSkill(p), ovr: playerOvr(p) }));
  const synergy = draftSynergy(players);
  const teamwork = 78 + Math.max(-14, Math.min(12, synergy.total * 1.2));
  return {
    ...user,
    players,
    teamwork,
    strength: teamStrengthFromPlayers(players, teamwork) + synergy.total * 0.7 + coachBaseBonus(user.coach) - DREAM_TEAM_MALUS,
    wins: 0,
    losses: 0,
    roundDiff: 0,
    status: 'alive',
  };
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
  const strength = teamStrengthFromPlayers(players, teamwork) + synergy.total * 0.7 + coachBaseBonus(coach) - DREAM_TEAM_MALUS;
  // país do time = nacionalidade predominante do elenco (não fixo 'br'), pra a
  // bandeira do usuário bater com o core em qualquer lugar que use team.country
  const tally = new Map<string, number>();
  for (const p of players) { const c = (p.country || '').toLowerCase(); if (c) tally.set(c, (tally.get(c) ?? 0) + 1); }
  let country = 'br', best = 0;
  for (const [c, n] of tally) if (n > best) { best = n; country = c; }
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
    country,
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
