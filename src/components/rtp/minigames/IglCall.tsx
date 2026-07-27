import { useState, useEffect, useRef, useMemo } from 'react';
import { ct } from '../../../state/career-i18n';
import { miniRng, diffLerp, type MiniGameProps } from '../../../engine/rtp/minigames';

// Call do IGL (mental/IGL): o radar mostra 5 pontos inimigos rotacionando por
// alguns instantes — aí o smoke fecha a visão e você tem que CANTAR o site (A/B)
// pra onde a maioria foi. 4 waves; score por wave = acertou × velocidade da call.
// Dificuldade (tier): menos tempo de leitura, split mais fechado (4v1 → 3v2) e
// na elite um dos pontos FINTA (começa indo pro site errado e corta no meio).

const SIZE = 320;
const WAVES = 4;
const DOTS = 5;
const SITE_A = { x: 74, y: 62 };
const SITE_B = { x: 246, y: 62 };

interface WaveDot { sx: number; sy: number; tx: number; ty: number; fake: boolean }
interface Wave { site: 'A' | 'B'; dots: WaveDot[] }

function buildWaves(seed: number, difficulty: number): Wave[] {
  const rng = miniRng((seed ^ 0x161c) >>> 0);
  const decoys = difficulty >= 0.5 ? 2 : 1;          // split 3v2 nos tiers altos
  const withFake = difficulty >= 0.66;               // elite/challenger alto: um ponto finta
  return Array.from({ length: WAVES }, () => {
    const site: 'A' | 'B' = rng() < 0.5 ? 'A' : 'B';
    const to = site === 'A' ? SITE_A : SITE_B;
    const other = site === 'A' ? SITE_B : SITE_A;
    const fakeIdx = withFake ? Math.floor(rng() * (DOTS - decoys)) : -1;
    const dots: WaveDot[] = Array.from({ length: DOTS }, (_, i) => {
      const decoy = i >= DOTS - decoys;
      const dest = decoy ? other : to;
      return {
        sx: 34 + rng() * (SIZE - 68),
        sy: 196 + rng() * 92,
        tx: dest.x - 24 + rng() * 48,
        ty: dest.y - 18 + rng() * 36,
        fake: i === fakeIdx,
      };
    });
    return { site, dots };
  });
}

// posição do ponto em t 0..1 (ease-in-out); a finta passa pelo site ERRADO no meio
function dotAt(d: WaveDot, t: number, site: 'A' | 'B'): { x: number; y: number } {
  const e = t * t * (3 - 2 * t);
  if (d.fake) {
    const wrong = site === 'A' ? SITE_B : SITE_A;
    if (e < 0.55) {
      const k = e / 0.55;
      return { x: d.sx + (wrong.x - d.sx) * k * 0.7, y: d.sy + (wrong.y - d.sy) * k * 0.7 };
    }
    const k = (e - 0.55) / 0.45;
    const mx = d.sx + (wrong.x - d.sx) * 0.7;
    const my = d.sy + (wrong.y - d.sy) * 0.7;
    return { x: mx + (d.tx - mx) * k, y: my + (d.ty - my) * k };
  }
  return { x: d.sx + (d.tx - d.sx) * e, y: d.sy + (d.ty - d.sy) * e };
}

type Phase = 'read' | 'call' | 'gap';

export function IglCall({ seed, durationMs, difficulty, reducedMotion, onFinish }: MiniGameProps) {
  const waves = useMemo(() => buildWaves(seed, difficulty), [seed, difficulty]);
  const readMs = diffLerp(2000, 1400, difficulty);
  const answerMs = diffLerp(2600, 1900, difficulty);
  const [wave, setWave] = useState(0);
  const [phase, setPhase] = useState<Phase>('read');
  const [t, setT] = useState(0);
  const [verdict, setVerdict] = useState<'hit' | 'miss' | null>(null);
  const [hud, setHud] = useState(0);
  const scores = useRef<number[]>([]);
  const callAt = useRef(0);
  const finished = useRef(false);
  const raf = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    cancelAnimationFrame(raf.current);
    timers.current.forEach(clearTimeout);
    const sum = scores.current.reduce((a, b) => a + b, 0);
    onFinish(Math.max(0, Math.min(1, sum / WAVES)));
  };

  const nextWave = (sc: number) => {
    scores.current.push(sc);
    setVerdict(sc > 0 ? 'hit' : 'miss');
    setHud(scores.current.filter((s) => s > 0).length);
    setPhase('gap');
    timers.current.push(setTimeout(() => {
      if (finished.current) return;
      if (scores.current.length >= WAVES) { finish(); return; }
      setVerdict(null);
      setT(0);
      setPhase('read');
      setWave((w) => w + 1);
    }, 620));
  };

  // fase de leitura: anima os pontos (ou salta pro fim com reduced motion),
  // depois fecha o smoke e abre a janela de call
  useEffect(() => {
    if (phase !== 'read' || finished.current) return;
    // reduced motion: pontos já nas posições finais (setState só no callback do rAF)
    const start = performance.now();
    const loop = (now: number) => {
      const k = reducedMotion ? 1 : Math.min(1, (now - start) / readMs);
      setT(k);
      if (k < 1) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    const toCall = setTimeout(() => {
      if (finished.current) return;
      callAt.current = performance.now();
      setPhase('call');
    }, readMs + 180);
    timers.current.push(toCall);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(toCall); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, wave]);

  // janela de call: sem resposta = 0
  useEffect(() => {
    if (phase !== 'call' || finished.current) return;
    const to = setTimeout(() => nextWave(0), answerMs);
    timers.current.push(to);
    return () => clearTimeout(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // teto duro de tempo
  useEffect(() => {
    const cap = setTimeout(finish, durationMs);
    const owned = timers.current; // mesmo array — os callbacks apensam nele
    return () => { clearTimeout(cap); cancelAnimationFrame(raf.current); owned.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const call = (site: 'A' | 'B') => {
    if (phase !== 'call' || finished.current) return;
    const w = waves[wave];
    if (site !== w.site) { nextWave(0); return; }
    const dt = performance.now() - callAt.current;
    nextWave(Math.max(0.4, Math.min(1, 1 - dt / answerMs)));
  };

  const w = waves[wave];
  return (
    <div className="rtp-mini-igl" style={{ width: SIZE, aspectRatio: '1', maxWidth: '100%', touchAction: 'none' }}>
      <div className="rtp-mini-hud">
        <span>{ct('Wave')} {Math.min(wave + 1, WAVES)}/{WAVES}</span>
        <span>{hud > 0 ? `${hud} ${ct('call(s) certa(s)')}` : ''}</span>
      </div>
      {/* sites */}
      {([['A', SITE_A], ['B', SITE_B]] as const).map(([label, p]) => (
        <div key={label} className="rtp-igl-site" style={{ left: `${((p.x - 30) / SIZE) * 100}%`, top: `${((p.y - 30) / SIZE) * 100}%` }}>{label}</div>
      ))}
      {/* pontos inimigos (visíveis só na leitura) */}
      {phase === 'read' && w.dots.map((d, i) => {
        const p = dotAt(d, t, w.site);
        return <div key={i} className="rtp-igl-dot" style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }} />;
      })}
      {/* smoke + botões de call */}
      {phase !== 'read' && (
        <div className={`rtp-igl-smoke${phase === 'gap' ? ` v-${verdict}` : ''}`}>
          {phase === 'call' ? (
            <>
              <span className="rtp-igl-ask">{ct('PRA ONDE ELES FORAM?')}</span>
              <div className="rtp-igl-btns">
                <button type="button" className="rtp-igl-btn" onPointerDown={() => call('A')}>A</button>
                <button type="button" className="rtp-igl-btn" onPointerDown={() => call('B')}>B</button>
              </div>
            </>
          ) : (
            <span className={`rtp-igl-verdict v-${verdict}`}>
              {verdict === 'hit' ? ct('CALL CERTA!') : `${ct('ERA O')} ${w.site}…`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
