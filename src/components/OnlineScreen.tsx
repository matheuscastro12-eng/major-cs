import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playerOvr } from '../engine/ratings';
import {
  buildDraftFromSeed,
  fetchLobby,
  lobbyApi,
  majorStandings,
  simulateOnlineMajor,
  type LobbyState,
} from '../state/online';
import { track } from '../state/track';
import type { SeriesResult, TournamentPool } from '../types';
import { COACH_STYLE_DESC, COACH_STYLE_LABELS } from '../types';
import { Scoreboard } from './Scoreboard';
import { AttrBar, Flag, OvrBadge, PlayerAvatar, TeamBadge } from './ui';

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
  const [nick, setNick] = useState(() => localStorage.getItem(NICK_KEY) ?? '');
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
  const pollRef = useRef<number | undefined>(undefined);

  const saveNick = (n: string) => {
    setNick(n);
    localStorage.setItem(NICK_KEY, n);
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

  useEffect(() => {
    if (!code) return;
    refresh();
    pollRef.current = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(pollRef.current);
  }, [code, refresh]);

  const create = async () => {
    if (!nick.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await lobbyApi({ action: 'create', nick: nick.trim(), mode, pool });
      if (r.ok && r.code) {
        setCode(r.code);
        track('online_create', { mode, pool });
      } else setError(r.error ?? 'erro ao criar lobby');
    } catch {
      setError('servidor indisponível (o modo online precisa do site publicado)');
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
      } else setError(r.error ?? 'erro ao entrar');
    } catch {
      setError('servidor indisponível (o modo online precisa do site publicado)');
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

  const setup = useMemo(
    () => (state && state.lobby.status !== 'waiting' ? buildDraftFromSeed(state.lobby.seed, state.lobby.pool) : null),
    [state],
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
            🌐 Jogar online com amigos
            <span className="spacer" />
            <button className="btn" onClick={onBack}>
              ← Voltar
            </button>
          </div>
          <div className="panel-body">
            <p className="muted small" style={{ marginTop: 0 }}>
              Todos draftam dos <b>mesmos elencos sorteados</b> (seu ultimate team), vendo o progresso
              uns dos outros ao vivo. No fim, os times de todos entram juntos num <b>Major completo</b>
              {' '}(com times da IA preenchendo) e disputam Suíça + playoffs. Vence quem levantar a taça.
            </p>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Seu nick</label>
              <input value={nick} maxLength={20} placeholder="ex: fallenzera" onChange={(e) => saveNick(e.target.value)} />
            </div>

            <div className="online-split">
              <div className="online-box">
                <h4>Criar sala</h4>
                <div className="seg" style={{ marginBottom: 8 }}>
                  <button className={mode === 'duel' ? 'active' : ''} onClick={() => setMode('duel')}>
                    ⚔ Duelo 1x1
                  </button>
                  <button className={mode === 'party' ? 'active' : ''} onClick={() => setMode('party')}>
                    👥 Grupo (até 8)
                  </button>
                </div>
                <div className="seg" style={{ marginBottom: 12 }}>
                  <button className={pool === 'world' ? 'active' : ''} onClick={() => setPool('world')}>
                    🌍 Mundial
                  </button>
                  <button className={pool === 'br' ? 'active' : ''} onClick={() => setPool('br')}>
                    🇧🇷 GC
                  </button>
                </div>
                <button className="btn gold" style={{ width: '100%' }} onClick={create} disabled={!nick.trim() || busy}>
                  {busy ? 'Criando…' : 'Criar sala'}
                </button>
              </div>
              <div className="online-box">
                <h4>Entrar com código</h4>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Código da sala</label>
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
                  {busy ? 'Entrando…' : 'Entrar na sala'}
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
    return (
      <div className="fade-in center" style={{ padding: 60 }}>
        <div className="muted">Conectando à sala {code}…</div>
      </div>
    );
  }

  const isHost = state.lobby.host.toLowerCase() === nick.toLowerCase();

  // sala de espera
  if (state.lobby.status === 'waiting') {
    return (
      <div className="fade-in">
        <div className="panel" style={{ maxWidth: 560, margin: '30px auto' }}>
          <div className="panel-head">
            🌐 Sala {state.lobby.mode === 'duel' ? '· Duelo 1x1' : '· Grupo'}
            <span className="spacer" />
            <button className="btn ghost" onClick={onBack}>
              Sair
            </button>
          </div>
          <div className="panel-body center">
            <div className="muted small">Compartilhe o código com seus amigos:</div>
            <div className="lobby-code" onClick={() => navigator.clipboard?.writeText(code)} title="Clique para copiar">
              {code}
            </div>
            <div className="muted small" style={{ marginBottom: 16 }}>
              {state.lobby.pool === 'br' ? '🇧🇷 GC Masters (só elencos BR)' : '🌍 Major Mundial'} · clique no código para copiar
            </div>
            <div className="lobby-players">
              {state.players.map((p) => (
                <span key={p.nick} className="lobby-player">
                  {p.nick === state.lobby.host ? '👑 ' : '🎮 '}
                  {p.nick}
                </span>
              ))}
            </div>
            {isHost ? (
              <button className="btn gold big" style={{ marginTop: 18 }} onClick={start} disabled={state.players.length < 2 || busy}>
                {state.players.length < 2 ? 'Aguardando jogadores…' : '▶ Começar o draft'}
              </button>
            ) : (
              <div className="muted" style={{ marginTop: 18 }}>
                Aguardando {state.lobby.host} iniciar o draft…
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
    const SeriesRow = ({ h, key }: { h: (typeof playoffs)[number]; key?: number }) => {
      const p = h.pairing;
      const res = p.result!;
      return (
        <div
          key={key}
          className="matchline clickable"
          onClick={() => setSelMatch({ a: p.a, b: p.b, series: res })}
        >
          <span className={`side${major.humanByTeamId[p.a] ? ' human' : ''}`}>
            <span className="tname">{teamLabel(p.a)}</span>
          </span>
          <span className="score">
            <span className={res.winner === 0 ? 'w' : 'l'}>{res.mapScore[0]}</span>
            {' : '}
            <span className={res.winner === 1 ? 'w' : 'l'}>{res.mapScore[1]}</span>
          </span>
          <span className={`side right${major.humanByTeamId[p.b] ? ' human' : ''}`}>
            <span className="tname">{teamLabel(p.b)}</span>
          </span>
          <span className="muted small">{h.phase.replace('Suíça - ', '')}</span>
        </div>
      );
    };

    return (
      <div className="fade-in">
        <div className="panel">
          <div className="panel-head">
            🏆 Major da sala {code}
            <span className="spacer" />
            <button className="btn" onClick={onBack}>
              ← Sair do online
            </button>
          </div>
          <div className="panel-body">
            <div className="finale" style={{ padding: '10px 0 18px' }}>
              <div className="trophy">🏆</div>
              <h1 style={{ fontSize: 26 }}>
                {champNick ? `${champNick} é CAMPEÃO do Major!` : `${champ?.name} levou o Major`}
              </h1>
              <div className="muted">
                {champNick ? `com o elenco: ${champ?.players.map((p) => p.nick).join(', ')}` : 'nenhum jogador chegou à final'}
              </div>
            </div>

            {/* resultado de cada jogador */}
            <div className="muted small section-label">Como cada jogador foi</div>
            <div className="human-results">
              {major.humans.map((h) => {
                const t = major.teamsById[h.teamId];
                return (
                  <div key={h.nick} className={`human-card${h.placement === 'CAMPEÃO' ? ' champ' : ''}`}>
                    <div className="hr-head">
                      <TeamBadge tag={t?.tag ?? ''} colors={t?.colors ?? ['#333', '#555']} size={28} logoUrl={t?.logoUrl} />
                      <b>{h.nick}</b>
                      <span className="spacer" />
                      <span className="hr-place">{h.placement}</span>
                    </div>
                    <div className="hr-roster muted small">{t?.players.map((p) => p.nick).join(', ')}</div>
                    <div className="hr-rec muted small">campanha {h.wins}V - {h.losses}D</div>
                  </div>
                );
              })}
            </div>

            {/* playoffs */}
            {playoffs.length > 0 && (
              <>
                <div className="muted small section-label">Playoffs (clique para ver o placar)</div>
                <div className="panel-body tight" style={{ padding: 0 }}>
                  {playoffs.map((h, i) => (
                    <SeriesRow key={i} h={h} />
                  ))}
                </div>
              </>
            )}

            {/* partidas dos jogadores na Suíça */}
            <div className="muted small section-label">Partidas dos jogadores</div>
            <div className="panel-body tight" style={{ padding: 0 }}>
              {humanGames.map((h, i) => (
                <SeriesRow key={i} h={h} />
              ))}
            </div>

            {/* classificação final do Major */}
            <div className="muted small section-label">Classificação final do Major</div>
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
            <div className="panel-head">✔ Draft enviado</div>
            <div className="panel-body center">
              <p className="muted">Aguardando os outros jogadores terminarem o draft…</p>
              <div className="lobby-players" style={{ justifyContent: 'center' }}>
                {state.players.map((p) => (
                  <span key={p.nick} className={`lobby-player${p.done ? ' done' : ''}`}>
                    {p.done ? '✔' : '⏳'} {p.nick}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : coachPhase ? (
          <div className="panel">
            <div className="panel-head">Escolha o COACH</div>
            <div className="player-cards">
              {setup.coachOptions.map((t) => (
                <button key={t.id} className="pcard" onClick={() => pickCoach(t.id)}>
                  <PlayerAvatar nick={t.coach.nick} size={52} coach />
                  <OvrBadge ovr={t.coach.rating} label="COACH" />
                  <div className="nick">{t.coach.nick}</div>
                  <div className="meta">
                    <span className="role-pill IGL">{COACH_STYLE_LABELS[t.coach.style]}</span>
                  </div>
                  <div className="meta muted small" style={{ marginTop: 6, lineHeight: 1.3 }}>
                    {COACH_STYLE_DESC[t.coach.style]}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              Draft online · escolha {myPicks.length + 1} de 5
              <span className="spacer" />
              <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Mesmos elencos para todos · sala {code}
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
                      <AttrBar label="Mira" value={p.aim} />
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
        <div className="panel-head">Sala {code}</div>
        <div className="panel-body">
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
            Progresso ao vivo
          </div>
          {state.players.map((p) => {
            const mine = p.nick.toLowerCase() === nick.toLowerCase();
            const livePicks = mine ? myPicks : (p.picks ?? []);
            return (
              <div key={p.nick} className="online-progress">
                <div className="op-head">
                  <b>
                    {p.nick === state.lobby.host ? '👑 ' : ''}
                    {p.nick}
                    {mine ? ' (você)' : ''}
                  </b>
                  <span className={p.done || (mine && myDone) ? 'pos small' : 'muted small'}>
                    {p.done || (mine && myDone) ? 'pronto ✔' : `${livePicks.length}/5 picks`}
                  </span>
                </div>
                <div className="op-picks">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const pid = livePicks[i];
                    const player = pid ? setup.sources[i]?.players.find((x) => x.id === pid) : undefined;
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
            Todos draftam dos mesmos 5 elencos sorteados. Quando todos terminarem, os times entram
            num Major completo (com a IA preenchendo) e disputam Suíça + playoffs juntos.
          </p>
        </div>
      </div>
    </div>
  );
}
