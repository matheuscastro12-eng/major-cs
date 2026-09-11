// [U06] PALCO DA PARTIDA INCREMENTAL (casual) — cada round nasce AGORA no motor.
// O timeout aqui é REAL: entra como boost nos próximos rounds da sessão
// (engine/ultimate/matchSession.ts). O componente só apresenta e encaminha
// decisões; quem persiste a sessão (localStorage) e grava a recompensa é o pai.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Flame, Zap } from 'lucide-react';
import { ct } from '../../state/career-i18n';
import { MAP_LABELS } from '../../types';
import {
  advanceSession, aiWantsTimeout, callTimeout, skipToEnd, viewSession, TIMEOUT_ROUNDS,
  type MatchSession, type SessionView,
} from '../../engine/ultimate/matchSession';

const SPEEDS = [0.5, 1, 2, 4] as const;

export function UltimateLiveSession({ session, onSession, onFinish }: {
  session: MatchSession;
  onSession: (next: MatchSession) => void;   // toda mudança (avanço/decisão) — o pai persiste
  onFinish: (final: MatchSession) => void;   // status 'done' → o pai fecha, grava 1x e mostra o resultado
}) {
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [paused, setPaused] = useState<string>('');     // mensagem de pausa (timeout) — congela o avanço
  const [flash, setFlash] = useState<string>('');
  const view: SessionView = viewSession(session);
  const finishedRef = useRef(false);
  const pauseTimer = useRef<number | null>(null);

  // avanço automático: um round por tick; para em timeout e no fim
  useEffect(() => {
    if (session.status === 'done') {
      if (!finishedRef.current) { finishedRef.current = true; const t = window.setTimeout(() => onFinish(session), 900); return () => window.clearTimeout(t); }
      return;
    }
    if (paused) return;
    const t = window.setTimeout(() => {
      // a IA decide ENTRE rounds, por regra determinística (aiWantsTimeout)
      let s = session;
      if (aiWantsTimeout(s, view)) {
        const r = callTimeout(s, 1);
        if (r.ok) { s = r.session; setFlash(`⏸ ${session.teams[1].name} ${ct('pediu timeout')} (+${TIMEOUT_ROUNDS} rounds)`); }
      }
      onSession(advanceSession(s));
    }, 850 / speed);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, paused, speed]);

  useEffect(() => () => { if (pauseTimer.current) window.clearTimeout(pauseTimer.current); }, []);

  const myTimeout = () => {
    const r = callTimeout(session, 0);
    if (!r.ok) { setFlash(r.reason === 'none_left' ? ct('Você já usou o timeout deste mapa.') : r.reason === 'active' ? ct('Timeout em vigor.') : ct('Partida encerrada.')); return; }
    onSession(r.session);
    setPaused(`⏸ ${ct('TIMEOUT')} · ${session.teams[0].name} · +${TIMEOUT_ROUNDS} ${ct('rounds com foco')}`);
    pauseTimer.current = window.setTimeout(() => setPaused(''), 1400);
  };
  const skip = () => { onSession(skipToEnd(session)); };

  const log = view.roundLog;
  let streakLen = 0; const streakSide = log.length ? log[log.length - 1] : null;
  for (let i = log.length - 1; i >= 0 && log[i] === streakSide; i--) streakLen++;
  const onFire = streakSide !== null && streakLen >= 3;
  const lastRound = log.length - 1;
  const lastKills = view.killFeed.filter((k) => k.round === lastRound);
  const nickOf = (id: string) => session.teams[0].players.find((p) => p.id === id)?.nick ?? session.teams[1].players.find((p) => p.id === id)?.nick ?? id;
  const boostActive = session.decisions.some((d) => d.team === 0 && session.cursor >= d.round && session.cursor < d.round + TIMEOUT_ROUNDS);
  const pWin = view.nextWinProb;

  return (
    <div className="ut-root ut-live">
      <div className="ut-live__bar">
        <button onClick={skip} className="ut-live__back"><ArrowLeft size={15} style={{ verticalAlign: '-2px' }} /> {ct('Ver resultado')}</button>
        <span className="ut-live__vs">{session.teams[0].name} <span style={{ color: 'var(--ut-gold-1)' }}>vs</span> {session.teams[1].name}</span>
        <span className="ut-live__badge"><span className="ut-live__dot" /> {ct('AO VIVO')} · {MAP_LABELS[session.map] ?? session.map} · {ct('round a round')}</span>
      </div>
      <div className="ut-mom">
        <div className="ut-mom__dots">
          {Array.from({ length: Math.max(24, log.length) }, (_, i) => (
            <span key={i} className={`ut-mom__dot${i < log.length ? (log[i] === 0 ? ' win' : ' loss') : ''}${i === 12 ? ' half' : ''}`} />
          ))}
        </div>
        <div className={`ut-mom__streak${onFire ? (streakSide === 0 ? ' fire-you' : ' fire-opp') : ''}`}>
          {onFire ? <><Flame size={13} strokeWidth={2.5} /> {streakSide === 0 ? session.teams[0].name : session.teams[1].name} · {streakLen} {ct('rounds seguidos')}</> : <span style={{ opacity: 0.55 }}>{ct('MOMENTUM')}</span>}
        </div>
      </div>
      <div className="ut-live__stage" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: '"JetBrains Mono", monospace', fontSize: '2.2rem', fontWeight: 900 }}>
          <span style={{ color: '#2563eb' }}>{view.score[0]}</span><span style={{ opacity: .4 }}>–</span><span style={{ color: '#d97706' }}>{view.score[1]}</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--ut-muted)' }}>
          {view.done ? ct('Fim de mapa') : <>{ct('Round')} {view.round + 1}{pWin != null && <> · {ct('leitura pré-round')}: <b>{Math.round(pWin * 100)}%</b> {ct('de vencer')}</>}{boostActive && <> · <b style={{ color: '#92600a' }}>⏸ {ct('timeout em vigor')}</b></>}</>}
        </div>
        {(paused || flash) && <div style={{ textAlign: 'center', fontWeight: 800, color: '#92600a' }}>{paused || flash}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="ut-jogar" style={{ padding: '9px 16px' }} onClick={myTimeout} disabled={view.done || view.timeoutsLeft[0] <= 0 || !!paused || boostActive} title={ct('Pede timeout: seu time joga os próximos rounds com foco (+força). Um por mapa. Só muda o que ainda não aconteceu.')}>
            ⏸ {ct('TIMEOUT')} ({Math.max(0, view.timeoutsLeft[0])})
          </button>
          <div className="ut-tabs" style={{ margin: 0 }}>
            {SPEEDS.map((sp) => <button key={sp} onClick={() => setSpeed(sp)} style={{ fontWeight: speed === sp ? 900 : 500, opacity: speed === sp ? 1 : .6 }}>{sp}x</button>)}
          </div>
          <button className="ut-btn ut-btn--ghost" onClick={skip} disabled={view.done}><Zap size={13} /> {ct('Pular pro fim')}</button>
        </div>
        <div style={{ maxWidth: 520, margin: '0 auto', width: '100%', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: 3, minHeight: 80 }}>
          {lastRound >= 0 && <div style={{ color: 'var(--ut-muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.64rem' }}>R{lastRound + 1} · {log[lastRound] === 0 ? session.teams[0].name : session.teams[1].name} {ct('venceu')}</div>}
          {lastKills.slice(0, 7).map((k, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: k.killerTeam === 0 ? '#2563eb' : '#d97706', fontWeight: 700 }}>{nickOf(k.killerId)}</span>
              <span style={{ opacity: .6 }}>{k.weapon}{k.headshot ? ' hs' : ''}{k.opening ? ' · abertura' : ''}{k.trade ? ' · troca' : ''}</span>
              <span style={{ color: k.victimTeam === 0 ? '#2563eb' : '#d97706' }}>{nickOf(k.victimId)}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.66rem', color: 'var(--ut-muted)' }}>{ct('Cada round é calculado agora. Recarregar retoma daqui; o resultado só é registrado no fim.')}</div>
      </div>
    </div>
  );
}
