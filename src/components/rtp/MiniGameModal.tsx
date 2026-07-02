import { useState, useEffect, useRef, type ComponentType } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { miniSeed, AUTO_PERF, type MiniGameDef, type MiniGameId, type MiniGameProps } from '../../engine/rtp/minigames';
import { CrosshairFlick } from './minigames/CrosshairFlick';
import { ReactionGate } from './minigames/ReactionGate';
import { SprayTracer } from './minigames/SprayTracer';
import { CalloutMemory } from './minigames/CalloutMemory';
import { TempoLock } from './minigames/TempoLock';
import type { RoadToProSave } from '../../engine/rtp/types';

const GAME_COMPONENTS: Record<MiniGameId, ComponentType<MiniGameProps>> = {
  flick: CrosshairFlick,
  reaction: ReactionGate,
  spray: SprayTracer,
  memory: CalloutMemory,
  tempo: TempoLock,
};

type Phase = 'intro' | 'play' | 'result';

function verdict(perf: number): string {
  if (perf >= 0.92) return ct('PERFEITO');
  if (perf >= 0.78) return ct('ÓTIMO');
  if (perf >= 0.62) return ct('BOM');
  if (perf >= 0.5) return ct('NA MÉDIA');
  return ct('FRACO');
}

// Anel de desempenho (reaproveita a linguagem do rtp-ovrring).
function PerfRing({ perf }: { perf: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.round(perf * 100);
  return (
    <div className="rtp-mini-ring">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} className="rtp-mini-ring-track" />
        <circle cx="60" cy="60" r={r} className="rtp-mini-ring-arc" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - perf) }} />
      </svg>
      <div className="rtp-mini-ring-num">{pct}<span>%</span></div>
    </div>
  );
}

export function MiniGameModal({ def, save, onApply, onCancel }: {
  def: MiniGameDef;
  save: RoadToProSave;
  onApply: (perf: number) => void;   // consome a ação com esse perf
  onCancel: () => void;              // fecha SEM consumir ação
}) {
  const seed = miniSeed(save);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<Phase>(reduced ? 'play' : 'intro');
  const [count, setCount] = useState(3);
  const [result, setResult] = useState<{ raw: number; perf: number } | null>(null);
  const done = useRef(false);
  const Game = GAME_COMPONENTS[def.id];

  // 3-2-1 → play (setState só dentro do callback do timer, nunca no corpo do effect)
  useEffect(() => {
    if (phase !== 'intro' || count <= 0) return;
    const t = setTimeout(() => {
      if (count <= 1) setPhase('play');
      else setCount(count - 1);
    }, 650);
    return () => clearTimeout(t);
  }, [phase, count]);

  const finish = (raw: number) => {
    if (done.current) return;
    done.current = true;
    const perf = def.scoreToPerf(Math.max(0, Math.min(1, raw)));
    setResult({ raw, perf });
    setPhase('result');
  };

  // Safety net: se o jogo travar e nunca reportar, resolve num fallback baixo.
  useEffect(() => {
    if (phase !== 'play') return;
    const t = setTimeout(() => finish(0.35), def.durationMs + 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="rtp-modal-overlay rtp-mini-overlay">
      <div className="rtp-mini" role="dialog" aria-modal="true">
        <div className="rtp-mini-head">
          <span className="rtp-mini-title"><RtpIcon name={def.icon} size={16} /> {def.title}</span>
          <button type="button" className="rtp-mini-x" onClick={onCancel} aria-label={ct('Fechar')}><RtpIcon name="close" size={15} /></button>
        </div>

        {phase === 'intro' && (
          <div className="rtp-mini-arena rtp-mini-count">
            <p className="rtp-mini-blurb">{def.blurb}</p>
            <div className="rtp-mini-countnum" key={count}>{count > 0 ? count : ct('JÁ!')}</div>
            <button type="button" className="rtp-mini-skip" onClick={() => onApply(AUTO_PERF)}>
              {ct('Pular minijogo')} · {Math.round(AUTO_PERF * 100)}%
            </button>
          </div>
        )}

        {phase === 'play' && (
          <div className="rtp-mini-arena">
            <Game seed={seed} durationMs={def.durationMs} reducedMotion={reduced} onFinish={finish} />
          </div>
        )}

        {phase === 'result' && result && (
          <div className="rtp-mini-arena rtp-mini-resultwrap">
            <PerfRing perf={result.perf} />
            <div className={`rtp-mini-verdict v-${result.perf >= 0.62 ? 'good' : result.perf >= 0.5 ? 'mid' : 'bad'}`}>{verdict(result.perf)}</div>
            <p className="rtp-mini-resnote">{ct('Você extraiu')} {Math.round(result.perf * 100)}% {ct('do ganho do treino.')}</p>
            <div className="rtp-mini-foot">
              <button type="button" className="rtp-cta" onClick={() => onApply(result.perf)}>{ct('Aplicar treino')}</button>
              <button type="button" className="rtp-btn-ghost" onClick={onCancel}>{ct('Descartar')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
