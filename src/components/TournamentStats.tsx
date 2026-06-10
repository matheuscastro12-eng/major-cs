import { useMemo, useState } from 'react';
import { computeDisplay, mergeLines, type DisplayLine } from '../engine/match';
import { getTeam } from '../engine/swiss';
import type { PlayerLine, Tournament, TPlayer, TTeam } from '../types';
import { ratingClass, swingFmt } from './statFormat';
import { Flag, TeamBadge } from './ui';

type SortKey = 'rating' | 'kills' | 'adr' | 'kast' | 'maps';

interface Row {
  p: TPlayer;
  team: TTeam;
  maps: number;
  d: DisplayLine;
}

interface Props {
  t: Tournament;
  onBack: () => void;
}

function SortTh({
  k,
  sort,
  onSort,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <th className={`sort-th${sort === k ? ' on' : ''}`} onClick={() => onSort(k)}>
      {children}
      {sort === k ? ' ▾' : ''}
    </th>
  );
}

export function TournamentStats({ t, onBack }: Props) {
  const [sort, setSort] = useState<SortKey>('rating');
  const [onlyUser, setOnlyUser] = useState(false);

  const rows = useMemo(() => {
    const acc = new Map<string, { lines: PlayerLine[]; maps: number; team: TTeam; p: TPlayer }>();
    for (const team of t.teams) {
      for (const p of team.players) {
        acc.set(p.id, { lines: [], maps: 0, team, p });
      }
    }
    for (const h of t.history) {
      const res = h.pairing.result;
      if (!res) continue;
      for (const m of res.maps) {
        for (const [pid, st] of Object.entries(m.stats)) {
          const e = acc.get(pid);
          if (!e) continue;
          e.lines.push(st.both);
          e.maps++;
        }
      }
    }
    const out: Row[] = [];
    for (const e of acc.values()) {
      if (e.maps === 0) continue;
      out.push({ p: e.p, team: e.team, maps: e.maps, d: computeDisplay(mergeLines(e.lines)) });
    }
    return out;
  }, [t]);

  const sorted = useMemo(() => {
    const list = onlyUser ? rows.filter((r) => r.team.isUser) : rows;
    const get = (r: Row) =>
      sort === 'rating' ? r.d.rating : sort === 'kills' ? r.d.kills : sort === 'adr' ? r.d.adr : sort === 'kast' ? r.d.kast : r.maps;
    return [...list].sort((a, b) => get(b) - get(a));
  }, [rows, sort, onlyUser]);

  const champion = t.championId ? getTeam(t, t.championId) : undefined;

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          Stats do campeonato - {t.name}
          <span className="spacer" />
          <div className="seg">
            <button className={!onlyUser ? 'active' : ''} onClick={() => setOnlyUser(false)}>
              Todos
            </button>
            <button className={onlyUser ? 'active' : ''} onClick={() => setOnlyUser(true)}>
              Meu time
            </button>
          </div>
          <button className="btn" onClick={onBack}>
            ← Voltar
          </button>
        </div>
        <div className="panel-body tight">
          <table className="stats">
            <thead>
              <tr>
                <th>#</th>
                <th style={{ textAlign: 'left' }}>Jogador</th>
                <th style={{ textAlign: 'left' }}>Time</th>
                <th>OVR</th>
                <SortTh k="maps" sort={sort} onSort={setSort}>Mapas</SortTh>
                <SortTh k="kills" sort={sort} onSort={setSort}>K-D</SortTh>
                <th>Swing</th>
                <SortTh k="adr" sort={sort} onSort={setSort}>ADR</SortTh>
                <SortTh k="kast" sort={sort} onSort={setSort}>KAST</SortTh>
                <SortTh k="rating" sort={sort} onSort={setSort}>Rating 3.0</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 60).map((r, i) => {
                const sw = swingFmt(r.d.swing);
                const isMvp = t.mvpId === r.p.id;
                return (
                  <tr key={r.p.id}>
                    <td className="muted" style={{ textAlign: 'left', width: 30 }}>
                      {i + 1}
                    </td>
                    <td>
                      <span className="pcell">
                        <Flag cc={r.p.country} />
                        <span className="pname">
                          <b>{r.p.nick}</b>
                          {r.p.originEra && <span className="era-chip">{r.p.originEra}</span>}
                          {isMvp && <span className="mvp-tag">MVP</span>}
                          {champion && r.team.id === champion.id && ' 🏆'}
                        </span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <span className="pcell">
                        <TeamBadge tag={r.team.tag} colors={r.team.colors} size={20} logoUrl={r.team.logoUrl} />
                        <span className={r.team.isUser ? 'gold-text' : 'muted'}>{r.team.tag}</span>
                      </span>
                    </td>
                    <td className="ovr-inline">{r.p.ovr}</td>
                    <td>{r.maps}</td>
                    <td>
                      {r.d.kills}-{r.d.deaths}
                    </td>
                    <td className={sw.cls}>{sw.text}</td>
                    <td>{r.d.adr.toFixed(1)}</td>
                    <td>{r.d.kast.toFixed(1)}%</td>
                    <td className={ratingClass(r.d.rating)}>{r.d.rating.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
