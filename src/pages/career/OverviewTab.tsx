// Aba Overview — T1.4. Saiu de IIFE inline no CareerScreen (hubTab === 'overview').
//
// Wrapper magro: a UI inteira já está em <CareerOverview>. A IIFE original só
// montava as props derivadas (squadPlayers, avg, form, chem, tasks, recentMatches,
// potentialMap, ages, oppScoutStats). Esta page faz o mesmo.

import type { TeamIdentity } from '../../engine/career/teamIdentity';
import {
  CareerOverview,
  type OverviewNewsRow,
  type RecentMatchRow,
} from '../../components/career/CareerOverview';
import {
  GamePlanPicker,
  eventMeta,
  scoutOppPlayerStats,
  effectiveAge,
  playerPotentialOvr,
  isMajorSplit,
  type GamePlan,
  type SeasonStat,
  type Signing,
} from '../../components/CareerScreen';
import { promiseOffersFor, PROMISE_SIGN_DELTA, type BoardPromise } from '../../engine/career/promises';
import { applyBoardDelta } from '../../engine/career/boardApproval';
import type { YouthDebut } from '../../engine/career/playerAge';
import type { VrsTeamRow } from './VrsTab';
import { buildDashboardTasks } from '../../state/career-tasks';
import { rivalryLabel, rivalryScore } from '../../engine/career/rivalries';
import { GSL_ROUND_LABELS } from '../../engine/gsl';
import { leagueTeam, type League, type LeagueMatch } from '../../engine/league';
import { formatMoney, playerOvr, playerWage } from '../../engine/ratings';
import { contractUntilMap, contractWageOf } from '../../engine/clube/contratos';
import type { ClubeState } from '../../engine/clube/model';
import { teamChemistry } from '../../engine/chemistry';
import { playerOrgId } from '../../state/career-player-route';
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
  pairChem?: Record<string, number>;
  rivalries?: Record<string, number>;
  clube?: ClubeState; // [fase 3] contratos completos (folha real e vencimentos)
  youthAge?: Record<string, number>;
  youthDebut?: Record<string, YouthDebut>;
  gamePlan?: GamePlan;
  news?: OverviewNewsRow[];
  identity?: TeamIdentity; // [W5]
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
  const fam = save.playbookXp ?? 0;
  // Química = a mesma do Elenco (pairChem dos titulares). Antes era uma fórmula
  // própria (moral + entrosamento + funções) com o mesmo rótulo e outro número.
  const chem = teamChemistry({ pairChem: save.pairChem }, squadPlayers.map((p) => playerOrgId(p.id)));
  const nextRivalryScore = opp ? rivalryScore(save.rivalries, opp.id) : 0;
  const nextRivalry = rivalryLabel(nextRivalryScore);
  const roundLabel = league.gsl
    ? ct(GSL_ROUND_LABELS[league.current] ?? 'Fase de grupos')
    : `${ct('Rodada')} ${league.current + 1}`;
  const boLabel = (myMatch?.bo ?? 3) === 1 ? 'MD1' : (myMatch?.bo ?? 3) === 5 ? 'MD5' : 'MD3';
  const venueMeta_ = eventMeta(save.circuit?.name ?? '', save.tier ?? 3);
  const wageTotal = save.squad.reduce((acc, sig) => {
    const f = findSigning(sig);
    return acc + (f ? contractWageOf(save, sig.playerId, () => playerWage(f.player)) : 0);
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
    const age = effectiveAge(p, save.split, save.youthAge, save.youthDebut);
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
      identity={save.identity}
      recentMatches={recentMatches.reverse().slice(0, 6)}
      oppRank={oppRank}
      contracts={contractUntilMap(save)}
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
      news={save.news ?? []}
      onOpenNews={() => setHubTab('inbox')}
      onOpenTasks={() => setHubTab('inbox')}
      onOpenCalendar={() => setHubTab('calendar')}
      onOpenVrs={() => setHubTab('vrs')}
      onOpenResults={() => setHubTab('results')}
      onSquad={() => setHubTab('squad')}
      onPickTeam={openTeamProfile}
      onPickPlayer={openPlayerProfile}
      oppScoutStats={oppScoutStats}
      board={typeof save.board === 'number' ? (save.board as number) : undefined}
      boardLog={Array.isArray(save.boardLog) ? (save.boardLog as import('../../engine/career/boardApproval').BoardLogEntry[]) : []}
      promise={(save.promise as BoardPromise | null | undefined) ?? null}
      promiseOffers={!save.promise ? promiseOffersFor(save.tier ?? 3, save.split, isMajorSplit(save.split)) : null}
      onPromise={(p) => {
        // #10: firmar promessa — aporte cai no caixa AGORA; julgamento no fim do split.
        const cur = typeof save.board === 'number' ? (save.board as number) : 60;
        const log = Array.isArray(save.boardLog) ? (save.boardLog as import('../../engine/career/boardApproval').BoardLogEntry[]) : [];
        const signed = applyBoardDelta(cur, log, save.split, PROMISE_SIGN_DELTA,
          `${ct('Promessa firmada:')} ${ct(p.text)}${p.injection > 0 ? ` (+${formatMoney(p.injection)} ${ct('de aporte')})` : ''}`);
        update({ promise: p, budget: save.budget + p.injection, board: signed.board, boardLog: signed.boardLog });
      }}
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
