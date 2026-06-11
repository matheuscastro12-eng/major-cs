import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminGate } from './components/AdminGate';
import { BrandMark } from './components/brand';
import { DonateButton, DonateModal } from './components/Donate';
import { Draft } from './components/Draft';
import { Home } from './components/Home';
import { Hub } from './components/Hub';
import { MatchScreen } from './components/MatchScreen';
import { Onboarding, shouldOnboard } from './components/Onboarding';
import { Loader } from './components/ui';

// telas pesadas e/ou pouco usadas: carregadas sob demanda (code-splitting) pra
// deixar o carregamento inicial bem mais leve.
const Admin = lazy(() => import('./components/Admin').then((m) => ({ default: m.Admin })));
const CareerScreen = lazy(() => import('./components/CareerScreen').then((m) => ({ default: m.CareerScreen })));
const CareerCRM = lazy(() => import('./components/CareerCRM').then((m) => ({ default: m.CareerCRM })));
const FinalScreen = lazy(() => import('./components/FinalScreen').then((m) => ({ default: m.FinalScreen })));
const HallScreen = lazy(() => import('./components/HallScreen').then((m) => ({ default: m.HallScreen })));
const LabScreen = lazy(() => import('./components/LabScreen').then((m) => ({ default: m.LabScreen })));
const MatchDetail = lazy(() => import('./components/MatchDetail').then((m) => ({ default: m.MatchDetail })));
const OnlineScreen = lazy(() => import('./components/OnlineScreen').then((m) => ({ default: m.OnlineScreen })));
const TournamentStats = lazy(() => import('./components/TournamentStats').then((m) => ({ default: m.TournamentStats })));
import { applyEvolution, buildEvolution, TransferScreen, type TransferOffer } from './components/TransferScreen';
import { VetoScreen } from './components/VetoScreen';
import { buildUserTeam, playerOvr } from './engine/ratings';
import { makeRng, randomSeed, shuffle } from './engine/rng';
import { createTournament, getTeam, pairingBestOf, phaseLabel, placementCode, resolveRound, userMapRecord, userPairing, userTeam, type PlacementCode } from './engine/swiss';
import { fetchRemoteDataset, hasUnsavedEdits, loadDataset, markDirty, mergePendingBaseTeams, resetDataset, saveDataset } from './state/crm';
import { useLang } from './state/i18n';
import { LangSwitcher } from './components/social';
import { startPresenceHeartbeat, track, trackVisit } from './state/track';
import { DIFFICULTY_OPP_BOOST } from './types';
import type { Difficulty, DraftState, MapId, Pairing, SeriesResult, TeamSeason, Tournament, TournamentPool, TTeam } from './types';

type Screen =
  | 'home'
  | 'draft'
  | 'hub'
  | 'veto'
  | 'match'
  | 'final'
  | 'admin'
  | 'stats'
  | 'hall'
  | 'lab'
  | 'transfer'
  | 'matchdetail'
  | 'online'
  | 'career'
  | 'careerCRM';

interface MatchCtx {
  teams: [TTeam, TTeam];
  maps: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  userIdx: 0 | 1;
  phase: string;
  bestOf: 1 | 3 | 5;
}

export interface PickemState {
  picks: Record<string, string>; // `${a}|${b}` → teamId apostado
  score: number;
  total: number;
}

export interface CareerState {
  season: number;
  titles: number;
  budget: number; // caixa do clube (R$) para transferências
  lastPrize?: number; // premiação da última campanha (para exibir)
}

// caixa inicial e premiação por desempenho no Major (chaveada por código
// estável de colocação, nunca por texto exibido/traduzível)
const STARTING_BUDGET = 2_000_000;
const PRIZE_BY_PLACEMENT: Record<PlacementCode, number> = {
  champion: 5_000_000,
  runnerup: 2_200_000,
  semi: 1_200_000,
  quarters: 600_000,
  playoffs: 350_000,
  swiss: 0,
};
const newCareer = (): CareerState => ({ season: 1, titles: 0, budget: STARTING_BUDGET });

interface TransferCtx {
  evolution: { nick: string; delta: number }[];
  offers: TransferOffer[];
  baseTeam: TTeam;
}

// v3: invalida campanhas em andamento salvas por builds antigos (antes do
// formato MD1/MD3/MD5 e do Major online), que podiam resumir com estado
// inconsistente - causa de placares/vitórias que pareciam trocados no meio da run.
const SESSION_KEY = 'major-session-v3';
try {
  localStorage.removeItem('major-session-v2');
} catch {
  /* sem storage */
}

export default function App() {
  const [dataset, setDataset] = useState<TeamSeason[]>(() => loadDataset());
  const [screen, setScreen] = useState<Screen>('home');
  const [bannerPreview, setBannerPreview] = useState(false); // demo de espaços de banner (#banners)
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matchCtx, setMatchCtx] = useState<MatchCtx | null>(null);
  const [pickem, setPickem] = useState<PickemState>({ picks: {}, score: 0, total: 0 });
  const [career, setCareer] = useState<CareerState>(newCareer());
  const [transferCtx, setTransferCtx] = useState<TransferCtx | null>(null);
  const [detail, setDetail] = useState<{ series: SeriesResult; teams: [TTeam, TTeam]; event: string } | null>(null);
  const [detailReturn, setDetailReturn] = useState<Screen>('hub');
  const [donateOpen, setDonateOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => shouldOnboard());
  const rngRef = useRef(makeRng(randomSeed()));
  const rng = useCallback(() => rngRef.current(), []);
  const { t } = useLang();

  // jogadores só veem times aprovados (pending fica oculto até liberar no CRM)
  const eligible = useMemo(() => dataset.filter((t) => t.players.length >= 5 && !t.pending), [dataset]);
  const playerCount = useMemo(() => dataset.reduce((s, t) => s + t.players.length, 0), [dataset]);
  const brEligible = useMemo(() => eligible.filter((t) => t.country === 'br'), [eligible]);

  const poolTeams = useCallback(
    (pool: TournamentPool) => (pool === 'br' ? brEligible : eligible),
    [brEligible, eligible],
  );

  // Sorteio ponderado por tier: times de elite aparecem bem menos no dado -
  // montar um dream team tem que ser raro. Em dificuldades maiores o campo
  // fica mais forte (elite aparece mais).
  const tierWeight = (t: TeamSeason, difficulty: Difficulty = 'normal') => {
    const avg = t.players.slice(0, 5).reduce((s, p) => s + playerOvr(p), 0) / Math.min(5, t.players.length);
    const eliteBias = difficulty === 'legend' ? 2.4 : difficulty === 'hard' ? 1.5 : 1;
    if (avg >= 90) return 0.55 * eliteBias;
    if (avg >= 87) return 1.1 * eliteBias;
    if (avg >= 83) return 2.2;
    return 2.9;
  };

  const weightedSample = (teams: TeamSeason[], n: number, difficulty: Difficulty = 'normal'): TeamSeason[] => {
    const pool = [...teams];
    const out: TeamSeason[] = [];
    while (out.length < n && pool.length > 0) {
      const weights = pool.map((t) => tierWeight(t, difficulty));
      const total = weights.reduce((s, w) => s + w, 0);
      let r = rngRef.current() * total;
      let idx = 0;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  };

  // ---------- persistência de campanha ----------
  useEffect(() => {
    if (!tournament) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ draft, tournament, pickem, career }));
    } catch {
      /* storage cheio - campanha segue só em memória */
    }
  }, [draft, tournament, pickem, career]);

  // sessionStamp invalida o memo quando o save é apagado sem mudar de tela
  // (ex.: "Nova campanha" clicada já na home)
  const [sessionStamp, setSessionStamp] = useState(0);
  const savedSession = useMemo(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as {
        draft: DraftState | null;
        tournament: Tournament | null;
        pickem?: PickemState;
        career?: CareerState;
      };
      return s?.tournament ? s : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, sessionStamp]);

  const resumeSession = () => {
    if (!savedSession?.tournament) return;
    setDraft(savedSession.draft);
    setTournament(savedSession.tournament);
    setPickem(savedSession.pickem ?? { picks: {}, score: 0, total: 0 });
    setCareer(savedSession.career ? { ...newCareer(), ...savedSession.career } : newCareer());
    setMatchCtx(null);
    setScreen(savedSession.tournament.phase === 'done' ? 'final' : 'hub');
  };

  // A base de dados não tem botão no front: só abre acessando a URL com
  // #admin (ex: https://site/#admin). O hash some da barra ao entrar.
  useEffect(() => {
    const checkHash = () => {
      const h = window.location.hash.toLowerCase();
      if (h === '#admin') {
        setScreen('admin');
        history.replaceState(null, '', window.location.pathname);
      } else if (h === '#hall') {
        setScreen('hall');
        history.replaceState(null, '', window.location.pathname);
      } else if (h === '#carreira') {
        // modo carreira em beta fechado: sem botão no front, só pela URL
        setScreen('career');
        history.replaceState(null, '', window.location.pathname);
      } else if (h === '#carreira-crm') {
        // CRM dos times/jogadores reais da carreira (oculto)
        setScreen('careerCRM');
        history.replaceState(null, '', window.location.pathname);
      } else if (h === '#banners') {
        // demonstração dos espaços de banner para o patrocinador
        setScreen('home');
        setBannerPreview(true);
        history.replaceState(null, '', window.location.pathname);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // telemetria: registra a visita (1x por sessão)
  useEffect(() => {
    trackVisit();
    return startPresenceHeartbeat();
  }, []);

  // rola pro topo ao trocar de tela (evita abrir uma tela já no meio dela)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen]);

  // fonte primária: banco Neon via /api/teams (verdade compartilhada).
  // Só NÃO adota o servidor se o usuário tem edições locais ainda não salvas;
  // assim o "Salvar no banco" do admin chega a todos os jogadores.
  useEffect(() => {
    if (hasUnsavedEdits()) return;
    let cancelled = false;
    fetchRemoteDataset().then((remote) => {
      if (remote && !cancelled) {
        const merged = mergePendingBaseTeams(remote); // times pendentes novos do build sempre aparecem
        setDataset(merged);
        saveDataset(merged); // atualiza o cache local com a base do servidor
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- fluxo: home → draft ----------
  const startDraft = (mode: 'classic' | 'almanac', teamName: string, pool: TournamentPool, difficulty: Difficulty) => {
    rngRef.current = makeRng(randomSeed());
    const base = poolTeams(pool);
    if (base.length < 16) {
      alert('A base precisa de pelo menos 16 times neste modo. Adicione times no CRM.');
      return;
    }
    const sources = weightedSample(base, 5, difficulty);
    const usedIds = new Set(sources.map((t) => t.id));
    const coachOptions = weightedSample(base.filter((t) => !usedIds.has(t.id)), 5, difficulty).map((t) => t.id);
    setDraft({
      mode,
      pool,
      difficulty,
      teamName,
      rounds: sources.map((t) => ({ teamSeasonId: t.id })),
      current: 0,
      rerollsLeft: 2,
      coachOptions,
    });
    setTournament(null);
    setPickem({ picks: {}, score: 0, total: 0 });
    setCareer(newCareer());
    setScreen('draft');
  };

  const rerollDraft = () => {
    if (!draft || draft.rerollsLeft <= 0) return;
    const used = new Set(draft.rounds.map((r) => r.teamSeasonId));
    const options = poolTeams(draft.pool).filter((t) => !used.has(t.id));
    if (options.length === 0) return;
    const next = weightedSample(options, 1, draft.difficulty)[0];
    const rounds = draft.rounds.map((r, i) => (i === draft.current ? { teamSeasonId: next.id } : r));
    setDraft({ ...draft, rounds, rerollsLeft: draft.rerollsLeft - 1 });
  };

  const pickPlayer = (playerId: string) => {
    if (!draft) return;
    const rounds = draft.rounds.map((r, i) => (i === draft.current ? { ...r, pickedPlayerId: playerId } : r));
    setDraft({ ...draft, rounds, current: draft.current + 1 });
  };

  const tournamentName = (pool: TournamentPool, season: number) =>
    `${pool === 'br' ? 'GC MASTERS' : 'MAJOR DOS SONHOS'}${season > 1 ? ` · TEMPORADA ${season}` : ''}`;

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
    const t = createTournament(
      poolTeams(draft.pool),
      user,
      rngRef.current,
      tournamentName(draft.pool, 1),
      DIFFICULTY_OPP_BOOST[draft.difficulty],
    );
    track('game_start', { pool: draft.pool, difficulty: draft.difficulty, mode: draft.mode });
    setDraft({ ...draft, pickedCoachTeamId: teamSeasonId });
    setTournament(t);
    setScreen('hub');
  };

  // ---------- pick'em ----------
  const setPick = (key: string, teamId: string) => {
    setPickem((prev) => ({
      ...prev,
      picks: { ...prev.picks, [key]: prev.picks[key] === teamId ? '' : teamId },
    }));
  };

  const scorePickemAfter = (t: Tournament) => {
    setPickem((prev) => {
      let score = prev.score;
      let total = prev.total;
      const picks = { ...prev.picks };
      for (const h of t.history) {
        const key = `${h.pairing.a}|${h.pairing.b}`;
        const pick = picks[key];
        if (pick === undefined || !h.pairing.result) continue;
        if (pick) {
          total++;
          const winnerId = h.pairing.result.winner === 0 ? h.pairing.a : h.pairing.b;
          if (winnerId === pick) score++;
        }
        delete picks[key];
      }
      return { picks, score, total };
    });
  };

  // abre o detalhe de qualquer série já jogada (inclusive AI vs AI)
  const openSeries = (p: Pairing) => {
    if (!tournament || !p.result) return;
    const a = getTeam(tournament, p.a);
    const b = getTeam(tournament, p.b);
    setDetail({ series: p.result, teams: [a, b], event: `${tournament.name} · ${phaseLabel(tournament)}` });
    setDetailReturn(screen === 'final' ? 'final' : 'hub');
    setScreen('matchdetail');
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
    // a série roda AO VIVO no MatchScreen (timeouts táticos podem mudar o rumo)
    setMatchCtx({ teams: [a, b], maps, userIdx: p.a === 'user' ? 0 : 1, phase: phaseLabel(tournament), bestOf: pairingBestOf(tournament, p) });
    setScreen('match');
  };

  const afterResolve = (clone: Tournament) => {
    scorePickemAfter(clone);
    if (clone.phase === 'done') {
      // premiação em dinheiro pelo desempenho no Major (entra no caixa do clube)
      const code = placementCode(clone, 'user');
      const u = getTeam(clone, 'user');
      const prize = 200_000 + (u?.wins ?? 0) * 150_000 + PRIZE_BY_PLACEMENT[code];
      setCareer((c) => ({
        ...c,
        titles: c.titles + (clone.championId === 'user' ? 1 : 0),
        budget: c.budget + prize,
        lastPrize: prize,
      }));
      track('game_end', {
        champion: clone.championId === 'user',
        difficulty: draft?.difficulty ?? 'normal',
        pool: draft?.pool ?? 'world',
        season: career.season,
      });
    }
    setTournament(clone);
    setScreen(clone.phase === 'done' ? 'final' : 'hub');
  };

  const onMatchFinish = (series: SeriesResult) => {
    if (!tournament || !matchCtx) return;
    const clone = structuredClone(tournament) as Tournament;
    const p = clone.pairings.find((x) => x.a === 'user' || x.b === 'user');
    if (p) p.result = series;
    resolveRound(clone, rngRef.current);
    setMatchCtx(null);
    afterResolve(clone);
  };

  const simRound = () => {
    if (!tournament) return;
    const clone = structuredClone(tournament) as Tournament;
    resolveRound(clone, rngRef.current);
    afterResolve(clone);
  };

  // ---------- modo carreira ----------
  const openTransferWindow = () => {
    if (!tournament || !draft) return;
    const user = userTeam(tournament);
    const evolution = buildEvolution(user);
    const evolved = applyEvolution(user, evolution);
    const nicksInTeam = new Set(evolved.players.map((p) => p.nick.toLowerCase()));
    const offerTeams = weightedSample(
      poolTeams(draft.pool).filter((t) => t.players.some((p) => !nicksInTeam.has(p.nick.toLowerCase()))),
      5,
      draft.difficulty ?? 'normal',
    );
    const offers: TransferOffer[] = offerTeams.map((from) => {
      const candidates = from.players.filter((p) => !nicksInTeam.has(p.nick.toLowerCase()));
      const player = shuffle(rngRef.current, candidates)[0];
      return { player, from };
    });
    setTransferCtx({ evolution, offers, baseTeam: evolved });
    setScreen('transfer');
  };

  const confirmTransfer = (newTeam: TTeam, cost = 0) => {
    if (!draft) return;
    const nextSeason = career.season + 1;
    track('season_start', { season: nextSeason, pool: draft.pool });
    setCareer((c) => ({ ...c, season: nextSeason, budget: c.budget - cost, lastPrize: undefined }));
    rngRef.current = makeRng(randomSeed());
    const t = createTournament(
      poolTeams(draft.pool),
      newTeam,
      rngRef.current,
      tournamentName(draft.pool, nextSeason),
      DIFFICULTY_OPP_BOOST[draft.difficulty ?? 'normal'],
    );
    setPickem({ picks: {}, score: 0, total: 0 });
    setTransferCtx(null);
    setTournament(t);
    setScreen('hub');
  };

  const restart = () => {
    localStorage.removeItem(SESSION_KEY);
    setDraft(null);
    setTournament(null);
    setMatchCtx(null);
    setTransferCtx(null);
    setPickem({ picks: {}, score: 0, total: 0 });
    setCareer(newCareer());
    setScreen('home');
  };

  // ---------- CRM ----------
  const changeDataset = (teams: TeamSeason[]) => {
    setDataset(teams);
    saveDataset(teams);
    markDirty(); // edições locais: só valem aqui até o admin "Salvar no banco"
  };

  const goHome = () => {
    // sem campanha carregada nesta sessão: só navega. NUNCA apagar um save em
    // disco por um clique no logo (vindo do online/hall, tournament é null).
    if (!tournament) {
      setScreen('home');
      return;
    }
    if (tournament.phase !== 'done' && screen !== 'final') {
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
    return {
      teams: [a, b] as [TTeam, TTeam],
      userIdx: (p.a === 'user' ? 0 : 1) as 0 | 1,
      bestOf: pairingBestOf(tournament, p),
      mapRecord: userMapRecord(tournament),
    };
  }, [tournament]);

  return (
    <>
      {/* barra de progresso: remonta a cada troca de tela e replaya a animação */}
      <div className="route-progress" key={screen} />

      {/* DEMO: banner premium SEMPRE VISÍVEL (fica em todas as telas, inclusive
          durante a partida). Pré-visualização para o patrocinador via #banners */}
      {bannerPreview && (
        <div className="ad-persistent">
          <div className="ad-persistent-inner">
            <span className="ad-tag">ESPAÇO PUBLICITÁRIO PREMIUM</span>
            <span className="ad-size">sempre visível durante o jogo · desktop 970×90 · mobile 320×50 (sticky)</span>
            <span className="spacer" />
            <button className="ad-close" onClick={() => setBannerPreview(false)}>fechar preview ✕</button>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="topbar">
          <span className="logo" onClick={goHome}>
            <BrandMark size={32} className="logo-mark" />
            ROAD&nbsp;TO&nbsp;<span>MAJOR</span>
          </span>
          <span className="subtitle">{t('nav.subtitle')}</span>
          <LangSwitcher />
          <DonateButton onClick={() => setDonateOpen(true)} />
          <button className="nav-btn" onClick={() => setScreen('hall')}>
            {t('nav.hall')}
          </button>
        </div>
      </header>

      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
      {showOnboarding && screen === 'home' && <Onboarding onClose={() => setShowOnboarding(false)} />}

      <main className="page">
      <Suspense fallback={<Loader text="…" />}>
      {bannerPreview && screen === 'home' && (
        <>
          <div className="ad-slot leaderboard">
            <span className="ad-tag">ESPAÇO PUBLICITÁRIO</span>
            <span className="ad-size">Leaderboard · desktop 970×90 / 728×90 · mobile 320×100 / 320×50</span>
            <span className="ad-note">banner do parceiro aqui, no topo (acima da dobra)</span>
          </div>
          <div className="ad-slot ad-side left">
            <span className="ad-tag">ESPAÇO PUBLICITÁRIO</span>
            <span className="ad-size">Skyscraper · 160×600 / 300×600</span>
            <span className="ad-note">lateral esquerda</span>
          </div>
          <div className="ad-slot ad-side right">
            <span className="ad-tag">ESPAÇO PUBLICITÁRIO</span>
            <span className="ad-size">Skyscraper · 160×600 / 300×600</span>
            <span className="ad-note">lateral direita</span>
          </div>
        </>
      )}
      {screen === 'home' && (
        <Home
          onStart={startDraft}
          onDonate={() => {
            track('donate_click', { from: 'home' });
            setDonateOpen(true);
          }}
          onHall={() => setScreen('hall')}
          onOnline={() => setScreen('online')}
          onCareer={() => setScreen('career')}
          teamCount={dataset.length}
          playerCount={playerCount}
          savedCampaign={savedSession?.tournament ? { name: savedSession.tournament.name, phase: savedSession.tournament.phase } : null}
          onResume={resumeSession}
          onDiscardCampaign={() => {
            localStorage.removeItem(SESSION_KEY);
            setSessionStamp((s) => s + 1); // o banner some na hora, mesmo já na home
            setScreen('home');
            setTournament(null);
            setDraft(null);
          }}
        />
      )}

      {bannerPreview && screen === 'home' && (
        <>
          <div className="ad-grid">
            <div className="ad-slot rectangle">
              <span className="ad-tag">ESPAÇO PUBLICITÁRIO</span>
              <span className="ad-size">Retângulo · 300×250</span>
              <span className="ad-note">no meio do conteúdo / lateral</span>
            </div>
            <div className="ad-slot rectangle">
              <span className="ad-tag">ESPAÇO PUBLICITÁRIO</span>
              <span className="ad-size">Retângulo · 300×250</span>
              <span className="ad-note">segundo bloco lateral</span>
            </div>
          </div>
          <div className="ad-slot billboard">
            <span className="ad-tag">ESPAÇO PUBLICITÁRIO</span>
            <span className="ad-size">Billboard / rodapé · 970×250 ou 728×90</span>
            <span className="ad-note">banner fixo no rodapé do site</span>
          </div>
          <div className="ad-info">
            Pré-visualização dos espaços de banner para o patrocinador. Acesse por
            <b> roadtomajor.com.br/#banners</b>. Formatos IAB padrão; dá pra ajustar tamanhos e posições.
          </div>
        </>
      )}

      {screen === 'online' && <OnlineScreen onBack={() => setScreen('home')} />}

      {screen === 'career' && <CareerScreen dataset={dataset} onExit={() => setScreen('home')} />}
      {screen === 'careerCRM' && <CareerCRM onExit={() => setScreen('home')} />}

      {screen === 'draft' && draft && (
        <Draft draft={draft} dataset={dataset} onPick={pickPlayer} onPickCoach={pickCoach} onReroll={rerollDraft} />
      )}

      {screen === 'hub' && tournament && (
        <Hub
          t={tournament}
          career={career}
          pickem={pickem}
          onPick={setPick}
          onPlay={playUserMatch}
          onSimRound={simRound}
          onStats={() => setScreen('stats')}
          onOpenSeries={openSeries}
        />
      )}

      {screen === 'matchdetail' && detail && (
        <MatchDetail series={detail.series} teams={detail.teams} event={detail.event} onBack={() => setScreen(detailReturn)} />
      )}

      {screen === 'stats' && tournament && (
        <TournamentStats t={tournament} onBack={() => setScreen(tournament.phase === 'done' ? 'final' : 'hub')} />
      )}

      {screen === 'hall' && <HallScreen onBack={() => setScreen(tournament ? (tournament.phase === 'done' ? 'final' : 'hub') : 'home')} />}

      {screen === 'lab' && <LabScreen dataset={eligible} onBack={() => setScreen('admin')} />}

      {screen === 'transfer' && transferCtx && (
        <TransferScreen
          user={transferCtx.baseTeam}
          season={career.season + 1}
          titles={career.titles}
          budget={career.budget}
          evolution={transferCtx.evolution}
          offers={transferCtx.offers}
          onConfirm={confirmTransfer}
        />
      )}

      {screen === 'veto' && tournament && vetoData && (
        <VetoScreen
          teams={vetoData.teams}
          userIdx={vetoData.userIdx}
          rng={rng}
          phaseLabel={phaseLabel(tournament)}
          bestOf={vetoData.bestOf}
          mapRecord={vetoData.mapRecord}
          onDone={onVetoDone}
        />
      )}

      {screen === 'match' && matchCtx && (
        <MatchScreen
          teams={matchCtx.teams}
          maps={matchCtx.maps}
          userIdx={matchCtx.userIdx}
          rng={rng}
          phaseLabel={matchCtx.phase}
          bestOf={matchCtx.bestOf}
          onFinish={onMatchFinish}
        />
      )}

      {screen === 'final' && tournament && (
        <FinalScreen
          t={tournament}
          career={career}
          pickem={pickem}
          pool={draft?.pool ?? 'world'}
          onRestart={restart}
          onStats={() => setScreen('stats')}
          onHall={() => setScreen('hall')}
          onBracket={() => setScreen('hub')}
          onNextSeason={openTransferWindow}
          onDonate={() => setDonateOpen(true)}
        />
      )}

      {screen === 'admin' && (
        <AdminGate>
          <Admin
            dataset={dataset}
            onChange={changeDataset}
            onReset={() => setDataset(resetDataset())}
            onLab={() => setScreen('lab')}
            onBack={() => setScreen(tournament && tournament.phase !== 'done' ? 'hub' : 'home')}
          />
        </AdminGate>
      )}
      </Suspense>
      </main>
    </>
  );
}
