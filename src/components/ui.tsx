import { useState } from 'react';
import { MAP_IMAGES } from '../data/media';
import { loadMapImages } from '../state/crm';
import { MAP_LABELS, type MapId, type TTeam } from '../types';

export function Flag({ cc, title }: { cc: string; title?: string }) {
  const [err, setErr] = useState(false);
  if (err || !cc) return <span className="flag-chip">{(cc || '??').toUpperCase()}</span>;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/w20/${cc.toLowerCase()}.png`}
      alt={cc}
      title={title ?? cc.toUpperCase()}
      onError={() => setErr(true)}
    />
  );
}

export function TeamBadge({
  tag,
  colors,
  size = 26,
  logoUrl,
}: {
  tag: string;
  colors: [string, string];
  size?: number;
  logoUrl?: string;
}) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      <span
        className="tbadge logo"
        style={{
          background: colors[0],
          width: size,
          height: size,
        }}
      >
        <img src={logoUrl} alt={tag} title={tag} onError={() => setErr(true)} />
      </span>
    );
  }
  return (
    <span
      className="tbadge"
      style={{
        background: colors[0],
        color: colors[1],
        width: size,
        height: size,
        fontSize: size * 0.38,
      }}
    >
      {tag.slice(0, 4)}
    </span>
  );
}

export function TeamName({ team, dim }: { team: TTeam; dim?: boolean }) {
  return (
    <span className="side">
      <TeamBadge tag={team.tag} colors={team.colors} logoUrl={team.logoUrl} />
      <Flag cc={team.country} />
      <span className={`tname${dim ? ' loser' : ''}`}>{team.name}</span>
    </span>
  );
}

export function MapThumb({ map, className = '' }: { map: MapId; className?: string }) {
  const [err, setErr] = useState(false);
  const custom = loadMapImages()[map];
  if (err && !custom) {
    return (
      <span className={`map-thumb map-fallback map-${map} ${className}`} aria-label={MAP_LABELS[map]}>
        <span>{MAP_LABELS[map]}</span>
      </span>
    );
  }
  return (
    <img
      className={`map-thumb ${className}`}
      src={custom ?? MAP_IMAGES[map]}
      alt={map}
      onError={() => setErr(true)}
    />
  );
}

export function OvrBadge({ ovr, label = 'OVR' }: { ovr: number; label?: string }) {
  const cls = ovr >= 93 ? 'elite' : ovr >= 86 ? '' : 'mid';
  return (
    <span className="ovr-badge">
      <span className={`n ${cls}`}>{ovr}</span>
      <span className="l">{label}</span>
    </span>
  );
}

export function AttrBar({ label, value }: { label: string; value: number }) {
  const cls = value >= 93 ? 'attr elite' : value >= 86 ? 'attr high' : 'attr';
  return (
    <div className={cls}>
      <span>{label}</span>
      <span className="bar">
        <i style={{ width: `${Math.max(4, ((value - 40) / 59) * 100)}%` }} />
      </span>
      <span className="val">{value}</span>
    </div>
  );
}
