// Conversores Academy ↔ runtime (TTeam/TPlayer).
//
// Permite que o usuário JOGUE de verdade os matches da Liga Academy:
// constrói os times no formato runtime que VetoScreen + MatchScreen consomem.
//
//   - buildAcademyUserTeam: 5 AcademyEntry do user → TTeam jogável
//   - buildAcademyOpponentTeam: AcademyClub (com players reais opcionais) → TTeam
//
// Tudo determinístico por seed (split + ids), igual ao resto do academyLeague.

import type { AcademyClub } from './academyLeague';
import { clubStrength } from './academyLeague';
import { derivePlaystyle, MAP_POOL, type MapId, type Playstyle, type Role, type TPlayer, type TTeam } from '../../types';
import { hashStr } from '../../state/hash';
import type { AcademyEntry } from '../../components/CareerScreen';

// Stats internas (skill/ovr/teamwork) batem com playerOvr() do ratings.ts:
// ovr = aim*0.45 + consistency*0.18 + clutch*0.12 + max(awp,igl,aim)*0.25
function ovrFromAttrs(p: { aim: number; consistency: number; clutch: number; awp: number; igl: number }): number {
  const spec = Math.max(p.awp, p.igl, p.aim);
  return Math.round(p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25);
}

// mapPrefs determinísticas: cada mapa recebe um leve viés -3..+3 (igual ao
// padrão dos times do bo3 dataset).
function makeMapPrefs(seed: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MAP_POOL) {
    const h = hashStr(`${seed}:map:${m}`);
    // -3..+3 (média 0)
    out[m] = (h % 7) - 3;
  }
  return out;
}

// um TPlayer a partir de qualquer player com aim/consistency/clutch/awp/igl
function makeTPlayer(p: {
  id: string;
  nick: string;
  name: string;
  country: string;
  role: Role;
  aim: number;
  consistency: number;
  clutch: number;
  awp: number;
  igl: number;
  playstyle?: Playstyle;
}, runtimeId: string): TPlayer {
  const ovr = ovrFromAttrs(p);
  const skill = p.aim * 0.6 + p.consistency * 0.25 + p.clutch * 0.15;
  return {
    id: runtimeId,
    sourcePlayerId: p.id,
    nick: p.nick,
    name: p.name,
    country: p.country,
    role: p.role,
    playstyle: p.playstyle ?? derivePlaystyle(p.role),
    aim: p.aim,
    clutch: p.clutch,
    consistency: p.consistency,
    awp: p.awp,
    igl: p.igl,
    skill,
    ovr,
    form: 1,
  };
}

const FILL_ROLES: Role[] = ['IGL', 'AWP', 'Entry', 'Support', 'Rifler'];

// ─── User team ───────────────────────────────────────────────────────────────
//
// Os 5 AcademyEntry do user viram TPlayers, e a TTeam herda nome/colors da org
// principal (com sufixo "Academy"). Mantém a identidade visual no scoreboard.
export function buildAcademyUserTeam(
  acaTeam: AcademyEntry[],
  org: { name?: string; tag?: string; colors?: [string, string]; logo?: string } | null | undefined,
  country: string,
): TTeam {
  const players: TPlayer[] = acaTeam.map((p, i) => makeTPlayer({
    id: p.id,
    nick: p.nick,
    name: p.name,
    country: p.country,
    role: p.role,
    aim: p.aim,
    consistency: p.consistency,
    clutch: p.clutch,
    awp: p.awp,
    igl: p.igl,
  }, `acauser-p${i}`));
  const ovrAvg = players.length
    ? Math.round(players.reduce((a, p) => a + p.ovr, 0) / players.length)
    : 60;
  return {
    id: 'user-academy',
    name: `${org?.name ?? 'Org'} Academy`,
    tag: `${org?.tag ?? 'ORG'}A`,
    country,
    isUser: true,
    game: 'CS2',
    colors: org?.colors ?? ['#101820', '#3a3a3a'],
    logoUrl: org?.logo,
    strength: ovrAvg,
    teamwork: 70, // entrosamento médio (academy não tem o mesmo do time A)
    mapPrefs: makeMapPrefs(`acauser:${org?.tag ?? 'org'}`),
    coach: { nick: '—', name: '—', country, rating: 60, style: 'tactical' },
    players,
    wins: 0,
    losses: 0,
    roundDiff: 0,
    status: 'alive',
  };
}

// ─── Opponent team ───────────────────────────────────────────────────────────
//
// Quando o AcademyClub tem `players` parciais (nicks reais — NAVI Junior, MOUZ
// NXT etc.), usa eles em primeiro lugar; preenche o resto com prospects
// procedurais alinhados ao país do club. Stats escalam com clubStrength().
export function buildAcademyOpponentTeam(club: AcademyClub, split: number): TTeam {
  const str = clubStrength(club); // 62..76
  const seed = `acaopp:${club.id}:${split}`;
  const realPlayers = club.players ?? [];
  const realRoles = new Set(realPlayers.map((p) => p.role as Role));

  // Players reais primeiro
  const players: TPlayer[] = realPlayers.map((rp, i) => {
    const h = hashStr(`${seed}:real:${i}:${rp.nick}`);
    const aim = str + 2 + (h % 7) - 3;        // str-1 .. str+5
    const consistency = str + (h % 5) - 2;
    const clutch = str - 1 + (h % 5) - 2;
    const awp = rp.role === 'AWP' ? str + 3 + (h % 4) : Math.max(40, str - 8);
    const igl = rp.role === 'IGL' ? str + 2 + (h % 4) : Math.max(40, str - 6);
    return makeTPlayer({
      id: `${club.id}__real_${i}`,
      nick: rp.nick,
      name: rp.name,
      country: rp.country,
      role: rp.role as Role,
      aim, consistency, clutch, awp, igl,
    }, `acaopp-p${i}`);
  });

  // Preenche as roles que faltam
  const missing = FILL_ROLES.filter((r) => !realRoles.has(r));
  for (let i = 0; i < missing.length && players.length < 5; i++) {
    const role = missing[i];
    const h = hashStr(`${seed}:fill:${role}:${i}`);
    const aim = str + (h % 7) - 3;
    const consistency = str - 1 + (h % 5) - 2;
    const clutch = str - 2 + (h % 5) - 2;
    const awp = role === 'AWP' ? str + 2 + (h % 4) : Math.max(40, str - 8);
    const igl = role === 'IGL' ? str + 1 + (h % 4) : Math.max(40, str - 6);
    const nickH = hashStr(`${seed}:nick:${i}`);
    const nicks = ['young1', 'pro2', 'kid3', 'rookie4', 'fresh5', 'newgen6', 'iceman', 'shadow', 'rookie', 'phantom', 'raze', 'echo'];
    players.push(makeTPlayer({
      id: `${club.id}__fill_${i}`,
      nick: `${nicks[nickH % nicks.length]}${(nickH % 90) + 10}`,
      name: '—',
      country: club.country,
      role,
      aim, consistency, clutch, awp, igl,
    }, `acaopp-p${realPlayers.length + i}`));
  }

  // Se ainda faltam (clube com >5 reais? não acontece), trunca pros 5 primeiros
  const final = players.slice(0, 5);
  const ovrAvg = final.length ? Math.round(final.reduce((a, p) => a + p.ovr, 0) / final.length) : str;

  return {
    id: club.id,
    name: club.name,
    tag: club.tag,
    country: club.country,
    isUser: false,
    game: 'CS2',
    colors: club.colors,
    logoUrl: undefined, // visual usa AcademyBadge (parent logo) na liga; fora dela é mostrado por tag/colors
    strength: ovrAvg,
    teamwork: 70 + (hashStr(`${seed}:tw`) % 12) - 4, // 66..78
    mapPrefs: makeMapPrefs(seed),
    coach: { nick: '—', name: '—', country: club.country, rating: 60 + (hashStr(`${seed}:coach`) % 20), style: 'tactical' },
    players: final,
    wins: 0,
    losses: 0,
    roundDiff: 0,
    status: 'alive',
  };
}

// Converte SeriesResult → [mapsWon_user, mapsWon_opp] no formato esperado pelo
// playedOverride da AcademyTab (mapeia a vitória no overlay → tabela).
export function seriesToAcademyScore(
  userIdx: 0 | 1,
  winsA: number,
  winsB: number,
): [number, number] {
  return userIdx === 0 ? [winsA, winsB] : [winsB, winsA];
}

// Lista de mapas neutra (não usada no veto — só fallback caso o usuário pule).
export const ACADEMY_FALLBACK_MAPS: { map: MapId; pickedBy: 0 | 1 | -1 }[] = [
  { map: 'mirage', pickedBy: 0 },
  { map: 'inferno', pickedBy: 1 },
  { map: 'nuke', pickedBy: -1 },
];

// ─── Playoff Academy: top 4 do round-robin → mata-mata ───────────────────────
import type { AcademyStanding } from './academyLeague';

export interface AcademyPlayoffSeed {
  id: string;
  name: string;
  tag: string;
  colors: [string, string];
  strength: number;
  isUser: boolean;
  parentId?: string;
}
export interface AcademyPlayoffMatch {
  a: AcademyPlayoffSeed;
  b: AcademyPlayoffSeed;
  result?: { winnerId: string; score: [number, number] };
}
export interface AcademyPlayoffState {
  split: number;
  semis: [AcademyPlayoffMatch, AcademyPlayoffMatch];
  final?: AcademyPlayoffMatch;
  champion?: AcademyPlayoffSeed;
}

export function buildAcademyPlayoff(
  table: AcademyStanding[],
  split: number,
): AcademyPlayoffState {
  const top4 = table.slice(0, 4);
  const toSeed = (s: AcademyStanding): AcademyPlayoffSeed => ({
    id: s.id, name: s.name, tag: s.tag, colors: s.colors,
    strength: s.strength, isUser: s.isUser, parentId: s.parentId,
  });
  return {
    split,
    semis: [
      { a: toSeed(top4[0]), b: toSeed(top4[3]) },
      { a: toSeed(top4[1]), b: toSeed(top4[2]) },
    ],
  };
}

// auto-simula um confronto de playoff (MD3). Usado quando o user não joga.
export function autoPlayoffResult(a: AcademyPlayoffSeed, b: AcademyPlayoffSeed): { winnerId: string; score: [number, number] } {
  const noise = Math.floor(Math.random() * 21) - 10;
  const edge = a.strength - b.strength + noise;
  let sa: number; let sb: number;
  if (edge > 5) { sa = 2; sb = Math.random() < 0.65 ? 0 : 1; }
  else if (edge < -5) { sa = Math.random() < 0.65 ? 0 : 1; sb = 2; }
  else { const flip = Math.random() < 0.5; sa = flip ? 2 : 1; sb = flip ? 1 : 2; }
  return { winnerId: sa > sb ? a.id : b.id, score: [sa, sb] };
}

// ─── Standings com overrides aplicados ───────────────────────────────────────
// Recalcula V/D/Pts/Diff a partir do baseline determinístico, reaplicando os
// matches que o user "jogou".
export function applyOverridesToStandings(
  baseline: AcademyStanding[],
  baselineUserMatches: import('./academyLeague').AcademyMatch[],
  overrides: Record<string, [number, number]>,
): AcademyStanding[] {
  if (!Object.keys(overrides).length) return baseline;
  const byId = new Map(baseline.map((s) => [s.id, { ...s }]));
  const user = baseline.find((s) => s.isUser);
  if (!user) return baseline;
  const userRow = byId.get(user.id)!;
  for (const m of baselineUserMatches) {
    const ov = overrides[m.oppId];
    if (!ov) continue;
    const oppRow = byId.get(m.oppId);
    if (!oppRow) continue;
    // remove o resultado baseline
    const baseUserWon = m.won;
    userRow.w -= baseUserWon ? 1 : 0;
    userRow.l -= baseUserWon ? 0 : 1;
    userRow.pts -= baseUserWon ? 3 : 0;
    userRow.diff -= m.userScore - m.oppScore;
    oppRow.w -= baseUserWon ? 0 : 1;
    oppRow.l -= baseUserWon ? 1 : 0;
    oppRow.pts -= baseUserWon ? 0 : 3;
    oppRow.diff -= m.oppScore - m.userScore;
    // aplica o resultado novo
    const [us, them] = ov;
    const userWon = us > them;
    userRow.w += userWon ? 1 : 0;
    userRow.l += userWon ? 0 : 1;
    userRow.pts += userWon ? 3 : 0;
    userRow.diff += us - them;
    oppRow.w += userWon ? 0 : 1;
    oppRow.l += userWon ? 1 : 0;
    oppRow.pts += userWon ? 0 : 3;
    oppRow.diff += them - us;
  }
  return [...byId.values()].sort(
    (x, y) => y.pts - x.pts || y.diff - x.diff || y.strength - x.strength,
  );
}

// Prize money por colocação final do split.
export function academyPrize(place: number): number {
  if (place === 1) return 300_000; // 🏆 campeão
  if (place === 2) return 150_000;
  if (place >= 3 && place <= 4) return 80_000;
  if (place >= 5 && place <= 8) return 30_000;
  return 0;
}
