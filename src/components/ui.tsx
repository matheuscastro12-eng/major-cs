import { useState } from 'react';
import { MAP_IMAGES, photoForNick } from '../data/media';
import { loadMapImages } from '../state/crm';
import { hashStr } from '../state/hash';
import { MAP_LABELS, type MapId, type TTeam } from '../types';

// ─── T7.1: paleta procedural pro fallback de avatar ────────────────────────
// Players têm 8 paletas dark/saturated rotacionadas por hash(nick); coaches
// ficam num grupo roxo distinto pra serem reconhecíveis num glance. Mesmo
// nick → mesmo avatar sempre (determinístico).
const PLAYER_PALETTES: { from: string; to: string; fg: string; accent: string }[] = [
  { from: '#1e3a5f', to: '#0d1b2e', fg: '#7cb3e8', accent: '#5fa4e8' }, // azul
  { from: '#3d1e5f', to: '#1d0d2e', fg: '#b389e8', accent: '#9b6fe8' }, // roxo claro
  { from: '#5f1e3a', to: '#2e0d1b', fg: '#e89bc7', accent: '#e8709f' }, // rosa profundo
  { from: '#5f3a1e', to: '#2e1b0d', fg: '#e8c170', accent: '#d8a93b' }, // âmbar
  { from: '#1e5f3a', to: '#0d2e1b', fg: '#7ce8a3', accent: '#5ed88a' }, // verde
  { from: '#3a5f1e', to: '#1b2e0d', fg: '#bce870', accent: '#a3d83b' }, // verde-amarelado
  { from: '#5f1e1e', to: '#2e0d0d', fg: '#e89b9b', accent: '#e87070' }, // vermelho
  { from: '#1e5f5f', to: '#0d2e2e', fg: '#7ce8e8', accent: '#5ed8d8' }, // teal
];
const COACH_PALETTES: { from: string; to: string; fg: string; accent: string }[] = [
  { from: '#4a2c7a', to: '#2a1745', fg: '#c8a4ff', accent: '#9b6fe8' },
  { from: '#5a3a8a', to: '#2c1d4a', fg: '#d4b8ff', accent: '#a87fff' },
  { from: '#3d2a6a', to: '#211538', fg: '#b894ee', accent: '#8a6fd8' },
];

function paletteFromNick(nick: string, coach: boolean): { from: string; to: string; fg: string; accent: string } {
  const h = hashStr(nick.toLowerCase());
  const pool = coach ? COACH_PALETTES : PLAYER_PALETTES;
  return pool[h % pool.length];
}

// Iniciais: 2 letras pra nicks normais, 3 pra nicks 1-2 char pra ter mais
// densidade visual (e separar "K" do "KZ" do "KZY" no glance).
function initialsFromNick(nick: string): string {
  const clean = nick.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || nick.toUpperCase();
  return clean.slice(0, clean.length <= 2 ? 3 : 2);
}

// Avatar do jogador: foto real da Liquipedia (via proxy) com fallback procedural.
// Quando não tem foto, gera um gradient único + iniciais (mesmo seed = mesmo
// avatar sempre, então o reconhecimento visual fica estável entre re-renders).
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
  // Fallback procedural: paleta determinada por hash(nick); shape sutil de fundo
  // pra diferenciar de placeholders genéricos. Iniciais em cor de contraste alta.
  const p = paletteFromNick(safeNick, coach);
  const initials = initialsFromNick(safeNick);
  const h = hashStr(safeNick.toLowerCase());
  // 4 shapes de fundo decorativo (varia por seed): círculo, triângulo, losango, none
  const shapeIdx = h % 4;
  const decoR = size * 0.42;
  const decoCx = h % 2 === 0 ? size * 0.78 : size * 0.22;
  const decoCy = (h >> 3) % 2 === 0 ? size * 0.22 : size * 0.78;
  return (
    <span
      className="pavatar text"
      style={{
        width: size,
        height: size,
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(160deg, ${p.from} 0%, ${p.to} 100%)`,
      }}
    >
      {/* Decoração sutil: shape no canto com cor de accent translucent */}
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0, opacity: 0.18 }}
      >
        {shapeIdx === 0 && <circle cx={decoCx} cy={decoCy} r={decoR} fill={p.accent} />}
        {shapeIdx === 1 && (
          <polygon
            points={`${decoCx},${decoCy - decoR} ${decoCx + decoR},${decoCy + decoR * 0.6} ${decoCx - decoR},${decoCy + decoR * 0.6}`}
            fill={p.accent}
          />
        )}
        {shapeIdx === 2 && (
          <polygon
            points={`${decoCx},${decoCy - decoR} ${decoCx + decoR * 0.7},${decoCy} ${decoCx},${decoCy + decoR} ${decoCx - decoR * 0.7},${decoCy}`}
            fill={p.accent}
          />
        )}
        {/* shapeIdx === 3: sem decoração (só gradient) */}
      </svg>
      <span
        style={{
          position: 'relative',
          color: p.fg,
          fontSize: size * (initials.length === 3 ? 0.32 : 0.38),
          fontWeight: 800,
          letterSpacing: '0.04em',
          textShadow: '0 1px 2px rgba(0,0,0,0.35)',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {initials}
      </span>
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
