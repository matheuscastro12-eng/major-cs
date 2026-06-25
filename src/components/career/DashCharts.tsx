import { IconTriangleDown, IconTriangleUp } from './DashIcons';
import { MAP_IMAGES } from '../../data/media';
import type { MapId } from '../../types';
import { MAP_LABELS } from '../../types';

/** Gráfico de linha simples (estilo win probability). */
export function SparkLine({ series, colors, height = 120, hideLegend = false, compact = false }: {
  series: { label: string; values: number[]; color: string }[];
  colors?: string[];
  height?: number;
  hideLegend?: boolean;
  compact?: boolean;
}) {
  const w = 280;
  const legendH = hideLegend ? 0 : compact ? 0 : 20;
  const h = height - legendH - (compact ? 4 : 8);
  const pad = 8;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const range = max - min || 1;
  const maxLen = Math.max(...series.map((s) => s.values.length), 1);

  const path = (vals: number[]) => {
    if (vals.length < 2) {
      const y = h - pad - ((vals[0] ?? 0.5) - min) / range * (h - pad * 2);
      return `M ${pad} ${y} L ${w - pad} ${y}`;
    }
    return vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  return (
    <div className={`dash-chart${compact ? ' dash-chart-compact' : ''}`} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="dash-chart-svg">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={w - pad} y1={h - pad - f * (h - pad * 2)} y2={h - pad - f * (h - pad * 2)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {series.map((s, i) => (
          <path key={s.label} d={path(s.values)} fill="none"
            stroke={colors?.[i] ?? s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {!compact && Array.from({ length: maxLen }, (_, i) => (
          <text key={i} x={pad + (i / Math.max(maxLen - 1, 1)) * (w - pad * 2)} y={h - 2}
            textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8">{i + 1}</text>
        ))}
      </svg>
      {!hideLegend && (
        <div className="dash-chart-legend">
          {series.map((s) => (
            <span key={s.label}><i style={{ background: s.color }} /> {s.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barras horizontais de comparação entre dois times. */
export function VsBars({ items, teamA, teamB }: {
  teamA: string;
  teamB: string;
  items: { label: string; a: number; b: number }[];
}) {
  return (
    <div className="dash-vs-list">
      {items.map((it) => {
        const total = it.a + it.b || 1;
        const pctA = Math.round((it.a / total) * 100);
        const pctB = 100 - pctA;
        return (
          <div key={it.label} className="dash-vs-item">
            <label>{it.label}</label>
            <div className="dash-vs-bar-wrap">
              <span className="dash-vs-bar-a" style={{ width: `${pctA}%` }}>{it.a}</span>
              <span className="dash-vs-bar-b" style={{ width: `${pctB}%` }}>{it.b}</span>
            </div>
            <div className="dash-vs-values"><span>{teamA}</span><span>{teamB}</span></div>
          </div>
        );
      })}
    </div>
  );
}

export type MapResultCard = {
  map: MapId;
  score: string;
  won: boolean;
  key: string;
};

export function MapStrip({ maps, onSelect }: { maps: MapResultCard[]; onSelect?: (key: string) => void }) {
  if (!maps.length) {
    return <p className="muted small">Sem mapas jogados ainda neste split.</p>;
  }
  return (
    <div className="dash-map-strip">
      {maps.map((m, i) => (
        <button key={m.key} type="button" className={`dash-map-card${i === 0 ? ' on' : ''}`}
          onClick={() => onSelect?.(m.key)}>
          <div className="dash-map-card-img" style={{ backgroundImage: `url(${MAP_IMAGES[m.map] ?? '/maps/mirage.jpg'})` }} />
          <div className="dash-map-card-body">
            <div className="dash-map-card-name">{MAP_LABELS[m.map]}</div>
            <div className="dash-map-card-score" style={{ color: m.won ? 'var(--dash-win)' : 'var(--dash-loss)' }}>{m.score}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function FormStrip({ wins, losses }: { wins: boolean[]; losses: boolean[] }) {
  return (
    <div className="dash-form-strip">
      <div className="dash-form-row" title="Vitórias">
        {wins.map((w, i) => (
          <span key={`w-${i}`} className={`dash-form-icon${w ? ' win' : ' pending'}`}>
            {w ? <IconTriangleUp size={8} /> : null}
          </span>
        ))}
      </div>
      <div className="dash-form-row" title="Derrotas">
        {losses.map((l, i) => (
          <span key={`l-${i}`} className={`dash-form-icon${l ? ' loss' : ' pending'}`}>
            {l ? <IconTriangleDown size={8} /> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
