// [estilo de jogo] Partida: troca de estilo ao vivo (vale a partir do próximo
// round; a % mostrada já o vê) e o pós-jogo com a estatística do estilo.
// Só aparece no motor v2 com tática (Carreira); fora disso não renderiza.
import type { MapSim } from '../engine/match';
import { STYLES_CT, STYLES_T, STYLE_SHORT, sumStyleStats, type StyleStats } from '../engine/gestao/estilo';
import type { StyleCT, StyleT, TeamStyle } from '../engine/gestao/model';
import { ct } from '../state/career-i18n';
import type { SeriesResult, TTeam } from '../types';
import '../styles/series-result.css';

export function StyleLiveBar({ sim, userIdx, onChange }: { sim: MapSim; userIdx: 0 | 1; onChange: (s: TeamStyle) => void }) {
  const cur = sim.style?.(userIdx);
  if (!cur || !sim.setStyle) return null;
  const set = (patch: Partial<TeamStyle>) => onChange({ ...cur, ...patch });
  return (
    <div className="stance-bar style-live" role="group" aria-label={ct('Estilo de jogo')}>
      <span className="stance-label">{ct('Estilo')}</span>
      <label className="style-live__side">
        <span className="side-pill t">T</span>
        <select className="style-live__select" value={cur.t} onChange={(e) => set({ t: e.target.value as StyleT })} aria-label={ct('Estilo no ataque')}>
          {STYLES_T.map((s) => <option key={s} value={s}>{ct(STYLE_SHORT[s])}</option>)}
        </select>
      </label>
      <label className="style-live__side">
        <span className="side-pill ct">CT</span>
        <select className="style-live__select" value={cur.ct} onChange={(e) => set({ ct: e.target.value as StyleCT })} aria-label={ct('Estilo na defesa')}>
          {STYLES_CT.map((s) => <option key={s} value={s}>{ct(STYLE_SHORT[s])}</option>)}
        </select>
      </label>
      <span className="style-live__hint">{ct('vale do próximo round em diante')}</span>
    </div>
  );
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

// [resultado] comparativo lado a lado com barra: o rótulo em cima, os dois
// times embaixo, quem foi melhor em destaque (antes: tabela com um vão enorme)
export function StyleStatsPanel({ series, teams, userIdx }: { series: SeriesResult; teams: [TTeam, TTeam]; userIdx: 0 | 1 }) {
  const maps = series.maps.filter((m) => m.styleStats);
  if (!maps.length) return null;
  const opp: 0 | 1 = userIdx === 0 ? 1 : 0;
  const tot: [StyleStats, StyleStats] = [sumStyleStats(maps.map((m) => m.styleStats![0])), sumStyleStats(maps.map((m) => m.styleStats![1]))];
  const last = maps[maps.length - 1].styles;
  const styleTxt = (i: 0 | 1) => {
    const s = last?.[i];
    return s ? `T ${ct(STYLE_SHORT[s.t])} · CT ${ct(STYLE_SHORT[s.ct])}` : '—';
  };
  // [rótulo, valor, formato, escala] — escala 'pct' vai de 0 a 100%; 'rel' usa o maior dos dois
  const rows: [string, (s: StyleStats) => number | null, (v: number) => string, 'pct' | 'rel'][] = [
    [ct('Aberturas ganhas'), (s) => ratio(s.openWon, s.rounds), pctFmt, 'pct'],
    [ct('Trocas por round'), (s) => ratio(s.trades, s.rounds), (v) => v.toFixed(2), 'rel'],
    [ct('Bomba plantada (rounds de T)'), (s) => ratio(s.plants, s.tRounds), pctFmt, 'pct'],
    [ct('Pós-plant convertido'), (s) => ratio(s.postWon, s.plants), pctFmt, 'pct'],
    [ct('Retakes (bomba plantada contra)'), (s) => ratio(s.retakes, s.ctPlantsAgainst), pctFmt, 'pct'],
    [ct('Rounds de CT ganhos no tempo'), (s) => ratio(s.timeWins, s.ctRounds), pctFmt, 'pct'],
    [ct('Clutches vencidos'), (s) => s.clutchWon, (v) => String(v), 'rel'],
  ];
  const order: [0 | 1, 0 | 1] = [userIdx, opp];
  return (
    <section className="panel style-stats fade-in" aria-label={ct('Estilo em campo')}>
      <div className="panel-head">{ct('ESTILO EM CAMPO')}</div>
      <div className="panel-body">
        <div className="ss-legend">
          {order.map((i) => (
            <div key={i} className={`ss-team${i === userIdx ? ' you' : ''}`}>
              <span className="ss-team__name">{teams[i].name}</span>
              <span className="ss-team__style">{styleTxt(i)}</span>
            </div>
          ))}
        </div>
        <ul className="ss-list">
          {rows.map(([k, f, fmt, scale]) => {
            const v = order.map((i) => f(tot[i]));
            const max = scale === 'pct' ? 1 : Math.max(v[0] ?? 0, v[1] ?? 0) || 1;
            const lead = v[0] != null && v[1] != null && v[0] !== v[1] ? (v[0] > v[1] ? 0 : 1) : -1;
            return (
              <li key={k} className="ss-row">
                <span className="ss-label">{k}</span>
                {order.map((i, j) => (
                  <div key={i} className={`ss-bar${i === userIdx ? ' you' : ''}${lead === j ? ' lead' : ''}`}>
                    <span className="ds-sr-only">{teams[i].name}:</span>
                    <span className="ss-bar__track" aria-hidden><span className="ss-bar__fill" style={{ width: `${v[j] == null ? 0 : Math.round((v[j]! / max) * 100)}%` }} /></span>
                    <b className="ss-bar__val">{v[j] == null ? '—' : fmt(v[j]!)}</b>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
