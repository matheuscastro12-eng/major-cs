import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, type MiniGameProps } from '../../../engine/rtp/minigames';

// Segure o ângulo (pós-plant/estudo): 3 portas na sua mira. Inimigos peekam em
// janelas curtas — CLIQUE NA PORTA certa antes de recuarem. Mas o seu aliado
// também cruza as portas: atirar nele custa caro (trigger discipline!). Score =
// velocidade nos inimigos − fogo amigo − tiro no vazio.

const N_PEEKS = 8;
const PEEK_MS = 720;        // janela em que o peek fica visível
const ALLY_EVERY = 4;       // ~1 em cada 4 peeks é o aliado

type Peek = { at: number; door: 0 | 1 | 2; ally: boolean };
type DoorView = { kind: 'enemy' | 'ally'; peekIdx: number } | null;

function buildPeeks(seed: number): Peek[] {
  const rng = miniRng((seed ^ 0xa1d0) >>> 0);
  const peeks: Peek[] = [];
  let t = 900;
  let lastDoor = -1;
  for (let i = 0; i < N_PEEKS; i++) {
    let door = Math.floor(rng() * 3) as 0 | 1 | 2;
    if (door === lastDoor) door = ((door + 1 + Math.floor(rng() * 2)) % 3) as 0 | 1 | 2;
    lastDoor = door;
    // aliado em slots semeados (nunca o primeiro — o jogador aprende o ritmo antes)
    const ally = i > 0 && (i % ALLY_EVERY === Math.floor(rng() * ALLY_EVERY));
    peeks.push({ at: t, door, ally });
    t += 680 + rng() * 420;
  }
  return peeks;
}

export function AngleHold({ seed, durationMs, onFinish }: MiniGameProps) {
  const peeks = useMemo(() => buildPeeks(seed), [seed]);
  const [doors, setDoors] = useState<DoorView[]>([null, null, null]);
  const [hud, setHud] = useState({ hits: 0, ff: 0 });
  const scores = useRef<number[]>([]);       // score por inimigo abatido
  const penalties = useRef(0);
  const handled = useRef<Set<number>>(new Set());
  const shownAt = useRef<Record<number, number>>({});
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const enemyCount = peeks.filter((p) => !p.ally).length;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    const sum = scores.current.reduce((a, b) => a + b, 0);
    onFinish(Math.max(0, Math.min(1, sum / enemyCount - penalties.current)));
  };

  useEffect(() => {
    peeks.forEach((p, i) => {
      timers.current.push(setTimeout(() => {
        if (finished.current) return;
        shownAt.current[i] = performance.now();
        setDoors((d) => { const n = [...d]; n[p.door] = { kind: p.ally ? 'ally' : 'enemy', peekIdx: i }; return n; });
        // recua sozinho no fim da janela (inimigo não clicado = 0)
        timers.current.push(setTimeout(() => {
          if (finished.current) return;
          setDoors((d) => { const n = [...d]; if (n[p.door]?.peekIdx === i) n[p.door] = null; return n; });
          handled.current.add(i);
          if (handled.current.size >= N_PEEKS) finish();
        }, PEEK_MS));
      }, p.at));
    });
    const cap = setTimeout(finish, durationMs);
    const owned = timers.current; // mesmo array — os callbacks aninhados apensam nele
    owned.push(cap);
    return () => owned.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shootDoor = (door: 0 | 1 | 2) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (finished.current) return;
    const view = doors[door];
    if (!view) { penalties.current += 0.05; return; } // porta vazia
    const peek = peeks[view.peekIdx];
    if (handled.current.has(view.peekIdx)) return;
    handled.current.add(view.peekIdx);
    setDoors((d) => { const n = [...d]; n[door] = null; return n; });
    if (peek.ally) {
      penalties.current += 0.18;                       // FOGO AMIGO
      setHud((h) => ({ ...h, ff: h.ff + 1 }));
    } else {
      const dt = performance.now() - (shownAt.current[view.peekIdx] ?? performance.now());
      const sc = Math.max(0.35, Math.min(1, 1 - (dt - 200) / (PEEK_MS - 150)));
      scores.current.push(sc);
      setHud((h) => ({ ...h, hits: h.hits + 1 }));
    }
    if (handled.current.size >= N_PEEKS) finish();
  };

  return (
    <div
      className="rtp-mini-hold"
      style={{ width: 320, aspectRatio: '1', maxWidth: '100%', touchAction: 'none' }}
      onPointerDown={() => { if (!finished.current) penalties.current += 0.05; }}
    >
      <div className="rtp-mini-hud">
        <span>{ct('Abates')} {hud.hits}/{enemyCount}</span>
        <span className="rtp-mini-hud-miss">{hud.ff > 0 ? `${hud.ff} ${ct('fogo amigo!')}` : ''}</span>
      </div>
      <div className="rtp-hold-doors">
        {[0, 1, 2].map((d) => {
          const view = doors[d];
          return (
            <button
              key={d}
              type="button"
              className={`rtp-hold-door${view ? ` peek-${view.kind}` : ''}`}
              onPointerDown={shootDoor(d as 0 | 1 | 2)}
            >
              <span className="rtp-hold-arch" />
              {view && (
                <span className={`rtp-hold-fig f-${view.kind}`}>
                  {view.kind === 'ally' ? ct('ALIADO') : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="rtp-hold-floor" />
    </div>
  );
}
