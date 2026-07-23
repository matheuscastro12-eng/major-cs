// RTP — PENEIRA de entrada. 3 estações de minigame (mira, reflexo, leitura); a nota
// média define o tier do time que te contrata. Reusa os componentes de minigame já
// existentes (contrato MiniGameProps) e a linguagem visual rtp-mini-*.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { MINIGAMES } from '../../engine/rtp/minigames';
import { GAME_COMPONENTS } from './minigames';
import { TRYOUT_STATIONS, tryoutScore, tryoutTier, tryoutStrong, TIER_FLAVOR } from '../../engine/rtp/tryout';
import { startTeamForTier } from '../../engine/rtp/world';
import type { Tier } from '../../engine/rtp/types';

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// stage: 'intro' → 0..N-1 (estação jogando) → 'reveal'
type Stage = 'intro' | number | 'reveal';

export function TryoutModal({ country, seed, ovr, onDone, onCancel }: {
  country: string;
  seed: number;
  ovr: number;
  onDone: (tier: Tier, strong: boolean, score: number) => void;
  onCancel: () => void;
}) {
  const reduced = reducedMotion();
  const [stage, setStage] = useState<Stage>('intro');
  const [count, setCount] = useState(3);
  const [raws, setRaws] = useState<number[]>([]);
  const done = useRef(false);

  const stations = TRYOUT_STATIONS;
  const isPlaying = typeof stage === 'number';

  // 3-2-1 antes de cada estação
  useEffect(() => {
    if (!isPlaying) return;
    if (reduced) { setCount(0); return; }
    setCount(3);
  }, [stage, isPlaying, reduced]);
  useEffect(() => {
    if (!isPlaying || count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 620);
    return () => clearTimeout(t);
  }, [isPlaying, count]);

  const startStations = () => { done.current = false; setRaws([]); setStage(0); };

  const finishStation = (raw: number) => {
    if (done.current) return;
    done.current = true;
    const nextRaws = [...raws, Math.max(0, Math.min(1, raw))];
    setRaws(nextRaws);
    const idx = stage as number;
    if (idx + 1 < stations.length) { setStage(idx + 1); done.current = false; }
    else setStage('reveal');
  };

  // safety net por estação: se o jogo travar, resolve num raw baixo
  useEffect(() => {
    if (!isPlaying || count > 0) return;
    const def = MINIGAMES[stations[stage as number]];
    const t = setTimeout(() => finishStation(0.28), def.durationMs + 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, count, stage]);

  const placement = useMemo(() => {
    if (stage !== 'reveal') return null;
    const score = tryoutScore(raws, ovr);
    const target = tryoutTier(score);           // tier reproduzido pelo createRtpSave (mesmo seed)
    const strong = tryoutStrong(score);
    const resolved = startTeamForTier(country, seed, target, strong); // pode rebaixar se a região não tiver o tier
    return { score, target, strong, tier: resolved.tier, team: resolved.team };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return (
    <div className="rtp-modal-overlay rtp-mini-overlay">
      <div className="rtp-mini rtp-tryout" role="dialog" aria-modal="true">
        <div className="rtp-mini-head">
          <span className="rtp-mini-title"><RtpIcon name="crosshair" size={16} /> {ct('Peneira')}</span>
          {stage === 'intro' && (
            <button type="button" className="rtp-mini-x" onClick={onCancel} aria-label={ct('Fechar')}><RtpIcon name="close" size={15} /></button>
          )}
        </div>

        {/* passos das estações */}
        {stage !== 'reveal' && (
          <div className="rtp-tryout-steps">
            {stations.map((id, i) => (
              <span key={id} className={`rtp-tryout-step${typeof stage === 'number' && i < stage ? ' done' : ''}${stage === i ? ' on' : ''}`}>
                <RtpIcon name={MINIGAMES[id].icon} size={13} /> {MINIGAMES[id].title}
              </span>
            ))}
          </div>
        )}

        {stage === 'intro' && (
          <div className="rtp-mini-arena rtp-mini-count">
            <p className="rtp-mini-blurb">
              {ct('É a sua peneira. Três testes: mira, reflexo e leitura de jogo. Mande bem e um time grande te contrata — vacile e você começa na base.')}
            </p>
            <button type="button" className="rtp-cta" onClick={startStations}>{ct('Começar a peneira')}</button>
            <button type="button" className="rtp-mini-skip" onClick={() => onDone('academy', false, 0.3)}>
              {ct('Pular (começa na academia)')}
            </button>
          </div>
        )}

        {isPlaying && count > 0 && (
          <div className="rtp-mini-arena rtp-mini-count">
            <p className="rtp-mini-blurb">{MINIGAMES[stations[stage as number]].blurb}</p>
            <div className="rtp-mini-countnum" key={count}>{count}</div>
          </div>
        )}

        {isPlaying && count <= 0 && (() => {
          const id = stations[stage as number];
          const def = MINIGAMES[id];
          const Game = GAME_COMPONENTS[id]!;
          return (
            <div className="rtp-mini-arena">
              <Game seed={(seed ^ ((stage as number) * 0x9e3779b1)) >>> 0} durationMs={def.durationMs} reducedMotion={reduced} onFinish={finishStation} />
            </div>
          );
        })()}

        {stage === 'reveal' && placement && (() => {
          const flavor = TIER_FLAVOR[placement.tier];
          return (
            <div className="rtp-mini-arena rtp-tryout-reveal">
              <div className={`rtp-tryout-badge tone-${flavor.tone}`}>{ct(flavor.label)}</div>
              <div className="rtp-tryout-team">
                <b>{placement.team.name}</b>
                <span className="rtp-tryout-tag">{placement.team.tag}</span>
              </div>
              <p className="rtp-tryout-blurb">{ct(flavor.blurb)}</p>
              <div className="rtp-tryout-score">{ct('Nota da peneira')}: <b>{Math.round(placement.score * 100)}</b></div>
              <div className="rtp-mini-foot">
                <button type="button" className="rtp-cta" onClick={() => onDone(placement.target, placement.strong, placement.score)}>
                  {ct('Assinar contrato')} →
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
