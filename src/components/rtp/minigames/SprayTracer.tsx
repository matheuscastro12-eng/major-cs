import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Controle de spray (gym): um ponto desce seguindo uma curva de recuo semeada.
// Mantenha o cursor colado nele. Score = fração do tempo dentro da tolerância.

const SIZE = 320;
const DUR = 4200;
const TOL = 34;

function buildPath(seed: number): { x: number; y: number }[] {
  const rng = miniRng((seed ^ 0x59a7) >>> 0);
  const pts: { x: number; y: number }[] = [];
  let x = SIZE / 2;
  let y = 40;
  for (let i = 0; i <= 60; i++) {
    pts.push({ x, y });
    x = Math.max(30, Math.min(SIZE - 30, x + (rng() - 0.5) * 26));
    y += 3.6;
  }
  return pts;
}

export function SprayTracer({ seed, durationMs, onFinish }: MiniGameProps) {
  const path = useMemo(() => buildPath(seed), [seed]);
  const [frame, setFrame] = useState({ dx: SIZE / 2, dy: 40, pct: 0, near: false });
  const [cur, setCur] = useState({ x: SIZE / 2, y: SIZE / 2 });
  const cursorRef = useRef({ x: SIZE / 2, y: SIZE / 2 });
  const onTarget = useRef(0);
  const total = useRef(0);
  const finished = useRef(false);
  const raf = useRef(0);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    cancelAnimationFrame(raf.current);
    onFinish(total.current > 0 ? Math.max(0, Math.min(1, onTarget.current / total.current)) : 0);
  };

  useEffect(() => {
    const start = performance.now();
    let last = start;
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const d = path[Math.min(path.length - 1, Math.floor(t * (path.length - 1)))];
      const near = Math.hypot(cursorRef.current.x - d.x, cursorRef.current.y - d.y) <= TOL;
      const dt = now - last;
      last = now;
      total.current += dt;
      if (near) onTarget.current += dt;
      setFrame({ dx: d.x, dy: d.y, pct: total.current > 0 ? Math.round((onTarget.current / total.current) * 100) : 0, near });
      if (t >= 1) { finish(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    const cap = setTimeout(finish, durationMs);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(cap); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    cursorRef.current = p;
    setCur(p);
  };

  return (
    <div className="rtp-mini-spray" style={{ width: SIZE, height: SIZE }} onMouseMove={move}>
      <div className="rtp-mini-hud"><span>{ct('No alvo')} {frame.pct}%</span></div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rtp-mini-spray-svg">
        <polyline points={path.map((p) => `${p.x},${p.y}`).join(' ')} className="rtp-mini-spray-path" />
      </svg>
      <div className={`rtp-mini-spray-dot${frame.near ? ' on' : ''}`} style={{ left: frame.dx - 16, top: frame.dy - 16 }} />
      <div className="rtp-mini-spray-cursor" style={{ left: cur.x - 4, top: cur.y - 4 }} />
    </div>
  );
}
