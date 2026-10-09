// <canvas> do clutch + HUD em DOM + overlay de início/resultado.
// O runtime (three) entra por import() só quando este componente monta.
import { useEffect, useRef, useState } from 'react';
import type { ClutchConfig, ClutchEnd, ClutchHud, ClutchResult } from './types';
import './clutch.css';

interface Props {
  config: ClutchConfig;
  onEnd: ClutchEnd;
  debugFps?: boolean;
  onRetry?: () => void;
  onExit?: () => void;
}

const REASON: Record<ClutchResult['reason'], string> = {
  eliminated_all: 'Você eliminou todo mundo.',
  defused: 'Bomba desarmada.',
  exploded: 'A bomba explodiu.',
  died: 'Você caiu.',
  quit: 'Você desistiu do round.',
};

export function ClutchCanvas({ config, onEnd, debugFps, onRetry, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<ClutchHud | null>(null);
  const [result, setResult] = useState<ClutchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    let handle: { dispose(): void } | null = null;
    let cancelled = false;
    import('./runtime/engine').then(({ createClutchGame }) => {
      if (cancelled || !canvasRef.current) return;
      try {
        handle = createClutchGame(canvasRef.current, config, (r) => { setResult(r); onEndRef.current(r); }, { onHud: setHud, debugFps });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'WebGL indisponível');
      }
    }).catch(() => setError('Não deu para carregar o modo clutch.'));
    return () => { cancelled = true; handle?.dispose(); };
  }, [config, debugFps]);

  const n = config.opponents.length;
  const bombLeft = hud?.bombLeft ?? config.bombTimeLeft ?? 40;
  const started = !!hud?.locked;

  return (
    <div className="clutch-root">
      <canvas ref={canvasRef} className="clutch-canvas" aria-label="Clutch em primeira pessoa" />
      {hud && !result && (
        <>
          <div className="clutch-cross" />
          {hud.hitMarker > 0.05 && <div className="clutch-hit" style={{ opacity: hud.hitMarker }} />}
          {hud.hurtFlash > 0.02 && <div className="clutch-hurt" style={{ opacity: hud.hurtFlash * 0.8 }} />}
          <div className="clutch-top">
            <div className="clutch-chip">
              <span className="clutch-lbl">Bomba</span>
              <span className={`clutch-big clutch-bomb${bombLeft < 10 ? ' low' : ''}`}>{bombLeft.toFixed(1)}</span>
            </div>
            <div className="clutch-chip">
              <span className="clutch-lbl">1v{hud.botsAlive}</span>
              <span className="clutch-alive">
                {Array.from({ length: hud.botsTotal }, (_, i) => <i key={i} className={i < hud.botsAlive ? '' : 'dead'} />)}
              </span>
            </div>
          </div>
          <div className="clutch-feed">
            {hud.killFeed.map((k, i) => (
              <div key={i} className={k.byPlayer ? 'me' : ''}>
                {k.byPlayer ? <>Você ✕ {k.victim}</> : <>{k.victim} caiu</>}
                {k.headshot && <span className="hs">HS</span>}
              </div>
            ))}
          </div>
          {(hud.canDefuse || hud.defuseProgress > 0) && (
            <div className="clutch-defuse">
              <div className="clutch-chip" style={{ display: 'block' }}>
                <span className="clutch-lbl">{hud.defuseProgress > 0 ? 'Desarmando…' : 'Segure E para desarmar'}</span>
                <div className="bar"><span style={{ width: `${hud.defuseProgress * 100}%` }} /></div>
              </div>
            </div>
          )}
          <div className="clutch-hud-bottom">
            <div className="clutch-chip">
              <span className="clutch-lbl">Vida</span><span className="clutch-big">{hud.hp}</span>
              <span className="clutch-lbl">Colete</span><span className="clutch-big">{hud.armor}</span>
            </div>
            <div className="clutch-chip">
              <span className="clutch-lbl">{hud.weapon === 'rifle' ? 'Fuzil' : 'Pistola'}</span>
              <span className="clutch-big">{hud.reloading ? '…' : hud.ammo}</span>
              <span className="clutch-lbl">/ {hud.magSize}</span>
            </div>
          </div>
          {hud.fps && (
            <div className="clutch-fps">
              {`${hud.fps.fps.toFixed(0)} fps  ${hud.fps.ms.toFixed(1)} ms  p95 ${hud.fps.p95.toFixed(1)}\ncalls ${hud.fps.calls}  tris ${hud.fps.tris}  ratio ${hud.fps.ratio}`}
            </div>
          )}
        </>
      )}
      {!started && !result && !error && (
        <div className="clutch-overlay" onClick={() => canvasRef.current?.click()}>
          <div className="clutch-card">
            <span className="clutch-lbl">Road to Major · Clutch</span>
            <h1>1v{n} pós-plant no B</h1>
            <p>A bomba está armada. Elimine todo mundo ou desarme antes de o tempo acabar.</p>
            <div className="clutch-opps">{config.opponents.map((o) => <span key={o.id}>{o.name}</span>)}</div>
            <button type="button" className="clutch-btn">{hud ? 'Clique para jogar' : 'Carregando…'}</button>
            <div className="clutch-keys">WASD andar · Shift andar devagar · Mouse mirar/atirar · R recarregar · 1/2 armas · E (segurar) desarmar · Esc pausa, Esc de novo desiste</div>
          </div>
        </div>
      )}
      {error && (
        <div className="clutch-overlay"><div className="clutch-card"><h1>Ops</h1><p>{error}</p>{onExit && <button type="button" className="clutch-btn" onClick={onExit}>Voltar</button>}</div></div>
      )}
      {result && (
        <div className="clutch-overlay">
          <div className="clutch-card">
            <span className="clutch-lbl">Road to Major · Clutch</span>
            <h1 className={result.won ? 'win' : 'loss'}>{result.won ? 'Clutch!' : 'Round perdido'}</h1>
            <p>{REASON[result.reason]}</p>
            <div className="clutch-stats">
              <div><b>{result.kills}</b><span className="clutch-lbl">Abates</span></div>
              <div><b>{result.headshots}</b><span className="clutch-lbl">Na cabeça</span></div>
              <div><b>{(result.timeMs / 1000).toFixed(1)}s</b><span className="clutch-lbl">Tempo</span></div>
            </div>
            <p>{result.damageDealt} de dano causado</p>
            {onRetry && <button type="button" className="clutch-btn" onClick={onRetry}>Jogar de novo</button>}
            {onExit && <button type="button" className="clutch-btn ghost" onClick={onExit}>Sair</button>}
          </div>
        </div>
      )}
    </div>
  );
}
