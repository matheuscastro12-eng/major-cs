import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { AdminGate } from './components/AdminGate';
import { BrandMark } from './components/brand';
import { DonateButton, DonateModal } from './components/Donate';
import { AdBanner } from './components/AdBanner';
import { Draft } from './components/Draft';
import { AppFrame } from './components/ds';
import { Home } from './components/Home';
import { Hub } from './components/Hub';
import { MatchScreen } from './components/MatchScreen';
import { Onboarding, shouldOnboard } from './components/Onboarding';
import { UpsellCard } from './components/UpsellCard';
import { Loader } from './components/ui';
import { AchievementsModal, AchievementToast } from './components/Achievements';
import { recordGameEnd, type AchDef } from './state/achievements';

// Deploy novo troca os hashes dos chunks; uma aba aberta tenta carregar um chunk
// antigo que sumiu do servidor → "Failed to fetch dynamically imported module".
// lazyWithReload recarrega a página UMA vez (guard em sessionStorage) pra pegar os
// assets frescos, em vez de cair no ErrorBoundary. O guard é limpo num load OK.
const CHUNK_RELOAD_KEY = 'rtm-chunk-reload';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy<T>(() => factory().then((m) => { try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ok */ } return m; }).catch((err): Promise<{ default: T }> => {
    let already = false;
    try { already = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'; } catch { /* ok */ }
    if (!already) {
      try { sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch { /* ok */ }
      window.location.reload();
      return new Promise<{ default: T }>(() => {}); // nunca resolve: segura até o reload
    }
    throw err; // já tentou recarregar: deixa o ErrorBoundary mostrar
  }));
}
// Vite também emite este evento quando o PRELOAD de um chunk falha (mesma causa).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    let already = false;
    try { already = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'; } catch { /* ok */ }
    if (!already) {
      e.preventDefault();
      try { sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch { /* ok */ }
      window.location.reload();
    }
  });
}

// telas pesadas e/ou pouco usadas: carregadas sob demanda (code-splitting) pra
// deixar o carregamento inicial bem mais leve.
const Admin = lazyWithReload(() => import('./components/Admin').then((m) => ({ default: m.Admin })));
const CareerScreen = lazyWithReload(() => import('./components/CareerScreen').then((m) => ({ default: m.CareerScreen })));
const CareerSaves = lazyWithReload(() => import('./components/CareerSaves').then((m) => ({ default: m.CareerSaves })));
const CareerCRM = lazyWithReload(() => import('./components/CareerCRM').then((m) => ({ default: m.CareerCRM })));
const AccountsCRM = lazyWithReload(() => import('./components/AccountsCRM').then((m) => ({ default: m.AccountsCRM })));
const FinalScreen = lazyWithReload(() => import('./components/FinalScreen').then((m) => ({ default: m.FinalScreen })));
const HallScreen = lazyWithReload(() => import('./components/HallScreen').then((m) => ({ default: m.HallScreen })));
const LabScreen = lazyWithReload(() => import('./components/LabScreen').then((m) => ({ default: m.LabScreen })));
const MatchDetail = lazyWithReload(() => import('./components/MatchDetail').then((m) => ({ default: m.MatchDetail })));
const OnlineMode = lazyWithReload(() => import('./components/online/OnlineMode').then((m) => ({ default: m.OnlineMode })));
const TournamentStats = lazyWithReload(() => import('./components/TournamentStats').then((m) => ({ default: m.TournamentStats })));
import { applyEvolution, buildEvolution, TransferScreen, type TransferOffer } from './components/TransferScreen';
import { VetoScreen } from './components/VetoScreen';
import { buildUserTeam, playerOvr } from './engine/ratings';
import { makeRng, randomSeed, shuffle } from './engine/rng';
import { createTournament, getTeam, pairingBestOf, phaseLabelDisplay, placementCode, resolveRound, userMapRecord, userPairing, userTeam, type PlacementCode } from './engine/swiss';
import { fetchRemoteDataset, hasUnsavedEdits, loadDataset, markDirty, mergePendingBaseTeams, resetDataset, saveDataset } from './state/crm';
import { BASE_TEAMS, BASE_REV } from './data/teams';
import { useLang } from './state/i18n';
import { ct, setCareerLang } from './state/career-i18n';
import { LangSwitcher } from './components/social';
import { Landing, AccountModal } from './components/Landing';
import { LegalPage } from './components/Legal';
import { ManagerSetup } from './components/ManagerSetup';
import { ManagerProfile } from './components/ManagerProfile';
import { Leaderboard } from './components/Leaderboard';
import { beginCheckout, claim as claimAccount, useAccount } from './state/account';
import { parseCareerPlayerId, isCareerPlayerPath, careerPlayerPath } from './state/career-player-route';
import { parseCareerTeamId, careerTeamPath, isCareerTeamPath } from './state/career-team-route';
import { getActiveSlot, setActiveSlot, slotKey, cloudSlot } from './state/careerSaves';
import { useManager } from './state/manager';
import { setCloudEnabled, syncSlot } from './state/cloud';
import { track, trackVisit } from './state/track';
import { DIFFICULTY_OPP_BOOST } from './types';
import type { Difficulty, DraftState, MapId, Pairing, SeriesResult, TeamSeason, Tournament, TournamentPool, TTeam } from './types';

type Screen =
  | 'landing'
  | 'setup'
  | 'profile'
  | 'leaderboard'
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
  | 'careerSaves'
  | 'careerCRM'
  | 'careerAccess'
  | 'privacy'
  | 'terms'
  | 'refund';

const SCREEN_PATH: Record<Screen, string> = {
  landing: '/',
  setup: '/criar-manager',
  profile: '/perfil',
  leaderboard: '/ranking',
  home: '/jogar',
  online: '/online',
  career: '/carreira',
  careerSaves: '/carreira/saves',
  hall: '/hall',
  draft: '/jogo/draft',
  hub: '/jogo/major',
  veto: '/jogo/veto',
  match: '/jogo/partida',
  final: '/jogo/resultado',
  stats: '/jogo/estatisticas',
  transfer: '/jogo/transferencias',
  matchdetail: '/jogo/partida/detalhes',
  admin: '/admin',
  lab: '/admin/lab',
  careerCRM: '/admin/carreira',
  careerAccess: '/admin/acessos',
  privacy: '/privacidade',
  terms: '/termos',
  refund: '/reembolso',
};

const PATH_SCREEN: Record<string, Screen> = Object.fromEntries(
  Object.entries(SCREEN_PATH).map(([screen, path]) => [path, screen as Screen]),
) as Record<string, Screen>;

const TRANSIENT_SCREENS = new Set<Screen>([
  'draft', 'hub', 'veto', 'match', 'final', 'stats', 'transfer', 'matchdetail',
]);
const ROUTE_SESSION_ID = `${Date.now()}-${Math.random()}`;

const normalizePath = (path: string) => {
  const normalized = path.toLowerCase().replace(/\/+$/, '');
  return normalized || '/';
};

function routeFromLocation(): { screen: Screen; bannerPreview: boolean } {
  const hash = window.location.hash.toLowerCase();
  const legacyHash: Record<string, Screen> = {
    '#admin': 'admin',
    '#hall': 'hall',
    '#carreira': 'career',
    '#carreira-crm': 'careerCRM',
    '#carreira-acessos': 'careerAccess',
  };
  if (hash === '#banners') return { screen: 'home', bannerPreview: true };
  if (legacyHash[hash]) return { screen: legacyHash[hash], bannerPreview: false };

  const path = normalizePath(window.location.pathname);
  if (isCareerPlayerPath(path) || isCareerTeamPath(path)) return { screen: 'career', bannerPreview: false };
  if (path === '/ultimateteam' || path === '/ultimate-team' || path === '/online' || path.startsWith('/online/')) {
    return { screen: 'online', bannerPreview: false }; // /online/<código> = deep link de sala
  }
  if (path === '/banners') return { screen: 'home', bannerPreview: true };
  const matched = PATH_SCREEN[path] ?? 'home';
  if (TRANSIENT_SCREENS.has(matched)) {
    const routeState = window.history.state as { screen?: Screen; routeSession?: string } | null;
    if (routeState?.routeSession !== ROUTE_SESSION_ID || routeState.screen !== matched) {
      return { screen: 'home', bannerPreview: false };
    }
  }
  return { screen: matched, bannerPreview: false };
}


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

// deep-link de CRIAÇÃO DE CONTA: /?criar (ou #criar) abre o modal já no cadastro.
// Lido UMA vez no carregamento (nível de módulo) pra sobreviver ao remount do
// StrictMode em dev — se fosse lido no efeito, a limpeza da URL no 1º mount faria
// o 2º mount não reabrir.
const WANTS_SIGNUP = (() => {
  try {
    return new URLSearchParams(window.location.search).get('criar') !== null
      || window.location.hash.toLowerCase() === '#criar';
  } catch { return false; }
})();

export default function App() {
  const [dataset, setDataset] = useState<TeamSeason[]>(() => loadDataset());
  const [screen, setScreen] = useState<Screen>(() => routeFromLocation().screen);
  const [bannerPreview, setBannerPreview] = useState(() => routeFromLocation().bannerPreview);
  const { account, ready: accountReady, refresh: refreshAccount, logout } = useAccount();
  const { manager, saveManager } = useManager();
  const [paidToast, setPaidToast] = useState(false);
  // retorno do Stripe: /jogar?conta=ok&cs=SESSION → confirma o pagamento e libera a conta
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('conta') !== 'ok') return;
    const cs = sp.get('cs') ?? '';
    void (async () => {
      if (cs) { const ok = await claimAccount(cs); if (ok) { setPaidToast(true); await refreshAccount(); } }
      const url = new URL(window.location.href);
      url.searchParams.delete('conta'); url.searchParams.delete('cs');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    })();
  }, [refreshAccount]);
  const [achToast, setAchToast] = useState<AchDef[]>([]); // conquistas recém-desbloqueadas
  const [achOpen, setAchOpen] = useState(false);
  // T3.14: captura conquistas disparadas via custom event (recordSaveTick na carreira)
  useEffect(() => {
    const onAch = (e: Event) => {
      const ce = e as CustomEvent<AchDef[]>;
      if (Array.isArray(ce.detail) && ce.detail.length > 0) {
        setAchToast((prev) => [...prev, ...ce.detail]);
      }
    };
    window.addEventListener('rtm:achievements', onAch);
    return () => window.removeEventListener('rtm:achievements', onAch);
  }, []);
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
  const routeReadyRef = useRef(false);
  const popNavigationRef = useRef(false);
  const rng = useCallback(() => rngRef.current(), []);
  const { t, lang } = useLang();
  setCareerLang(lang); // idioma global: ct() traduz em QUALQUER tela (não só na carreira)

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

  // save na nuvem (conta vitalícia): liga o espelhamento e reconcilia no login.
  // Se a nuvem estiver mais nova, restaura no localStorage e atualiza a home.
  const [cloudToast, setCloudToast] = useState('');
  // já abre no cadastro quando veio do deep-link /?criar (pra divulgar no Twitter).
  const [authOpen, setAuthOpen] = useState(WANTS_SIGNUP); // modal de login/conta acessível do header
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(WANTS_SIGNUP ? 'signup' : 'login');
  // limpa o ?criar/#criar da URL depois que a intenção já foi capturada.
  useEffect(() => {
    if (!WANTS_SIGNUP) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('criar');
    if (url.hash.toLowerCase() === '#criar') url.hash = '';
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, []);
  useEffect(() => {
    setCloudEnabled(!!account?.paid);
    if (!account?.paid) return;
    let alive = true;
    void syncSlot(cloudSlot(getActiveSlot()), slotKey(getActiveSlot())).then((r) => {
      if (alive && r === 'restored') { setCloudToast(ct('☁ Save da carreira carregado da nuvem')); setSessionStamp((s) => s + 1); }
    });
    return () => { alive = false; };
  }, [account?.paid]);
  useEffect(() => {
    if (!cloudToast) return;
    const t = window.setTimeout(() => setCloudToast(''), 5000);
    return () => window.clearTimeout(t);
  }, [cloudToast]);

  // ativação: usuário grátis voltando após 7+ dias ganha um nudge (1× por visita).
  // Marca a data de hoje no localStorage e compara com a anterior. Cooldown próprio
  // do UpsellCard (45min) ainda vale, então se ele acabou de ver outro upsell hoje,
  // este não duplica.
  useEffect(() => {
    if (!accountReady || account?.paid) return;
    try {
      const LAST_KEY = 'rtm_last_visit';
      const now = Date.now();
      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      localStorage.setItem(LAST_KEY, String(now));
      if (last > 0 && now - last > 1000 * 60 * 60 * 24 * 7) {
        window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'return' } }));
      }
    } catch { /* sem storage */ }
  }, [accountReady, account?.paid]);

  const resumeSession = () => {
    if (!savedSession?.tournament) return;
    setDraft(savedSession.draft);
    setTournament(savedSession.tournament);
    setPickem(savedSession.pickem ?? { picks: {}, score: 0, total: 0 });
    setCareer(savedSession.career ? { ...newCareer(), ...savedSession.career } : newCareer());
    setMatchCtx(null);
    setScreen(savedSession.tournament.phase === 'done' ? 'final' : 'hub');
  };

  // Restaura a tela ao usar voltar/avançar do navegador. Os hashes antigos
  // continuam aceitos, mas são convertidos para os caminhos canônicos.
  useEffect(() => {
    const onPopState = () => {
      const route = routeFromLocation();
      popNavigationRef.current = true;
      setScreen(route.screen);
      setBannerPreview(route.bannerPreview);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Cada tela ganha uma URL real e navegável. A primeira sincronização usa
  // replace para canonicalizar aliases; cliques seguintes criam histórico.
  useEffect(() => {
    let targetPath = screen === 'home' && bannerPreview ? '/banners' : SCREEN_PATH[screen];
    // o OnlineScreen gere a própria subrota /online/<código>; não canonicaliza de volta
    if (screen === 'online' && window.location.pathname.toLowerCase().startsWith('/online')) {
      targetPath = window.location.pathname;
    }
    if (screen === 'career') {
      const playerId = parseCareerPlayerId();
      const teamId = parseCareerTeamId();
      if (playerId) targetPath = careerPlayerPath(playerId);
      else if (teamId) targetPath = careerTeamPath(teamId);
    }
    const target = `${targetPath}${window.location.search}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== target) {
      if (!routeReadyRef.current || popNavigationRef.current) {
        window.history.replaceState({ screen, routeSession: ROUTE_SESSION_ID }, '', target);
      } else {
        window.history.pushState({ screen, routeSession: ROUTE_SESSION_ID }, '', target);
      }
    }
    routeReadyRef.current = true;
    popNavigationRef.current = false;
  }, [screen, bannerPreview]);

  // título da aba acompanha a tela (cara mais profissional, abas distinguíveis)
  useEffect(() => {
    const TITLES: Partial<Record<Screen, string>> = {
      draft: 'Draft', hub: 'Campeonato', veto: 'Veto de mapas', match: 'Partida ao vivo',
      final: 'Resultado', online: 'Online', career: 'Modo Carreira', hall: 'Hall da Fama',
      stats: 'Estatísticas', admin: 'Admin',
      privacy: 'Privacidade', terms: 'Termos', refund: 'Reembolso',
    };
    const sub = TITLES[screen];
    document.title = sub ? `${ct(sub)} · Road to Major` : ct('Road to Major · simulador de CS de todas as eras');
  }, [screen, lang]);

  // telemetria: SÓ 1 evento de visita por sessão (barato). Removido o heartbeat
  // de presença ("online agora"), que batia /api/track a cada 90s em TODO
  // visitante — gasto recorrente que não compensa.
  useEffect(() => {
    trackVisit();
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
      if (!remote || cancelled) return;
      if (remote.rev && remote.rev === BASE_REV) {
        // banco salvo CONTRA este build: tem as edições mais novas do admin
        const merged = mergePendingBaseTeams(remote.teams);
        setDataset(merged);
        saveDataset(merged);
      } else {
        // banco salvo num build ANTIGO (ou sem rev): o deploy novo manda. Usa a
        // base fresca do build e preserva só os times que existem SÓ no banco
        // (criados pelo admin e ainda não trazidos pro teams.json).
        const buildIds = new Set(BASE_TEAMS.map((t) => t.id));
        const dbOnly = remote.teams.filter((t) => !buildIds.has(t.id));
        const fresh = [...structuredClone(BASE_TEAMS), ...dbOnly];
        setDataset(fresh);
        saveDataset(fresh);
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
      alert(ct('A base precisa de pelo menos 16 times neste modo. Adicione times no CRM.'));
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
    `${t(pool === 'br' ? 'home.poolBr' : 'home.poolWorld')}${season > 1 ? ` · ${t('final.season').toUpperCase()} ${season}` : ''}`;

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
    setDetail({ series: p.result, teams: [a, b], event: `${tournament.name} · ${phaseLabelDisplay(tournament)}` });
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
    setMatchCtx({ teams: [a, b], maps, userIdx: p.a === 'user' ? 0 : 1, phase: phaseLabelDisplay(tournament), bestOf: pairingBestOf(tournament, p) });
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
      // conquistas: detecta desbloqueios e mostra um toast
      const champ = clone.championId === 'user';
      const fresh = recordGameEnd({
        champion: champ,
        placement: code,
        difficulty: draft?.difficulty ?? 'normal',
        pool: draft?.pool ?? 'world',
        swissWins: u?.wins ?? 0,
        swissLosses: u?.losses ?? 0,
        totalTitles: career.titles + (champ ? 1 : 0),
      });
      if (fresh.length) setAchToast(fresh);
      // ativação: fechou o Major do draft no grátis → gancho pra criar conta/carreira
      if (clone.phase === 'done' && !account?.paid) {
        window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: champ ? 'draft-win' : 'save-risk' } }));
      }
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
      if (!confirm(ct('Abandonar o Major em andamento e voltar para o início?'))) return;
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

  // O backend liga o Payment Link à conta autenticada com uma referência opaca.
  const startCheckout = async () => {
    track('checkout_start', {});
    const url = await beginCheckout();
    if (url) window.location.href = url;
    else {
      setPaidToast(true);
      await refreshAccount();
      setScreen(manager ? 'home' : 'setup');
    }
  };

  if (screen === 'landing') {
    return (
      <>
        <Landing onPlay={() => setScreen(manager ? 'home' : 'setup')} onCheckout={startCheckout} openSignup={WANTS_SIGNUP} />
        {!bannerPreview && <AdBanner />}
      </>
    );
  }

  if (screen === 'privacy' || screen === 'terms' || screen === 'refund') {
    return <LegalPage kind={screen} onBack={() => setScreen('landing')} />;
  }

  // Portão do Setup: não vive só no botão "Jogar". Sem manager criado, qualquer
  // entrada direta no jogo (deep link, F5, retorno do Stripe em /jogar) cai aqui.
  if (screen === 'setup' || !manager) {
    return <ManagerSetup initial={manager} defaultNick={account?.nick} onDone={(m) => { saveManager(m); setScreen('home'); }} />;
  }

  if (screen === 'profile' && manager) {
    return (
      <main className="page" style={{ paddingTop: 24 }}>
        <ManagerProfile
          manager={manager}
          account={account}
          onBack={() => setScreen('home')}
          onEdit={() => setScreen('setup')}
          onUpgrade={() => setScreen('landing')}
          onManageSaves={account?.paid ? () => setScreen('careerSaves') : undefined}
          onAccountDeleted={() => {
            logout();
            setCloudEnabled(false);
            setCloudToast(ct('Conta e dados na nuvem excluídos. Seus saves locais continuam neste navegador.'));
            setScreen('home');
          }}
        />
      </main>
    );
  }

  if (screen === 'leaderboard') {
    return (
      <main className="page" style={{ paddingTop: 24 }}>
        <Leaderboard account={account} onBack={() => setScreen('home')} onUpgrade={() => setScreen('landing')} />
      </main>
    );
  }

  return (
    <>
      {/* barra de progresso: remonta a cada troca de tela e replaya a animação */}
      <div className="route-progress" key={screen} />

      {paidToast && (
        <div className="paid-toast" role="status">
          <span>{ct('★ Conta com save ativada! Nuvem e ranking persistente liberados.')}</span>
          <button onClick={() => setPaidToast(false)} aria-label={ct('fechar')}>✕</button>
        </div>
      )}

      {cloudToast && (
        <div className="paid-toast" role="status">
          <span>{cloudToast}</span>
          <button onClick={() => setCloudToast('')} aria-label={ct('fechar')}>✕</button>
        </div>
      )}

      {achToast.length > 0 && <AchievementToast items={achToast} onDone={() => setAchToast([])} />}
      {achOpen && <AchievementsModal onClose={() => setAchOpen(false)} />}

      {/* DEMO: banner premium SEMPRE VISÍVEL (fica em todas as telas, inclusive
          durante a partida). Pré-visualização para o patrocinador via /banners */}
      {bannerPreview && (
        <div className="ad-persistent">
          <div className="ad-persistent-inner">
            <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO PREMIUM')}</span>
            <span className="ad-size">{ct('sempre visível durante o jogo · desktop 970×90 · mobile 320×50 (sticky)')}</span>
            <span className="spacer" />
            <button className="ad-close" onClick={() => setBannerPreview(false)}>{ct('fechar preview ✕')}</button>
          </div>
        </div>
      )}
      {screen !== 'career' && (
        <header className="app-header">
          <div className="topbar">
            <span className="logo" onClick={goHome}>
              <BrandMark size={32} className="logo-mark" />
              ROAD&nbsp;TO&nbsp;<span>MAJOR</span>
            </span>
            <span className="subtitle">{t('nav.subtitle')}</span>
            <LangSwitcher />
            <DonateButton onClick={() => setDonateOpen(true)} />
            {account && (
              <button className="acct-chip" title={account.founder ? `${ct('Fundador')}${account.founderNo != null ? ` #${String(account.founderNo).padStart(3, '0')}` : ''} · ${ct('apoiador desde o lançamento')}` : account.paid ? ct('Conta vitalícia (apoiador) · perfil, saves e conta') : ct('Sua conta · ver perfil')} onClick={() => setScreen(manager ? 'profile' : 'setup')}>
                {account.paid && <span className="acct-star">★</span>}
                {account.nick || account.email}
                {account.founder
                  ? <span className="acct-tag">{ct('FUNDADOR')}{account.founderNo != null ? ` #${String(account.founderNo).padStart(3, '0')}` : ''}</span>
                  : account.paid && <span className="acct-tag">{ct('VITALÍCIA')}</span>}
              </button>
            )}
            <button
              className="nav-btn"
              title={account ? ct('Perfil e configurações da conta') : ct('Entrar ou criar conta')}
              onClick={() => { if (account) { setScreen(manager ? 'profile' : 'setup'); } else { setAuthOpen(true); } }}
            >
              {account ? ct('Conta') : ct('Entrar')}
            </button>
            <button className="nav-btn" onClick={() => setScreen('hall')}>
              {t('nav.hall')}
            </button>
          </div>
        </header>
      )}

      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
      {/* card de ativação (upsell) global: abre via evento rtm:upsell de qualquer tela.
         Antes era excluído da carreira (screen !== 'career'), mas é nela que os
         momentos emocionais acontecem (split, promoção, título) — os 3 dispatches
         do CareerScreen iam pro vazio. O overlay já é dismissível (clique fora ou
         ✕), então não bloqueia o jogo. */}
      {!account?.paid && <UpsellCard onUpgrade={startCheckout} />}
      {authOpen && !account && (
        <AccountModal
          initialMode={authMode}
          onClose={() => { setAuthOpen(false); setAuthMode('login'); }}
          onCheckout={startCheckout}
          onPlay={async () => { setAuthOpen(false); await refreshAccount(); setScreen(manager ? 'home' : 'setup'); }}
        />
      )}
      {showOnboarding && screen === 'home' && <Onboarding onClose={() => setShowOnboarding(false)} />}

      <main className={screen === 'career' ? 'page page-career' : screen === 'home' ? 'page page-play' : 'page'}>
      <Suspense fallback={<Loader text="…" />}>
      {bannerPreview && screen === 'home' && (
        <>
          <div className="ad-slot leaderboard">
            <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO')}</span>
            <span className="ad-size">{ct('Leaderboard · desktop 970×90 / 728×90 · mobile 320×100 / 320×50')}</span>
            <span className="ad-note">{ct('banner do parceiro aqui, no topo (acima da dobra)')}</span>
          </div>
          <div className="ad-slot ad-side left">
            <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO')}</span>
            <span className="ad-size">{ct('Skyscraper · 160×600 / 300×600')}</span>
            <span className="ad-note">{ct('lateral esquerda')}</span>
          </div>
          <div className="ad-slot ad-side right">
            <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO')}</span>
            <span className="ad-size">{ct('Skyscraper · 160×600 / 300×600')}</span>
            <span className="ad-note">{ct('lateral direita')}</span>
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
          onLeaderboard={() => setScreen('leaderboard')}
          onCareer={() => {
            // Aguarda account terminar de carregar antes de decidir o caminho —
            // antes podia cair no else se o usuário clicava muito rápido
            // (account === null durante o fetch /me) e perder o redirect pro
            // gerenciador de saves.
            if (!accountReady) return;
            if (account?.paid) { setScreen('careerSaves'); }
            else { setActiveSlot(1); setScreen('career'); }
          }}
          account={account}
          accountReady={accountReady}
          onAccount={() => setScreen(manager ? 'profile' : 'setup')}
          onCreateAccount={() => setScreen('landing')}
          onLogout={() => { logout(); setCloudEnabled(false); }}
          onAchievements={() => setAchOpen(true)}
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
              <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO')}</span>
              <span className="ad-size">{ct('Retângulo · 300×250')}</span>
              <span className="ad-note">{ct('no meio do conteúdo / lateral')}</span>
            </div>
            <div className="ad-slot rectangle">
              <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO')}</span>
              <span className="ad-size">{ct('Retângulo · 300×250')}</span>
              <span className="ad-note">{ct('segundo bloco lateral')}</span>
            </div>
          </div>
          <div className="ad-slot billboard">
            <span className="ad-tag">{ct('ESPAÇO PUBLICITÁRIO')}</span>
            <span className="ad-size">{ct('Billboard / rodapé · 970×250 ou 728×90')}</span>
            <span className="ad-note">{ct('banner fixo no rodapé do site')}</span>
          </div>
          <div className="ad-info">
            {ct('Pré-visualização dos espaços de banner para o patrocinador. Acesse por')}{' '}
            <b>roadtomajor.com.br/banners</b>. {ct('Formatos IAB padrão; dá pra ajustar tamanhos e posições.')}
          </div>
        </>
      )}

      {screen === 'online' && <OnlineMode onBack={() => setScreen('home')} account={account} dataset={dataset} />}

      {/* gerência de saves: só conta vitalícia (até 5 carreiras) */}
      {screen === 'careerSaves' && (
        <CareerSaves
          paid={!!account?.paid}
          onPlay={(slot) => { setActiveSlot(slot); setScreen('career'); }}
          onBack={() => setScreen('home')}
        />
      )}
      {/* carreira aberta de graça pra todos (o R$20 vale por save na nuvem + ranking) */}
      {screen === 'career' && (
        <>
          <CareerScreen dataset={dataset} founder={!!account?.founder} onExit={() => setScreen(account?.paid ? 'careerSaves' : 'home')} />
        </>
      )}
      {screen === 'careerCRM' && (
        <AdminGate>
          <CareerCRM onExit={() => setScreen('home')} />
        </AdminGate>
      )}
      {screen === 'careerAccess' && (
        <AdminGate>
          <AccountsCRM onExit={() => setScreen('home')} />
        </AdminGate>
      )}

      {screen === 'draft' && draft && (
        <AppFrame title={`Draft · ${draft.current < 5 ? `Pick ${draft.current + 1}/5` : 'Coach'}`} onExit={() => setScreen('home')}>
          <Draft draft={draft} dataset={dataset} onPick={pickPlayer} onPickCoach={pickCoach} onReroll={rerollDraft} />
        </AppFrame>
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
          phaseLabel={phaseLabelDisplay(tournament)}
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

      {/* patrocinador sempre visível no rodapé (G4 Skins). Some sozinho se o asset
          ainda não estiver no ar. Não aparece no modo de preview de banners.
          Antes era escondido na carreira (screen !== 'career'), mas é onde o user
          passa 95% do tempo — sem isso o banner 'sumia' do dia-a-dia. O
          body.has-ad-footer já reserva o padding-bottom necessário pro UI da
          carreira não ser engolido pelo banner fixed. */}
      {!bannerPreview && <AdBanner />}
    </>
  );
}
