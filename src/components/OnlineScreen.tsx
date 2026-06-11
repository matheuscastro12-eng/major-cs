import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playerOvr } from '../engine/ratings';
import {
  buildDraftForPlayer,
  fetchLobby,
  lobbyApi,
  majorStandings,
  simulateOnlineMajor,
  type LobbyState,
} from '../state/online';
import { useLang } from '../state/i18n';
import { track } from '../state/track';
import type { SeriesResult, TournamentPool } from '../types';
import { Scoreboard } from './Scoreboard';
import { AttrBar, Flag, Loader, OvrBadge, PlayerAvatar, TeamBadge } from './ui';

interface SelSeries {
  a: string; // teamId
  b: string;
  series: SeriesResult;
}

interface Props {
  onBack: () => void;
}

const NICK_KEY = 'rtm-nick';
const POLL_MS = 2200;

export function OnlineScreen({ onBack }: Props) {
  const { t: tr } = useLang();
  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem(NICK_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [codeInput, setCodeInput] = useState('');
  const [mode, setMode] = useState<'duel' | 'party'>('duel');
  const [pool, setPool] = useState<TournamentPool>('world');
  const [code, setCode] = useState('');
  const [state, setState] = useState<LobbyState | null>(null);
  const [myPicks, setMyPicks] = useState<string[]>([]);
  const [coachPick, setCoachPick] = useState('');
  const [myDone, setMyDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selMatch, setSelMatch] = useState<SelSeries | null>(null);
  // quantas fases do Major já foram reveladas (experiência rodada a rodada,
  // sem spoiler do campeão); persiste por sala para sobreviver a F5
  const [revealed, setRevealed] = useState(0);
  const pollRef = useRef<number | undefined>(undefined);

  const revealKey = `rtm-online-reveal-${code}`;
  useEffect(() => {
    if (!code) return;
    try {
      setRevealed(Number(localStorage.getItem(revealKey) ?? '0') || 0);
    } catch {
      /* sem storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const advanceReveal = (n: number) => {
    setRevealed(n);
    setSelMatch(null);
    try {
      localStorage.setItem(revealKey, String(n));
    } catch {
      /* sem storage */
    }
  };

  const saveNick = (n: string) => {
    setNick(n);
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* sem storage: o nick vale só nesta sessão */
    }
  };

  // polling do estado do lobby
  const refresh = useCallback(async () => {
    if (!code) return;
    const s = await fetchLobby(code);
    if (!s) return;
    setState(s);
    const me = s.players.find((p) => p.nick.toLowerCase() === nick.toLowerCase());
    if (!me) return;
    if (me.done && !myDone) setMyDone(true);
    // catch-up: adota os picks do servidor apenas quando ele tem MAIS picks que
    // o local (reconexão após F5), nunca regredindo picks otimistas ainda não
    // confirmados. Funciona como restauração e como auto-correção de divergência.
    const serverPicks = Array.isArray(me.picks) ? me.picks : [];
    setMyPicks((local) => (serverPicks.length > local.length ? serverPicks : local));
    if (me.coach_pick) setCoachPick((c) => c || me.coach_pick);
  }, [code, nick, myDone]);

  const lobbyDone = state?.lobby.status === 'done';
  useEffect(() => {
    if (!code) return;
    refresh();
    // resultado é imutável depois de 'done': parar o polling evita re-simular
    // o Major inteiro (~40 séries) a cada 2.2s com a tela de resultado aberta
    if (lobbyDone) return;
    pollRef.current = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(pollRef.current);
  }, [code, refresh, lobbyDone]);

  const create = async () => {
    if (!nick.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await lobbyApi({ action: 'create', nick: nick.trim(), mode, pool });
      if (r.ok && r.code) {
        setCode(r.code);
        track('online_create', { mode, pool });
      } else setError(r.error ?? tr('online.errCreate'));
    } catch {
      setError(tr('online.errServer'));
    }
    setBusy(false);
  };

  const join = async () => {
    if (!nick.trim() || !codeInput.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await lobbyApi({ action: 'join', nick: nick.trim(), code: codeInput.trim().toUpperCase() });
      if (r.ok) {
        setCode(codeInput.trim().toUpperCase());
        track('online_join', {});
      } else setError(r.error ?? tr('online.errJoin'));
    } catch {
      setError(tr('online.errServer'));
    }
    setBusy(false);
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    await lobbyApi({ action: 'start', nick: nick.trim(), code }).catch(() => {});
    setBusy(false);
    refresh();
  };

  const sendPicks = async (picks: string[], coach: string, done: boolean) => {
    await lobbyApi({ action: 'pick', nick: nick.trim(), code, picks, coachPick: coach, done }).catch(() => {});
  };

  // o MEU sorteio (cada jogador recebe elencos diferentes, por seed + nick)
  const setup = useMemo(
    () => (state && state.lobby.status !== 'waiting' ? buildDraftForPlayer(state.lobby.seed, state.lobby.pool, nick) : null),
    [state, nick],
  );

  const major = useMemo(
    () => (state && state.lobby.status === 'done' ? simulateOnlineMajor(state) : null),
    [state],
  );

  useEffect(() => {
    if (major) track('online_done', { players: state?.players.length ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!major]);

  const pickPlayer = (playerId: string) => {
    if (myDone || !setup) return;
    const picks = [...myPicks, playerId];
    setMyPicks(picks);
    sendPicks(picks, coachPick, false);
  };

  const pickCoach = (teamId: string) => {
    if (myDone) return;
    setCoachPick(teamId);
    setMyDone(true);
    sendPicks(myPicks, teamId, true);
  };

  // ---------- telas ----------

  if (!code) {
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 560, margin: '30px auto' }}>
          <div className="panel-head">
            {tr('online.title')}
            <span className="spacer" />
            <button className="btn" onClick={onBack}>
              {tr('common.back')}
            </button>
          </div>
          <div className="panel-body">
            <p className="muted small" style={{ marginTop: 0 }}>
              {tr('online.introA')} <b>{tr('online.introB')}</b> {tr('online.introC')}
              <b>{tr('online.introD')}</b>
              {' '}{tr('online.introE')}
            </p>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{tr('online.yourNick')}</label>
              <input value={nick} maxLength={20} placeholder="ex: fallenzera" onChange={(e) => saveNick(e.target.value)} />
            </div>

            <div className="online-split">
              <div className="online-box">
                <h4>{tr('online.createRoom')}</h4>
                <div className="seg" style={{ marginBottom: 8 }}>
                  <button className={mode === 'duel' ? 'active' : ''} onClick={() => setMode('duel')}>
                    {tr('online.modeDuel')}
                  </button>
                  <button className={mode === 'party' ? 'active' : ''} onClick={() => setMode('party')}>
                    {tr('online.modeParty')}
                  </button>
                </div>
                <div className="seg" style={{ marginBottom: 12 }}>
                  <button className={pool === 'world' ? 'active' : ''} onClick={() => setPool('world')}>
                    {tr('online.poolWorld')}
                  </button>
                  <button className={pool === 'br' ? 'active' : ''} onClick={() => setPool('br')}>
                    {tr('online.poolBr')}
                  </button>
                </div>
                <button className="btn gold" style={{ width: '100%' }} onClick={create} disabled={!nick.trim() || busy}>
                  {busy ? tr('online.creating') : tr('online.createRoom')}
                </button>
              </div>
              <div className="online-box">
                <h4>{tr('online.joinWithCode')}</h4>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>{tr('online.roomCode')}</label>
                  <input
                    value={codeInput}
                    maxLength={5}
                    placeholder="ex: K7KPQ"
                    style={{ textTransform: 'uppercase', letterSpacing: 4, fontFamily: 'var(--font-cond)', fontSize: 18 }}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && join()}
                  />
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={join} disabled={!nick.trim() || !codeInput.trim() || busy}>
                  {busy ? tr('online.joining') : tr('online.joinRoom')}
                </button>
              </div>
            </div>
            {error && (
              <div className="neg small" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return <Loader text={`${tr('online.connecting')} ${code}`} />;
  }

  const isHost = state.lobby.host.toLowerCase() === nick.toLowerCase();

  // sala de espera
  if (state.lobby.status === 'waiting') {
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 560, margin: '30px auto' }}>
          <div className="panel-head">
            {tr('online.roomLabel')} {state.lobby.mode === 'duel' ? tr('online.roomDuel') : tr('online.roomParty')}
            <span className="spacer" />
            <button className="btn ghost" onClick={onBack}>
              {tr('common.exit')}
            </button>
          </div>
          <div className="panel-body center">
            <div className="muted small">{tr('online.shareCode')}</div>
            <div className="lobby-code" onClick={() => navigator.clipboard?.writeText(code)} title={tr('online.clickToCopy')}>
              {code}
            </div>
            <div className="muted small" style={{ marginBottom: 16 }}>
              {state.lobby.pool === 'br' ? tr('online.poolBrLong') : tr('online.poolWorldLong')} · {tr('online.clickCodeToCopy')}
            </div>
            <div className="lobby-players">
              {state.players.map((p) => (
                <span key={p.nick} className="lobby-player">
                  {p.nick === state.lobby.host ? '★ ' : '• '}
                  {p.nick}
                </span>
              ))}
            </div>
            {isHost ? (
              <button className="btn gold big" style={{ marginTop: 18 }} onClick={start} disabled={state.players.length < 2 || busy}>
                {state.players.length < 2 ? tr('online.waitingPlayers') : tr('online.startDraft')}
              </button>
            ) : (
              <div className="muted" style={{ marginTop: 18 }}>
                {tr('online.waitingHost')} {state.lobby.host} {tr('online.waitingHostTail')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // resultados: MAJOR completo (jogadores + IA disputam o mesmo torneio)
  if (state.lobby.status === 'done' && major) {
    const champ = major.teamsById[major.championId];
    const champNick = major.humanByTeamId[major.championId];
    const fullStandings = majorStandings(major);
    // partidas dos playoffs + partidas que envolveram algum jogador humano
    const playoffs = major.tournament.history.filter(
      (h) => !h.phase.startsWith('Suíça') && h.pairing.result,
    );
    const humanGames = major.tournament.history.filter(
      (h) => h.pairing.result && (major.humanByTeamId[h.pairing.a] || major.humanByTeamId[h.pairing.b]),
    );
    const teamLabel = (id: string) => {
      const t = major.teamsById[id];
      const nk = major.humanByTeamId[id];
      return nk ? `${nk} (${t?.tag ?? ''})` : t?.name ?? id;
    };
    // fase do histórico vem em PT do engine; traduz só na exibição
    const phaseDisplay = (ph: string) => {
      const round = /Rodada (\d+)/.exec(ph);
      if (round) return `${tr('common.round')} ${round[1]}`;
      if (ph === 'GRANDE FINAL') return tr('phase.final');
      if (ph === 'Semifinal') return tr('phase.semi');
      if (ph.startsWith('Quartas')) return tr('phase.quarters');
      return ph;
    };
    const SeriesRow = ({ h, hiddenScore }: { h: (typeof playoffs)[number]; hiddenScore?: boolean }) => {
      const p = h.pairing;
      const res = p.result!;
      return (
        <div
          className={`matchline${hiddenScore ? '' : ' clickable'}`}
          onClick={() => !hiddenScore && setSelMatch({ a: p.a, b: p.b, series: res })}
        >
          <span className={`side${major.humanByTeamId[p.a] ? ' human' : ''}`}>
            <span className="tname">{teamLabel(p.a)}</span>
          </span>
          {hiddenScore ? (
            <span className="score muted">vs</span>
          ) : (
            <span className="score">
              <span className={res.winner === 0 ? 'w' : 'l'}>{res.mapScore[0]}</span>
              {' : '}
              <span className={res.winner === 1 ? 'w' : 'l'}>{res.mapScore[1]}</span>
            </span>
          )}
          <span className={`side right${major.humanByTeamId[p.b] ? ' human' : ''}`}>
            <span className="tname">{teamLabel(p.b)}</span>
          </span>
          <span className="muted small">{phaseDisplay(h.phase)}</span>
        </div>
      );
    };

    // fases na ordem em que aconteceram, para revelar rodada a rodada
    const stages: { phase: string; items: typeof playoffs }[] = [];
    for (const h of major.tournament.history) {
      const last = stages[stages.length - 1];
      if (last && last.phase === h.phase) last.items.push(h);
      else stages.push({ phase: h.phase, items: [h] });
    }
    const allRevealed = revealed >= stages.length;

    // ----- modo rodada a rodada (sem spoiler do campeão) -----
    if (!allRevealed) {
      const stage = stages[revealed];
      return (
        <div className="fade-in">
          <div className="panel">
            <div className="panel-head">
              {tr('online.roomMajor')} {code}
              <span className="spacer" />
              <button className="btn ghost" onClick={() => advanceReveal(stages.length)}>
                {tr('online.skipToFinal')}
              </button>
              <button className="btn" onClick={onBack}>
                {tr('online.exitOnline')}
              </button>
            </div>
            <div className="panel-body">
              <div className="reveal-progress">
                {stages.map((s, i) => (
                  <span key={i} className={`reveal-chip${i < revealed ? ' done' : i === revealed ? ' now' : ''}`}>
                    {i < revealed ? '✓ ' : ''}
                    {phaseDisplay(s.phase)}
                  </span>
                ))}
              </div>

              {/* fases já reveladas (placares clicáveis) */}
              {stages.slice(0, revealed).map((s, si) => (
                <div key={si}>
                  <div className="muted small section-label">{phaseDisplay(s.phase)}</div>
                  <div className="panel-body tight" style={{ padding: 0 }}>
                    {s.items.map((h, i) => (
                      <SeriesRow key={i} h={h} />
                    ))}
                  </div>
                </div>
              ))}

              {/* fase atual: confrontos sem placar + botão de revelar */}
              <div className="muted small section-label">
                {tr('online.matchups')} - {phaseDisplay(stage.phase)}
              </div>
              <div className="panel-body tight" style={{ padding: 0 }}>
                {stage.items.map((h, i) => (
                  <SeriesRow key={i} h={h} hiddenScore />
                ))}
              </div>
              <div className="center" style={{ marginTop: 14 }}>
                <button className="btn gold big" onClick={() => advanceReveal(revealed + 1)}>
                  ▶ {tr('online.reveal')} - {phaseDisplay(stage.phase)}
                </button>
              </div>
            </div>
          </div>
          {selMatch && (
            <Scoreboard
              series={selMatch.series}
              teams={[major.teamsById[selMatch.a], major.teamsById[selMatch.b]]}
            />
          )}
        </div>
      );
    }

    return (
      <div className="fade-in">
        <div className="panel">
          <div className="panel-head">
            {tr('online.roomMajor')} {code}
            <span className="spacer" />
            <button className="btn" onClick={onBack}>
              {tr('online.exitOnline')}
            </button>
          </div>
          <div className="panel-body">
            <div className="finale" style={{ padding: '10px 0 18px' }}>
              <div className="trophy">🏆</div>
              <h1 style={{ fontSize: 26 }}>
                {champNick ? `${champNick} ${tr('online.champTitleHuman')}` : `${champ?.name} ${tr('online.champTitleAi')}`}
              </h1>
              <div className="muted">
                {champNick ? `${tr('online.champRoster')} ${champ?.players.map((p) => p.nick).join(', ')}` : tr('online.noHumanFinal')}
              </div>
            </div>

            {/* resultado de cada jogador */}
            <div className="muted small section-label">{tr('online.howEachPlayer')}</div>
            <div className="human-results">
              {major.humans.map((h) => {
                const tm = major.teamsById[h.teamId];
                return (
                  <div key={h.nick} className={`human-card${h.placement === 'champion' ? ' champ' : ''}`}>
                    <div className="hr-head">
                      <TeamBadge tag={tm?.tag ?? ''} colors={tm?.colors ?? ['#333', '#555']} size={28} logoUrl={tm?.logoUrl} />
                      <b>{h.nick}</b>
                      <span className="spacer" />
                      <span className="hr-place">{tr(`placement.${h.placement}`)}</span>
                    </div>
                    <div className="hr-roster muted small">{tm?.players.map((p) => p.nick).join(', ')}</div>
                    <div className="hr-rec muted small">{tr('online.campaign')} {h.wins}{tr('common.wins')} - {h.losses}{tr('common.losses')}</div>
                  </div>
                );
              })}
            </div>

            {/* playoffs */}
            {playoffs.length > 0 && (
              <>
                <div className="muted small section-label">{tr('online.playoffs')}</div>
                <div className="panel-body tight" style={{ padding: 0 }}>
                  {playoffs.map((h, i) => (
                    <SeriesRow key={i} h={h} />
                  ))}
                </div>
              </>
            )}

            {/* partidas dos jogadores na Suíça */}
            <div className="muted small section-label">{tr('online.playerMatches')}</div>
            <div className="panel-body tight" style={{ padding: 0 }}>
              {humanGames.map((h, i) => (
                <SeriesRow key={i} h={h} />
              ))}
            </div>

            {/* classificação final do Major */}
            <div className="muted small section-label">{tr('online.finalStandings')}</div>
            <table className="stats">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>#</th>
                  <th style={{ textAlign: 'left' }}>{tr('online.team')}</th>
                  <th>{tr('common.wins')}</th>
                  <th>{tr('common.losses')}</th>
                  <th>{tr('online.diff')}</th>
                </tr>
              </thead>
              <tbody>
                {fullStandings.map((s, i) => (
                  <tr key={s.team.id} className={s.isHuman ? 'human-row' : undefined}>
                    <td style={{ textAlign: 'left' }}>{i + 1}</td>
                    <td style={{ textAlign: 'left', fontWeight: s.isHuman ? 700 : 400 }}>
                      {s.team.id === major.championId ? '🏆 ' : ''}
                      {s.isHuman ? `${s.nick} · ` : ''}
                      {s.team.name}
                    </td>
                    <td className="pos">{s.team.wins}</td>
                    <td className="neg">{s.team.losses}</td>
                    <td>{s.team.roundDiff > 0 ? `+${s.team.roundDiff}` : s.team.roundDiff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selMatch && (
          <Scoreboard
            series={selMatch.series}
            teams={[major.teamsById[selMatch.a], major.teamsById[selMatch.b]]}
          />
        )}
      </div>
    );
  }

  // draft sincronizado
  if (!setup) return null;
  const coachPhase = myPicks.length >= 5 && !myDone;
  const source = setup.sources[Math.min(myPicks.length, 4)];
  const pickedNicks = new Set(
    myPicks.map((pid, i) => setup.sources[i]?.players.find((p) => p.id === pid)?.nick.toLowerCase()),
  );

  return (
    <div className="fade-in online-draft-layout">
      <div>
        {myDone ? (
          <div className="panel">
            <div className="panel-head">{tr('online.draftSent')}</div>
            <div className="panel-body center">
              <p className="muted">{tr('online.waitingOthers')}</p>
              <div className="lobby-players" style={{ justifyContent: 'center' }}>
                {state.players.map((p) => (
                  <span key={p.nick} className={`lobby-player${p.done ? ' done' : ''}`}>
                    {p.done ? '✔' : '·'} {p.nick}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : coachPhase ? (
          <div className="panel">
            <div className="panel-head">{tr('online.chooseCoach')}</div>
            <div className="player-cards">
              {setup.coachOptions.map((t) => (
                <button key={t.id} className="pcard" onClick={() => pickCoach(t.id)}>
                  <PlayerAvatar nick={t.coach.nick} size={52} coach />
                  <OvrBadge ovr={t.coach.rating} label="COACH" />
                  <div className="nick">{t.coach.nick}</div>
                  <div className="meta">
                    <span className="role-pill IGL">{tr(`coach.${t.coach.style}`)}</span>
                  </div>
                  <div className="meta muted small" style={{ marginTop: 6, lineHeight: 1.3 }}>
                    {tr(`coach.${t.coach.style}Desc`)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              {tr('online.draftOnline')} {myPicks.length + 1} {tr('online.ofFive')}
              <span className="spacer" />
              <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {tr('online.sameRosters')} {tr('online.roomLabel')} {code}
              </span>
            </div>
            <div className="draft-source">
              <TeamBadge tag={source.tag} colors={source.colors} size={56} logoUrl={source.logoUrl} />
              <div style={{ flex: 1 }}>
                <div className="era-game">
                  {source.game} · {source.era}
                </div>
                <h2>
                  {source.team} <Flag cc={source.country} />
                </h2>
                <div className="honors">{source.honors}</div>
              </div>
            </div>
            <div className="player-cards">
              {source.players.map((p) => {
                const taken = pickedNicks.has(p.nick.toLowerCase());
                return (
                  <button key={p.id} className={`pcard${taken ? ' taken' : ''}`} onClick={() => pickPlayer(p.id)}>
                    <PlayerAvatar nick={p.nick} size={56} />
                    <OvrBadge ovr={playerOvr(p)} />
                    <div className="nick">{p.nick}</div>
                    <div className="meta">
                      <Flag cc={p.country} />
                      <span>{p.name}</span>
                    </div>
                    <div className="meta">
                      <span className={`role-pill ${p.role}`}>{p.role}</span>
                    </div>
                    <div className="attr-bars">
                      <AttrBar label={tr('online.attrAim')} value={p.aim} />
                      <AttrBar label="AWP" value={p.awp} />
                      <AttrBar label="IGL" value={p.igl} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="panel online-side">
        <div className="panel-head">{tr('online.roomLabel')} {code}</div>
        <div className="panel-body">
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
            {tr('online.liveProgress')}
          </div>
          {state.players.map((p) => {
            const mine = p.nick.toLowerCase() === nick.toLowerCase();
            const livePicks = mine ? myPicks : (p.picks ?? []);
            // cada jogador tem o próprio sorteio: resolve os nicks pelo setup dele
            const pSetup = mine ? setup : buildDraftForPlayer(state.lobby.seed, state.lobby.pool, p.nick);
            return (
              <div key={p.nick} className="online-progress">
                <div className="op-head">
                  <b>
                    {p.nick === state.lobby.host ? '★ ' : ''}
                    {p.nick}
                    {mine ? ` (${tr('common.you')})` : ''}
                  </b>
                  <span className={p.done || (mine && myDone) ? 'pos small' : 'muted small'}>
                    {p.done || (mine && myDone) ? tr('online.ready') : `${livePicks.length}/5 ${tr('online.picks')}`}
                  </span>
                </div>
                <div className="op-picks">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const pid = livePicks[i];
                    const player = pid ? pSetup.sources[i]?.players.find((x) => x.id === pid) : undefined;
                    return (
                      <span key={i} className={`op-slot${player ? ' filled' : ''}`}>
                        {player ? player.nick : '·'}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="muted small" style={{ marginTop: 12 }}>
            {tr('online.sideExplain')}
          </p>
        </div>
      </div>
    </div>
  );
}
