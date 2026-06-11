// MODO CARREIRA REALISTA (v0, NÃO LISTADO: só abre via #carreira).
// Fundar sua organização nos tempos atuais (só elencos CS2), contratar dentro
// do orçamento e disputar o CIRCUIT X (liga BR de pontos corridos). Vitórias
// rendem dinheiro e pontos de VRS - o caminho até o Major virá nas próximas
// fases. Textos em PT por enquanto (modo em refino, não lançado).
import { useMemo, useRef, useState } from 'react';
import { formatMoney, playerValue, playerWage, buildUserTeam, playerOvr } from '../engine/ratings';
import { createLeague, leagueDone, leagueTable, leagueTeam, resolveLeagueRound, userLeagueMatch, type League } from '../engine/league';
import { teamSeasonToTTeam } from '../engine/ratings';
import { simulateSeries } from '../engine/match';
import { autoVeto } from '../engine/veto';
import { createTournament, placementCode, resolveRound, userPairing as tournamentUserPairing, getTeam, type PlacementCode } from '../engine/swiss';
import { Hub } from './Hub';
import { makeRng, randomSeed } from '../engine/rng';
import type { Coach, MapId, Player, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { MatchScreen } from './MatchScreen';
import { VetoScreen } from './VetoScreen';
import { Scoreboard } from './Scoreboard';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { logoForTeam } from '../data/media';
import { fileToDataUrl } from '../state/crm';

const SAVE_KEY = 'rtm-career-v1';
const STARTING_BUDGET = 6_000_000;
const PRIZE_BY_POS = [2_000_000, 1_200_000, 700_000, 400_000, 250_000, 150_000, 100_000, 50_000];
const VRS_BY_POS = [200, 140, 100, 70, 50, 35, 25, 15];
const LEAGUE_BO: 1 | 3 = 3;
const MAJOR_SPOTS = 2; // top 2 do Circuit X garantem vaga no Major
// premiação e VRS do Major por colocação (bem maior que o circuito)
const MAJOR_PRIZE: Record<PlacementCode, number> = {
  champion: 8_000_000,
  runnerup: 4_000_000,
  semi: 2_400_000,
  quarters: 1_400_000,
  playoffs: 800_000,
  swiss: 400_000,
};
const MAJOR_VRS: Record<PlacementCode, number> = {
  champion: 600,
  runnerup: 400,
  semi: 280,
  quarters: 180,
  playoffs: 120,
  swiss: 70,
};
// nomes reais de Majors (fonte: Liquipedia), rotacionando por split
const MAJOR_NAMES = ['PGL Major Copenhagen', 'BLAST.tv Austin Major', 'IEM Major Rio', 'PGL Major Budapest', 'ESL One Major Cologne'];
const MAJOR_NAME = (split: number) => MAJOR_NAMES[(split - 1) % MAJOR_NAMES.length];

interface Signing {
  playerId: string;
  fromId: string;
}

// Patrocinadores: marcas reais que pagam por split. Os de maior tier exigem
// prestígio (VRS acumulado) pra liberar o contrato. Até 3 slots ativos.
interface Sponsor {
  id: string;
  name: string;
  perSplit: number;
  minVrs: number;
  color: string;
}
const SPONSORS: Sponsor[] = [
  { id: 'logitech', name: 'Logitech G', perSplit: 200_000, minVrs: 0, color: '#00b8fc' },
  { id: 'hyperx', name: 'HyperX', perSplit: 280_000, minVrs: 0, color: '#e21b22' },
  { id: 'razer', name: 'Razer', perSplit: 320_000, minVrs: 150, color: '#44d62c' },
  { id: 'monster', name: 'Monster Energy', perSplit: 400_000, minVrs: 250, color: '#7ed957' },
  { id: 'secretlab', name: 'Secretlab', perSplit: 360_000, minVrs: 200, color: '#d9a441' },
  { id: 'intel', name: 'Intel', perSplit: 520_000, minVrs: 400, color: '#0071c5' },
  { id: 'redbull', name: 'Red Bull', perSplit: 650_000, minVrs: 550, color: '#cc0033' },
  { id: 'samsung', name: 'Samsung', perSplit: 800_000, minVrs: 750, color: '#1428a0' },
];
const SPONSOR_SLOTS = 3;
const sponsorById = (id: string) => SPONSORS.find((s) => s.id === id);
const sponsorIncome = (ids: string[]) => ids.reduce((a, id) => a + (sponsorById(id)?.perSplit ?? 0), 0);

// campeonato escolhido para o split (define o chaveamento e a premiação)
interface CircuitChoice {
  id: string;
  name: string;
  spots: number;     // vagas que vão ao Major
  prizeMult: number; // multiplicador de premiação
  vrsMult: number;   // multiplicador de VRS
}

// registro de um split encerrado (história da organização)
interface SplitRecord {
  split: number;
  circuit: string;
  position: number;
  wins: number;
  losses: number;
  roundDiff: number;
  prize: number;
  vrs: number;
  champion: boolean; // venceu o circuito
  major?: { placement: PlacementCode; champion: boolean };
}

interface CareerSave {
  org: { name: string; tag: string; colors: [string, string]; logo?: string } | null;
  budget: number;
  vrs: number;
  split: number;
  titles: number;
  squad: Signing[];
  coachFromId: string | null;
  league: League | null;
  circuit: CircuitChoice | null;
  history: SplitRecord[];
  sponsors: string[];
}

const emptySave = (): CareerSave => ({
  org: null,
  budget: STARTING_BUDGET,
  vrs: 0,
  split: 1,
  titles: 0,
  squad: [],
  coachFromId: null,
  league: null,
  circuit: null,
  history: [],
  sponsors: [],
});

function loadSave(): CareerSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const s = JSON.parse(raw) as CareerSave;
    return { ...emptySave(), ...s };
  } catch {
    return emptySave();
  }
}

function persist(s: CareerSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* sem storage */
  }
}

const coachFee = (c: Coach): number => Math.max(100_000, (c.rating - 60) * 30_000);

// opção de entrada: técnico iniciante barato para clubes recém-fundados
const ROOKIE_COACH: Coach = { nick: 'rook1e', name: 'Técnico Iniciante', country: 'br', rating: 66, style: 'tactical' };
const ROOKIE_ID = '__rookie__';

type Stage = 'found' | 'market' | 'circuit' | 'hub' | 'veto' | 'match' | 'seasonEnd' | 'majorHub' | 'major';
type HubTab = 'overview' | 'results' | 'standings' | 'squad' | 'history';

interface MajorResult {
  tournament: Tournament;
  placement: PlacementCode;
  prize: number;
  vrs: number;
  champion: boolean;
}

interface Props {
  dataset: TeamSeason[];
  onExit: () => void;
}

export function CareerScreen({ dataset, onExit }: Props) {
  const [save, setSave] = useState<CareerSave>(() => loadSave());
  const [stage, setStage] = useState<Stage>(() => {
    const s = loadSave();
    if (!s.org) return 'found';
    // sem elenco fechado = janela de mercado/transferências
    if (s.squad.length < 5 || !s.coachFromId) return 'market';
    // elenco pronto mas sem liga = escolha do campeonato (qual convite aceitar)
    if (!s.league) return 'circuit';
    if (leagueDone(s.league)) return 'seasonEnd';
    return 'hub';
  });
  const [matchCtx, setMatchCtx] = useState<{
    teams: [TTeam, TTeam];
    userIdx: 0 | 1;
    maps?: { map: MapId; pickedBy: 0 | 1 | -1 }[];
    mode: 'league' | 'major';
    bestOf: 1 | 3 | 5;
    phaseLabel: string;
  } | null>(null);
  const [selSeries, setSelSeries] = useState<{ series: SeriesResult; teams: [TTeam, TTeam] } | null>(null);
  const [majorResult, setMajorResult] = useState<MajorResult | null>(null);
  const [majorT, setMajorT] = useState<Tournament | null>(null);
  const [hubTab, setHubTab] = useState<HubTab>('overview');
  const [selTeam, setSelTeam] = useState<TTeam | null>(null);
  const rngRef = useRef(makeRng(randomSeed()));
  // registro parcial do split, finalizado após o Major (se houver)
  const pendingSplit = useRef<SplitRecord | null>(null);

  const update = (patch: Partial<CareerSave>) => {
    setSave((s) => {
      const next = { ...s, ...patch };
      persist(next);
      return next;
    });
  };

  // SÓ tempos atuais: elencos CS2 (2023+). Nada de lendas de outras eras aqui.
  const currentEra = useMemo(
    () => dataset.filter((t) => !t.pending && t.game === 'CS2' && t.players.length >= 5),
    [dataset],
  );
  const brTeams = useMemo(
    () => currentEra.filter((t) => t.country === 'br').sort((a, b) => b.teamwork - a.teamwork),
    [currentEra],
  );

  // Campeonatos disponíveis a cada split: o jogador escolhe qual convite aceitar,
  // já sabendo quais times vai enfrentar em cada um. Cada circuito tem força,
  // premiação e número de vagas pro Major diferentes.
  const circuits = useMemo(() => {
    const pool = currentEra.filter((t) => t.id !== 'user');
    const byStrength = [...pool].sort((a, b) => b.teamwork - a.teamwork);
    const br = brTeams.filter((t) => t.id !== 'user');
    const mid = byStrength.slice(8, 16); // times medianos (fora do top 8)
    const mk = (
      id: string,
      name: string,
      desc: string,
      teams: TeamSeason[],
      spots: number,
      prizeMult: number,
      vrsMult: number,
    ) => ({ id, name, desc, teams: teams.slice(0, 7), spots, prizeMult, vrsMult });
    return [
      mk('gcmasters', 'Gamers Club Masters (BR)', 'Liga nacional brasileira. Campo equilibrado, porta de entrada pro Major.', br, 2, 1, 1),
      mk('blast', 'BLAST Premier (Mundial)', 'Os gigantes internacionais. Mais difícil, porém paga muito mais e dá mais VRS.', byStrength, 2, 1.6, 1.5),
      mk('eslchallenger', 'ESL Challenger', 'Liga de acesso com times medianos. Mais fácil, mas só 1 vaga e prêmios menores.', mid, 1, 0.6, 0.6),
    ].filter((c) => c.teams.length >= 5);
  }, [currentEra, brTeams]);

  // mercado: todos os jogadores da era atual, com preço de mercado
  const market = useMemo(
    () =>
      currentEra
        .flatMap((t) => t.players.map((p) => ({ player: p, from: t, price: playerValue(p) })))
        .sort((a, b) => a.price - b.price),
    [currentEra],
  );

  const findSigning = (s: Signing): { player: Player; from: TeamSeason } | null => {
    const from = dataset.find((t) => t.id === s.fromId);
    const player = from?.players.find((p) => p.id === s.playerId);
    return from && player ? { player, from } : null;
  };

  const buildTeam = (s: CareerSave): TTeam | null => {
    if (!s.org || s.squad.length < 5 || !s.coachFromId) return null;
    const picks = s.squad.map(findSigning).filter(Boolean) as { player: Player; from: TeamSeason }[];
    if (picks.length < 5) return null;
    // '__rookie__' = técnico iniciante barato (opção de entrada da carreira)
    const coach = dataset.find((t) => t.id === s.coachFromId)?.coach ?? ROOKIE_COACH;
    const team = buildUserTeam(s.org.name, picks.slice(0, 5), coach);
    return { ...team, tag: s.org.tag, colors: s.org.colors, logoUrl: s.org.logo };
  };

  const startSplit = (s: CareerSave, circuit: (typeof circuits)[number]) => {
    const user = buildTeam(s);
    if (!user) return;
    const ai = circuit.teams.filter((t) => t.id !== 'user').slice(0, 7).map(teamSeasonToTTeam);
    const league = createLeague(`${circuit.name} - Split ${s.split}`, [user, ...ai]);
    const choice: CircuitChoice = {
      id: circuit.id,
      name: circuit.name,
      spots: circuit.spots,
      prizeMult: circuit.prizeMult,
      vrsMult: circuit.vrsMult,
    };
    const next = { ...s, league, circuit: choice };
    persist(next);
    setSave(next);
    setHubTab('overview');
    setStage('hub');
  };

  // folha salarial do split (soma dos salários do elenco contratado)
  const payroll = useMemo(() => {
    const picks = save.squad.map(findSigning).filter(Boolean) as { player: Player }[];
    return picks.reduce((acc, p) => acc + playerWage(p.player), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.squad]);

  // forma do clube no split (resultados das partidas do usuário já jogadas)
  const clubForm = (l: League): ('W' | 'L')[] => {
    const out: ('W' | 'L')[] = [];
    for (let r = 0; r < l.current; r++) {
      const m = l.rounds[r]?.find((x) => x.a === 'user' || x.b === 'user');
      if (m?.result) {
        const userWon = (m.result.winner === 0 ? m.a : m.b) === 'user';
        out.push(userWon ? 'W' : 'L');
      }
    }
    return out;
  };

  const userPosition = (l: League): number => leagueTable(l).findIndex((t) => t.id === 'user') + 1;

  // resolve a rodada atual após a partida do usuário (jogada ou simulada)
  const finishUserRound = (l: League, series?: SeriesResult) => {
    if (series) {
      const m = userLeagueMatch(l);
      if (m) m.result = series;
    }
    resolveLeagueRound(l, rngRef.current, LEAGUE_BO);
    const next = { ...save, league: { ...l } };
    persist(next);
    setSave(next);
    setMatchCtx(null);
    setStage(leagueDone(l) ? 'seasonEnd' : 'hub');
  };

  // SIM MATCH: simula a partida do usuário na hora (sem veto/partida ao vivo)
  const simMine = (l: League) => {
    const m = userLeagueMatch(l);
    if (!m) return;
    rngRef.current = makeRng(randomSeed());
    const a = leagueTeam(l, m.a);
    const b = leagueTeam(l, m.b);
    const series = simulateSeries(rngRef.current, a, b, autoVeto([a, b], rngRef.current, LEAGUE_BO), LEAGUE_BO);
    finishUserRound(l, series);
  };

  // Major: o time vai pro Major mundial (16 times) e disputa Suíça + playoffs
  // AO VIVO, com bracket de verdade (mesmo motor/UI do modo draft).
  const playMajor = (s: CareerSave) => {
    const user = buildTeam(s);
    if (!user) return;
    rngRef.current = makeRng(randomSeed());
    const pool = currentEra.filter((t) => t.id !== 'user');
    const major = createTournament(pool, user, rngRef.current, MAJOR_NAME(s.split), 4);
    setMajorT(major);
    setStage('majorHub');
  };

  // encerra o Major: calcula colocação, prêmio e VRS
  const concludeMajor = (t: Tournament) => {
    const placement = placementCode(t, 'user');
    setMajorResult({
      tournament: t,
      placement,
      prize: MAJOR_PRIZE[placement],
      vrs: MAJOR_VRS[placement],
      champion: placement === 'champion',
    });
    setStage('major');
  };

  // abre o veto/partida da rodada do usuário no Major
  const playMajorMine = () => {
    if (!majorT) return;
    const up = tournamentUserPairing(majorT);
    if (!up) return;
    const a = getTeam(majorT, up.a);
    const b = getTeam(majorT, up.b);
    setMatchCtx({
      teams: [a, b],
      userIdx: up.a === 'user' ? 0 : 1,
      mode: 'major',
      bestOf: up.bestOf ?? 3,
      phaseLabel: `${majorT.name} · ${up.label}`,
    });
    setStage('veto');
  };

  // resolve a rodada do Major após a partida do usuário
  const finishMajorRound = (series?: SeriesResult) => {
    if (!majorT) return;
    const clone: Tournament = structuredClone(majorT);
    if (series) {
      const p = clone.pairings.find((x) => x.a === 'user' || x.b === 'user');
      if (p) p.result = series;
    }
    resolveRound(clone, rngRef.current);
    setMatchCtx(null);
    setMajorT(clone);
    if (clone.phase === 'done') concludeMajor(clone);
    else setStage('majorHub');
  };

  // simula a rodada inteira do Major (incluindo a partida do usuário)
  const simMajorRound = () => {
    if (!majorT) return;
    const clone: Tournament = structuredClone(majorT);
    resolveRound(clone, rngRef.current);
    setMajorT(clone);
    if (clone.phase === 'done') concludeMajor(clone);
    else setStage('majorHub');
  };

  // ---------- fundação ----------
  if (stage === 'found') {
    return <FoundOrg onExit={onExit} onFound={(org) => {
      update({ org });
      setStage('market');
    }} />;
  }

  // ---------- mercado ----------
  if (stage === 'market') {
    return (
      <MarketScreen
        save={save}
        market={market}
        coaches={currentEra}
        findSigning={findSigning}
        onExit={onExit}
        onConfirm={(squad, coachFromId, budget, sponsors) => {
          const next = { ...save, squad, coachFromId, budget, sponsors };
          persist(next);
          setSave(next);
          setStage('circuit');
        }}
      />
    );
  }

  // ---------- escolha do campeonato (qual convite aceitar) ----------
  if (stage === 'circuit') {
    return (
      <CircuitPicker
        circuits={circuits}
        split={save.split}
        onBack={() => setStage('market')}
        onPick={(c) => startSplit(save, c)}
      />
    );
  }

  const league = save.league;

  // ---------- resultado do Major ----------
  if (stage === 'major' && majorResult) {
    const mr = majorResult;
    const PLACE_PT: Record<PlacementCode, string> = {
      champion: 'CAMPEÃO DO MAJOR',
      runnerup: 'VICE-CAMPEÃO',
      semi: 'SEMIFINAL',
      quarters: 'QUARTAS DE FINAL',
      playoffs: 'FASE DE PLAYOFFS',
      swiss: 'FASE SUÍÇA',
    };
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 720, margin: '24px auto' }}>
          <div className="panel-head">Major Mundial - resultado</div>
          <div className="panel-body center">
            <div className="trophy">{mr.champion ? '🏆' : mr.placement === 'runnerup' ? '🥈' : '★'}</div>
            <h2>{save.org?.name}: {PLACE_PT[mr.placement]}</h2>
            <div className="prize-banner">
              Premiação: <b>+{formatMoney(mr.prize)}</b> · VRS: <b>+{mr.vrs} pts</b>
              {mr.champion ? ' · +1 título!' : ''}
            </div>
            <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
              {mr.champion
                ? 'Sua organização é CAMPEÃ MUNDIAL! O nome entrou para a história do CS.'
                : 'Sua org representou o circuito no Major mundial. Volte mais forte no próximo split.'}
            </p>
            <button
              className="btn gold big"
              onClick={() => {
                const rec = pendingSplit.current;
                const finished: SplitRecord = rec
                  ? { ...rec, major: { placement: mr.placement, champion: mr.champion } }
                  : {
                      split: save.split, circuit: save.circuit?.name ?? 'Major', position: 0,
                      wins: 0, losses: 0, roundDiff: 0, prize: 0, vrs: 0, champion: false,
                      major: { placement: mr.placement, champion: mr.champion },
                    };
                pendingSplit.current = null;
                setMajorT(null);
                const next = {
                  ...save,
                  budget: save.budget + mr.prize - payroll + sponsorIncome(save.sponsors),
                  vrs: save.vrs + mr.vrs,
                  titles: save.titles + (mr.champion ? 1 : 0),
                  split: save.split + 1,
                  league: null,
                  circuit: null,
                  history: [...save.history, finished],
                };
                persist(next);
                setSave(next);
                setMajorResult(null);
                setStage('market');
              }}
            >
              Pagar folha ({formatMoney(payroll)}) e ir pro Split {save.split + 1}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- fim de temporada (split) ----------
  if (stage === 'seasonEnd' && league) {
    const table = leagueTable(league);
    const pos = table.findIndex((t) => t.id === 'user') + 1;
    const me = leagueTeam(league, 'user');
    const spots = save.circuit?.spots ?? MAJOR_SPOTS;
    const prize = Math.round((PRIZE_BY_POS[pos - 1] ?? 50_000) * (save.circuit?.prizeMult ?? 1));
    const vrsGain = Math.round((VRS_BY_POS[pos - 1] ?? 10) * (save.circuit?.vrsMult ?? 1));
    const qualified = pos <= spots;
    const baseRecord = (): SplitRecord => ({
      split: save.split,
      circuit: save.circuit?.name ?? league.name,
      position: pos,
      wins: me.wins,
      losses: me.losses,
      roundDiff: me.roundDiff,
      prize,
      vrs: vrsGain,
      champion: pos === 1,
    });
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }}>
          <div className="panel-head">
            {league.name} - split encerrado
            <span className="spacer" />
            <button className="btn" onClick={onExit}>← Sair</button>
          </div>
          <div className="panel-body center">
            <div className="trophy">{pos === 1 ? '🏆' : pos <= 3 ? '🥉' : '★'}</div>
            <h2>{save.org?.name} terminou em {pos}º lugar</h2>
            <div className="prize-banner">
              Premiação: <b>+{formatMoney(prize)}</b> · VRS: <b>+{vrsGain} pts</b> · Folha:{' '}
              <b className="neg">-{formatMoney(payroll)}</b>
            </div>
            {qualified ? (
              <div className="qualify-banner">
                <b>CLASSIFICADO PRO MAJOR MUNDIAL!</b> Terminar no top {spots} do {save.circuit?.name ?? 'circuito'}
                {' '}garantiu a vaga. Hora de enfrentar os melhores do mundo.
              </div>
            ) : (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                Termine no <b>top {spots}</b> do {save.circuit?.name ?? 'circuito'} para garantir vaga no Major Mundial.
                Faltou pouco: continue acumulando VRS e reforçando o elenco.
              </p>
            )}
            <CareerTable table={table} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
              {qualified && (
                <button
                  className="btn gold big"
                  onClick={() => {
                    // aplica prêmio+VRS do split antes de ir pro Major;
                    // o registro do split é finalizado após o resultado do Major
                    pendingSplit.current = baseRecord();
                    const next = {
                      ...save,
                      budget: save.budget + prize,
                      vrs: save.vrs + vrsGain,
                      titles: save.titles + (pos === 1 ? 1 : 0),
                    };
                    persist(next);
                    setSave(next);
                    playMajor(next);
                  }}
                >
                  Disputar o Major Mundial
                </button>
              )}
              <button
                className={qualified ? 'btn ghost big' : 'btn gold big'}
                onClick={() => {
                  const next = {
                    ...save,
                    budget: save.budget + prize - payroll + sponsorIncome(save.sponsors),
                    vrs: save.vrs + vrsGain,
                    titles: save.titles + (pos === 1 ? 1 : 0),
                    split: save.split + 1,
                    league: null,
                    circuit: null,
                    history: [...save.history, baseRecord()],
                  };
                  persist(next);
                  setSave(next);
                  setStage('market');
                }}
              >
                Pagar folha e ir pro Split {save.split + 1}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- veto / partida (liga OU Major, ao vivo) ----------
  if ((stage === 'veto' || stage === 'match') && matchCtx) {
    const finish = (series: SeriesResult) =>
      matchCtx.mode === 'major' ? finishMajorRound(series) : league && finishUserRound(league, series);
    if (stage === 'veto') {
      return (
        <VetoScreen
          teams={matchCtx.teams}
          userIdx={matchCtx.userIdx}
          rng={() => rngRef.current()}
          phaseLabel={matchCtx.phaseLabel}
          bestOf={matchCtx.bestOf}
          onDone={(maps) => {
            setMatchCtx({ ...matchCtx, maps });
            setStage('match');
          }}
        />
      );
    }
    return (
      <MatchScreen
        teams={matchCtx.teams}
        maps={matchCtx.maps!}
        userIdx={matchCtx.userIdx}
        rng={() => rngRef.current()}
        phaseLabel={matchCtx.phaseLabel}
        bestOf={matchCtx.bestOf}
        onFinish={finish}
      />
    );
  }

  // ---------- hub do Major (ao vivo, com bracket) ----------
  if (stage === 'majorHub' && majorT) {
    return (
      <div className="career-major-live">
        <div className="major-live-bar">
          <b>MODO CARREIRA</b> · {save.org?.name} no {majorT.name}
          <span className="spacer" />
          <button className="btn" onClick={() => setStage('majorHub')} disabled>Major ao vivo</button>
        </div>
        <Hub
          t={majorT}
          career={{ season: save.split, titles: save.titles, budget: save.budget }}
          pickem={{ picks: {}, score: 0, total: 0 }}
          onPick={() => {}}
          onPlay={playMajorMine}
          onSimRound={simMajorRound}
          onStats={() => {}}
          onOpenSeries={(p) => p.result && setSelSeries({ series: p.result, teams: [getTeam(majorT, p.a), getTeam(majorT, p.b)] })}
        />
        {selSeries && <Scoreboard series={selSeries.series} teams={selSeries.teams} />}
      </div>
    );
  }

  // ---------- hub da liga ----------
  // sem liga ativa o stage inicial já cai em 'market' (janela de
  // transferências entre splits); esta guarda evita render sem liga
  if (!league) return null;
  const table = leagueTable(league);
  const myMatch = userLeagueMatch(league);
  const playMine = () => {
    if (!myMatch) return;
    rngRef.current = makeRng(randomSeed());
    const a = leagueTeam(league, myMatch.a);
    const b = leagueTeam(league, myMatch.b);
    setMatchCtx({
      teams: [a, b],
      userIdx: myMatch.a === 'user' ? 0 : 1,
      mode: 'league',
      bestOf: LEAGUE_BO,
      phaseLabel: `${league.name} · Rodada ${league.current + 1}`,
    });
    setStage('veto');
  };

  const myPos = userPosition(league);
  const spots = save.circuit?.spots ?? MAJOR_SPOTS;
  const form = clubForm(league);
  const opp = myMatch ? leagueTeam(league, myMatch.a === 'user' ? myMatch.b : myMatch.a) : null;
  const oppPos = opp ? table.findIndex((t) => t.id === opp.id) + 1 : 0;
  const me = leagueTeam(league, 'user');
  const seasonStats = seasonPlayerStats(league);
  const mySquadIds = new Set((buildTeam(save)?.players ?? []).map((p) => p.id));
  const org = aggregateHistory(save.history);

  const TABS: { id: HubTab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'results', label: 'Resultados' },
    { id: 'standings', label: 'Classificação' },
    { id: 'squad', label: 'Elenco' },
    { id: 'history', label: 'História da org' },
  ];

  return (
    <div className="fade-in career-hub">
      {/* barra do clube (estilo hub do FIFA) */}
      <div className="career-topbar">
        <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={46} />
        <div className="ct-id">
          <div className="ct-name">{save.org?.name}</div>
          <div className="ct-sub">{save.circuit?.name ?? 'CIRCUIT X'} · Split {save.split}</div>
          {save.sponsors.length > 0 && (
            <div className="ct-sponsors">
              {save.sponsors.map((id) => {
                const sp = sponsorById(id);
                return sp ? <span key={id} className="ct-sp" style={{ background: sp.color }} title={`${sp.name} · +${formatMoney(sp.perSplit)}/split`}>{sp.name}</span> : null;
              })}
            </div>
          )}
        </div>
        <div className="ct-standing">
          <span className="muted small">POSIÇÃO</span>
          <b className={myPos <= spots ? 'pos' : ''}>{myPos}º</b>
        </div>
        <div className="ct-form">
          <span className="muted small">FORMA</span>
          <span className="form-chips">
            {form.length ? form.slice(-5).map((f, i) => <i key={i} className={`fchip ${f === 'W' ? 'w' : 'l'}`}>{f}</i>) : <i className="muted small">-</i>}
          </span>
        </div>
        <span className="spacer" />
        <div className="ct-stats">
          <span title="Caixa do clube"><i className="muted small">CAIXA</i> {formatMoney(save.budget)}</span>
          <span title="Folha salarial por split"><i className="muted small">FOLHA</i> {formatMoney(payroll)}</span>
          <span title="Pontos de ranking (VRS)"><i className="muted small">VRS</i> {save.vrs}</span>
          <span title="Títulos"><i className="muted small">TÍTULOS</i> {save.titles}</span>
        </div>
        <button className="btn" onClick={onExit}>← Sair</button>
      </div>

      <div className="career-tabs">
        {TABS.map((tab) => (
          <button key={tab.id} className={`career-tab${hubTab === tab.id ? ' on' : ''}`} onClick={() => setHubTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== VISÃO GERAL ===== */}
      {hubTab === 'overview' && (
        <div className="career-grid">
          <div className="career-main">
            {opp && myMatch ? (
              <div className="play-match-card" style={{ background: `linear-gradient(110deg, ${save.org?.colors[0] ?? '#101820'}cc, var(--header) 70%)` }}>
                <div className="pm-info">
                  <div className="pm-label">PRÓXIMA PARTIDA · MD3 · Rodada {league.current + 1}/{league.rounds.length}</div>
                  <div className="pm-teams">
                    <span className="pm-side">
                      <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={40} />
                      <b>{save.org?.tag}</b>
                    </span>
                    <span className="pm-vs">VS</span>
                    <span className="pm-side">
                      <TeamBadge tag={opp.tag} colors={opp.colors} size={40} logoUrl={opp.logoUrl} />
                      <b>{opp.name}</b>
                    </span>
                  </div>
                  <div className="pm-opp muted small">
                    <Flag cc={opp.country} /> {oppPos}º na tabela · força {opp.strength.toFixed(1)}
                  </div>
                </div>
                <div className="pm-actions">
                  <button className="btn gold big" onClick={playMine}>▶ JOGAR</button>
                  <button className="btn ghost" onClick={() => simMine(league)}>⏩ Simular</button>
                </div>
              </div>
            ) : (
              <div className="career-banner">Rodada concluída. Avançando…</div>
            )}

            {/* resumo da temporada atual */}
            <div className="career-statgrid">
              <div className="cstat"><b>{me.wins}-{me.losses}</b><span>Campanha</span></div>
              <div className="cstat"><b className={me.roundDiff >= 0 ? 'pos' : 'neg'}>{me.roundDiff >= 0 ? '+' : ''}{me.roundDiff}</b><span>Saldo de rounds</span></div>
              <div className="cstat"><b>{myPos}º / {league.teams.length}</b><span>Posição</span></div>
              <div className="cstat"><b>{league.current}/{league.rounds.length}</b><span>Rodadas jogadas</span></div>
            </div>

            <div className="muted small section-label">Rodada {league.current + 1} - confrontos</div>
            <div className="panel-body tight" style={{ padding: 0 }}>
              {league.rounds[league.current]?.map((m, i) => (
                <MatchLine key={i} league={league} m={m} onOpen={setSelSeries} />
              ))}
            </div>
          </div>

          <div className="career-side">
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Classificação · top {spots} vai ao Major</div>
              <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} />
            </div>
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Destaques da temporada</div>
              <BestPlayers stats={seasonStats.slice(0, 5)} mine={mySquadIds} />
            </div>
          </div>
        </div>
      )}

      {/* ===== RESULTADOS (todas as rodadas) ===== */}
      {hubTab === 'results' && (
        <div className="panel">
          <div className="panel-body">
            {league.rounds.map((round, r) => (
              <div key={r} className="results-round">
                <div className="muted small section-label" style={{ marginTop: r === 0 ? 0 : 14 }}>
                  Rodada {r + 1}{r === league.current && ' (atual)'}
                </div>
                {round.map((m, i) => <MatchLine key={i} league={league} m={m} onOpen={setSelSeries} />)}
              </div>
            ))}
            <p className="muted small" style={{ marginTop: 12 }}>Clique em qualquer partida finalizada para ver o placar mapa a mapa.</p>
          </div>
        </div>
      )}

      {/* ===== CLASSIFICAÇÃO (detalhada) ===== */}
      {hubTab === 'standings' && (
        <div className="panel">
          <div className="panel-body">
            <div className="muted small section-label" style={{ marginTop: 0 }}>{save.circuit?.name ?? 'Circuito'} · top {spots} vai ao Major Mundial</div>
            <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} detailed />
            <p className="muted small" style={{ marginTop: 10 }}>Clique em um time para ver elenco, técnico e força.</p>
          </div>
        </div>
      )}

      {/* ===== ELENCO + RANKING DE JOGADORES ===== */}
      {hubTab === 'squad' && (
        <div className="career-grid">
          <div className="career-main">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Seu elenco</div>
            <div className="career-squad big">
              {(buildTeam(save)?.players ?? []).map((p) => {
                const st = seasonStats.find((s) => s.id === p.id);
                return (
                  <div key={p.id} className="cs-row">
                    <PlayerAvatar nick={p.nick} size={32} />
                    <span className="cs-nick"><Flag cc={p.country} /> {p.nick}</span>
                    <span className={`role-pill ${p.role}`}>{p.role}</span>
                    <span className="cs-stat">{st ? `rat ${st.rating.toFixed(2)}` : '-'}</span>
                    <span className="cs-stat">{st ? `${st.kd.toFixed(2)} K/D` : ''}</span>
                    <span className="cs-ovr">{p.ovr}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="career-side">
            <div className="side-card">
              <div className="muted small section-label" style={{ marginTop: 0 }}>Melhores jogadores do {save.circuit?.name ?? 'circuito'}</div>
              <BestPlayers stats={seasonStats.slice(0, 8)} mine={mySquadIds} ranked />
            </div>
          </div>
        </div>
      )}

      {/* ===== HISTÓRIA DA ORGANIZAÇÃO ===== */}
      {hubTab === 'history' && (
        <div className="panel">
          <div className="panel-body">
            <div className="career-statgrid">
              <div className="cstat"><b>{save.split - 1}</b><span>Splits disputados</span></div>
              <div className="cstat"><b className="pos">{org.circuitTitles}</b><span>Títulos de circuito</span></div>
              <div className="cstat"><b className="gold-text">{save.titles}</b><span>Majors vencidos</span></div>
              <div className="cstat"><b>{org.majorApps}</b><span>Majors disputados</span></div>
              <div className="cstat"><b>{formatMoney(org.totalPrize)}</b><span>Prêmios na história</span></div>
              <div className="cstat"><b>{org.bestPlacement}</b><span>Melhor campanha</span></div>
            </div>
            <div className="muted small section-label">Linha do tempo</div>
            {save.history.length === 0 ? (
              <p className="muted small">Sua organização ainda não encerrou nenhum split. A história começa agora.</p>
            ) : (
              <table className="stats">
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Split</th><th style={{ textAlign: 'left' }}>Campeonato</th><th>Pos</th><th>V-D</th><th>Major</th><th>Prêmio</th></tr>
                </thead>
                <tbody>
                  {[...save.history].reverse().map((h, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'left' }}>{h.split}</td>
                      <td style={{ textAlign: 'left' }}>{h.circuit}{h.champion && ' 🏆'}</td>
                      <td>{h.position || '-'}º</td>
                      <td>{h.wins}-{h.losses}</td>
                      <td>{h.major ? PLACE_SHORT[h.major.placement] : '-'}</td>
                      <td>{formatMoney(h.prize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {selSeries && <Scoreboard series={selSeries.series} teams={selSeries.teams} />}
      {selTeam && <TeamDetail team={selTeam} onClose={() => setSelTeam(null)} />}
    </div>
  );
}

// linha de confronto reaproveitada (overview e resultados)
function MatchLine({ league, m, onOpen }: {
  league: League;
  m: { a: string; b: string; result?: SeriesResult };
  onOpen: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}) {
  const a = leagueTeam(league, m.a);
  const b = leagueTeam(league, m.b);
  const mine = m.a === 'user' || m.b === 'user';
  return (
    <div className={`matchline${m.result ? ' clickable' : ''}`}
      onClick={() => m.result && onOpen({ series: m.result, teams: [a, b] })}>
      <span className={`side${mine && m.a === 'user' ? ' human' : ''}`}><span className="tname">{a.name}</span></span>
      {m.result ? (
        <span className="score">
          <span className={m.result.winner === 0 ? 'w' : 'l'}>{m.result.mapScore[0]}</span>
          {' : '}
          <span className={m.result.winner === 1 ? 'w' : 'l'}>{m.result.mapScore[1]}</span>
        </span>
      ) : (
        <span className="score muted">vs</span>
      )}
      <span className={`side right${mine && m.b === 'user' ? ' human' : ''}`}><span className="tname">{b.name}</span></span>
    </div>
  );
}

const PLACE_SHORT: Record<PlacementCode, string> = {
  champion: 'Campeão', runnerup: 'Vice', semi: 'Semi', quarters: 'Quartas', playoffs: 'Playoffs', swiss: 'Suíça',
};

// ranking de jogadores (destaques da temporada)
function BestPlayers({ stats, mine, ranked }: { stats: SeasonStat[]; mine: Set<string>; ranked?: boolean }) {
  if (stats.length === 0) return <p className="muted small">Os destaques aparecem após as primeiras partidas.</p>;
  return (
    <div className="best-players">
      {stats.map((s, i) => (
        <div key={s.id} className={`bp-row${mine.has(s.id) ? ' mine' : ''}`}>
          {ranked && <span className="bp-rank">{i + 1}</span>}
          <PlayerAvatar nick={s.nick} size={26} />
          <span className="bp-nick"><Flag cc={s.country} /> {s.nick} <span className="muted small">{s.teamTag}</span></span>
          <span className="bp-rating">{s.rating.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// painel de detalhe de um time da tabela (elenco, técnico, força)
function TeamDetail({ team, onClose }: { team: TTeam; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card team-detail" onClick={(e) => e.stopPropagation()}>
        <div className="td-head">
          <TeamBadge tag={team.tag} colors={team.colors} size={42} logoUrl={team.logoUrl} />
          <div>
            <div className="td-name"><Flag cc={team.country} /> {team.name}</div>
            <div className="muted small">{team.wins}-{team.losses} · saldo {team.roundDiff >= 0 ? '+' : ''}{team.roundDiff} · força {team.strength.toFixed(1)}</div>
          </div>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="td-body">
          {team.players.map((p) => (
            <div key={p.id} className="cs-row">
              <PlayerAvatar nick={p.nick} size={28} />
              <span className="cs-nick"><Flag cc={p.country} /> {p.nick}</span>
              <span className={`role-pill ${p.role}`}>{p.role}</span>
              <span className="cs-ovr">{p.ovr}</span>
            </div>
          ))}
          {team.coach && <div className="td-coach muted small">Técnico: <b>{team.coach.nick}</b> ({team.coach.rating})</div>}
        </div>
      </div>
    </div>
  );
}

// ----- agregações para a aba de história / destaques -----
interface SeasonStat { id: string; nick: string; teamTag: string; country: string; role: string; rating: number; kd: number; adr: number; maps: number; }

function seasonPlayerStats(l: League): SeasonStat[] {
  const meta = new Map<string, { nick: string; teamTag: string; country: string; role: string }>();
  for (const t of l.teams) for (const p of t.players) meta.set(p.id, { nick: p.nick, teamTag: t.tag, country: p.country, role: p.role });
  const agg = new Map<string, { k: number; d: number; a: number; dmg: number; kast: number; r: number }>();
  for (const round of l.rounds) {
    for (const m of round) {
      if (!m.result) continue;
      for (const map of m.result.maps) {
        for (const [id, st] of Object.entries(map.stats)) {
          const cur = agg.get(id) ?? { k: 0, d: 0, a: 0, dmg: 0, kast: 0, r: 0 };
          cur.k += st.both.kills; cur.d += st.both.deaths; cur.a += st.both.assists;
          cur.dmg += st.both.dmg; cur.kast += st.both.kastRounds; cur.r += st.both.rounds;
          agg.set(id, cur);
        }
      }
    }
  }
  const out: SeasonStat[] = [];
  for (const [id, s] of agg) {
    if (s.r < 1) continue;
    const kpr = s.k / s.r, dpr = s.d / s.r, apr = s.a / s.r, kast = s.kast / s.r, adr = s.dmg / s.r;
    const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
    // rating estilo HLTV 2.0 (média ~1.0)
    const rating = Math.max(0, 0.0073 * kast * 100 + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587);
    const md = meta.get(id);
    if (!md) continue;
    out.push({ id, nick: md.nick, teamTag: md.teamTag, country: md.country, role: md.role, rating, kd: s.d ? s.k / s.d : s.k, adr, maps: 0 });
  }
  return out.sort((a, b) => b.rating - a.rating);
}

function aggregateHistory(h: SplitRecord[]) {
  let circuitTitles = 0, majorApps = 0, totalPrize = 0, bestPos = 99;
  for (const r of h) {
    if (r.champion) circuitTitles++;
    if (r.major) majorApps++;
    totalPrize += r.prize;
    if (r.position && r.position < bestPos) bestPos = r.position;
  }
  return {
    circuitTitles, majorApps, totalPrize,
    bestPlacement: bestPos === 99 ? '-' : `${bestPos}º`,
  };
}

function CareerTable({ table, highlightTop = 0, onPick, detailed }: {
  table: TTeam[];
  highlightTop?: number;
  onPick?: (t: TTeam) => void;
  detailed?: boolean;
}) {
  return (
    <table className="stats">
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>#</th>
          <th style={{ textAlign: 'left' }}>Time</th>
          <th>V</th>
          <th>D</th>
          <th>Saldo</th>
          {detailed && <th>Força</th>}
        </tr>
      </thead>
      <tbody>
        {table.map((t, i) => (
          <tr
            key={t.id}
            className={`${t.id === 'user' ? 'human-row' : ''}${highlightTop && i < highlightTop ? ' qualify-row' : ''}${onPick ? ' clickable' : ''}`}
            onClick={() => onPick?.(t)}
          >
            <td style={{ textAlign: 'left' }}>{i + 1}</td>
            <td style={{ textAlign: 'left', fontWeight: t.id === 'user' ? 700 : 400 }}>{t.name}</td>
            <td className="pos">{t.wins}</td>
            <td className="neg">{t.losses}</td>
            <td>{t.roundDiff > 0 ? `+${t.roundDiff}` : t.roundDiff}</td>
            {detailed && <td>{t.strength.toFixed(1)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- escolha do campeonato ----------
interface CircuitOption {
  id: string;
  name: string;
  desc: string;
  teams: TeamSeason[];
  spots: number;
  prizeMult: number;
  vrsMult: number;
}
function CircuitPicker({ circuits, split, onPick, onBack }: {
  circuits: CircuitOption[];
  split: number;
  onPick: (c: CircuitOption) => void;
  onBack: () => void;
}) {
  const [sel, setSel] = useState(0);
  const c = circuits[sel];
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 900, margin: '24px auto' }}>
        <div className="panel-head">
          Escolha o campeonato - Split {split}
          <span className="spacer" />
          <button className="btn" onClick={onBack}>← Mercado</button>
        </div>
        <div className="panel-body">
          <p className="muted small">Você recebeu convites de mais de um circuito. Veja quem disputa cada um e decida onde quer competir neste split.</p>
          <div className="circuit-cards">
            {circuits.map((opt, i) => (
              <button key={opt.id} className={`circuit-card${sel === i ? ' on' : ''}`} onClick={() => setSel(i)}>
                <div className="cc-name">{opt.name}</div>
                <div className="cc-desc muted small">{opt.desc}</div>
                <div className="cc-meta">
                  <span>{opt.spots} {opt.spots === 1 ? 'vaga' : 'vagas'} ao Major</span>
                  <span>prêmio ×{opt.prizeMult}</span>
                  <span>VRS ×{opt.vrsMult}</span>
                </div>
              </button>
            ))}
          </div>
          {c && (
            <>
              <div className="muted small section-label">Times confirmados no {c.name}</div>
              <div className="circuit-teams">
                {c.teams.map((t) => (
                  <div key={t.id} className="cteam">
                    <TeamBadge tag={t.tag} colors={t.colors} size={28} logoUrl={t.logoUrl ?? logoForTeam(t)} />
                    <span className="ct-tname"><Flag cc={t.country} /> {t.team}</span>
                    <span className="muted small">forma {t.teamwork}</span>
                  </div>
                ))}
              </div>
              <div className="center" style={{ marginTop: 16 }}>
                <button className="btn gold big" onClick={() => onPick(c)}>Aceitar convite do {c.name}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// emblemas do construtor de logo (SVG inline gerado a partir das cores + tag)
type EmblemId = 'shield' | 'circle' | 'hexagon' | 'bolt' | 'star' | 'diamond';
const EMBLEMS: { id: EmblemId; label: string }[] = [
  { id: 'shield', label: 'Escudo' },
  { id: 'circle', label: 'Círculo' },
  { id: 'hexagon', label: 'Hexágono' },
  { id: 'bolt', label: 'Raio' },
  { id: 'star', label: 'Estrela' },
  { id: 'diamond', label: 'Losango' },
];

function emblemShape(id: EmblemId, fill: string): string {
  switch (id) {
    case 'shield': return `<path d="M50 6 L90 20 V52 C90 76 72 90 50 96 C28 90 10 76 10 52 V20 Z" fill="${fill}"/>`;
    case 'circle': return `<circle cx="50" cy="50" r="44" fill="${fill}"/>`;
    case 'hexagon': return `<path d="M50 6 L88 28 V72 L50 94 L12 72 V28 Z" fill="${fill}"/>`;
    case 'bolt': return `<path d="M50 4 L18 54 H44 L38 96 L84 40 H56 Z" fill="${fill}"/>`;
    case 'star': return `<path d="M50 6 L61 38 H95 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 H39 Z" fill="${fill}"/>`;
    case 'diamond': return `<path d="M50 4 L92 50 L50 96 L8 50 Z" fill="${fill}"/>`;
  }
}

// constrói um data URL SVG com emblema + iniciais (até 3 letras)
function buildLogoDataUrl(emblem: EmblemId, c1: string, c2: string, text: string): string {
  const initials = (text || 'ORG').slice(0, 3).toUpperCase();
  const fontSize = initials.length >= 3 ? 30 : initials.length === 2 ? 38 : 50;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    emblemShape(emblem, c1) +
    `<text x="50" y="50" dy="0.36em" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="${c2}">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------- fundação da organização ----------
function FoundOrg({ onFound, onExit }: { onFound: (org: NonNullable<CareerSave['org']>) => void; onExit: () => void }) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [c1, setC1] = useState('#101820');
  const [c2, setC2] = useState('#61a8dd');
  const [emblem, setEmblem] = useState<EmblemId>('shield');
  const [uploaded, setUploaded] = useState<string | null>(null); // logo enviada (data URL)
  const [mode, setMode] = useState<'build' | 'upload'>('build');

  // logo final: upload tem prioridade; senão o emblema construído
  const builtLogo = useMemo(() => buildLogoDataUrl(emblem, c1, c2, tag || name), [emblem, c1, c2, tag, name]);
  const logo = mode === 'upload' && uploaded ? uploaded : builtLogo;

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file, 200);
      setUploaded(dataUrl);
      setMode('upload');
    } catch {
      alert('Não foi possível ler a imagem.');
    }
  };

  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }}>
        <div className="panel-head">
          Fundar organização (modo carreira)
          <span className="spacer" />
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Crie sua org nos <b>tempos atuais</b> (só elencos CS2). Você começa com{' '}
            <b>{formatMoney(STARTING_BUDGET)}</b> para montar 5 jogadores + coach,
            fechar patrocínios e disputar os circuitos rumo ao Major. Sem lendas do
            passado: o desafio é construir do zero.
          </p>

          <div className="found-grid">
            {/* coluna esquerda: identidade */}
            <div className="found-form">
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Nome da organização</label>
                <input value={name} maxLength={24} placeholder="ex: Astro Esports" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Tag (até 4 letras)</label>
                <input value={tag} maxLength={4} placeholder="ex: ASTR" style={{ textTransform: 'uppercase' }} onChange={(e) => setTag(e.target.value.toUpperCase())} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Cores (primária / secundária)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} />
                  <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} />
                  <span className="muted small">a secundária colore o texto/emblema</span>
                </div>
              </div>

              <div className="field">
                <label>Logo</label>
                <div className="logo-mode-tabs">
                  <button type="button" className={`call-btn${mode === 'build' ? ' armed' : ''}`} onClick={() => setMode('build')}>Construir</button>
                  <button type="button" className={`call-btn${mode === 'upload' ? ' armed' : ''}`} onClick={() => uploaded ? setMode('upload') : null}>
                    <label style={{ cursor: 'pointer', display: 'inline-flex', gap: 6 }}>
                      Enviar imagem
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { onUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                    </label>
                  </button>
                  {uploaded && <button type="button" className="btn danger small" onClick={() => { setUploaded(null); setMode('build'); }}>Remover</button>}
                </div>
              </div>

              {mode === 'build' && (
                <div className="emblem-grid">
                  {EMBLEMS.map((em) => (
                    <button
                      key={em.id}
                      type="button"
                      className={`emblem-opt${emblem === em.id ? ' on' : ''}`}
                      title={em.label}
                      onClick={() => setEmblem(em.id)}
                    >
                      <img src={buildLogoDataUrl(em.id, c1, c2, tag || name)} alt={em.label} width={40} height={40} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* coluna direita: preview do clube */}
            <div className="found-preview">
              <div className="fp-card" style={{ background: `linear-gradient(150deg, ${c1} 0%, #0c0f14 80%)` }}>
                <img className="fp-logo" src={logo} alt="logo" />
                <div className="fp-name" style={{ color: '#fff' }}>{name || 'Sua Organização'}</div>
                <div className="fp-tag" style={{ color: c2 }}>{(tag || 'ORG').toUpperCase()}</div>
              </div>
              <div className="fp-badges">
                <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={40} logoUrl={logo} />
                <TeamBadge tag={tag || 'ORG'} colors={[c1, c2]} size={28} logoUrl={logo} />
                <span className="muted small">como aparece nos campeonatos</span>
              </div>
            </div>
          </div>

          <button
            className="btn gold big"
            style={{ width: '100%', marginTop: 16 }}
            disabled={!name.trim() || !tag.trim()}
            onClick={() => onFound({ name: name.trim(), tag: tag.trim() || 'ORG', colors: [c1, c2], logo })}
          >
            ✔ Fundar e abrir o mercado
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- mercado de contratações ----------
function MarketScreen({
  save,
  market,
  coaches,
  findSigning,
  onConfirm,
  onExit,
}: {
  save: CareerSave;
  market: { player: Player; from: TeamSeason; price: number }[];
  coaches: TeamSeason[];
  findSigning: (s: Signing) => { player: Player; from: TeamSeason } | null;
  onConfirm: (squad: Signing[], coachFromId: string, budget: number, sponsors: string[]) => void;
  onExit: () => void;
}) {
  const [squad, setSquad] = useState<Signing[]>(save.squad);
  const [coachId, setCoachId] = useState<string | null>(save.coachFromId);
  const [filter, setFilter] = useState('');
  const [sponsors, setSponsors] = useState<string[]>(save.sponsors);

  const toggleSponsor = (id: string) => {
    setSponsors((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= SPONSOR_SLOTS) return cur;
      return [...cur, id];
    });
  };

  const signedNicks = new Set(
    squad.map((s) => findSigning(s)?.player.nick.toLowerCase()).filter(Boolean) as string[],
  );
  // jogadores que JÁ eram seus (pagos no split anterior) não custam de novo;
  // dispensar um deles é venda a 85% do valor de mercado
  const owned = new Set(save.squad.map((s) => s.playerId));
  const spentPlayers = squad.reduce((acc, s) => {
    if (owned.has(s.playerId)) return acc;
    const f = findSigning(s);
    return acc + (f ? playerValue(f.player) : 0);
  }, 0);
  const soldPlayers = save.squad
    .filter((s) => !squad.some((x) => x.playerId === s.playerId))
    .reduce((acc, s) => {
      const f = findSigning(s);
      return acc + (f ? Math.round(playerValue(f.player) * 0.85) : 0);
    }, 0);
  const coachTeam = coachId && coachId !== ROOKIE_ID ? coaches.find((t) => t.id === coachId) : null;
  const coachChanged = coachId !== save.coachFromId;
  const spentCoach = !coachChanged ? 0 : coachId === ROOKIE_ID ? coachFee(ROOKIE_COACH) : coachTeam ? coachFee(coachTeam.coach) : 0;
  const coachOptions = [...coaches].sort((a, b) => coachFee(a.coach) - coachFee(b.coach));
  const budgetLeft = save.budget - spentPlayers - spentCoach + soldPlayers;
  const ready = squad.length === 5 && !!coachId && budgetLeft >= 0;

  const visible = market.filter(
    (m) =>
      !squad.some((s) => s.playerId === m.player.id) &&
      (!filter ||
        m.player.nick.toLowerCase().includes(filter.toLowerCase()) ||
        m.from.team.toLowerCase().includes(filter.toLowerCase())),
  );

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          Mercado - Split {save.split} ({save.org?.name})
          <span className="spacer" />
          <span className={budgetLeft >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 800 }}>
            💰 {formatMoney(budgetLeft)}
          </span>
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <div className="career-banner muted small">
            Contrate <b>5 jogadores</b> e <b>1 coach</b> dentro do orçamento. Só
            jogadores dos elencos atuais (CS2). Clique num contratado para dispensar:
            contratação desta janela tem reembolso integral; jogador do seu elenco é
            vendido por 85% do valor.
          </div>

          <div className="muted small section-label">Seu elenco ({squad.length}/5)</div>
          <div className="roster-slots">
            {[0, 1, 2, 3, 4].map((i) => {
              const s = squad[i];
              const f = s ? findSigning(s) : null;
              if (f) {
                return (
                  <button key={i} className="slot filled" style={{ cursor: 'pointer' }}
                    onClick={() => setSquad(squad.filter((x) => x.playerId !== s.playerId))}>
                    <div className="nick">
                      <Flag cc={f.player.country} /> {f.player.nick}{' '}
                      <span className="ovr-inline">{playerOvr(f.player)}</span>
                    </div>
                    <span className={`role-pill ${f.player.role}`}>{f.player.role}</span>
                    <div className="from">{formatMoney(playerValue(f.player))} · clique p/ dispensar</div>
                  </button>
                );
              }
              return <div key={i} className="slot">Contratação {i + 1}</div>;
            })}
          </div>

          <div className="muted small section-label">Coach</div>
          <div className="career-coaches">
            <button className={`call-btn${coachId === ROOKIE_ID ? ' armed' : ''}`}
              title="Opção de entrada: barato, mas com rating baixo"
              onClick={() => setCoachId(coachId === ROOKIE_ID ? null : ROOKIE_ID)}>
              {ROOKIE_COACH.nick} · {ROOKIE_COACH.rating} · {formatMoney(coachFee(ROOKIE_COACH))}
            </button>
            {coachOptions.slice(0, 12).map((t) => (
              <button key={t.id} className={`call-btn${coachId === t.id ? ' armed' : ''}`}
                title={`${t.coach.name} (${t.team})`}
                onClick={() => setCoachId(coachId === t.id ? null : t.id)}>
                {t.coach.nick} · {t.coach.rating} · {formatMoney(coachFee(t.coach))}
              </button>
            ))}
          </div>

          <div className="muted small section-label">Mercado ({visible.length} disponíveis)</div>
          <div className="field" style={{ marginBottom: 8 }}>
            <input placeholder="Buscar jogador ou time…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="career-market">
            {visible.slice(0, 40).map((m) => {
              const dup = signedNicks.has(m.player.nick.toLowerCase());
              const affordable = m.price <= budgetLeft && squad.length < 5 && !dup;
              return (
                <button key={m.player.id} className={`pcard${!affordable ? ' taken' : ''}`}
                  disabled={!affordable}
                  onClick={() => setSquad([...squad, { playerId: m.player.id, fromId: m.from.id }])}>
                  <PlayerAvatar nick={m.player.nick} size={48} />
                  <OvrBadge ovr={playerOvr(m.player)} />
                  <div className="nick">{m.player.nick}</div>
                  <div className="meta">
                    <span className={`role-pill ${m.player.role}`}>{m.player.role}</span>
                  </div>
                  <div className="meta muted small">
                    <TeamBadge tag={m.from.tag} colors={m.from.colors} size={16} logoUrl={m.from.logoUrl ?? logoForTeam(m.from)} />{' '}
                    {m.from.team}
                  </div>
                  <div className="price buy">💰 {formatMoney(m.price)}</div>
                  {dup && <div className="meta muted small">já contratado</div>}
                </button>
              );
            })}
          </div>

          {/* patrocinadores: receita fixa por split, marcas reais */}
          <div className="muted small section-label">
            Patrocinadores ({sponsors.length}/{SPONSOR_SLOTS}) · receita por split: <b className="pos">+{formatMoney(sponsorIncome(sponsors))}</b>
          </div>
          <div className="sponsor-grid">
            {SPONSORS.map((sp) => {
              const active = sponsors.includes(sp.id);
              const locked = !active && sp.minVrs > save.vrs;
              const full = !active && sponsors.length >= SPONSOR_SLOTS;
              return (
                <button
                  key={sp.id}
                  type="button"
                  className={`sponsor-card${active ? ' on' : ''}${locked || full ? ' locked' : ''}`}
                  disabled={locked || full}
                  onClick={() => !locked && !full && toggleSponsor(sp.id)}
                  title={locked ? `Requer ${sp.minVrs} VRS` : full ? 'Slots cheios' : ''}
                >
                  <span className="sp-logo" style={{ background: sp.color }}>{sp.name.slice(0, 1)}</span>
                  <span className="sp-name">{sp.name}</span>
                  <span className="sp-pay pos">+{formatMoney(sp.perSplit)}</span>
                  {locked && <span className="sp-lock muted small">{sp.minVrs} VRS</span>}
                  {active && <span className="sp-check">✔</span>}
                </button>
              );
            })}
          </div>

          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn gold big" disabled={!ready}
              onClick={() => coachId && onConfirm(squad, coachId, budgetLeft, sponsors)}>
              ✔ Fechar elenco e escolher o campeonato
            </button>
            {!ready && (
              <div className="muted small" style={{ marginTop: 8 }}>
                {squad.length < 5 ? `Faltam ${5 - squad.length} jogador(es). ` : ''}
                {!coachId ? 'Escolha um coach. ' : ''}
                {budgetLeft < 0 ? 'Orçamento estourado.' : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
