import { useEffect, useMemo, useState } from 'react';
import { analyzeSeries } from '../engine/insights';
import type { KillEvent, SeriesResult, TPlayer, TTeam } from '../types';
import { MAP_LABELS } from '../types';
import { Scoreboard } from './Scoreboard';
import { MapThumb, TeamBadge } from './ui';

interface Props {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  userIdx: 0 | 1;
  phaseLabel: string;
  onFinish: () => void;
}

export function MatchScreen({ series, teams, userIdx, phaseLabel, onFinish }: Props) {
  const [mapIdx, setMapIdx] = useState(0);
  const [roundIdx, setRoundIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  const map = series.maps[Math.min(mapIdx, series.maps.length - 1)];
  const totalRounds = map.roundLog.length;

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => {
      setRoundIdx((r) => {
        if (r < totalRounds) return r + 1;
        return r;
      });
    }, 85);
    return () => window.clearInterval(id);
  }, [finished, totalRounds, mapIdx]);

  useEffect(() => {
    if (finished || roundIdx < totalRounds) return;
    const id = window.setTimeout(() => {
      if (mapIdx + 1 < series.maps.length) {
        setMapIdx((m) => m + 1);
        setRoundIdx(0);
      } else {
        setFinished(true);
      }
    }, 1100);
    return () => window.clearTimeout(id);
  }, [roundIdx, totalRounds, mapIdx, series.maps.length, finished]);

  const [sa, sb] = useMemo(() => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < Math.min(roundIdx, totalRounds); i++) {
      if (map.roundLog[i] === 0) a++;
      else b++;
    }
    return [a, b];
  }, [roundIdx, map, totalRounds]);

  const mapsWon = useMemo(() => {
    let a = 0;
    let b = 0;
    series.maps.forEach((m, i) => {
      const done = i < mapIdx || finished;
      if (!done) return;
      if (m.winner === 0) a++;
      else b++;
    });
    return [a, b];
  }, [series, mapIdx, finished]);

  const playerById = useMemo(() => {
    const players = new Map<string, TPlayer>();
    for (const team of teams) {
      for (const p of team.players) players.set(p.id, p);
    }
    return players;
  }, [teams]);

  const visibleKills = useMemo(
    () => map.killFeed.filter((e) => e.round <= roundIdx).slice(-8).reverse(),
    [map, roundIdx],
  );

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          {phaseLabel} - MD3
          <span className="spacer" />
          {!finished && (
            <button className="btn ghost" onClick={() => setFinished(true)}>
              Pular para o resultado
            </button>
          )}
        </div>

        <div className="live-stage">
          <MapThumb map={map.map} className="live-map-art" />
          <div className="live-score">
            <div className="team">
              <TeamBadge tag={teams[0].tag} colors={teams[0].colors} size={48} logoUrl={teams[0].logoUrl} />
              <span className="tn">{teams[0].name}</span>
              <span className="muted small">mapas: {finished ? series.mapScore[0] : mapsWon[0]}</span>
            </div>
            <div className="mid">
              {finished ? (
                <>
                  <div className="digits">
                    <span className={series.winner === 0 ? 'winning' : ''}>{series.mapScore[0]}</span>
                    <span className="sep"> : </span>
                    <span className={series.winner === 1 ? 'winning' : ''}>{series.mapScore[1]}</span>
                  </div>
                  <div className="mapname">Serie encerrada</div>
                </>
              ) : (
                <>
                  <div className="digits">
                    <span className={sa > sb ? 'winning' : ''}>{sa}</span>
                    <span className="sep"> : </span>
                    <span className={sb > sa ? 'winning' : ''}>{sb}</span>
                  </div>
                  <div className="mapname">
                    Mapa {mapIdx + 1} - {MAP_LABELS[map.map]}
                    {map.ot && roundIdx >= 24 ? ' - OT' : ''}
                  </div>
                </>
              )}
            </div>
            <div className="team">
              <TeamBadge tag={teams[1].tag} colors={teams[1].colors} size={48} logoUrl={teams[1].logoUrl} />
              <span className="tn">{teams[1].name}</span>
              <span className="muted small">mapas: {finished ? series.mapScore[1] : mapsWon[1]}</span>
            </div>
          </div>
          {!finished && <KillFeed events={visibleKills} teams={teams} playerById={playerById} />}
        </div>

        {!finished && (
          <div className="round-dots">
            {map.roundLog.map((w, i) => (
              <span key={i} className={`rdot${i < roundIdx ? (w === 0 ? ' a' : ' b') : ''}`} />
            ))}
          </div>
        )}

        <div className="map-pills">
          {series.maps.map((m, i) => {
            const done = i < mapIdx || finished;
            const current = i === mapIdx && !finished;
            return (
              <span key={i} className={`map-pill${!done && !current ? ' pending' : ''}`}>
                {MAP_LABELS[m.map]}
                {m.pickedBy >= 0 ? ` (pick ${teams[m.pickedBy as 0 | 1].tag})` : ' (decider)'}{' '}
                {done ? (
                  <b>
                    <span className={m.winner === 0 ? 'mw' : 'ml'}>{m.score[0]}</span>:
                    <span className={m.winner === 1 ? 'mw' : 'ml'}>{m.score[1]}</span>
                  </b>
                ) : current ? (
                  <b>
                    {sa}:{sb}
                  </b>
                ) : (
                  '-'
                )}
              </span>
            );
          })}
        </div>
      </div>

      {finished && <InsightPanel series={series} teams={teams} userIdx={userIdx} />}

      {finished && (
        <>
          <Scoreboard series={series} teams={teams} />
          <div className="center" style={{ margin: '18px 0' }}>
            <button className="btn big" onClick={onFinish}>
              Continuar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function KillFeed({
  events,
  teams,
  playerById,
}: {
  events: KillEvent[];
  teams: [TTeam, TTeam];
  playerById: Map<string, TPlayer>;
}) {
  return (
    <div className="killfeed">
      <div className="killfeed-head">Killfeed</div>
      <div className="killfeed-list">
        {events.length === 0 && <div className="kill-row empty">Aguardando primeiro contato...</div>}
        {events.map((e, i) => {
          const killer = playerById.get(e.killerId);
          const victim = playerById.get(e.victimId);
          return (
            <div key={`${e.round}-${e.killerId}-${e.victimId}-${i}`} className={`kill-row team-${e.killerTeam}`}>
              <span className="kf-round">R{e.round}</span>
              <span className="kf-player" style={{ color: teams[e.killerTeam].colors[1] }}>
                {killer?.nick ?? teams[e.killerTeam].tag}
              </span>
              <span className="kf-weapon">
                {e.weapon}
                {e.headshot ? ' HS' : ''}
                {e.opening ? ' OPEN' : ''}
              </span>
              <span className="kf-player victim">{victim?.nick ?? teams[e.victimTeam].tag}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightPanel({ series, teams, userIdx }: { series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1 }) {
  const insight = useMemo(() => analyzeSeries(series, teams, userIdx), [series, teams, userIdx]);
  return (
    <div className="panel insight-panel fade-in">
      <div className="panel-head">Analise da serie</div>
      <div className="panel-body">
        <div className="verdict">{insight.verdict}</div>
        <div className="insight-list">
          {insight.bullets.map((b, i) => (
            <div key={i} className={`insight-item ${b.tone}`}>
              <span className="ic">{b.icon}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
