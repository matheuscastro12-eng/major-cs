// PRÊMIOS DE FIM DE TEMPORADA DA CENA — Top 20 do ano (estilo HLTV), MVP de
// evento, revelação do ano, melhor técnico e time ideal. Puro e determinístico.
//
// Tudo sai do MUNDO simulado, não de sorteio:
//   - desempenho: as linhas de `seasonStats` do ano (todo jogador que entrou
//     num campeonato que a simulação jogou partida a partida — o seu e os da
//     sua liga), agregadas e convertidas em rating HLTV 2.0;
//   - resultados: `mundo.results` do ano (campeão e vice de cada evento, por
//     tier, LAN e Major), atribuídos ao time de cada jogador;
//   - nível: o OVR no fechamento do ano (a base pra quem a simulação só viu
//     em segundo plano, sem estatística por mapa).
// Régua (HLTV-like): rating com amostra pesa mais que fama; título grande pesa
// mais que título pequeno; amostra curta tem credibilidade reduzida.

import type { Role } from '../../types';
import type { SeasonEventLine, SeasonStats } from '../career/seasonStats';
import type { WorldEventResult } from '../mundo/model';
import {
  MAX_EVENT_MVPS, yearRange,
  type SceneCoachAward, type SceneEventMvp, type SceneTopEntry, type SceneYearAwards,
} from './model';

export interface ScenePlayer {
  id: string;            // id estável (sem user__)
  statsId: string;       // chave em seasonStats (user__<id> no seu elenco)
  nick: string;
  country: string;
  role: Role;
  age?: number;
  ovr: number;
  teamId: string;        // 'user' = você
  team: string;          // tag
}

export interface SceneTeam {
  id: string;
  tag: string;
  coachNick: string;
}

export interface SceneAwardsInput {
  year: number;
  players: ScenePlayer[];
  teams: SceneTeam[];
  seasonStats: SeasonStats | undefined;
  results: WorldEventResult[];
}

/** Mapas mínimos pra o rating do ano valer por inteiro (abaixo disso, credibilidade parcial). */
export const FULL_SAMPLE_MAPS = 24;
export const REVELATION_MAX_AGE = 21;

// pontos de resultado por colocação × peso do evento
function eventWeight(r: WorldEventResult): number {
  if (r.kind === 'major') return 4;
  if (r.kind === 'qualifier' || r.kind === 'rmr') return 0.35;
  const tier = r.tier ?? 2;
  const lan = r.lan ? 1.25 : 1;
  return (tier === 1 ? 2 : tier === 2 ? 0.9 : 0.4) * lan;
}
const PLACE_POINTS: Record<number, number> = { 1: 10, 2: 5 };

export interface TeamYearResults { points: number; titles: number; bigTitles: number; majors: number }

/** Resultado do ano por time (só campeão e vice ficam no mundo podado). */
export function teamResultsOfYear(results: WorldEventResult[], year: number): Map<string, TeamYearResults> {
  const [a, b] = yearRange(year);
  const out = new Map<string, TeamYearResults>();
  for (const r of results) {
    if (r.split < a || r.split > b) continue;
    const w = eventWeight(r);
    for (const p of r.placements) {
      const pts = PLACE_POINTS[p.place];
      if (!pts) continue;
      const cur = out.get(p.teamId) ?? { points: 0, titles: 0, bigTitles: 0, majors: 0 };
      cur.points += pts * w;
      if (p.place === 1 && r.kind !== 'qualifier' && r.kind !== 'rmr') {
        cur.titles += 1;
        if (r.kind === 'major' || (r.tier ?? 3) === 1) cur.bigTitles += 1;
        if (r.kind === 'major') cur.majors += 1;
      }
      out.set(p.teamId, cur);
    }
  }
  return out;
}

/** Soma as linhas do ano de um jogador e devolve rating/mapas (rating 0 sem amostra). */
export function yearLine(lines: SeasonEventLine[] | undefined, year: number): { rating: number; maps: number; kd: number; adr: number } {
  const [a, b] = yearRange(year);
  let k = 0, d = 0, as = 0, dmg = 0, kast = 0, rounds = 0, maps = 0;
  for (const l of lines ?? []) {
    if (l.split < a || l.split > b) continue;
    k += l.k; d += l.d; as += l.a; dmg += l.dmg; kast += l.kast; rounds += l.rounds; maps += l.maps;
  }
  if (rounds < 1) return { rating: 0, maps: 0, kd: 0, adr: 0 };
  return { rating: hltvRating(k, d, as, dmg, kast, rounds), maps, kd: d ? k / d : k, adr: dmg / rounds };
}

/** Rating HLTV 2.0 — mesmos coeficientes de seasonStats.deriveEventLine / deriveCareer. */
export function hltvRating(k: number, d: number, a: number, dmg: number, kast: number, rounds: number): number {
  if (rounds < 1) return 0;
  const kpr = k / rounds, dpr = d / rounds, apr = a / rounds;
  const kastR = kast / rounds, adr = dmg / rounds;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  return Math.max(0, 0.0073 * kastR * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
}

/**
 * Nota do ranking do ano. Base = OVR (o nível que o mundo vê); o rating do ano
 * desloca a nota com peso pela amostra (1,20 de rating em 24+ mapas ≈ +12);
 * resultados somam com retorno decrescente (o 5º título vale menos que o 1º).
 */
export function sceneScore(ovr: number, rating: number, maps: number, teamPoints: number): number {
  const cred = Math.min(1, maps / FULL_SAMPLE_MAPS);
  const perf = rating > 0 ? (rating - 1.0) * 60 * cred : 0;
  const res = Math.sqrt(Math.max(0, teamPoints)) * 2.2;
  return Math.round((ovr + perf + res) * 10) / 10;
}

const byScore = (x: { score: number; id: string }, y: { score: number; id: string }) =>
  y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** Time ideal: melhor AWP, melhor IGL e os 3 melhores restantes (por nota). */
export function idealTeam(top: SceneTopEntry[]): string[] {
  const sorted = [...top].sort(byScore);
  const picked: string[] = [];
  const take = (role: Role) => {
    const c = sorted.find((e) => !picked.includes(e.id) && e.role === role);
    if (c) picked.push(c.id);
  };
  take('AWP');
  take('IGL');
  // um AWP só (como um time de verdade); se faltar gente, completa com quem sobrar
  for (const e of sorted) {
    if (picked.length >= 5) break;
    if (!picked.includes(e.id) && e.role !== 'AWP') picked.push(e.id);
  }
  for (const e of sorted) {
    if (picked.length >= 5) break;
    if (!picked.includes(e.id)) picked.push(e.id);
  }
  return picked;
}

/** Calcula os prêmios da cena de um ano. */
export function computeSceneAwards(input: SceneAwardsInput): SceneYearAwards {
  const { year } = input;
  const [startSplit, endSplit] = yearRange(year);
  const teamRes = teamResultsOfYear(input.results, year);

  // um jogador por id (o mesmo id pode aparecer duas vezes se o pool repetir)
  const seen = new Set<string>();
  const entries: SceneTopEntry[] = [];
  for (const p of input.players) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const yl = yearLine(input.seasonStats?.[p.statsId], year);
    const tr = teamRes.get(p.teamId);
    entries.push({
      id: p.id, nick: p.nick, country: p.country, role: p.role, age: p.age,
      team: p.team, teamId: p.teamId, ovr: p.ovr,
      rating: Math.round(yl.rating * 100) / 100, maps: yl.maps,
      titles: tr?.titles ?? 0,
      score: sceneScore(p.ovr, yl.rating, yl.maps, tr?.points ?? 0),
    });
  }
  entries.sort(byScore);
  const top20 = entries.slice(0, 20);

  // revelação: o melhor jovem (≤ 21) do ano, mesmo fora do Top 20
  const rev = entries.find((e) => e.age != null && e.age <= REVELATION_MAX_AGE) ?? null;

  // MVP de evento: o melhor (pela nota do ano) do time campeão, nos eventos grandes
  const [a, b] = [startSplit, endSplit];
  const byTeam = new Map<string, SceneTopEntry[]>();
  for (const e of entries) byTeam.set(e.teamId, [...(byTeam.get(e.teamId) ?? []), e]);
  const big = input.results
    .filter((r) => r.split >= a && r.split <= b && r.kind !== 'qualifier' && r.kind !== 'rmr')
    .filter((r) => r.kind === 'major' || (r.tier ?? 3) <= 2)
    .sort((x, y) => (y.kind === 'major' ? 1 : 0) - (x.kind === 'major' ? 1 : 0) || (x.tier ?? 3) - (y.tier ?? 3) || y.split - x.split || (x.eventId < y.eventId ? -1 : 1));
  const mvps: SceneEventMvp[] = [];
  for (const r of big) {
    if (mvps.length >= MAX_EVENT_MVPS) break;
    const champ = r.placements.find((p) => p.place === 1);
    if (!champ) continue;
    // o MVP gravado pelo circuito (se houver) vence; senão o melhor do campeão
    const roster = byTeam.get(champ.teamId) ?? [];
    const best = (r.mvpPlayerId ? entries.find((e) => e.id === r.mvpPlayerId) : undefined) ?? roster[0];
    if (!best) continue;
    mvps.push({
      eventId: r.eventId, event: r.name ?? r.eventId, tier: r.tier ?? 1, major: r.kind === 'major', split: r.split,
      playerId: best.id, nick: best.nick, team: best.team, teamId: best.teamId,
    });
  }

  // melhor técnico: o técnico do time com mais pontos de resultado no ano
  let coach: SceneCoachAward | null = null;
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const ranked = [...teamRes.entries()]
    .filter(([id]) => teamById.has(id))
    .sort((x, y) => y[1].points - x[1].points || (x[0] < y[0] ? -1 : 1));
  if (ranked.length) {
    const [id, r] = ranked[0];
    const t = teamById.get(id)!;
    coach = { nick: t.coachNick, team: t.tag, teamId: id, titles: r.titles, points: Math.round(r.points * 10) / 10 };
  }

  return {
    year, startSplit, endSplit,
    top20,
    mvps,
    revelation: rev?.id ?? null,
    revelationEntry: rev && !top20.some((e) => e.id === rev.id) ? rev : null,
    coach,
    ideal: idealTeam(top20),
  };
}

/** Entrada de um id no ano (Top 20 ou a revelação de fora do Top 20). */
export function entryOf(y: SceneYearAwards, id: string | null | undefined): SceneTopEntry | null {
  if (!id) return null;
  return y.top20.find((e) => e.id === id) ?? (y.revelationEntry?.id === id ? y.revelationEntry : null) ?? null;
}

/** O que os SEUS jogadores levaram no ano (pra timeline, lendas e cards). */
export function userHonorsOfYear(y: SceneYearAwards): { top20: SceneTopEntry[]; mvps: SceneEventMvp[]; revelation: boolean; coach: boolean; ideal: string[] } {
  const mineTop = y.top20.filter((e) => e.teamId === 'user');
  const rev = entryOf(y, y.revelation);
  return {
    top20: mineTop,
    mvps: y.mvps.filter((m) => m.teamId === 'user'),
    revelation: rev?.teamId === 'user',
    coach: y.coach?.teamId === 'user',
    ideal: y.ideal.filter((id) => mineTop.some((e) => e.id === id)),
  };
}
