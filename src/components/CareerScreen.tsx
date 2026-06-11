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
import { createTournament, placementCode, resolveRound, type PlacementCode } from '../engine/swiss';
import { makeRng, randomSeed } from '../engine/rng';
import type { Coach, MapId, Player, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { MatchScreen } from './MatchScreen';
import { VetoScreen } from './VetoScreen';
import { Scoreboard } from './Scoreboard';
import { Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';
import { logoForTeam } from '../data/media';

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

interface Signing {
  playerId: string;
  fromId: string;
}

interface CareerSave {
  org: { name: string; tag: string; colors: [string, string] } | null;
  budget: number;
  vrs: number;
  split: number;
  titles: number;
  squad: Signing[];
  coachFromId: string | null;
  league: League | null;
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

type Stage = 'found' | 'market' | 'hub' | 'veto' | 'match' | 'seasonEnd' | 'major';

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
    // sem liga ativa (org nova ou entre splits) = janela de mercado/transferências
    if (s.squad.length < 5 || !s.coachFromId || !s.league) return 'market';
    if (leagueDone(s.league)) return 'seasonEnd';
    return 'hub';
  });
  const [matchCtx, setMatchCtx] = useState<{
    teams: [TTeam, TTeam];
    userIdx: 0 | 1;
    maps?: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  } | null>(null);
  const [selSeries, setSelSeries] = useState<{ series: SeriesResult; teams: [TTeam, TTeam] } | null>(null);
  const [majorResult, setMajorResult] = useState<MajorResult | null>(null);
  const rngRef = useRef(makeRng(randomSeed()));

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
    return { ...team, tag: s.org.tag, colors: s.org.colors };
  };

  const startSplit = (s: CareerSave) => {
    const user = buildTeam(s);
    if (!user) return;
    const ai = brTeams.filter((t) => t.id !== 'user').slice(0, 7).map(teamSeasonToTTeam);
    const league = createLeague(`CIRCUIT X - Split ${s.split}`, [user, ...ai]);
    update({ league });
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

  // Major: o time vai pro Major mundial (16 times) e disputa Suíça + playoffs.
  // v0: simulado de ponta a ponta para mostrar a jornada (jogar ao vivo vem a seguir).
  const playMajor = (s: CareerSave) => {
    const user = buildTeam(s);
    if (!user) return;
    rngRef.current = makeRng(randomSeed());
    const pool = currentEra.filter((t) => t.id !== 'user');
    const major = createTournament(pool, user, rngRef.current, `MAJOR ${s.split}`, 4);
    let guard = 0;
    while (major.phase !== 'done' && guard++ < 40) resolveRound(major, rngRef.current);
    const placement = placementCode(major, 'user');
    setMajorResult({
      tournament: major,
      placement,
      prize: MAJOR_PRIZE[placement],
      vrs: MAJOR_VRS[placement],
      champion: placement === 'champion',
    });
    setStage('major');
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
        onConfirm={(squad, coachFromId, budget) => {
          const next = { ...save, squad, coachFromId, budget };
          persist(next);
          setSave(next);
          startSplit(next);
        }}
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
          <div className="panel-head">🌍 Major Mundial - resultado</div>
          <div className="panel-body center">
            <div className="trophy">{mr.champion ? '🏆' : mr.placement === 'runnerup' ? '🥈' : '🎯'}</div>
            <h2>{save.org?.name}: {PLACE_PT[mr.placement]}</h2>
            <div className="prize-banner">
              💰 Premiação: <b>+{formatMoney(mr.prize)}</b> · 📈 VRS: <b>+{mr.vrs} pts</b>
              {mr.champion ? ' · 🏆 +1 título!' : ''}
            </div>
            <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
              {mr.champion
                ? 'Sua organização é CAMPEÃ MUNDIAL! O nome entrou para a história do CS.'
                : 'Sua org representou o Brasil no Major mundial. Volte mais forte no próximo split.'}
            </p>
            <button
              className="btn gold big"
              onClick={() => {
                const next = {
                  ...save,
                  budget: save.budget + mr.prize - payroll,
                  vrs: save.vrs + mr.vrs,
                  titles: save.titles + (mr.champion ? 1 : 0),
                  split: save.split + 1,
                  league: null,
                };
                persist(next);
                setSave(next);
                setMajorResult(null);
                setStage('market');
              }}
            >
              🔁 Pagar folha ({formatMoney(payroll)}) e ir pro Split {save.split + 1}
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
    const prize = PRIZE_BY_POS[pos - 1] ?? 50_000;
    const vrsGain = VRS_BY_POS[pos - 1] ?? 10;
    const qualified = pos <= MAJOR_SPOTS;
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }}>
          <div className="panel-head">
            🏁 {league.name} - split encerrado
            <span className="spacer" />
            <button className="btn" onClick={onExit}>← Sair</button>
          </div>
          <div className="panel-body center">
            <div className="trophy">{pos === 1 ? '🏆' : pos <= 3 ? '🥉' : '📊'}</div>
            <h2>{save.org?.name} terminou em {pos}º lugar</h2>
            <div className="prize-banner">
              💰 Premiação: <b>+{formatMoney(prize)}</b> · 📈 VRS: <b>+{vrsGain} pts</b> · 💸 Folha:{' '}
              <b className="neg">-{formatMoney(payroll)}</b>
            </div>
            {qualified ? (
              <div className="qualify-banner">
                🎟️ <b>CLASSIFICADO PRO MAJOR MUNDIAL!</b> Terminar no top {MAJOR_SPOTS} do Circuit X
                garantiu a vaga. Hora de enfrentar os melhores do mundo.
              </div>
            ) : (
              <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
                Termine no <b>top {MAJOR_SPOTS}</b> do Circuit X para garantir vaga no Major Mundial.
                Faltou pouco: continue acumulando VRS e reforçando o elenco.
              </p>
            )}
            <CareerTable table={table} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
              {qualified && (
                <button
                  className="btn gold big"
                  onClick={() => {
                    // aplica prêmio+VRS do split antes de ir pro Major
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
                  🌍 Disputar o Major Mundial
                </button>
              )}
              <button
                className={qualified ? 'btn ghost big' : 'btn gold big'}
                onClick={() => {
                  const next = {
                    ...save,
                    budget: save.budget + prize - payroll,
                    vrs: save.vrs + vrsGain,
                    titles: save.titles + (pos === 1 ? 1 : 0),
                    split: save.split + 1,
                    league: null,
                  };
                  persist(next);
                  setSave(next);
                  setStage('market');
                }}
              >
                🔁 Pagar folha e ir pro Split {save.split + 1}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- veto / partida ----------
  if ((stage === 'veto' || stage === 'match') && matchCtx && league) {
    if (stage === 'veto') {
      return (
        <VetoScreen
          teams={matchCtx.teams}
          userIdx={matchCtx.userIdx}
          rng={() => rngRef.current()}
          phaseLabel={`${league.name} · Rodada ${league.current + 1}`}
          bestOf={LEAGUE_BO}
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
        phaseLabel={`${league.name} · Rodada ${league.current + 1}`}
        bestOf={LEAGUE_BO}
        onFinish={(series) => finishUserRound(league, series)}
      />
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
    setMatchCtx({ teams: [a, b], userIdx: myMatch.a === 'user' ? 0 : 1 });
    setStage('veto');
  };

  const myPos = userPosition(league);
  const form = clubForm(league);
  const opp = myMatch ? leagueTeam(league, myMatch.a === 'user' ? myMatch.b : myMatch.a) : null;
  const oppPos = opp ? table.findIndex((t) => t.id === opp.id) + 1 : 0;

  return (
    <div className="fade-in career-hub">
      {/* barra do clube (estilo hub do FIFA) */}
      <div className="career-topbar">
        <TeamBadge tag={save.org?.tag ?? ''} colors={save.org?.colors ?? ['#101820', '#61a8dd']} size={46} />
        <div className="ct-id">
          <div className="ct-name">{save.org?.name}</div>
          <div className="ct-sub">CIRCUIT X · Split {save.split}</div>
        </div>
        <div className="ct-standing">
          <span className="muted small">POSIÇÃO</span>
          <b className={myPos <= MAJOR_SPOTS ? 'pos' : ''}>{myPos}º</b>
        </div>
        <div className="ct-form">
          <span className="muted small">FORMA</span>
          <span className="form-chips">
            {form.length ? form.slice(-5).map((f, i) => <i key={i} className={`fchip ${f === 'W' ? 'w' : 'l'}`}>{f}</i>) : <i className="muted small">-</i>}
          </span>
        </div>
        <span className="spacer" />
        <div className="ct-stats">
          <span title="Caixa do clube">💰 {formatMoney(save.budget)}</span>
          <span title="Folha salarial por split">💸 {formatMoney(payroll)}</span>
          <span title="Pontos de ranking (VRS)">📈 {save.vrs} VRS</span>
          <span title="Títulos">🏆 {save.titles}</span>
        </div>
        <button className="btn" onClick={onExit}>← Sair</button>
      </div>

      <div className="career-grid">
        <div className="career-main">
          {/* card grande de PRÓXIMA PARTIDA */}
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

          <div className="muted small section-label">Rodada {league.current + 1} - confrontos</div>
          <div className="panel-body tight" style={{ padding: 0 }}>
            {league.rounds[league.current]?.map((m, i) => {
              const a = leagueTeam(league, m.a);
              const b = leagueTeam(league, m.b);
              const mine = m.a === 'user' || m.b === 'user';
              return (
                <div key={i} className={`matchline${m.result ? ' clickable' : ''}`}
                  onClick={() => m.result && setSelSeries({ series: m.result, teams: [a, b] })}>
                  <span className={`side${mine && m.a === 'user' ? ' human' : ''}`}>
                    <span className="tname">{a.name}</span>
                  </span>
                  {m.result ? (
                    <span className="score">
                      <span className={m.result.winner === 0 ? 'w' : 'l'}>{m.result.mapScore[0]}</span>
                      {' : '}
                      <span className={m.result.winner === 1 ? 'w' : 'l'}>{m.result.mapScore[1]}</span>
                    </span>
                  ) : (
                    <span className="score muted">vs</span>
                  )}
                  <span className={`side right${mine && m.b === 'user' ? ' human' : ''}`}>
                    <span className="tname">{b.name}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="career-side">
          <div className="side-card">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Classificação · top {MAJOR_SPOTS} vai ao Major</div>
            <CareerTable table={table} highlightTop={MAJOR_SPOTS} />
          </div>
          <div className="side-card">
            <div className="muted small section-label" style={{ marginTop: 0 }}>Seu elenco</div>
            <div className="career-squad">
              {(buildTeam(save)?.players ?? []).map((p) => (
                <div key={p.id} className="cs-row">
                  <PlayerAvatar nick={p.nick} size={28} />
                  <span className="cs-nick"><Flag cc={p.country} /> {p.nick}</span>
                  <span className={`role-pill ${p.role}`}>{p.role}</span>
                  <span className="cs-ovr">{p.ovr}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {selSeries && <Scoreboard series={selSeries.series} teams={selSeries.teams} />}
    </div>
  );
}

function CareerTable({ table, highlightTop = 0 }: { table: TTeam[]; highlightTop?: number }) {
  return (
    <table className="stats">
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>#</th>
          <th style={{ textAlign: 'left' }}>Time</th>
          <th>V</th>
          <th>D</th>
          <th>Saldo</th>
        </tr>
      </thead>
      <tbody>
        {table.map((t, i) => (
          <tr key={t.id} className={`${t.id === 'user' ? 'human-row' : ''}${highlightTop && i < highlightTop ? ' qualify-row' : ''}`}>
            <td style={{ textAlign: 'left' }}>{i + 1}</td>
            <td style={{ textAlign: 'left', fontWeight: t.id === 'user' ? 700 : 400 }}>{t.name}</td>
            <td className="pos">{t.wins}</td>
            <td className="neg">{t.losses}</td>
            <td>{t.roundDiff > 0 ? `+${t.roundDiff}` : t.roundDiff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- fundação da organização ----------
function FoundOrg({ onFound, onExit }: { onFound: (org: NonNullable<CareerSave['org']>) => void; onExit: () => void }) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [c1, setC1] = useState('#101820');
  const [c2, setC2] = useState('#61a8dd');
  return (
    <div className="fade-in">
      <div className="panel" style={{ maxWidth: 560, margin: '30px auto' }}>
        <div className="panel-head">
          🏗️ Fundar organização (modo carreira)
          <span className="spacer" />
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <p className="muted small" style={{ marginTop: 0 }}>
            Crie sua org nos <b>tempos atuais</b> (só elencos CS2). Você começa com{' '}
            <b>{formatMoney(STARTING_BUDGET)}</b> para montar 5 jogadores + coach e
            disputar o <b>Circuit X</b>. Sem lendas do passado aqui: o desafio é
            construir do zero.
          </p>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Nome da organização</label>
            <input value={name} maxLength={24} placeholder="ex: Astro Esports" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Tag (até 4 letras)</label>
            <input value={tag} maxLength={4} placeholder="ex: ASTR" style={{ textTransform: 'uppercase' }} onChange={(e) => setTag(e.target.value.toUpperCase())} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Cores</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} />
              <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} />
            </div>
          </div>
          <button
            className="btn gold big"
            style={{ width: '100%' }}
            disabled={!name.trim() || !tag.trim()}
            onClick={() => onFound({ name: name.trim(), tag: tag.trim() || 'ORG', colors: [c1, c2] })}
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
  onConfirm: (squad: Signing[], coachFromId: string, budget: number) => void;
  onExit: () => void;
}) {
  const [squad, setSquad] = useState<Signing[]>(save.squad);
  const [coachId, setCoachId] = useState<string | null>(save.coachFromId);
  const [filter, setFilter] = useState('');

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
          💼 Mercado - Split {save.split} ({save.org?.name})
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

          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn gold big" disabled={!ready}
              onClick={() => coachId && onConfirm(squad, coachId, budgetLeft)}>
              ✔ Fechar elenco e começar o Circuit X
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
