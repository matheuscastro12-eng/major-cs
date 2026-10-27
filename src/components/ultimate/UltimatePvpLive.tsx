// [F2] PARTIDA PvP AO VIVO resolvida NO SERVIDOR. Os dois decidem ao mesmo
// tempo, com prazo comum por beat; quando os dois travam (ou o prazo vence) o
// servidor resolve e o placar anda. Este componente só apresenta e encaminha:
// poll de matchState (~1.5s, com backoff em erro), decide, e reconexão pelo
// próprio matchState (recarregar retoma do beat em que o servidor está).
// As odds vêm do motor compartilhado (pvpMatch) — o que aparece é o que rola.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Swords, Zap } from 'lucide-react';
import { ct } from '../../state/career-i18n';
import { MAP_LABELS, type MapId } from '../../types';
import { ultMatchApi } from '../../state/online';
import { PVP_STYLE_LABEL, PVP_STYLES, type MatchView, type PvpStyle } from '../../engine/ultimate/pvpMatch';

const POLL_MS = 1500;
const POLL_MAX_MS = 12_000;

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function UltimatePvpLive({ code, nick, onDone, onLeave }: {
  code: string;
  nick: string;
  onDone: (view: MatchView) => void;   // partida encerrada (vencedor fixado pelo servidor) — 1x
  onLeave: () => void;
}) {
  const [view, setView] = useState<MatchView | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<PvpStyle | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const recvAt = useRef(Date.now());       // quando chegou a última visão (contagem local do prazo)
  const delay = useRef(POLL_MS);
  const doneRef = useRef(false);

  const accept = useCallback((v: MatchView) => {
    recvAt.current = Date.now();
    setView((prev) => (prev && prev.version > v.version && prev.status === v.status ? prev : v));
    if (v.status !== 'live' && !doneRef.current) { doneRef.current = true; onDone(v); }
  }, [onDone]);

  // início idempotente + poll com backoff (erro/429 dobra o intervalo até 12s)
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async (first: boolean) => {
      try {
        const r = await ultMatchApi({ action: first ? 'matchStart' : 'matchState', code, nick });
        if (!alive) return;
        if (r.ok && r.match) { setError(''); delay.current = POLL_MS; accept(r.match); }
        else {
          setError(r.error ?? ct('Falha ao falar com o servidor.'));
          delay.current = Math.min(POLL_MAX_MS, delay.current * 2);
          if (r.status === 403 || r.status === 404) return; // não é desta partida: para
        }
      } catch {
        if (!alive) return;
        setError(ct('Sem conexão — tentando de novo…'));
        delay.current = Math.min(POLL_MAX_MS, delay.current * 2);
      }
      if (alive && !doneRef.current) timer = window.setTimeout(() => void tick(false), delay.current);
    };
    void tick(true);
    // voltar pro app (aba oculta no celular) repõe na hora
    const onVis = () => { if (!document.hidden && alive) { window.clearTimeout(timer); void tick(false); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [code, nick, accept]);

  // relógio do prazo (só visual; quem manda é o servidor)
  useEffect(() => {
    if (view?.status !== 'live') return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [view?.status]);

  const decide = async (style: PvpStyle) => {
    if (!view?.beat || view.myDecision || sending) return;
    setSending(style);
    try {
      const r = await ultMatchApi({ action: 'decide', code, nick, style, beat: view.beat.idx });
      if (r.ok && r.match) accept(r.match); else setError(r.error ?? ct('Não foi possível enviar a decisão.'));
    } catch { setError(ct('Sem conexão — a decisão não saiu. Tente de novo.')); }
    setSending(null);
  };

  if (!view) {
    return (
      <div className="ut-duel">
        <div className="ut-duel__status" style={{ textAlign: 'center', padding: 18 }}>{ct('Conectando à partida…')}</div>
        {error && <div className="ut-duel__err">{error}</div>}
      </div>
    );
  }

  const beat = view.beat;
  const left = Math.max(0, view.deadlineIn - (now - recvAt.current));
  const secs = Math.ceil(left / 1000);
  const last = view.last;
  const mapName = MAP_LABELS[view.map as MapId] ?? view.map;
  const score = view.finalScore ?? view.score;

  return (
    <div className="ut-duel" aria-live="polite">
      <div className="ut-live__bar" style={{ position: 'static' }}>
        <span className="ut-live__vs">{view.names[0]} <span style={{ color: 'var(--ut-gold-1)' }}>vs</span> {view.names[1]}</span>
        <span className="ut-live__badge"><span className="ut-live__dot" /> {view.status === 'live' ? ct('AO VIVO') : ct('ENCERRADA')} · {mapName}{view.ranked ? ` · ${ct('ranqueada')}` : ''}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: 'var(--font-num)', fontSize: '2.2rem', fontWeight: 900 }}>
        <span style={{ color: 'var(--c-ct)' }}>{score[0]}</span><span style={{ opacity: .4 }}>–</span><span style={{ color: 'var(--c-t)' }}>{score[1]}</span>
      </div>
      <div className="ut-mom__dots" style={{ justifyContent: 'center' }}>
        {view.history.map((h, i) => <span key={i} className={`ut-mom__dot ${h.won ? 'win' : 'loss'}`} title={`${ct('Você')}: ${ct(PVP_STYLE_LABEL[h.mine])} · ${ct('Rival')}: ${ct(PVP_STYLE_LABEL[h.theirs])}`} />)}
      </div>

      {last && (
        <div className="ut-duel__pl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
          <div style={{ fontWeight: 800, color: last.won ? 'var(--c-ct)' : 'var(--c-t)' }}>
            {last.won ? ct('Você venceu o beat') : ct('O rival venceu o beat')} · {ct('chance era')} {pct(last.pWin)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ut-muted)' }}>
            {ct('Você')}: <b>{ct(PVP_STYLE_LABEL[last.mine])}</b>{last.myAuto ? ` (${ct('automático')})` : ''} · {ct('Rival')}: <b>{ct(PVP_STYLE_LABEL[last.theirs])}</b>{last.theirAuto ? ` (${ct('automático')})` : ''}
          </div>
        </div>
      )}

      {view.status === 'live' && beat && (
        <>
          <div className="ut-duel__box" style={{ gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: '0.7rem', letterSpacing: '1.2px', fontWeight: 800, color: 'var(--ut-muted)' }}>
              <span>{beat.kicker} · {ct('beat')} {beat.idx + 1}/{beat.total} · {ct('lado')} {beat.side}</span>
              <span style={{ color: secs <= 5 ? 'var(--c-t)' : 'var(--ut-muted)' }}><Clock size={12} style={{ verticalAlign: '-2px' }} /> {secs}s</span>
            </div>
            {beat.bridged && <div style={{ fontSize: '0.74rem', color: 'var(--ut-muted)' }}>{ct('Desde o último beat')}: {beat.bridged[0]}–{beat.bridged[1]} {ct('em rounds')}</div>}
            <div style={{ fontWeight: 900 }}>{beat.title}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ut-muted)' }}>{beat.situation}</div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {beat.options.map((o) => {
              const chosen = view.myDecision === o.style;
              const locked = !!view.myDecision;
              return (
                <button key={o.style} className={chosen ? 'ut-jogar' : 'ut-btn ut-btn--ghost'} disabled={locked || !!sending}
                  onClick={() => void decide(o.style)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', gap: 3, padding: '10px 12px', opacity: locked && !chosen ? 0.5 : 1 }}>
                  <span style={{ fontWeight: 800 }}>{ct(PVP_STYLE_LABEL[o.style])} · {o.label}</span>
                  {o.desc && <span style={{ fontSize: '0.74rem', opacity: .8 }}>{o.desc}</span>}
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: '0.72rem' }}>
                    {PVP_STYLES.map((t) => `${ct('vs')} ${ct(PVP_STYLE_LABEL[t]).toLowerCase()} ${pct(o.odds[t])}`).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--ut-muted)' }}>
            {view.myDecision ? <><Zap size={12} /> {ct('Decisão travada.')} </> : null}
            {view.oppDecided ? <b>{ct('O rival já decidiu.')}</b> : ct('O rival ainda está decidindo.')}
            {' '}{ct('Sem decisão no prazo, o servidor sorteia uma escolha pra você.')}
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.66rem', color: 'var(--ut-muted)' }}>
            {ct('Agressivo vence Passivo, Passivo vence Setup, Setup vence Agressivo. As chances já contam força dos squads e embalo.')}
          </div>
        </>
      )}

      {view.status !== 'live' && (
        <div className="ut-duel__box" style={{ textAlign: 'center', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>
            <Swords size={16} style={{ verticalAlign: '-3px' }} />{' '}
            {view.status === 'abandoned' ? ct('Partida abandonada pelos dois lados') : view.won ? ct('VITÓRIA') : ct('DERROTA')}
            {view.reason === 'wo' && view.status === 'done' ? ` · ${ct('W.O.')}` : ''}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ut-muted)' }}>{ct('Resultado fixado pelo servidor.')}</div>
          <button className="ut-btn ut-btn--ghost" onClick={onLeave}>{ct('Voltar')}</button>
        </div>
      )}

      {error && <div className="ut-duel__err">{error}</div>}
    </div>
  );
}
