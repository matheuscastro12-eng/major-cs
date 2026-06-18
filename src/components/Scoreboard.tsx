import { useMemo, useState } from 'react';
import { computeDisplay, mergeLines } from '../engine/match';
import type { PlayerLine, SeriesResult, TTeam } from '../types';
import { MAP_LABELS } from '../types';
import { ratingClass, swingFmt } from './statFormat';
import { Flag, PlayerAvatar, TeamBadge } from './ui';
import { ct } from '../state/career-i18n';

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

  // "Player of the match": maior rating somando a SÉRIE inteira (todos os mapas,
  // ambos os lados), independente dos filtros de mapa/lado acima.
  const potm = useMemo(() => {
    let best: { team: 0 | 1; pid: string; line: PlayerLine; rating: number } | null = null;
    for (const idx of [0, 1] as const) {
      for (const p of teams[idx].players) {
        const line = mergeLines(series.maps.map((m) => m.stats[p.id]).filter(Boolean).map((s) => s.both));
        if (line.rounds === 0) continue;
        const rating = computeDisplay(line).rating;
        if (!best || rating > best.rating) best = { team: idx, pid: p.id, line, rating };
      }
    }
    return best;
  }, [series, teams]);

  const renderTeam = (idx: 0 | 1) => {
    const team = teams[idx];
    const rows = team.players
      .map((p) => { const l = lines.get(p.id); return { p, l, d: computeDisplay(l) }; })
      .sort((a, b) => b.d.rating - a.d.rating);

    return (
      <tbody key={team.id}>
        <tr className="team-row">
          <td colSpan={10}>
            <span className="pcell">
              <TeamBadge tag={team.tag} colors={team.colors} size={22} logoUrl={team.logoUrl} />
              {series.winner === idx ? '🏆 ' : ''}
              {team.name}
            </span>
          </td>
        </tr>
        {rows.map(({ p, l, d }) => {
          const sw = swingFmt(d.swing);
          return (
            <tr key={p.id}>
              <td className="sb-player">
                <span className="pcell">
                  <Flag cc={p.country} />
                  <span className="pname">
                    <b>{p.nick}</b>
                    {p.originEra && <span className="era-chip">{p.originEra}</span>}{' '}
                    <span className="real">{p.name}</span>
                  </span>
                </span>
              </td>
              <td className="sb-kad"><b>{l.kills}</b>-{l.assists}-{l.deaths}</td>
              <td>{l.mkRounds}</td>
              <td>{d.kast.toFixed(1)}%</td>
              <td>{l.clutchWins}</td>
              <td className="sb-sub">{l.kills} <span className="muted">({l.hsKills})</span></td>
              <td className="sb-sub">{l.deaths} <span className="muted">({l.tradedDeaths})</span></td>
              <td>{d.adr.toFixed(1)}</td>
              <td className={sw.cls}>{sw.text}</td>
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
        {ct('Estatísticas da partida')}
        <span className="spacer" />
        <div className="seg">
          {(['both', 't', 'ct'] as SideFilter[]).map((s) => (
            <button key={s} className={side === s ? 'active' : ''} onClick={() => setSide(s)} title={s === 'both' ? ct('Ambos os lados') : s === 't' ? ct('Terrorista (TR)') : ct('Counter-Terrorist (CT)')}>
              {s === 'both' ? ct('Ambos') : s === 't' ? 'TR' : 'CT'}
            </button>
          ))}
        </div>
      </div>

      {potm && <PlayerOfMatch team={teams[potm.team]} pid={potm.pid} line={potm.line} />}

      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-soft)' }}>
        <div className="tabs">
          <button className={`tab${mapTab === -1 ? ' active' : ''}`} onClick={() => setMapTab(-1)}>
            {ct('Todos os mapas')}
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
        <div className="sb-scroll">
          <table className="stats sb-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{ct('Jogador')}</th>
                <th title={ct('Kills - Assistências - Mortes')}>K-A-D</th>
                <th title={ct('Rounds com 2+ abates (multi-kills)')}>MKs</th>
                <th title={ct('Kill / Assist / Survive / Trade')}>KAST</th>
                <th title={ct('Clutches (1vX) vencidos')}>1vsX</th>
                <th title={ct('Abates (de headshot)')}>K (hs)</th>
                <th title={ct('Mortes (trocadas)')}>D (t)</th>
                <th>ADR</th>
                <th>Swing</th>
                <th>Rating<br />3.0</th>
              </tr>
            </thead>
            {renderTeam(0)}
            {renderTeam(1)}
          </table>
        </div>
      </div>
    </div>
  );
}

// destaque da partida: KPR/DPR/KAST/MK/Swing/ADR/Rating em barras vs a média (~1.0)
function PlayerOfMatch({ team, pid, line }: { team: TTeam; pid: string; line: PlayerLine }) {
  const p = team.players.find((x) => x.id === pid);
  if (!p) return null;
  const r = Math.max(1, line.rounds);
  const d = computeDisplay(line);
  const kpr = line.kills / r;
  const dpr = line.deaths / r;
  const mk = line.mkRounds / r;
  // cada métrica vira uma fração 0..1 vs um teto plausível, pra desenhar a barra
  const bars: { label: string; val: string; frac: number; good: boolean }[] = [
    { label: 'KPR', val: kpr.toFixed(2), frac: kpr / 1.1, good: kpr >= 0.72 },
    { label: 'DPR', val: dpr.toFixed(2), frac: 1 - dpr / 1.0, good: dpr <= 0.66 },
    { label: 'KAST', val: `${d.kast.toFixed(0)}%`, frac: d.kast / 100, good: d.kast >= 72 },
    { label: 'MK', val: line.mkRounds.toString(), frac: mk / 0.28, good: mk >= 0.14 },
    { label: 'Swing', val: swingFmt(d.swing).text, frac: 0.5 + d.swing / 16, good: d.swing >= 0 },
    { label: 'ADR', val: d.adr.toFixed(0), frac: d.adr / 110, good: d.adr >= 78 },
    { label: 'Rating 3.0', val: d.rating.toFixed(2), frac: d.rating / 1.6, good: d.rating >= 1 },
  ];
  return (
    <div className="potm">
      <div className="potm-id">
        <span className="potm-tag">{ct('Destaque da partida')}</span>
        <PlayerAvatar nick={p.nick} size={46} />
        <div className="potm-name"><Flag cc={p.country} /> <b>{p.nick}</b></div>
        <div className="muted small">{team.tag} · {p.name}</div>
      </div>
      <div className="potm-bars">
        {bars.map((b) => (
          <div key={b.label} className="potm-bar">
            <span className="pb-val">{b.val}</span>
            <span className="pb-track"><i className={b.good ? 'good' : 'bad'} style={{ height: `${Math.max(6, Math.min(100, b.frac * 100))}%` }} /></span>
            <span className="pb-label">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
