import { useState } from 'react';
import { ct } from '../../state/career-i18n';
import { RtpFrame } from './RtpFrame';
import { RtpIcon } from './RtpIcon';
import { eraCloseOf, MAJOR_PLACE_LABEL } from '../../engine/rtp/era';
import { eraCloseDesk } from '../../engine/rtp/broadcast';
import { TIER_NAME } from '../../engine/rtp/league';
import type { EraStamp } from '../../engine/rtp/types';

// [W6] FECHAMENTO DE ERA — tela cheia no estilo do resultado do Major / recap de
// temporada da Carreira: manchete do ano, o melhor momento, os números da era,
// o time mais forte e o Major do ano. Mostrada UMA vez na virada (pendingEraYear)
// e reaberta pelos carimbos do Overview (modo leitura: `past`).
// Tudo o que aparece aqui deriva do carimbo (eraCloseOf) — nada recalculado.

const placeLabel = (p: number) =>
  p === 1 ? ct('Campeão') : p === 2 ? ct('Vice') : p === 3 ? ct('Semifinal') : p === 5 ? ct('3º do grupo') : ct('4º do grupo');

export function RtpEraClose({ stamp, nick, past = false, onContinue }: {
  stamp: EraStamp;
  nick: string;
  past?: boolean;          // reabrindo um carimbo antigo (sem "próximo ano")
  onContinue: () => void;
}) {
  const close = eraCloseOf(stamp);
  const desk = eraCloseDesk(stamp, nick);
  const [copied, setCopied] = useState(false);
  const champ = close.titles > 0 || stamp.majorPlacement === 'champion';
  const losses = Math.max(0, stamp.series - stamp.wins);

  const share = async () => {
    const text = close.share;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cancelado */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sem clipboard */ }
  };

  const majorLine = stamp.majorPlacement === undefined
    ? ct('Em disputa')
    : stamp.majorPlacement === null
      ? ct('Sem vaga este ano')
      : `${MAJOR_PLACE_LABEL[stamp.majorPlacement]}${stamp.majorAward ? ` · ${stamp.majorAward.toUpperCase()}` : ''}`;

  return (
    <RtpFrame onExit={onContinue} kicker={`ERA ${stamp.year}`}>
      <div className={`rtp-major-result rtp-era-close${champ ? ' champ' : ''}`}>
        <div className="rtp-era-close-kicker">{past ? ct('Carimbo da era') : ct('Fim de ano')}</div>
        <span className="rtp-major-result-trophy"><RtpIcon name={champ ? 'trophy' : 'calendar'} size={48} /></span>
        <div className="rtp-major-result-place">{close.name.toUpperCase()}</div>
        <div className="rtp-major-result-name">{stamp.teamName} · {TIER_NAME[stamp.tier]}</div>

        <p className="rtp-era-close-headline">{stamp.headline}</p>
        <p className="rtp-era-close-desk">“{desk.opener} {desk.verdict}”</p>

        <div className="rtp-era-close-form" aria-label={ct('Resumo do ano')}>{close.form}</div>

        <div className="rtp-major-result-stats rtp-era-close-stats">
          <div><span>{ct('Títulos')}</span><b>{close.titles}</b></div>
          <div><span>{ct('Séries')}</span><b>{stamp.wins}–{losses}</b></div>
          <div><span>{ct('Rating')}</span><b>{close.rating.toFixed(2)}</b></div>
          {typeof stamp.worldRank === 'number' && <div><span>{ct('Ranking')}</span><b>#{stamp.worldRank}</b></div>}
        </div>

        <div className="rtp-era-close-grid">
          {close.bestMoment && (
            <div className="rtp-era-close-cell">
              <span>{ct('Melhor momento')}</span>
              <b>{close.bestMoment.eventName}</b>
              <em>{placeLabel(close.bestMoment.place)} · rating {close.bestMoment.rating.toFixed(2)}{close.bestMoment.award ? ` · ${close.bestMoment.award.toUpperCase()}` : ''}</em>
            </div>
          )}
          {stamp.strongestTeam && (
            <div className="rtp-era-close-cell">
              <span>{ct('Time mais forte do ano')}</span>
              <b>{stamp.strongestTeam.name}</b>
              <em>{stamp.strongestTeam.isUser ? ct('Vocês. Ninguém chegou perto.') : `${stamp.strongestTeam.tag} · ${ct('dominou a última etapa')}`}</em>
            </div>
          )}
          <div className="rtp-era-close-cell major">
            <span>{ct('Major do ano')}</span>
            <b>{stamp.majorName}</b>
            <em>{stamp.majorCity} · {majorLine}</em>
          </div>
        </div>

        {stamp.events.length > 0 && (
          <div className="rtp-era-close-events">
            {stamp.events.map((e, i) => (
              <div key={i} className={`rtp-era-close-ev${e.place === 1 ? ' won' : ''}`}>
                <span className="rtp-era-close-ev-n">{i + 1}</span>
                <b>{e.eventName}</b>
                <em>{placeLabel(e.place)}{e.award ? ` · ${e.award.toUpperCase()}` : ''}</em>
              </div>
            ))}
          </div>
        )}

        {!past && <p className="rtp-era-close-next">{desk.next}</p>}

        <div className="rtp-era-close-btns">
          <button type="button" className="rtp-btn-ghost" onClick={share}>{copied ? ct('Copiado!') : ct('Compartilhar')}</button>
          <button type="button" className="rtp-cta" onClick={onContinue}>
            {past ? ct('Fechar') : `${ct('Seguir pra')} ${stamp.year + 1}`} <RtpIcon name="chevR" size={14} />
          </button>
        </div>
      </div>
    </RtpFrame>
  );
}
