import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Utilitária perfeita (retake/estudo): estilingue de granada. Segure perto do
// lançador, arraste pra trás pra mirar (a linha mostra o começo do arco) e
// solte — a granada voa com gravidade. 3 arremessos, alvos semeados. Score por
// arremesso = proximidade do pouso ao centro do alvo.

const SIZE = 320;
const THROWS = 3;
const START = { x: 46, y: 268 };   // posição do lançador (canto inferior esq.)
const G = 640;                     // gravidade (px/s²)
const POWER = 3.4;                 // multiplicador do vetor de arrasto
const R_IN = 17;                   // acerto cheio
const R_MID = 38;                  // acerto parcial

function buildTargets(seed: number): { x: number; y: number }[] {
  const rng = miniRng((seed ^ 0xade5) >>> 0);
  return Array.from({ length: THROWS }, () => ({
    x: 170 + rng() * 116,
    y: 64 + rng() * 130,
  }));
}

type Flight = { x: number; y: number; done: boolean; land?: { x: number; y: number; score: number } };

export function NadeArc({ seed, durationMs, onFinish }: MiniGameProps) {
  const targets = useMemo(() => buildTargets(seed), [seed]);
  const [throwIdx, setThrowIdx] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [hudPct, setHudPct] = useState<number | null>(null);
  const scores = useRef<number[]>([]);
  const finished = useRef(false);
  const flying = useRef(false);
  const raf = useRef(0);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    cancelAnimationFrame(raf.current);
    const sum = scores.current.reduce((a, b) => a + b, 0);
    onFinish(Math.max(0, Math.min(1, sum / THROWS)));
  };

  useEffect(() => {
    const cap = setTimeout(finish, durationMs);
    return () => { clearTimeout(cap); cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const norm = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = r.width ? SIZE / r.width : 1;
    const sy = r.height ? SIZE / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const release = () => {
    if (!drag || flying.current || finished.current) return;
    const target = targets[throwIdx];
    // estilingue: vetor = lançador − ponto de arrasto (puxa pra trás → voa pra frente)
    const vx = (START.x - drag.x) * POWER;
    let vy = (START.y - drag.y) * POWER;
    setDrag(null);
    if (Math.hypot(vx, vy) < 40) return; // arrasto mínimo — evita toque acidental
    flying.current = true;
    let px = START.x; let py = START.y;
    let minD = Math.hypot(px - target.x, py - target.y);
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      vy += G * dt;
      px += vx * dt;
      py += vy * dt;
      const d = Math.hypot(px - target.x, py - target.y);
      if (d < minD) minD = d;
      const out = px < -20 || px > SIZE + 20 || py > SIZE + 20;
      const landed = vy > 0 && py >= START.y; // voltou à altura do chão descendo
      if (out || landed) {
        const score = minD <= R_IN ? 1 : minD <= R_MID ? Math.max(0.35, 1 - (minD - R_IN) / (R_MID - R_IN) * 0.65) : minD <= 70 ? 0.2 : 0;
        scores.current.push(score);
        setHudPct(Math.round((scores.current.reduce((a, b) => a + b, 0) / scores.current.length) * 100));
        setFlight({ x: px, y: Math.min(py, SIZE - 8), done: true, land: { x: px, y: Math.min(py, SIZE - 8), score } });
        flying.current = false;
        // próxima granada (ou fim) depois do "puff" de pouso
        setTimeout(() => {
          if (finished.current) return;
          if (scores.current.length >= THROWS) { finish(); return; }
          setFlight(null);
          setThrowIdx((v) => v + 1);
        }, 620);
        return;
      }
      setFlight({ x: px, y: py, done: false });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  const target = targets[throwIdx];
  // preview do começo do arco enquanto arrasta (só os 3 primeiros décimos de segundo)
  const preview = drag
    ? Array.from({ length: 5 }, (_, i) => {
        const t = (i + 1) * 0.07;
        return {
          x: START.x + (START.x - drag.x) * POWER * t,
          y: START.y + (START.y - drag.y) * POWER * t + 0.5 * G * t * t,
        };
      })
    : [];

  return (
    <div
      className="rtp-mini-nade"
      style={{ width: SIZE, aspectRatio: '1', maxWidth: '100%', touchAction: 'none' }}
      onPointerDown={(e) => { if (!flying.current) setDrag(norm(e)); }}
      onPointerMove={(e) => { if (drag) setDrag(norm(e)); }}
      onPointerUp={release}
      onPointerLeave={() => { if (drag) release(); }}
    >
      <div className="rtp-mini-hud">
        <span>{ct('Granada')} {Math.min(throwIdx + 1, THROWS)}/{THROWS}</span>
        <span>{hudPct != null ? `${hudPct}%` : ''}</span>
      </div>
      {/* alvo */}
      <div className="rtp-nade-target" style={{ left: `${((target.x - R_MID) / SIZE) * 100}%`, top: `${((target.y - R_MID) / SIZE) * 100}%`, width: `${(R_MID * 2 / SIZE) * 100}%` }}>
        <span />
      </div>
      {/* lançador */}
      <div className="rtp-nade-origin" style={{ left: `${((START.x - 14) / SIZE) * 100}%`, top: `${((START.y - 14) / SIZE) * 100}%` }} />
      {/* preview do arco */}
      {preview.map((p, i) => (
        <div key={i} className="rtp-nade-dot" style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%`, opacity: 0.65 - i * 0.1 }} />
      ))}
      {/* elástico do arrasto */}
      {drag && (
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rtp-nade-svg">
          <line x1={START.x} y1={START.y} x2={drag.x} y2={drag.y} className="rtp-nade-band" />
        </svg>
      )}
      {/* granada em voo / pouso */}
      {flight && (
        <div
          className={`rtp-nade-ball${flight.done ? (flight.land && flight.land.score >= 0.35 ? ' land-good' : ' land-bad') : ''}`}
          style={{ left: `${(flight.x / SIZE) * 100}%`, top: `${(flight.y / SIZE) * 100}%` }}
        />
      )}
      {flight?.done && flight.land && (
        <div className="rtp-nade-callout" style={{ left: `${(flight.land.x / SIZE) * 100}%`, top: `${((flight.land.y - 26) / SIZE) * 100}%` }}>
          {flight.land.score >= 1 ? ct('NA CABEÇA!') : flight.land.score >= 0.35 ? ct('Boa!') : ct('Longe…')}
        </div>
      )}
    </div>
  );
}
