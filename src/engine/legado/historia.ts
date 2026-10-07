// LEGADO DO CLUBE — linha do tempo da carreira (FM "History"), recordes do
// clube e individuais, números all-time por jogador, lendas do clube e o Hall
// da Fama do manager (reputação + conquistas raras). Puro e determinístico:
// tudo derivado do que o save já guarda; o único estado novo é o `legado`
// (prêmios da cena por ano e camisas aposentadas — ver model.ts).

import type { SeasonEventLine, SeasonStats } from '../career/seasonStats';
import type { StintsMap } from '../career/stints';
import { hltvRating, userHonorsOfYear } from './premios';
import { SPLITS_PER_YEAR, yearOfSplit, type LegadoState, type SceneYearAwards } from './model';

// ─── entradas (subconjunto estrutural do CareerSave) ───────────────────────
export type MajorPlace = 'champion' | 'runnerup' | 'semi' | 'quarters' | 'playoffs' | 'swiss';
export interface LegadoSplit {
  split: number;
  circuit: string;
  position: number;
  wins: number;
  losses: number;
  prize: number;
  champion: boolean;
  major?: { placement: MajorPlace; champion: boolean };
}
export interface LegadoStatLine { k: number; d: number; a: number; dmg: number; kast: number; rounds: number; maps: number; splits?: number }
export interface LegadoCoachStint { coachNick: string; orgName: string; tier: number; startSplit: number; endSplit?: number; wins: number; losses: number; trophies: unknown[] }

export interface LegadoInput {
  split: number;
  orgName: string;
  tier: number;
  history: LegadoSplit[];
  careerStats?: Record<string, LegadoStatLine>;   // chaves user__<id> = seus jogadores
  seasonStats?: SeasonStats;
  stints?: StintsMap;
  peakOvr?: Record<string, number>;
  squadIds: string[];                             // ids do elenco atual
  retired?: string[];                             // aposentados (T3.9)
  coachStints?: LegadoCoachStint[];
  legado: LegadoState;
  academyTrophies?: number;
  /** nick/país/função por id (ex-jogadores inclusive); null = desconhecido */
  infoOf: (id: string) => { nick: string; country?: string; role?: string } | null;
}

const USER_PREFIX = 'user__';
const MAJOR_ORDER: MajorPlace[] = ['champion', 'runnerup', 'semi', 'quarters', 'playoffs', 'swiss'];

// ─── números all-time por jogador NO SEU clube ─────────────────────────────
export interface ClubPlayerLine {
  id: string;
  nick: string;
  country?: string;
  role?: string;
  maps: number;
  kills: number;
  deaths: number;
  rating: number;      // rating da carreira no clube (0 sem amostra)
  adr: number;
  titles: number;      // eventos vencidos defendendo o clube
  majors: number;      // Majors vencidos com o clube (pelo split do título)
  splits: number;      // splits no clube (passagens)
  firstSplit: number;
  lastSplit: number | null; // null = ainda no clube
  peakOvr: number;
  bestEvent: { rating: number; split: number; event: string } | null;
  arrivalOvr: number;
  sceneTop20: number;  // vezes no Top 20 do ano
  bestRank: number | null; // melhor posição num Top 20
  awards: number;      // MVP de evento + revelação
  inSquad: boolean;
  retired: boolean;
}

function stintSplits(stints: StintsMap | undefined, id: string, now: number): { splits: number; first: number; last: number | null; arrival: number } {
  const arr = stints?.[id] ?? [];
  if (!arr.length) return { splits: 0, first: 0, last: null, arrival: 0 };
  let splits = 0;
  for (const s of arr) splits += Math.max(1, (s.to ?? now) - s.from + 1);
  const lastStint = arr[arr.length - 1];
  return { splits, first: arr[0].from, last: lastStint.to, arrival: arr[0].startOvr };
}

/** Linhas all-time de todos que já vestiram a camisa (stats, passagens ou elenco). */
export function clubPlayerLines(inp: LegadoInput): ClubPlayerLine[] {
  const ids = new Set<string>();
  for (const k of Object.keys(inp.careerStats ?? {})) if (k.startsWith(USER_PREFIX)) ids.add(k.slice(USER_PREFIX.length));
  for (const k of Object.keys(inp.stints ?? {})) ids.add(k);
  for (const k of inp.squadIds) ids.add(k);
  const majorSplits = new Set(inp.history.filter((h) => h.major?.champion).map((h) => h.split));
  const squad = new Set(inp.squadIds);
  const retired = new Set(inp.retired ?? []);
  const out: ClubPlayerLine[] = [];
  for (const id of ids) {
    const info = inp.infoOf(id);
    const cs = inp.careerStats?.[USER_PREFIX + id];
    const lines: SeasonEventLine[] = inp.seasonStats?.[USER_PREFIX + id] ?? [];
    const st = stintSplits(inp.stints, id, inp.split);
    let best: ClubPlayerLine['bestEvent'] = null;
    for (const l of lines) {
      if (l.maps < 3) continue;
      const r = hltvRating(l.k, l.d, l.a, l.dmg, l.kast, l.rounds);
      if (!best || r > best.rating) best = { rating: Math.round(r * 100) / 100, split: l.split, event: l.eventName };
    }
    const titles = lines.filter((l) => l.champion || l.placement === 1).length;
    const titleSplits = new Set(lines.filter((l) => l.champion || l.placement === 1).map((l) => l.split));
    // Major: o jogador estava no elenco no split do título (passagem cobre o split)
    const stArr = inp.stints?.[id] ?? [];
    const majors = [...majorSplits].filter((sp) => stArr.some((s) => s.from <= sp && (s.to ?? inp.split) >= sp)).length;
    let sceneTop20 = 0, bestRank: number | null = null, awards = 0;
    for (const y of inp.legado.years) {
      const i = y.top20.findIndex((e) => e.id === id && e.teamId === 'user');
      if (i >= 0) { sceneTop20 += 1; bestRank = bestRank == null ? i + 1 : Math.min(bestRank, i + 1); }
      awards += y.mvps.filter((m) => m.playerId === id && m.teamId === 'user').length;
      if (y.revelation === id && (y.top20.find((e) => e.id === id) ?? y.revelationEntry)?.teamId === 'user') awards += 1;
    }
    const rating = cs && cs.rounds > 0 ? hltvRating(cs.k, cs.d, cs.a, cs.dmg, cs.kast, cs.rounds) : 0;
    out.push({
      id,
      nick: info?.nick ?? id,
      country: info?.country,
      role: info?.role,
      maps: cs?.maps ?? 0,
      kills: cs?.k ?? 0,
      deaths: cs?.d ?? 0,
      rating: Math.round(rating * 100) / 100,
      adr: cs && cs.rounds > 0 ? Math.round((cs.dmg / cs.rounds) * 10) / 10 : 0,
      titles: Math.max(titles, titleSplits.size),
      majors,
      splits: st.splits || (cs?.splits ?? 0),
      firstSplit: st.first,
      lastSplit: squad.has(id) ? null : st.last ?? (st.first ? st.first : null),
      peakOvr: inp.peakOvr?.[id] ?? 0,
      bestEvent: best,
      arrivalOvr: st.arrival,
      sceneTop20, bestRank, awards,
      inSquad: squad.has(id),
      retired: retired.has(id),
    });
  }
  return out.sort((a, b) => b.maps - a.maps || b.titles - a.titles || (a.id < b.id ? -1 : 1));
}

// ─── lendas do clube ───────────────────────────────────────────────────────
export type LegendRank = 'idolo' | 'lenda' | 'imortal';
export interface ClubLegend extends ClubPlayerLine { legendScore: number; rank: LegendRank; shirtRetired: boolean; canRetireShirt: boolean }

/** Nota de lenda: títulos e Majors mandam, longevidade e prêmios da cena somam. */
export function legendScore(l: ClubPlayerLine): number {
  return Math.round(
    l.titles * 9 + l.majors * 30 + Math.min(60, l.maps * 0.25) + Math.max(0, l.peakOvr - 82) * 2.5
    + l.sceneTop20 * 8 + (l.bestRank === 1 ? 20 : 0) + l.awards * 10 + Math.min(20, l.splits * 1.5),
  );
}
export const LEGEND_MIN = 45;
export function legendRank(score: number): LegendRank | null {
  if (score >= 140) return 'imortal';
  if (score >= 85) return 'lenda';
  if (score >= LEGEND_MIN) return 'idolo';
  return null;
}

export function clubLegends(inp: LegadoInput, lines = clubPlayerLines(inp)): ClubLegend[] {
  const shirts = new Set(inp.legado.shirts.map((s) => s.playerId));
  const out: ClubLegend[] = [];
  for (const l of lines) {
    const score = legendScore(l);
    const rank = legendRank(score);
    if (!rank) continue;
    out.push({
      ...l, legendScore: score, rank,
      shirtRetired: shirts.has(l.id),
      // aposentar a camisa: lenda (não só ídolo) que já saiu do clube ou parou de jogar
      canRetireShirt: !shirts.has(l.id) && rank !== 'idolo' && (!l.inSquad || l.retired),
    });
  }
  return out.sort((a, b) => b.legendScore - a.legendScore || (a.id < b.id ? -1 : 1));
}

// ─── recordes ──────────────────────────────────────────────────────────────
export interface RecordRow { id: string; value: number; holder: string; detail?: string; split?: number }

function longestRun(history: LegadoSplit[], pred: (h: LegadoSplit) => boolean): { len: number; from: number; to: number } {
  let best = { len: 0, from: 0, to: 0 }, cur = 0, start = 0;
  const sorted = [...history].sort((a, b) => a.split - b.split);
  for (const h of sorted) {
    if (pred(h)) { if (cur === 0) start = h.split; cur += 1; if (cur > best.len) best = { len: cur, from: start, to: h.split }; }
    else cur = 0;
  }
  return best;
}

export interface ClubRecords { club: RecordRow[]; individual: RecordRow[] }

export function clubRecords(inp: LegadoInput, lines = clubPlayerLines(inp)): ClubRecords {
  const h = inp.history;
  const club: RecordRow[] = [];
  const titles = h.filter((x) => x.champion).length;
  const majors = h.filter((x) => x.major?.champion).length;
  club.push({ id: 'titles', value: titles, holder: inp.orgName });
  club.push({ id: 'majors', value: majors, holder: inp.orgName });
  const bestMajor = h.filter((x) => x.major).sort((a, b) => MAJOR_ORDER.indexOf(a.major!.placement) - MAJOR_ORDER.indexOf(b.major!.placement) || a.split - b.split)[0];
  if (bestMajor) club.push({ id: 'bestMajor', value: 6 - MAJOR_ORDER.indexOf(bestMajor.major!.placement), holder: inp.orgName, detail: bestMajor.major!.placement, split: bestMajor.split });
  const tRun = longestRun(h, (x) => x.champion);
  if (tRun.len) club.push({ id: 'titleStreak', value: tRun.len, holder: inp.orgName, detail: `${tRun.from}–${tRun.to}`, split: tRun.to });
  const top4 = longestRun(h, (x) => x.position > 0 && x.position <= 4);
  if (top4.len) club.push({ id: 'top4Streak', value: top4.len, holder: inp.orgName, detail: `${top4.from}–${top4.to}`, split: top4.to });
  const mostWins = [...h].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.split - b.split)[0];
  if (mostWins && mostWins.wins > 0) club.push({ id: 'mostWins', value: mostWins.wins, holder: inp.orgName, detail: `${mostWins.wins}–${mostWins.losses}`, split: mostWins.split });
  const prize = [...h].sort((a, b) => b.prize - a.prize || a.split - b.split)[0];
  if (prize && prize.prize > 0) club.push({ id: 'prize', value: prize.prize, holder: inp.orgName, split: prize.split });
  const unbeaten = h.filter((x) => x.wins > 0 && x.losses === 0).sort((a, b) => b.wins - a.wins)[0];
  if (unbeaten) club.push({ id: 'unbeaten', value: unbeaten.wins, holder: inp.orgName, split: unbeaten.split });

  const individual: RecordRow[] = [];
  const top = <T,>(arr: T[], key: (x: T) => number) => [...arr].sort((a, b) => key(b) - key(a))[0];
  const withMaps = lines.filter((l) => l.maps > 0);
  const m = top(withMaps, (l) => l.maps);
  if (m) individual.push({ id: 'mostMaps', value: m.maps, holder: m.nick });
  const k = top(withMaps, (l) => l.kills);
  if (k) individual.push({ id: 'mostKills', value: k.kills, holder: k.nick });
  const r = top(lines.filter((l) => l.maps >= 20), (l) => l.rating);
  if (r) individual.push({ id: 'bestRating', value: r.rating, holder: r.nick, detail: `${r.maps}` });
  const ev = top(lines.filter((l) => l.bestEvent), (l) => l.bestEvent!.rating);
  if (ev?.bestEvent) individual.push({ id: 'bestEvent', value: ev.bestEvent.rating, holder: ev.nick, detail: ev.bestEvent.event, split: ev.bestEvent.split });
  const t = top(lines.filter((l) => l.titles > 0), (l) => l.titles);
  if (t) individual.push({ id: 'mostTitles', value: t.titles, holder: t.nick });
  const p = top(lines.filter((l) => l.peakOvr > 0), (l) => l.peakOvr);
  if (p) individual.push({ id: 'peakOvr', value: p.peakOvr, holder: p.nick });
  const s = top(lines.filter((l) => l.splits > 0), (l) => l.splits);
  if (s) individual.push({ id: 'longest', value: s.splits, holder: s.nick });
  return { club, individual };
}

// ─── linha do tempo ────────────────────────────────────────────────────────
export type TimelineKind =
  | 'founded' | 'title' | 'major' | 'majorRun' | 'signing' | 'legendLeft' | 'scene' | 'sceneMvp' | 'sceneCoach' | 'shirt' | 'promoted';
export interface TimelineEntry {
  split: number;
  kind: TimelineKind;
  gold: boolean;       // marco de ouro (título/Major/#1 do mundo)
  a?: string;          // sujeito (nick / circuito / evento)
  b?: string;          // complemento (colocação, OVR, posição…)
  n?: number;
}
export interface TimelineSeason { year: number; fromSplit: number; toSplit: number; entries: TimelineEntry[]; titles: number; majors: number }

export function careerTimeline(inp: LegadoInput, lines = clubPlayerLines(inp)): TimelineSeason[] {
  const ev: TimelineEntry[] = [];
  const h = [...inp.history].sort((a, b) => a.split - b.split);
  if (h.length) ev.push({ split: h[0].split, kind: 'founded', gold: false, a: inp.orgName });
  for (const x of h) {
    if (x.champion) ev.push({ split: x.split, kind: 'title', gold: true, a: x.circuit });
    if (x.major) ev.push({ split: x.split, kind: x.major.champion ? 'major' : 'majorRun', gold: x.major.champion, b: x.major.placement });
  }
  // contratações marcantes: chegou com OVR alto ou virou lenda/top 20
  const legends = new Set(clubLegends(inp, lines).map((l) => l.id));
  for (const l of lines) {
    if (!l.firstSplit) continue;
    if (l.arrivalOvr >= 84 || legends.has(l.id)) ev.push({ split: l.firstSplit, kind: 'signing', gold: false, a: l.nick, n: l.arrivalOvr || undefined });
    if (legends.has(l.id) && l.lastSplit != null && !l.inSquad) ev.push({ split: l.lastSplit, kind: 'legendLeft', gold: false, a: l.nick, n: l.titles });
  }
  for (const y of inp.legado.years) {
    const hon = userHonorsOfYear(y);
    for (const e of hon.top20) {
      const rank = y.top20.findIndex((t) => t.id === e.id) + 1;
      ev.push({ split: y.endSplit, kind: 'scene', gold: rank === 1, a: e.nick, n: rank });
    }
    for (const m of hon.mvps) ev.push({ split: m.split, kind: 'sceneMvp', gold: m.major, a: m.nick, b: m.event });
    if (hon.coach && y.coach) ev.push({ split: y.endSplit, kind: 'sceneCoach', gold: false, a: y.coach.nick });
  }
  for (const s of inp.legado.shirts) ev.push({ split: s.split, kind: 'shirt', gold: true, a: s.nick });

  const order: Record<TimelineKind, number> = { founded: 0, signing: 1, title: 2, majorRun: 3, major: 4, sceneMvp: 5, scene: 6, sceneCoach: 7, legendLeft: 8, shirt: 9, promoted: 10 };
  ev.sort((a, b) => a.split - b.split || order[a.kind] - order[b.kind] || (b.n ?? 0) - (a.n ?? 0));
  const seasons = new Map<number, TimelineSeason>();
  for (const e of ev) {
    const year = yearOfSplit(e.split);
    const cur = seasons.get(year) ?? { year, fromSplit: (year - 1) * SPLITS_PER_YEAR + 1, toSplit: year * SPLITS_PER_YEAR, entries: [], titles: 0, majors: 0 };
    cur.entries.push(e);
    if (e.kind === 'title') cur.titles += 1;
    if (e.kind === 'major') cur.majors += 1;
    seasons.set(year, cur);
  }
  return [...seasons.values()].sort((a, b) => b.year - a.year); // mais recente primeiro
}

// ─── Hall da Fama do manager ───────────────────────────────────────────────
export type BadgeRarity = 'comum' | 'rara' | 'epica' | 'lendaria';
export interface ManagerBadge { id: string; rarity: BadgeRarity; unlocked: boolean; progress: number; goal: number; split?: number }

export interface ManagerHall {
  reputation: number;  // 0–99 (mesma régua do perfil de técnico)
  splits: number;
  titles: number;
  majors: number;
  winRate: number;     // 0–1
  badges: ManagerBadge[];
}

export function managerHall(inp: LegadoInput, lines = clubPlayerLines(inp)): ManagerHall {
  const h = inp.history;
  const titles = h.filter((x) => x.champion).length;
  const majors = h.filter((x) => x.major?.champion).length;
  const wins = h.reduce((a, x) => a + x.wins, 0), losses = h.reduce((a, x) => a + x.losses, 0);
  const winRate = wins + losses ? wins / (wins + losses) : 0;
  // reputação: mesma fórmula do summarizeCoach (coachCareer.ts), sobre as passagens
  const cs = inp.coachStints ?? [];
  const trophies = cs.reduce((a, s) => a + s.trophies.length, 0) || titles;
  const avgTier = cs.length ? cs.reduce((a, s) => a + s.tier, 0) / cs.length : inp.tier;
  const reputation = Math.round(Math.max(20, Math.min(99,
    25 + Math.min(50, trophies * 12) + Math.max(0, 4 - avgTier) * 8 + winRate * 25 + Math.min(10, Math.max(1, cs.length) * 2) + majors * 4)));

  const tRun = longestRun(h, (x) => x.champion).len;
  const majorPlayed = h.filter((x) => x.major).length;
  const majorFinals = h.filter((x) => x.major && (x.major.placement === 'champion' || x.major.placement === 'runnerup')).length;
  const unbeaten = h.some((x) => x.wins >= 5 && x.losses === 0);
  const top1 = inp.legado.years.some((y) => y.top20[0]?.teamId === 'user');
  const top20Count = inp.legado.years.reduce((a, y) => a + y.top20.filter((e) => e.teamId === 'user').length, 0);
  const coachAward = inp.legado.years.filter((y) => y.coach?.teamId === 'user').length;
  const legends = clubLegends(inp, lines);
  const firstMajor = h.find((x) => x.major?.champion)?.split;
  const tierOneTitle = h.some((x) => x.champion) && inp.tier === 1;
  const B = (id: string, rarity: BadgeRarity, progress: number, goal: number, split?: number): ManagerBadge =>
    ({ id, rarity, unlocked: progress >= goal, progress: Math.min(progress, goal), goal, split });
  const badges: ManagerBadge[] = [
    B('firstTitle', 'comum', titles, 1, h.find((x) => x.champion)?.split),
    B('majorDebut', 'comum', majorPlayed, 1),
    B('fiveTitles', 'rara', titles, 5),
    B('majorFinal', 'rara', majorFinals, 1),
    B('unbeaten', 'rara', unbeaten ? 1 : 0, 1),
    B('topOfWorld', 'rara', tierOneTitle ? 1 : 0, 1),
    B('starFactory', 'rara', top20Count, 3),
    B('majorChampion', 'epica', majors, 1, firstMajor),
    B('dynasty', 'epica', tRun, 3),
    B('coachOfYear', 'epica', coachAward, 1),
    B('legendsHouse', 'epica', legends.filter((l) => l.rank !== 'idolo').length, 3),
    B('playerOfYear', 'lendaria', top1 ? 1 : 0, 1),
    B('multiMajor', 'lendaria', majors, 3),
    B('decade', 'lendaria', Math.max(0, inp.split - 1), 40),
  ];
  return { reputation, splits: Math.max(0, inp.split - 1), titles, majors, winRate, badges };
}

/** Pacote completo pra página (uma passada só sobre as linhas). */
export function buildLegado(inp: LegadoInput) {
  const lines = clubPlayerLines(inp);
  return {
    lines,
    legends: clubLegends(inp, lines),
    records: clubRecords(inp, lines),
    timeline: careerTimeline(inp, lines),
    hall: managerHall(inp, lines),
  };
}
export type LegadoView = ReturnType<typeof buildLegado>;

/** Ano mais recente em que um jogador SEU foi #1 do Top 20 (pro card "jogador do ano"). */
export function userPlayerOfYear(years: SceneYearAwards[]): SceneYearAwards | null {
  for (let i = years.length - 1; i >= 0; i--) if (years[i].top20[0]?.teamId === 'user') return years[i];
  return null;
}
