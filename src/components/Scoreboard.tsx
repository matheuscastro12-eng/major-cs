import { useMemo, useState } from 'react';
import { computeDisplay, mergeLines } from '../engine/match';
import type { PlayerLine, SeriesResult, TTeam } from '../types';
import { MAP_LABELS } from '../types';
import { ratingClass, swingFmt } from './statFormat';
import { Flag, TeamBadge } from './ui';

type SideFilter = 'both' | 't' | 'ct';

interface Props {
  series: SeriesResult;
  teams: [TTeam, TTeam];
}

export function Scoreboard({ series, teams }: Props) {
  const [mapTab, setMapTab] = useState<number>(-1); // -1 = todos os mapas
  const [side, setSide] = useState<SideFilter>('both');

  const lines = useMemo(() => {
    const maps = mapTab === -1 ? series.maps : [series.maps[mapTab]];
    const get = (pid: string): PlayerLine =>
      mergeLines(
        maps
          .map((m) => m.stats[pid])
          .filter(Boolean)
          .map((s) => s[side]),
      );
    return { get };
  }, [series, mapTab, side]);

  const renderTeam = (idx: 0 | 1) => {
    const team = teams[idx];
    const rows = team.players
      .map((p) => ({ p, d: computeDisplay(lines.get(p.id)) }))
      .sort((a, b) => b.d.rating - a.d.rating);

    return (
      <tbody key={team.id}>
        <tr className="team-row">
          <td colSpan={6}>
            <span className="pcell">
              <TeamBadge tag={team.tag} colors={team.colors} size={22} logoUrl={team.logoUrl} />
              {series.winner === idx ? '🏆 ' : ''}
              {team.name}
            </span>
          </td>
        </tr>
        {rows.map(({ p, d }) => {
          const sw = swingFmt(d.swing);
          return (
            <tr key={p.id}>
              <td>
                <span className="pcell">
                  <Flag cc={p.country} />
                  <span className="pname">
                    <b>{p.nick}</b>
                    {p.originEra && <span className="era-chip">{p.originEra}</span>}{' '}
                    <span className="real">{p.name}</span>
                  </span>
                </span>
              </td>
              <td>
                {d.kills}-{d.deaths}
              </td>
              <td className={sw.cls}>{sw.text}</td>
              <td>{d.adr.toFixed(1)}</td>
              <td>{d.kast.toFixed(1)}%</td>
              <td className={ratingClass(d.rating)}>{d.rating.toFixed(2)}</td>
            </tr>
          );
        })}
      </tbody>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head">
        Match stats
        <span className="spacer" />
        <div className="seg">
          {(['both', 't', 'ct'] as SideFilter[]).map((s) => (
            <button key={s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>
              {s === 'both' ? 'Ambos' : s === 't' ? 'Terrorista' : 'Counter-Terrorist'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-soft)' }}>
        <div className="tabs">
          <button className={`tab${mapTab === -1 ? ' active' : ''}`} onClick={() => setMapTab(-1)}>
            Todos os mapas
          </button>
          {series.maps.map((m, i) => (
            <button key={i} className={`tab${mapTab === i ? ' active' : ''}`} onClick={() => setMapTab(i)}>
              {MAP_LABELS[m.map]}{' '}
              <span className="muted">
                {m.score[0]}:{m.score[1]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body tight">
        <table className="stats">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>K-D</th>
              <th>Swing</th>
              <th>ADR</th>
              <th>KAST</th>
              <th>
                Rating
                <br />
                3.0
              </th>
            </tr>
          </thead>
          {renderTeam(0)}
          {renderTeam(1)}
        </table>
      </div>
    </div>
  );
}
