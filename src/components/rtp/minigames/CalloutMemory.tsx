import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Memória de calls (demos): uma sequência pisca numa grade 3×3; repita clicando.
// Score = passos corretos / total. Erro encerra a entrada na hora.

const CELLS = 9;

function buildSeq(seed: number): number[] {
  const rng = miniRng((seed ^ 0xca11) >>> 0);
  const len = 4 + Math.floor(rng() * 3);    // 4..6
  return Array.from({ length: len }, () => Math.floor(rng() * CELLS));
}

type Phase = 'show' | 'input' | 'over';

export function CalloutMemory({ seed, durationMs, onFinish }: MiniGameProps) {
  const seq = useMemo(() => buildSeq(seed), [seed]);
  const [phase, setPhase] = useState<Phase>('show');
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);          // posição atual na entrada
  const correct = useRef(0);
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = (corr: number) => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    onFinish(Math.max(0, Math.min(1, corr / seq.length)));
  };

  // reproduz a sequência, depois libera a entrada
  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    let t = 350;
    seq.forEach((cell) => {
      ts.push(setTimeout(() => setLit(cell), t));
      ts.push(setTimeout(() => setLit(null), t + 420));
      t += 620;
    });
    ts.push(setTimeout(() => setPhase('input'), t + 150));
    ts.push(setTimeout(() => finish(correct.current), durationMs));
    timers.current = ts;
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = (cell: number) => {
    if (phase !== 'input' || finished.current) return;
    if (cell === seq[step]) {
      correct.current += 1;
      setLit(cell);
      timers.current.push(setTimeout(() => setLit(null), 160));   // rastreado p/ cleanup no unmount
      const next = step + 1;
      if (next >= seq.length) { setPhase('over'); finish(correct.current); return; }
      setStep(next);
    } else {
      // errou: encerra a entrada com o que acertou até aqui
      setPhase('over');
      finish(correct.current);
    }
  };

  return (
    <div className="rtp-mini-memory" style={{ width: 320 }}>
      <div className="rtp-mini-hud">
        <span>{phase === 'show' ? ct('Memorize…') : `${ct('Repita')} ${step}/${seq.length}`}</span>
      </div>
      <div className="rtp-mini-grid">
        {Array.from({ length: CELLS }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`rtp-mini-cell${lit === i ? ' lit' : ''}`}
            disabled={phase !== 'input'}
            onMouseDown={() => tap(i)}
          />
        ))}
      </div>
    </div>
  );
}
