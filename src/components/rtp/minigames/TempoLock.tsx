import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Timing (mental): uma barra varre a faixa; pare na zona-alvo. 4 rodadas, a zona
// encolhe a cada rodada. Score por rodada = proximidade do centro da zona.

const ROUNDS = 4;
const W = 320;

export function TempoLock({ seed, durationMs, onFinish }: MiniGameProps) {
  const zones = useMemo(() => {
    const rng = miniRng((seed ^ 0x7e3) >>> 0);
    return Array.from({ length: ROUNDS }, (_, i) => ({
      center: 0.2 + rng() * 0.6,
      half: 0.13 - i * 0.022,
    }));
  }, [seed]);
  const [round, setRound] = useState(0);
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const dir = useRef(1);
  const scores = useRef<number[]>([]);
  const finished = useRef(false);
  const raf = useRef(0);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    cancelAnimationFrame(raf.current);
    const sum = scores.current.reduce((a, b) => a + b, 0);
    onFinish(Math.max(0, Math.min(1, sum / ROUNDS)));
  };

  useEffect(() => {
    let last = performance.now();
    const speed = 1.05;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let p = posRef.current + dir.current * speed * dt;
      if (p >= 1) { p = 1; dir.current = -1; } else if (p <= 0) { p = 0; dir.current = 1; }
      posRef.current = p;
      setPos(p);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    const cap = setTimeout(finish, durationMs);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(cap); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lock = () => {
    if (finished.current) return;
    const z = zones[round];
    const sc = Math.max(0, 1 - Math.abs(posRef.current - z.center) / z.half);
    scores.current.push(sc);
    if (scores.current.length >= ROUNDS) { finish(); return; }
    setRound((r) => r + 1);
  };

  const z = zones[round];
  return (
    <button type="button" className="rtp-mini-tempo" style={{ width: W }} onMouseDown={lock}>
      <div className="rtp-mini-hud"><span>{ct('Rodada')} {round + 1}/{ROUNDS}</span><span>{ct('clique na zona')}</span></div>
      <div className="rtp-mini-tempo-track">
        <div className="rtp-mini-tempo-zone" style={{ left: `${(z.center - z.half) * 100}%`, width: `${z.half * 2 * 100}%` }} />
        <div className="rtp-mini-tempo-needle" style={{ left: `${pos * 100}%` }} />
      </div>
    </button>
  );
}
