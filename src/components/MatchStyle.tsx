// [estilo de jogo] Partida: troca de estilo ao vivo (vale a partir do próximo
// round; a % mostrada já o vê) e o pós-jogo com a estatística do estilo.
// Só aparece no motor v2 com tática (Carreira); fora disso não renderiza.
import type { MapSim } from '../engine/match';
import { STYLES_CT, STYLES_T, STYLE_SHORT, sumStyleStats, type StyleStats } from '../engine/gestao/estilo';
import type { StyleCT, StyleT, TeamStyle } from '../engine/gestao/model';
import { ct } from '../state/career-i18n';
import type { SeriesResult, TTeam } from '../types';

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

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

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
  const rows: [string, (s: StyleStats) => string][] = [
    [ct('Aberturas ganhas'), (s) => pct(s.openWon, s.rounds)],
    [ct('Trocas por round'), (s) => (s.rounds ? (s.trades / s.rounds).toFixed(2) : '—')],
    [ct('Bomba plantada (rounds de T)'), (s) => pct(s.plants, s.tRounds)],
    [ct('Pós-plant convertido'), (s) => pct(s.postWon, s.plants)],
    [ct('Retakes (bomba plantada contra)'), (s) => pct(s.retakes, s.ctPlantsAgainst)],
    [ct('Rounds de CT ganhos no tempo'), (s) => pct(s.timeWins, s.ctRounds)],
    [ct('Clutches vencidos'), (s) => String(s.clutchWon)],
  ];
  const name = (i: 0 | 1) => teams[i].tag || teams[i].name;
  return (
    <div className="panel style-stats fade-in">
      <div className="panel-head">{ct('ESTILO EM CAMPO')}</div>
      <div className="panel-body">
        <table className="style-stats__table">
          <thead>
            <tr><th scope="col" /><th scope="col" className="you">{name(userIdx)}</th><th scope="col">{name(opp)}</th></tr>
          </thead>
          <tbody>
            <tr className="style-stats__style"><th scope="row">{ct('Estilo')}</th><td className="you">{styleTxt(userIdx)}</td><td>{styleTxt(opp)}</td></tr>
            {rows.map(([k, f]) => (
              <tr key={k}><th scope="row">{k}</th><td className="you">{f(tot[userIdx])}</td><td>{f(tot[opp])}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
