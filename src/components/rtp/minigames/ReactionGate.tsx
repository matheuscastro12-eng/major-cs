import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, diffLerp, type MiniGameProps } from '../../../engine/rtp/minigames';

// Tempo de reação (físico): 5 rodadas. Espere o vermelho virar verde e clique.
// Adiantar (clicar no vermelho) zera a rodada. Score por rodada = velocidade.
// Dificuldade (tier): a régua de velocidade aperta (elite exige reflexo real).

const ROUNDS = 5;
type State = 'wait' | 'go' | 'early';

export function ReactionGate({ seed, durationMs, difficulty, onFinish }: MiniGameProps) {
  const span = diffLerp(350, 260, difficulty);   // janela do score (150ms → 150+span)
  const delays = useMemo(
    () => Array.from({ length: ROUNDS }, (_, i) => 650 + miniRng(((seed ^ ((i + 1) * 0x9e3779b1)) >>> 0))() * 1500),
    [seed],
  );
  const [round, setRound] = useState(0);
  const [state, setStateView] = useState<State>('wait');
  // [RTP-TAP] estado em ref: o closure do render ficava velho entre dois toques
  // rápidos (dois advance na mesma rodada / clique ignorado).
  const stateRef = useRef<State>('wait');
  const setState = (v: State) => { stateRef.current = v; setStateView(v); };
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
    if (finished.current || scores.current.length >= ROUNDS) return;
    stateRef.current = 'wait'; // trava novos toques até o effect da próxima rodada
    scores.current.push(sc);
    if (scores.current.length >= ROUNDS) { finish(); return; }
    setRound((r) => r + 1);
  };

  const click = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (finished.current) return;
    const state = stateRef.current;
    if (state === 'wait') {
      // adiantou: zera a rodada e segue. Guarda no timer ref pra o cleanup do
      // effect limpar se o modal fechar antes dos 420ms (sem setState pós-unmount).
      if (timer.current) clearTimeout(timer.current);
      setState('early');
      timer.current = setTimeout(() => advance(0), 420);
    } else if (state === 'go') {
      const rt = performance.now() - goAt.current;
      const sc = Math.max(0, Math.min(1, 1 - (rt - 150) / span));  // 150ms≈1.0
      advance(sc);
    }
  };

  return (
    <button
      type="button"
      className={`rtp-mini-react s-${state}`}
      style={{ width: 320, height: 320, maxWidth: '100%', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={click}
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
