// Aba Overview — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'overview').
//
// Wrapper magro: a UI inteira já está em <CareerOverview>. A IIFE original só
// montava as props derivadas (squadPlayers, avg, form, chem, tasks, recentMatches,
// potentialMap, ages, oppScoutStats). Esta page faz o mesmo.

import {
  CareerOverview,
  type RecentMatchRow,
} from '../../components/career/CareerOverview';
import {
  GamePlanPicker,
  MORALE_DEFAULT,
  eventMeta,
  scoutOppPlayerStats,
  effectiveAge,
  playerPotentialOvr,
  type GamePlan,
  type SeasonStat,
  type Signing,
} from '../../components/CareerScreen';
import type { VrsTeamRow } from './VrsTab';
import { buildDashboardTasks } from '../../state/career-tasks';
import { rivalryLabel, rivalryScore } from '../../engine/career/rivalries';
import { GSL_ROUND_LABELS } from '../../engine/gsl';
import { leagueTeam, type League, type LeagueMatch } from '../../engine/league';
import { formatMoney, playerOvr, playerWage } from '../../engine/ratings';
import { MAP_LABELS } from '../../types';
import { ct } from '../../state/career-i18n';
import type { Player, TTeam } from '../../types';

interface OverviewTabSave {
  org?: { name?: string; tag?: string; colors?: [string, string]; logo?: string } | null;
  circuit?: { name?: string; tier?: number } | null;
  split: number;
  titles: number;
  budget: number;
  tier?: number;
  squad: Signing[];
  morale?: Record<string, number>;
  playbookXp?: number;
  rivalries?: Record<string, number>;
  contracts?: Record<string, number>;
  youthAge?: Record<string, number>;
  gamePlan?: GamePlan;
  [key: string]: unknown;
}

interface Props {
  save: OverviewTabSave;
  league: League;
  opp: TTeam | null;
  myMatch: LeagueMatch | null | undefined;
  findSigning: (s: Signing) => { player: Player } | null;
  seasonStats: SeasonStat[];
  myVrsRank: number;
  userVrs: number;
  vrsAll: VrsTeamRow[];
  expiringCount: number;
  playMine: () => void;
  simMine: () => void;
  simWholeSplit: () => void;
  setHubTab: (tab: string) => void;
  openTeamProfile: (id: string) => void;
  openPlayerProfile: (p: Player) => void;
  update: (patch: Record<string, unknown>) => void;
  // buildTeam é função LOCAL do CareerScreen (depende de findSigning/etc do escopo).
  // Não exportável — recebida via prop.
  buildTeam: (save: unknown) => { players: Player[] } | null;
}

export function OverviewTab({
  save,
  league,
  opp,
  myMatch,
  findSigning,
  seasonStats,
  myVrsRank,
  userVrs,
  vrsAll,
  expiringCount,
  playMine,
  simMine,
  simWholeSplit,
  setHubTab,
  openTeamProfile,
  openPlayerProfile,
  update,
  buildTeam,
}: Props) {
  const squadPlayers: Player[] = buildTeam(save)?.players ?? [];
  const avg = squadPlayers.length
    ? Math.round(squadPlayers.reduce((a, p) => a + playerOvr(p), 0) / squadPlayers.length)
    : 0;
  const form = clubForm(league);
  const moraleVals = squadPlayers.map((p) => save.morale?.[p.id] ?? MORALE_DEFAULT);
  const avgMorale = moraleVals.length
    ? Math.round(moraleVals.reduce((a, b) => a + b, 0) / moraleVals.length)
    : 70;
  const fam = save.playbookXp ?? 0;
  const hasAwp = squadPlayers.some((p) => p.role === 'AWP' || p.role2 === 'AWP');
  const hasIgl = squadPlayers.some((p) => p.role === 'IGL' || p.role2 === 'IGL');
  const roleOk = (hasAwp ? 1 : 0) + (hasIgl ? 1 : 0);
  const chem = Math.round(0.45 * avgMorale + 0.35 * fam + 0.2 * (roleOk / 2) * 100);
  const nextRivalryScore = opp ? rivalryScore(save.rivalries, opp.id) : 0;
  const nextRivalry = rivalryLabel(nextRivalryScore);
  const roundLabel = league.gsl
    ? ct(GSL_ROUND_LABELS[league.current] ?? 'Fase de grupos')
    : `${ct('Rodada')} ${league.current + 1}`;
  const boLabel = (myMatch?.bo ?? 3) === 1 ? 'MD1' : (myMatch?.bo ?? 3) === 5 ? 'MD5' : 'MD3';
  const venueMeta_ = eventMeta(save.circuit?.name ?? '', save.tier ?? 3);
  const wageTotal = save.squad.reduce((acc, sig) => {
    const f = findSigning(sig);
    return acc + (f ? playerWage(f.player) : 0);
  }, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = buildDashboardTasks(save as any, squadPlayers, expiringCount);
  const recentMatches: RecentMatchRow[] = [];
  for (const mt of league.rounds.flat()) {
    if (!mt.result || (mt.a !== 'user' && mt.b !== 'user')) continue;
    const userWon = (mt.result.winner === 0 ? mt.a : mt.b) === 'user';
    const oppId = mt.a === 'user' ? mt.b : mt.a;
    const oppTeam = leagueTeam(league, oppId);
    recentMatches.push({
      key: `${mt.a}-${mt.b}-${recentMatches.length}`,
      label: save.circuit?.name ?? ct('Circuito'),
      opponent: oppTeam.name,
      score: `${mt.result.mapScore[0]}:${mt.result.mapScore[1]}`,
      won: userWon,
      maps: mt.result.maps.map((mp) => `${MAP_LABELS[mp.map]} ${mp.score[0]}-${mp.score[1]}`),
    });
  }
  const oppRank = opp ? vrsAll.findIndex((t) => t.id === opp.id) + 1 : 0;
  const potentialMap: Record<string, number> = {};
  const ages: Record<string, number> = {};
  for (const p of squadPlayers) {
    const age = effectiveAge(p, save.split, save.youthAge);
    ages[p.id] = age;
    potentialMap[p.id] = playerPotentialOvr(p, age);
  }
  const oppScoutStats: Record<string, { rating: number; adr: number }> = {};
  if (opp) {
    for (const p of opp.players) {
      oppScoutStats[p.id] = scoutOppPlayerStats(p, save.split, seasonStats);
    }
  }

  return (
    <CareerOverview
      save={{
        org: save.org ?? undefined,
        circuit: save.circuit ?? undefined,
        split: save.split,
        titles: save.titles,
        budget: save.budget,
        tier: save.tier,
      }}
      league={league}
      opp={opp}
      myMatch={myMatch ?? null}
      squadPlayers={squadPlayers}
      seasonStats={seasonStats}
      form={form}
      myVrsRank={myVrsRank}
      vrsPoints={userVrs}
      avgOvr={avg}
      budgetLabel={formatMoney(save.budget)}
      wageLabel={formatMoney(wageTotal)}
      chem={chem}
      fam={fam}
      tasks={tasks}
      vrsRanking={vrsAll}
      recentMatches={recentMatches.reverse().slice(0, 6)}
      oppRank={oppRank}
      contracts={save.contracts ?? {}}
      moraleMap={save.morale ?? {}}
      potentialMap={potentialMap}
      ages={ages}
      roundLabel={roundLabel}
      boLabel={boLabel}
      venueLabel={venueMeta_.venue}
      nextRivalry={nextRivalry}
      nextRivalryScore={nextRivalryScore}
      onPlay={playMine}
      onSim={simMine}
      onSimSplit={simWholeSplit}
      onOpenTasks={() => setHubTab('inbox')}
      onOpenCalendar={() => setHubTab('calendar')}
      onOpenVrs={() => setHubTab('vrs')}
      onOpenResults={() => setHubTab('results')}
      onSquad={() => setHubTab('squad')}
      onPickTeam={openTeamProfile}
      onPickPlayer={openPlayerProfile}
      oppScoutStats={oppScoutStats}
      gamePlanPicker={
        <GamePlanPicker
          plan={save.gamePlan ?? 'disciplined'}
          onPick={(p) => update({ gamePlan: p })}
        />
      }
    />
  );
}

// Helper local — clubForm precisa do escopo. Replicado aqui idêntico ao
// que existe no CareerScreen pra não ter cross-import bagunçado.
function clubForm(l: League): ('W' | 'L')[] {
  const out: ('W' | 'L')[] = [];
  for (const round of l.rounds) {
    for (const m of round) {
      if (!m.result || (m.a !== 'user' && m.b !== 'user')) continue;
      const userWon = (m.result.winner === 0 ? m.a : m.b) === 'user';
      out.push(userWon ? 'W' : 'L');
    }
  }
  return out.slice(-5);
}
