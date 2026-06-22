// Replay AO VIVO de uma série já calculada (determinístico): o placar sobe round a
// round, com killfeed, K/D acumulados e scoreboard final. Compartilhado pelo Online
// (duelo/major) e pelo Gauntlet — a partida "acontece" igual em todos os modos.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, PlayerAvatar, TeamBadge } from '../ui';
import { Scoreboard } from '../Scoreboard';
import { MAP_LABELS } from '../../types';
import type { SeriesResult, TTeam } from '../../types';
import type { PlaybackSpeed } from '../../state/online';

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4, 8];
const MAP_GAP_UNITS = 2;

function LiveStatsSide({ team, stats }: { team: TTeam; stats: Record<string, { k: number; d: number }> }) {
  return (
    <div className="lsb-team">
      <div className="lsb-head">
        <TeamBadge tag={team.tag} colors={team.colors} size={20} logoUrl={team.logoUrl} />
        <span className="lsb-tname">{team.name}</span>
        <span className="lsb-cols">K&nbsp;&nbsp;D&nbsp;&nbsp;+/-</span>
      </div>
      {[...team.players, ...(team.bench ?? [])].map((p) => {
        const s = stats[p.id] ?? { k: 0, d: 0 };
        const diff = s.k - s.d;
        return (
          <div key={p.id} className="lsb-row">
            <PlayerAvatar nick={p.nick} size={24} />
            <span className="lsb-nick"><Flag cc={p.country} /> {p.nick}</span>
            <span className="lsb-kda">{s.k}&nbsp;&nbsp;{s.d}&nbsp;&nbsp;<i className={diff >= 0 ? 'pos' : 'neg'}>{diff > 0 ? `+${diff}` : diff}</i></span>
          </div>
        );
      })}
    </div>
  );
}

export function MatchReplay({
  series,
  teams,
  onClose,
  onFinish,
  allowSkip = true,
  playbackSpeed,
  canControlSpeed,
  onPlaybackSpeedChange,
  startedAt,
  lockedLive = false,
  initialDone = false,
}: {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  onClose: () => void;
  onFinish?: () => void;
  allowSkip?: boolean;
  playbackSpeed: PlaybackSpeed;
  canControlSpeed: boolean;
  onPlaybackSpeedChange: (speed: PlaybackSpeed) => void;
  startedAt?: number;
  lockedLive?: boolean;
  initialDone?: boolean;
}) {
  const [mapIdx, setMapIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(initialDone);
  const finishNotified = useRef(false);

  useEffect(() => {
    if (!done || finishNotified.current) return;
    finishNotified.current = true;
    onFinish?.();
  }, [done, onFinish]);

  useEffect(() => {
    if (done || startedAt) return;
    const map = series.maps[mapIdx];
    if (!map) {
      const finish = window.setTimeout(() => setDone(true), 0);
      return () => window.clearTimeout(finish);
    }
    if (round >= map.roundLog.length) {
      if (mapIdx + 1 >= series.maps.length) {
        const finish = window.setTimeout(() => setDone(true), 0);
        return () => window.clearTimeout(finish);
      }
      const t = setTimeout(() => { setMapIdx(mapIdx + 1); setRound(0); }, 1200 / playbackSpeed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRound((r) => r + 1), 850 / playbackSpeed);
    return () => clearTimeout(t);
  }, [mapIdx, round, done, series, playbackSpeed, startedAt]);

  useEffect(() => {
    if (!startedAt || done) return;
    const syncToRoomClock = () => {
      let units = Math.max(0, Math.floor((Date.now() - startedAt) * playbackSpeed / 850));
      for (let index = 0; index < series.maps.length; index++) {
        const rounds = series.maps[index].roundLog.length;
        if (units <= rounds) {
          setMapIdx(index);
          setRound(Math.min(rounds, units));
          return;
        }
        units -= rounds;
        if (index < series.maps.length - 1) {
          if (units <= MAP_GAP_UNITS) {
            setMapIdx(index);
            setRound(rounds);
            return;
          }
          units -= MAP_GAP_UNITS;
        }
      }
      setDone(true);
    };
    syncToRoomClock();
    const timer = window.setInterval(syncToRoomClock, 250);
    return () => window.clearInterval(timer);
  }, [done, playbackSpeed, series, startedAt]);

  const idIndex = useMemo(() => {
    const m = new Map<string, { nick: string; team: 0 | 1 }>();
    teams.forEach((tm, ti) => [...tm.players, ...(tm.bench ?? [])].forEach((p) => m.set(p.id, { nick: p.nick, team: ti as 0 | 1 })));
    return m;
  }, [teams]);

  const kd = useMemo(() => {
    const k: Record<string, { k: number; d: number }> = {};
    const bump = (id: string, key: 'k' | 'd') => { (k[id] = k[id] || { k: 0, d: 0 })[key]++; };
    for (let mi = 0; mi <= mapIdx && mi < series.maps.length; mi++) {
      const lim = mi < mapIdx ? Infinity : round;
      for (const e of series.maps[mi].killFeed) if (e.round <= lim) { bump(e.killerId, 'k'); bump(e.victimId, 'd'); }
    }
    return k;
  }, [mapIdx, round, series]);

  const map = series.maps[mapIdx];
  const tacticalEvent = !done && map
    ? round === 8 && teams[0].onlinePlan?.timeoutMap === mapIdx
      ? `TIMEOUT TÁTICO · ${teams[0].name}`
      : round === 9 && teams[1].onlinePlan?.timeoutMap === mapIdx
        ? `TIMEOUT TÁTICO · ${teams[1].name}`
        : round === 0 && mapIdx > 0
          ? [teams[0], teams[1]].filter((team) => team.onlinePlan?.substituteAfterMap && team.onlinePlan.reserveNick).map((team) => `${team.onlinePlan?.reserveNick} entra por ${team.name}`).join(' · ')
          : ''
    : '';
  const log = map ? map.roundLog.slice(0, round) : [];
  const sa = done && map ? map.score[0] : log.filter((w) => w === 0).length;
  const sb = done && map ? map.score[1] : log.filter((w) => w === 1).length;
  const playedMaps = done ? series.maps : series.maps.slice(0, mapIdx);
  const mapsA = playedMaps.filter((m) => m.winner === 0).length;
  const mapsB = playedMaps.filter((m) => m.winner === 1).length;
  const feed = map ? map.killFeed.filter((e) => e.round <= round).slice(-7).reverse() : [];
  const lastWinner = round > 0 && map ? map.roundLog[Math.min(round, map.roundLog.length) - 1] : null;

  return (
    <div className="panel match-replay fade-in">
      <div className="panel-head">
        {map ? MAP_LABELS[map.map] : 'FIM'} {!done && `· ${round === 0 ? 'LIVE' : `R${round}`}`}
        <span className="spacer" />
        {!done && (
          <div className="ut-playback-speed" title={canControlSpeed ? 'O host controla a velocidade para toda a sala' : 'Velocidade definida pelo host'}>
            <span>{canControlSpeed ? 'VELOCIDADE DA SALA' : `HOST · ${playbackSpeed}x`}</span>
            {canControlSpeed && PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                className={`btn ghost small${playbackSpeed === speed ? ' active' : ''}`}
                onClick={() => onPlaybackSpeedChange(speed)}
                title={speed === 8 ? 'Instantâneo: cai direto no placar' : undefined}
              >
                {speed === 8 ? '⚡' : `${speed}x`}
              </button>
            ))}
          </div>
        )}
        {!done && allowSkip && <button className="btn ghost small" onClick={() => setDone(true)}>Pular ⏭</button>}
        {!lockedLive && <button className="btn small" onClick={onClose}>Fechar ✕</button>}
      </div>
      <div className="panel-body">
        <div className="qs-board" style={{ marginBottom: 10 }}>
          <div className="qs-side"><TeamBadge tag={teams[0].tag} colors={teams[0].colors} size={40} logoUrl={teams[0].logoUrl} /><div className="qs-name">{teams[0].name}</div><div className="qs-score">{sa}</div></div>
          <div className="qs-mid"><div className="qs-mapscore">{mapsA} - {mapsB} <span className="muted small">mapas</span></div></div>
          <div className="qs-side"><TeamBadge tag={teams[1].tag} colors={teams[1].colors} size={40} logoUrl={teams[1].logoUrl} /><div className="qs-name">{teams[1].name}</div><div className="qs-score">{sb}</div></div>
        </div>
        {tacticalEvent && <div className="ut-tactical-event">{tacticalEvent}</div>}
        {!done && lastWinner !== null && (
          <div className={`ut-round-winner team-${lastWinner}`}>
            ROUND {round} · {teams[lastWinner].name} pontua · {sa}:{sb}
          </div>
        )}
        {!done && (
          <>
            <div className="replay-feed">
              {feed.length === 0 ? <div className="muted small">…</div> : feed.map((e, i) => (
                <div key={i} className="rf-row">
                  <span className="kf-round">R{e.round}</span>
                  <span style={{ color: e.killerTeam === 0 ? '#6fb6ec' : '#f0b35c' }}>{idIndex.get(e.killerId)?.nick ?? '?'}</span>
                  {e.headshot ? ' ◉ ' : ' ▸ '}
                  <span style={{ color: e.victimTeam === 0 ? '#6fb6ec' : '#f0b35c' }}>{idIndex.get(e.victimId)?.nick ?? '?'}</span>
                </div>
              ))}
            </div>
            <div className="live-scoreboard">
              <LiveStatsSide team={teams[0]} stats={kd} />
              <div className="lsb-vs">VS</div>
              <LiveStatsSide team={teams[1]} stats={kd} />
            </div>
          </>
        )}
      </div>
      {done && <Scoreboard series={series} teams={teams} />}
    </div>
  );
}
