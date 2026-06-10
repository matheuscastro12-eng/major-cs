import { useState } from 'react';
import { coreIdentity, REGION_LABELS, type CoreId, type RegionKey } from '../data/regions';
import type { TPlayer } from '../types';

// estrela de 5 pontas centrada em (cx,cy)
function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function RegionFlagSvg({ region }: { region: RegionKey }) {
  switch (region) {
    case 'europe':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="40" fill="#003399" />
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (Math.PI / 6) * i - Math.PI / 2;
            return <polygon key={i} points={starPoints(30 + 12 * Math.cos(ang), 20 + 12 * Math.sin(ang), 2.2)} fill="#ffcc00" />;
          })}
        </svg>
      );
    case 'cis':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="40" fill="#b01020" />
          <polygon points={starPoints(30, 20, 12)} fill="#ffd84d" />
        </svg>
      );
    case 'samerica':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="22" fill="#4aa3df" />
          <rect y="22" width="60" height="18" fill="#1f9e5a" />
          <circle cx="30" cy="20" r="7" fill="#ffd84d" />
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (Math.PI / 6) * i;
            return (
              <line
                key={i}
                x1={30 + 7 * Math.cos(ang)}
                y1={20 + 7 * Math.sin(ang)}
                x2={30 + 10 * Math.cos(ang)}
                y2={20 + 10 * Math.sin(ang)}
                stroke="#ffd84d"
                strokeWidth="1.4"
              />
            );
          })}
        </svg>
      );
    case 'namerica':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="40" fill="#16335c" />
          <rect x="30" width="30" height="40" fill="#c8102e" />
          <polygon points={starPoints(18, 20, 9)} fill="#ffffff" />
        </svg>
      );
    case 'asia':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="40" fill="#b01020" />
          <circle cx="30" cy="20" r="9" fill="#ffd84d" />
          {Array.from({ length: 16 }).map((_, i) => {
            const ang = (Math.PI / 8) * i;
            return (
              <line
                key={i}
                x1={30 + 9 * Math.cos(ang)}
                y1={20 + 9 * Math.sin(ang)}
                x2={30 + 16 * Math.cos(ang)}
                y2={20 + 16 * Math.sin(ang)}
                stroke="#ffd84d"
                strokeWidth="1.3"
              />
            );
          })}
        </svg>
      );
    case 'oceania':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="40" fill="#012169" />
          <polygon points={starPoints(40, 14, 4)} fill="#fff" />
          <polygon points={starPoints(46, 26, 3.4)} fill="#fff" />
          <polygon points={starPoints(36, 30, 3)} fill="#fff" />
          <polygon points={starPoints(50, 20, 2.6)} fill="#fff" />
          <polygon points={starPoints(15, 20, 6)} fill="#fff" />
        </svg>
      );
    case 'africa':
      return (
        <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" className="region-svg">
          <rect width="60" height="13.3" fill="#1f9e5a" />
          <rect y="13.3" width="60" height="13.4" fill="#ffd84d" />
          <rect y="26.7" width="60" height="13.3" fill="#c8102e" />
        </svg>
      );
  }
}

// bandeira do "core" (país via flagcdn em alta resolução, região via SVG) - usada como fundo
export function CoreFlag({ players, className = '' }: { players: { country: string }[]; className?: string }) {
  const core = coreIdentity(players.map((p) => p.country));
  if (core.kind === 'country') {
    return (
      <img
        className={`region-svg ${className}`}
        src={`https://flagcdn.com/w640/${core.cc}.png`}
        srcSet={`https://flagcdn.com/w640/${core.cc}.png 640w, https://flagcdn.com/w1280/${core.cc}.png 1280w`}
        sizes="640px"
        alt={core.cc}
        loading="lazy"
      />
    );
  }
  if (core.kind === 'region') {
    return (
      <span className={className} style={{ display: 'block', width: '100%', height: '100%' }}>
        <RegionFlagSvg region={core.region} />
      </span>
    );
  }
  return null;
}

export function coreLabel(players: { country: string }[]): string {
  const core = coreIdentity(players.map((p) => p.country));
  if (core.kind === 'country') return core.cc.toUpperCase();
  if (core.kind === 'region') return REGION_LABELS[core.region];
  return 'Internacional';
}

export type { CoreId };

// banner de confronto estilo HLTV: bandeira do core atrás de cada lado
export function MatchBanner({
  teamA,
  teamB,
  center,
  sub,
  event,
  scoreA,
  scoreB,
  winner,
}: {
  teamA: { name: string; tag: string; colors: [string, string]; logoUrl?: string; players: TPlayer[] };
  teamB: { name: string; tag: string; colors: [string, string]; logoUrl?: string; players: TPlayer[] };
  center?: string;
  sub?: string;
  event?: string;
  scoreA?: number;
  scoreB?: number;
  winner?: 0 | 1;
}) {
  const showScore = scoreA !== undefined && scoreB !== undefined;
  return (
    <div className="match-banner">
      <div className="mb-side left">
        <div className="mb-flag">
          <CoreFlag players={teamA.players} />
        </div>
        <div className="mb-content">
          <LogoChip tag={teamA.tag} colors={teamA.colors} logoUrl={teamA.logoUrl} />
          <span className={`mb-name${winner === 1 ? ' dim' : ''}`}>{teamA.name}</span>
        </div>
      </div>

      <div className="mb-center">
        {showScore ? (
          <div className="mb-score">
            <span className={winner === 0 ? 'w' : ''}>{scoreA}</span>
            <span className="sep">:</span>
            <span className={winner === 1 ? 'w' : ''}>{scoreB}</span>
          </div>
        ) : (
          <div className="mb-vs">{center ?? 'VS'}</div>
        )}
        {event && <div className="mb-event">{event}</div>}
        {sub && <div className="mb-sub">{sub}</div>}
      </div>

      <div className="mb-side right">
        <div className="mb-flag">
          <CoreFlag players={teamB.players} />
        </div>
        <div className="mb-content">
          <span className={`mb-name${winner === 0 ? ' dim' : ''}`}>{teamB.name}</span>
          <LogoChip tag={teamB.tag} colors={teamB.colors} logoUrl={teamB.logoUrl} />
        </div>
      </div>
    </div>
  );
}

function LogoChip({ tag, colors, logoUrl }: { tag: string; colors: [string, string]; logoUrl?: string }) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      <span className="mb-logo">
        <img src={logoUrl} alt={tag} onError={() => setErr(true)} />
      </span>
    );
  }
  return (
    <span className="mb-logo text" style={{ background: colors[0], color: colors[1] }}>
      {tag.slice(0, 4)}
    </span>
  );
}
