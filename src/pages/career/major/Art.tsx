// [Major espetáculo] Arte própria em SVG/CSS: troféu, arena da LAN e confete.
// Sem imagens de terceiros; cores só por tokens (var(--c-*)).
import { useMemo } from 'react';

/** troféu do Major (desenho próprio): taça com alças, estrela e base em degraus */
export function Trophy({ size = 160, tone = 'gold', className = '' }: { size?: number; tone?: 'gold' | 'silver'; className?: string }) {
  const id = `mj-tro-${tone}`;
  return (
    <svg className={`mj-trophy ${tone} ${className}`} width={size} height={size * 1.2} viewBox="0 0 100 120" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" className="mj-tro-hi" />
          <stop offset="0.55" className="mj-tro-mid" />
          <stop offset="1" className="mj-tro-lo" />
        </linearGradient>
      </defs>
      <path d="M22 14 C 8 14 6 38 26 44" fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M78 14 C 92 14 94 38 74 44" fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M20 8 H80 V22 C80 48 66 62 50 64 C34 62 20 48 20 22 Z" fill={`url(#${id})`} />
      <path d="M28 12 V24 C28 40 36 52 46 56" fill="none" className="mj-tro-shine" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 22 l4.1 8.3 9.2 1.3 -6.6 6.5 1.6 9.1 -8.3 -4.4 -8.3 4.4 1.6 -9.1 -6.6 -6.5 9.2 -1.3 Z" className="mj-tro-star" />
      <rect x="44" y="63" width="12" height="16" fill={`url(#${id})`} />
      <path d="M36 79 H64 L68 88 H32 Z" fill={`url(#${id})`} />
      <rect x="26" y="88" width="48" height="10" rx="2" className="mj-tro-base" />
      <rect x="20" y="98" width="60" height="12" rx="2" className="mj-tro-base dark" />
      <rect x="34" y="101" width="32" height="6" rx="1" className="mj-tro-plate" />
    </svg>
  );
}

/** arena estilizada: telão, palco com as duas cabines, holofotes e a torcida (pontos) */
export function Arena({ live = true, className = '' }: { live?: boolean; className?: string }) {
  const crowd = useMemo(() => {
    const dots: { x: number; y: number; r: number; d: number }[] = [];
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let row = 0; row < 5; row++) {
      const y = 92 + row * 7;
      for (let x = 4 + (row % 2) * 4; x < 396; x += 8) dots.push({ x: x + rnd() * 3, y: y + rnd() * 2, r: 1.6 + row * 0.25, d: rnd() });
    }
    return dots;
  }, []);
  return (
    <svg className={`mj-arena ${live ? 'live' : ''} ${className}`} viewBox="0 0 400 130" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <polygon points="40,0 80,0 150,88 120,88" className="mj-beam b1" />
      <polygon points="320,0 360,0 280,88 250,88" className="mj-beam b2" />
      <polygon points="185,0 215,0 230,88 170,88" className="mj-beam b3" />
      <rect x="140" y="10" width="120" height="44" rx="3" className="mj-screen" />
      <rect x="146" y="16" width="108" height="32" rx="2" className="mj-screen-in" />
      <polygon points="200.0,22.0 202.5,28.6 209.5,28.9 204.0,33.3 205.9,40.1 200.0,36.2 194.1,40.1 196.0,33.3 190.5,28.9 197.5,28.6" className="mj-screen-star" />
      <rect x="60" y="58" width="78" height="22" rx="2" className="mj-booth ct" />
      <rect x="262" y="58" width="78" height="22" rx="2" className="mj-booth t" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={`a${i}`} x={66 + i * 14} y={64} width={9} height={10} rx={1} className="mj-pc" />)}
      {[0, 1, 2, 3, 4].map((i) => <rect key={`b${i}`} x={268 + i * 14} y={64} width={9} height={10} rx={1} className="mj-pc" />)}
      <rect x="0" y="80" width="400" height="6" className="mj-stage-edge" />
      {crowd.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={c.r} className="mj-fan" style={{ animationDelay: `${(c.d * 1.6).toFixed(2)}s` }} />)}
    </svg>
  );
}

/** confete em CSS puro (desligado com prefers-reduced-motion pelo CSS e pelo `off`) */
export function Confetti({ count = 48, off = false }: { count?: number; off?: boolean }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    return { left: r(1) * 100, delay: r(2) * 1.8, dur: 2.6 + r(3) * 2.2, rot: r(4) * 360, kind: i % 4, drift: (r(5) - 0.5) * 80 };
  }), [count]);
  if (off) return null;
  return (
    <div className="mj-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} className={`k${b.kind}`} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, ['--rot' as string]: `${b.rot}deg`, ['--drift' as string]: `${b.drift}px` }} />
      ))}
    </div>
  );
}
