import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { MAP_LABELS } from '../../types';
import type { ProMatchResult, MatchConsequence } from '../../engine/rtp/matchSim';

// Resultado do SIMULAR (v15): em vez de uma notificação seca, um modal de
// transmissão — placar, mapas, a SUA linha (K-D/ADR/rating) e as consequências.
// O usuário vê a partida que aconteceu, mesmo sem jogá-la.
export function RtpSimResult({ result, consequence, onClose }: {
  result: ProMatchResult;
  consequence: MatchConsequence;
  onClose: () => void;
}) {
  const hero = result.userRows.find((r) => r.isHero);
  const ratingTone = result.heroRating >= 1.1 ? 'good' : result.heroRating >= 0.9 ? 'mid' : 'bad';
  return (
    // .rtp.rtp-portal: escopo de tokens pros modais que vivem FORA do RtpShell
    // (irmãos do hub) — sem ele, nada de --rtp-* e o modal renderiza pelado.
    <div className="rtp rtp-portal">
      <div className="rtp-modal-overlay rtp-simres-overlay">
        <div className="rtp-simres" role="dialog" aria-modal="true" aria-label={ct('Resultado da partida simulada')}>
        <div className={`rtp-simres-banner ${result.won ? 'win' : 'loss'}`}>
          <span className="rtp-simres-kicker">{ct('PARTIDA SIMULADA')}</span>
          <span className="rtp-simres-verdict">{result.won ? ct('VITÓRIA') : ct('DERROTA')}</span>
          <span className="rtp-simres-score">{result.mapScore[0]} — {result.mapScore[1]} <i>vs {result.oppTag}</i></span>
          <div className="rtp-simres-maps">
            {result.maps.map((m, i) => (
              <span key={i} className={`rtp-result-map ${m.won ? 'w' : 'l'}`}>{MAP_LABELS[m.map] ?? m.map} {m.score[0]}-{m.score[1]}</span>
            ))}
          </div>
        </div>

        <div className="rtp-simres-line">
          <div className={`rtp-simres-rating r-${ratingTone}`}>{result.heroRating.toFixed(2)}<span>{ct('rating')}</span></div>
          <div className="rtp-simres-stats">
            <b>{hero?.nick}</b>
            <span>{hero?.kills}–{hero?.deaths} · {hero?.adr} ADR{result.mvp && <span className="rtp-simres-mvp"><RtpIcon name="fame" size={11} /> MVP</span>}</span>
          </div>
        </div>

        {consequence.headline && (
          <div className="rtp-debrief-headline"><span className="rtp-debrief-kicker">{ct('IMPRENSA')}</span> “{consequence.headline}”</div>
        )}

        <div className="rtp-cond-chips rtp-simres-deltas">
          {consequence.deltas.map((d, i) => <span key={i} className="rtp-feedback-chip">{d.label} {d.value}</span>)}
        </div>

          <button type="button" className="rtp-cta rtp-simres-cta" onClick={onClose}>{ct('Continuar')} →</button>
        </div>
      </div>
    </div>
  );
}
