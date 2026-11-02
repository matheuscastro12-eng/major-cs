import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, diffLerp, type MiniGameProps } from '../../../engine/rtp/minigames';

// Timing (mental): uma barra varre a faixa; pare na zona-alvo. 4 rodadas, a zona
// encolhe a cada rodada. Score por rodada = proximidade do centro da zona.
// Dificuldade (tier): agulha mais rápida + zona menor desde a largada.

const ROUNDS = 4;
const W = 320;

export function TempoLock({ seed, durationMs, difficulty, onFinish }: MiniGameProps) {
  const zones = useMemo(() => {
    const rng = miniRng((seed ^ 0x7e3) >>> 0);
    const baseHalf = diffLerp(0.13, 0.105, difficulty);
    return Array.from({ length: ROUNDS }, (_, i) => ({
      center: 0.2 + rng() * 0.6,
      half: baseHalf - i * 0.022,
    }));
  }, [seed, difficulty]);
  const speed = diffLerp(1.05, 1.35, difficulty);
  const [round, setRound] = useState(0);
  const roundRef = useRef(0); // [RTP-TAP] closure do render ficava velho entre toques rápidos
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
    const loop = (now: number) => {
      // [RTP-RAF] rAF pode vir com timestamp < last (1º frame) e, após aba em
      // 2º plano, com um salto enorme: clamp evita agulha presa/teleportando.
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
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

  const lock = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (finished.current || roundRef.current >= ROUNDS) return;
    const z = zones[roundRef.current];
    const sc = Math.max(0, 1 - Math.abs(posRef.current - z.center) / z.half);
    scores.current.push(sc);
    roundRef.current += 1;
    if (scores.current.length >= ROUNDS) { finish(); return; }
    setRound(roundRef.current);
  };

  const z = zones[Math.min(round, ROUNDS - 1)];
  return (
    <button type="button" className="rtp-mini-tempo" style={{ width: W, maxWidth: '100%', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} onPointerDown={lock}>
      <div className="rtp-mini-hud"><span>{ct('Rodada')} {Math.min(round + 1, ROUNDS)}/{ROUNDS}</span><span>{ct('clique na zona')}</span></div>
      <div className="rtp-mini-tempo-track">
        <div className="rtp-mini-tempo-zone" style={{ left: `${(z.center - z.half) * 100}%`, width: `${z.half * 2 * 100}%` }} />
        <div className="rtp-mini-tempo-needle" style={{ left: `${pos * 100}%` }} />
      </div>
    </button>
  );
}
