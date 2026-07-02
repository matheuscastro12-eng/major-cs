import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Tempo de reação (físico): 5 rodadas. Espere o vermelho virar verde e clique.
// Adiantar (clicar no vermelho) zera a rodada. Score por rodada = velocidade.

const ROUNDS = 5;
type State = 'wait' | 'go' | 'early';

export function ReactionGate({ seed, durationMs, onFinish }: MiniGameProps) {
  const delays = useMemo(
    () => Array.from({ length: ROUNDS }, (_, i) => 650 + miniRng(((seed ^ ((i + 1) * 0x9e3779b1)) >>> 0))() * 1500),
    [seed],
  );
  const [round, setRound] = useState(0);
  const [state, setState] = useState<State>('wait');
  const scores = useRef<number[]>([]);
  const goAt = useRef(0);
  const finished = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const sum = scores.current.reduce((a, b) => a + b, 0);
    onFinish(Math.max(0, Math.min(1, sum / ROUNDS)));
  };

  // agenda o "verde" da rodada atual
  useEffect(() => {
    if (finished.current || round >= ROUNDS) return;
    setState('wait');
    timer.current = setTimeout(() => {
      setState('go');
      goAt.current = performance.now();
    }, delays[round]);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [round, delays]);

  // teto de tempo
  useEffect(() => {
    const cap = setTimeout(finish, durationMs);
    return () => clearTimeout(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = (sc: number) => {
    scores.current.push(sc);
    if (scores.current.length >= ROUNDS) { finish(); return; }
    setRound((r) => r + 1);
  };

  const click = () => {
    if (finished.current) return;
    if (state === 'wait') {
      // adiantou: zera a rodada e segue. Guarda no timer ref pra o cleanup do
      // effect limpar se o modal fechar antes dos 420ms (sem setState pós-unmount).
      if (timer.current) clearTimeout(timer.current);
      setState('early');
      timer.current = setTimeout(() => advance(0), 420);
    } else if (state === 'go') {
      const rt = performance.now() - goAt.current;
      const sc = Math.max(0, Math.min(1, 1 - (rt - 150) / 350));   // 150ms≈1.0, 500ms≈0
      advance(sc);
    }
  };

  return (
    <button
      type="button"
      className={`rtp-mini-react s-${state}`}
      style={{ width: 320, height: 320 }}
      onMouseDown={click}
    >
      <div className="rtp-mini-hud"><span>{ct('Rodada')} {Math.min(round + 1, ROUNDS)}/{ROUNDS}</span></div>
      <div className="rtp-mini-react-msg">
        {state === 'wait' && ct('Espere o verde…')}
        {state === 'go' && ct('JÁ! CLIQUE')}
        {state === 'early' && ct('Cedo demais!')}
      </div>
    </button>
  );
}
