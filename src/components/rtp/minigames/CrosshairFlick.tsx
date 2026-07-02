import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Treino de mira (mecânica): 8 alvos aparecem um a um em posições semeadas.
// Clique rápido e preciso. Score por alvo = velocidade; clicar no vazio penaliza.
// Auto-resolve no teto de tempo (alvos não alcançados contam 0).

const N = 8;
const SIZE = 320;
const R = 24;

function buildTargets(seed: number): { x: number; y: number }[] {
  const rng = miniRng((seed ^ 0xf11c) >>> 0);
  return Array.from({ length: N }, () => ({
    x: R + rng() * (SIZE - 2 * R),
    y: R + rng() * (SIZE - 2 * R),
  }));
}

export function CrosshairFlick({ seed, durationMs, onFinish }: MiniGameProps) {
  const targets = useMemo(() => buildTargets(seed), [seed]);
  const [idx, setIdx] = useState(0);
  const [missView, setMissView] = useState(0);
  const scores = useRef<number[]>([]);
  const misses = useRef(0);
  const shownAt = useRef(0);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const sum = scores.current.reduce((a, b) => a + b, 0);
    onFinish(Math.max(0, Math.min(1, sum / N - 0.05 * misses.current)));
  };

  useEffect(() => { shownAt.current = performance.now(); }, [idx]);

  useEffect(() => {
    const cap = setTimeout(finish, durationMs);
    return () => clearTimeout(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (finished.current) return;
    const dt = performance.now() - shownAt.current;
    const sc = Math.max(0, Math.min(1, 1 - (dt - 280) / 1100));   // <280ms≈1.0, >1380ms≈0
    scores.current.push(sc);
    if (scores.current.length >= N) { finish(); return; }
    setIdx((v) => v + 1);
  };

  const miss = () => {
    if (finished.current) return;
    misses.current += 1;
    setMissView(misses.current);
  };

  const t = targets[idx];
  return (
    <div className="rtp-mini-flick" style={{ width: SIZE, height: SIZE }} onMouseDown={miss}>
      <div className="rtp-mini-hud">
        <span>{ct('Alvo')} {Math.min(idx + 1, N)}/{N}</span>
        <span className="rtp-mini-hud-miss">{missView > 0 ? `${missView} ${ct('erro(s)')}` : ''}</span>
      </div>
      {t && (
        <button
          type="button"
          className="rtp-mini-target"
          style={{ left: t.x - R, top: t.y - R, width: R * 2, height: R * 2 }}
          onMouseDown={hit}
        >
          <span />
        </button>
      )}
    </div>
  );
}
