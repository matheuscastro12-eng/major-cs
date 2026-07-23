import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Prefire nos ângulos (mecânica/entry): a mira varre o corredor sozinha (ida e
// volta). 5 cabeças aparecem em ângulos semeados — DISPARE (clique/toque em
// qualquer lugar) no instante em que a linha cruza cada cabeça. Score por
// cabeça = proximidade do centro; disparar no vazio penaliza. Auto-resolve
// quando as passadas acabam (cabeças não prefiradas contam 0).

const SIZE = 320;
const N = 5;
const GATE_W = 30;        // meia-janela de acerto (px) ao redor da cabeça
const PASS_MS = 2700;     // duração de UMA passada (L→R ou R→L)
const PASSES = 3;

function buildGates(seed: number): { x: number; y: number }[] {
  const rng = miniRng((seed ^ 0x9ef1) >>> 0);
  // espaça as cabeças em faixas pra nunca nascerem coladas (janela sem overlap)
  const lane = (SIZE - 70) / N;
  return Array.from({ length: N }, (_, i) => ({
    x: 35 + lane * i + rng() * (lane - GATE_W),
    y: 96 + rng() * 140,
  }));
}

export function PrefireRun({ seed, durationMs, onFinish }: MiniGameProps) {
  const gates = useMemo(() => buildGates(seed), [seed]);
  const [lineX, setLineX] = useState(0);
  const [hits, setHits] = useState<number[]>(Array(N).fill(-1)); // -1 = viva
  const [missView, setMissView] = useState(0);
  const hitsRef = useRef(hits);
  const misses = useRef(0);
  const lineRef = useRef(0);
  const finished = useRef(false);
  const raf = useRef(0);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    cancelAnimationFrame(raf.current);
    const sum = hitsRef.current.reduce((a, b) => a + Math.max(0, b), 0);
    onFinish(Math.max(0, Math.min(1, sum / N - 0.06 * misses.current)));
  };

  useEffect(() => {
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / PASS_MS;
      if (t >= PASSES) { finish(); return; }
      // ida e volta: passada par vai L→R, ímpar volta R→L
      const p = t % 1;
      const x = Math.floor(t) % 2 === 0 ? p * SIZE : (1 - p) * SIZE;
      lineRef.current = x;
      setLineX(x);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    const cap = setTimeout(finish, durationMs);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(cap); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shoot = () => {
    if (finished.current) return;
    const x = lineRef.current;
    // cabeça viva mais próxima dentro da janela
    let best = -1; let bestD = GATE_W + 1;
    hitsRef.current.forEach((h, i) => {
      if (h >= 0) return;
      const d = Math.abs(gates[i].x - x);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) {
      misses.current += 1;
      setMissView(misses.current);
      return;
    }
    const sc = Math.max(0.3, 1 - (bestD / GATE_W) * 0.7); // centro=1.0, borda=0.3
    const next = [...hitsRef.current];
    next[best] = sc;
    hitsRef.current = next;
    setHits(next);
    if (next.every((h) => h >= 0)) finish();
  };

  const done = hits.filter((h) => h >= 0).length;
  return (
    <div
      className="rtp-mini-prefire"
      style={{ width: SIZE, aspectRatio: '1', maxWidth: '100%', touchAction: 'none' }}
      onPointerDown={shoot}
    >
      <div className="rtp-mini-hud">
        <span>{ct('Prefire')} {done}/{N}</span>
        <span className="rtp-mini-hud-miss">{missView > 0 ? `${missView} ${ct('no vazio')}` : ''}</span>
      </div>
      {gates.map((g, i) => (
        <div
          key={i}
          className={`rtp-prefire-head${hits[i] >= 0 ? ' hit' : ''}`}
          style={{ left: `${((g.x - 13) / SIZE) * 100}%`, top: `${((g.y - 13) / SIZE) * 100}%` }}
        >
          <span />
        </div>
      ))}
      <div className="rtp-prefire-line" style={{ left: `${(lineX / SIZE) * 100}%` }} />
    </div>
  );
}
