import { useState } from 'react';
import { MAP_IMAGES, photoForNick } from '../data/media';
import { loadMapImages } from '../state/crm';
import { MAP_LABELS, type MapId, type TTeam } from '../types';

// Avatar do jogador: foto real da Liquipedia (via proxy) com fallback de iniciais
export function PlayerAvatar({ nick, size = 52, coach = false }: { nick: string; size?: number; coach?: boolean }) {
  const [failedUrl, setFailedUrl] = useState('');
  const safeNick = nick || '?'; // protege contra nick indefinido (não quebra o render)
  const url = photoForNick(safeNick, Math.max(120, size * 2));
  if (url && failedUrl !== url) {
    return (
      <span className="pavatar" style={{ width: size, height: size }}>
        <img src={url} alt={nick} loading="lazy" onError={() => setFailedUrl(url)} />
      </span>
    );
  }
  return (
    <span
      className="pavatar text"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: coach
          ? 'linear-gradient(160deg, #6a4f9e 0%, #3a2c5c 100%)'
          : 'linear-gradient(160deg, var(--em-panel-2) 0%, var(--em-panel) 100%)',
      }}
    >
      {safeNick.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Flag({ cc, title }: { cc: string; title?: string }) {
  const [failedCountry, setFailedCountry] = useState('');
  if (failedCountry === cc || !cc) return <span className="flag-chip">{(cc || '??').toUpperCase()}</span>;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/w20/${cc.toLowerCase()}.png`}
      alt={cc}
      title={title ?? cc.toUpperCase()}
      onError={() => setFailedCountry(cc)}
    />
  );
}

// Detecta se a logo é escura ou clara (média de luminância dos pixels opacos)
// para escolher um fundo com contraste adequado. Cache por URL.
type LogoTone = 'dark' | 'light' | 'mid';
const toneCache = new Map<string, LogoTone>();

function detectTone(img: HTMLImageElement, url: string): LogoTone {
  const cached = toneCache.get(url);
  if (cached) return cached;
  try {
    const dim = 24;
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, dim, dim);
    const data = ctx.getImageData(0, 0, dim, dim).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 40) continue;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum;
      n++;
    }
    const avg = n > 0 ? sum / n : 128;
    const tone: LogoTone = avg < 80 ? 'dark' : avg > 175 ? 'light' : 'mid';
    toneCache.set(url, tone);
    return tone;
  } catch {
    toneCache.set(url, 'mid');
    return 'mid';
  }
}

function toneBackground(tone: LogoTone | undefined, fallback: string): string {
  if (tone === 'dark') return '#dde3ea'; // logo escura → chip claro
  if (tone === 'light') return '#1b212a'; // logo clara → chip escuro
  return fallback; // logo colorida → cor do time
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
  const [tone, setTone] = useState<LogoTone | undefined>(logoUrl ? toneCache.get(logoUrl) : undefined);
  if (logoUrl && !err) {
    return (
      <span
        className="tbadge logo"
        style={{
          background: toneBackground(tone, colors[0]),
          width: size,
          height: size,
        }}
      >
        <img
          src={logoUrl}
          alt={tag}
          title={tag}
          crossOrigin={logoUrl.startsWith('http') ? 'anonymous' : undefined}
          onLoad={(e) => setTone(detectTone(e.currentTarget, logoUrl))}
          onError={() => setErr(true)}
        />
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

// spinner de carregamento reutilizável para estados assíncronos
export function Loader({ text, gold }: { text?: string; gold?: boolean }) {
  return (
    <div className="loader fade-in">
      <div className={`spinner${gold ? ' gold' : ''}`} />
      {text && <div className="loader-text">{text}<span className="loader-dots" /></div>}
    </div>
  );
}
