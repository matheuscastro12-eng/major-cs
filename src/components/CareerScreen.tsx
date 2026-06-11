// MODO CARREIRA REALISTA (v0, NÃO LISTADO: só abre via #carreira).
// Fundar sua organização nos tempos atuais (só elencos CS2), contratar dentro
// do orçamento e disputar o CIRCUIT X (liga BR de pontos corridos). Vitórias
// rendem dinheiro e pontos de VRS - o caminho até o Major virá nas próximas
// fases. Textos em PT por enquanto (modo em refino, não lançado).
import { useMemo, useRef, useState } from 'react';
import { formatMoney, playerValue, buildUserTeam, playerOvr } from '../engine/ratings';
import { createLeague, leagueDone, leagueTable, leagueTeam, resolveLeagueRound, userLeagueMatch, type League } from '../engine/league';
import { teamSeasonToTTeam } from '../engine/ratings';
import { makeRng, randomSeed } from '../engine/rng';
import type { Coach, MapId, Player, SeriesResult, TeamSeason, TTeam } from '../types';
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

type Stage = 'found' | 'market' | 'hub' | 'veto' | 'match' | 'seasonEnd';

interface Props {
  dataset: TeamSeason[];
  onExit: () => void;
}

export function CareerScreen({ dataset, onExit }: Props) {
  const [save, setSave] = useState<CareerSave>(() => loadSave());
  const [stage, setStage] = useState<Stage>(() => {
    const s = loadSave();
    if (!s.org) return 'found';
    if (s.squad.length < 5 || !s.coachFromId) return 'market';
    if (s.league && leagueDone(s.league)) return 'seasonEnd';
    return 'hub';
  });
  const [matchCtx, setMatchCtx] = useState<{
    teams: [TTeam, TTeam];
    userIdx: 0 | 1;
    maps?: { map: MapId; pickedBy: 0 | 1 | -1 }[];
  } | null>(null);
  const [selSeries, setSelSeries] = useState<{ series: SeriesResult; teams: [TTeam, TTeam] } | null>(null);
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

  // ---------- fim de temporada ----------
  if (stage === 'seasonEnd' && league) {
    const table = leagueTable(league);
    const pos = table.findIndex((t) => t.id === 'user') + 1;
    const prize = PRIZE_BY_POS[pos - 1] ?? 50_000;
    const vrsGain = VRS_BY_POS[pos - 1] ?? 10;
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 760, margin: '24px auto' }}>
          <div className="panel-head">
            🏁 {league.name} - temporada encerrada
            <span className="spacer" />
            <button className="btn" onClick={onExit}>← Sair</button>
          </div>
          <div className="panel-body center">
            <div className="trophy">{pos === 1 ? '🏆' : pos <= 3 ? '🥉' : '📊'}</div>
            <h2>{save.org?.name} terminou em {pos}º lugar</h2>
            <div className="prize-banner">
              💰 Premiação: <b>+{formatMoney(prize)}</b> · 📈 VRS: <b>+{vrsGain} pts</b>
            </div>
            <CareerTable table={table} />
            <p className="muted small" style={{ maxWidth: 520, margin: '12px auto' }}>
              Junte pontos de VRS nos splits do Circuit X para garantir vaga nos
              qualifiers do Major (em breve no modo carreira).
            </p>
            <button
              className="btn gold big"
              onClick={() => {
                const next = {
                  ...save,
                  budget: save.budget + prize,
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
              🔁 Janela de transferências → Split {save.split + 1}
            </button>
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
        onFinish={(series) => {
          const m = userLeagueMatch(league);
          if (m) m.result = series;
          resolveLeagueRound(league, rngRef.current, LEAGUE_BO);
          const next = { ...save, league: { ...league } };
          persist(next);
          setSave(next);
          setMatchCtx(null);
          setStage(leagueDone(league) ? 'seasonEnd' : 'hub');
        }}
      />
    );
  }

  // ---------- hub da liga ----------
  if (!league) {
    // squad pronto mas liga ainda não criada (ex.: F5 no momento errado)
    startSplit(save);
    return null;
  }
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

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          🇧🇷 {league.name} · Rodada {league.current + 1}/{league.rounds.length}
          <span className="spacer" />
          <span className="muted small" style={{ textTransform: 'none' }}>
            💰 {formatMoney(save.budget)} · 📈 VRS {save.vrs} pts · 🏆 {save.titles} título(s)
          </span>
          <button className="btn" onClick={onExit}>← Sair</button>
        </div>
        <div className="panel-body">
          <div className="career-banner muted small">
            🔒 MODO CARREIRA (beta fechado) - sua org nos tempos atuais. Vença o
            Circuit X, acumule VRS e prepare o caminho até o Major.
          </div>

          {myMatch && (
            <div className="center" style={{ margin: '12px 0' }}>
              <button className="btn gold big" onClick={playMine}>
                ▶ Jogar minha partida (MD3) - vs{' '}
                {leagueTeam(league, myMatch.a === 'user' ? myMatch.b : myMatch.a).name}
              </button>
            </div>
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

          <div className="muted small section-label">Classificação</div>
          <CareerTable table={table} />
        </div>
      </div>
      {selSeries && <Scoreboard series={selSeries.series} teams={selSeries.teams} />}
    </div>
  );
}

function CareerTable({ table }: { table: TTeam[] }) {
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
          <tr key={t.id} className={t.id === 'user' ? 'human-row' : undefined}>
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
