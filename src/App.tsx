import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Admin } from './components/Admin';
import { Draft } from './components/Draft';
import { FinalScreen } from './components/FinalScreen';
import { Home } from './components/Home';
import { Hub } from './components/Hub';
import { MatchScreen } from './components/MatchScreen';
import { TournamentStats } from './components/TournamentStats';
import { VetoScreen } from './components/VetoScreen';
import { simulateSeries } from './engine/match';
import { buildUserTeam } from './engine/ratings';
import { makeRng, randomSeed, shuffle } from './engine/rng';
import { createTournament, getTeam, phaseLabel, resolveRound, userPairing } from './engine/swiss';
import { fetchRemoteDataset, isCustomized, loadDataset, resetDataset, saveDataset } from './state/crm';
import type { DraftState, MapId, SeriesResult, TeamSeason, Tournament, TTeam } from './types';

type Screen = 'home' | 'draft' | 'hub' | 'veto' | 'match' | 'final' | 'admin' | 'stats';

interface MatchCtx {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  phase: string;
}

export default function App() {
  const [dataset, setDataset] = useState<TeamSeason[]>(() => loadDataset());
  const [screen, setScreen] = useState<Screen>('home');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matchCtx, setMatchCtx] = useState<MatchCtx | null>(null);
  const rngRef = useRef(makeRng(randomSeed()));
  const rng = useCallback(() => rngRef.current(), []);

  const eligible = useMemo(() => dataset.filter((t) => t.players.length >= 5), [dataset]);
  const playerCount = useMemo(() => dataset.reduce((s, t) => s + t.players.length, 0), [dataset]);

  // fonte primária: banco Neon via /api/teams; edições locais do CRM têm prioridade
  useEffect(() => {
    if (isCustomized()) return;
    let cancelled = false;
    fetchRemoteDataset().then((remote) => {
      if (remote && !cancelled) setDataset(remote);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- fluxo: home → draft ----------
  const startDraft = (mode: 'classic' | 'almanac', teamName: string) => {
    rngRef.current = makeRng(randomSeed());
    const shuffled = shuffle(rngRef.current, eligible);
    const sources = shuffled.slice(0, 5);
    const coachOptions = shuffled.slice(5, 10).map((t) => t.id);
    setDraft({
      mode,
      teamName,
      rounds: sources.map((t) => ({ teamSeasonId: t.id })),
      current: 0,
      rerollsLeft: 2,
      coachOptions,
    });
    setTournament(null);
    setScreen('draft');
  };

  const rerollDraft = () => {
    if (!draft || draft.rerollsLeft <= 0) return;
    const used = new Set(draft.rounds.map((r) => r.teamSeasonId));
    const options = eligible.filter((t) => !used.has(t.id));
    if (options.length === 0) return;
    const next = shuffle(rngRef.current, options)[0];
    const rounds = draft.rounds.map((r, i) => (i === draft.current ? { teamSeasonId: next.id } : r));
    setDraft({ ...draft, rounds, rerollsLeft: draft.rerollsLeft - 1 });
  };

  const pickPlayer = (playerId: string) => {
    if (!draft) return;
    const rounds = draft.rounds.map((r, i) => (i === draft.current ? { ...r, pickedPlayerId: playerId } : r));
    // após os 5 jogadores vem a escolha do coach (current === 5)
    setDraft({ ...draft, rounds, current: draft.current + 1 });
  };

  const pickCoach = (teamSeasonId: string) => {
    if (!draft) return;
    const coachTeam = dataset.find((t) => t.id === teamSeasonId);
    if (!coachTeam) return;
    const picks = draft.rounds.map((r) => {
      const from = dataset.find((t) => t.id === r.teamSeasonId)!;
      const player = from.players.find((p) => p.id === r.pickedPlayerId)!;
      return { player, from };
    });
    const user = buildUserTeam(draft.teamName, picks, coachTeam.coach);
    const t = createTournament(eligible, user, rngRef.current);
    setDraft({ ...draft, pickedCoachTeamId: teamSeasonId });
    setTournament(t);
    setScreen('hub');
  };

  // ---------- fluxo: hub → veto → partida ----------
  const playUserMatch = () => {
    setScreen('veto');
  };

  const onVetoDone = (maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]) => {
    if (!tournament) return;
    const p = userPairing(tournament);
    if (!p) return;
    const a = getTeam(tournament, p.a);
    const b = getTeam(tournament, p.b);
    const series = simulateSeries(rngRef.current, a, b, maps);
    setMatchCtx({ series, teams: [a, b], userIdx: p.a === 'user' ? 0 : 1, phase: phaseLabel(tournament) });
    setScreen('match');
  };

  const onMatchFinish = () => {
    if (!tournament || !matchCtx) return;
    const clone = structuredClone(tournament) as Tournament;
    const p = clone.pairings.find((x) => x.a === 'user' || x.b === 'user');
    if (p) p.result = matchCtx.series;
    resolveRound(clone, rngRef.current);
    setTournament(clone);
    setMatchCtx(null);
    setScreen(clone.phase === 'done' ? 'final' : 'hub');
  };

  const simRound = () => {
    if (!tournament) return;
    const clone = structuredClone(tournament) as Tournament;
    resolveRound(clone, rngRef.current);
    setTournament(clone);
    if (clone.phase === 'done') setScreen('final');
  };

  const restart = () => {
    setDraft(null);
    setTournament(null);
    setMatchCtx(null);
    setScreen('home');
  };

  // ---------- CRM ----------
  const changeDataset = (teams: TeamSeason[]) => {
    setDataset(teams);
    saveDataset(teams);
  };

  const goHome = () => {
    if (tournament && tournament.phase !== 'done' && screen !== 'final') {
      if (!confirm('Abandonar o Major em andamento e voltar para o início?')) return;
    }
    restart();
  };

  const vetoData = useMemo(() => {
    if (!tournament) return null;
    const p = userPairing(tournament);
    if (!p) return null;
    const a = getTeam(tournament, p.a);
    const b = getTeam(tournament, p.b);
    return { teams: [a, b] as [TTeam, TTeam], userIdx: (p.a === 'user' ? 0 : 1) as 0 | 1 };
  }, [tournament]);

  return (
    <>
      <div className="topbar">
        <span className="logo" onClick={goHome}>
          MAJOR<span>//</span>CS
        </span>
        <span className="subtitle">simulador do cenário profissional de Counter-Strike — 1.6 ao CS2</span>
        {screen !== 'admin' && (
          <button className="nav-btn" onClick={() => setScreen('admin')}>
            ⚙ Base de dados
          </button>
        )}
      </div>

      {screen === 'home' && (
        <Home onStart={startDraft} onAdmin={() => setScreen('admin')} teamCount={dataset.length} playerCount={playerCount} />
      )}

      {screen === 'draft' && draft && (
        <Draft draft={draft} dataset={dataset} onPick={pickPlayer} onPickCoach={pickCoach} onReroll={rerollDraft} />
      )}

      {screen === 'hub' && tournament && (
        <Hub t={tournament} onPlay={playUserMatch} onSimRound={simRound} onStats={() => setScreen('stats')} />
      )}

      {screen === 'stats' && tournament && (
        <TournamentStats t={tournament} onBack={() => setScreen(tournament.phase === 'done' ? 'final' : 'hub')} />
      )}

      {screen === 'veto' && tournament && vetoData && (
        <VetoScreen
          teams={vetoData.teams}
          userIdx={vetoData.userIdx}
          rng={rng}
          phaseLabel={phaseLabel(tournament)}
          onDone={onVetoDone}
        />
      )}

      {screen === 'match' && matchCtx && (
        <MatchScreen
          series={matchCtx.series}
          teams={matchCtx.teams}
          userIdx={matchCtx.userIdx}
          phaseLabel={matchCtx.phase}
          onFinish={onMatchFinish}
        />
      )}

      {screen === 'final' && tournament && (
        <FinalScreen t={tournament} onRestart={restart} onStats={() => setScreen('stats')} />
      )}

      {screen === 'admin' && (
        <Admin
          dataset={dataset}
          onChange={changeDataset}
          onReset={() => setDataset(resetDataset())}
          onBack={() => setScreen(tournament && tournament.phase !== 'done' ? 'hub' : 'home')}
        />
      )}
    </>
  );
}
