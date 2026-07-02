import { useState } from 'react';
import { RtpFrame } from './RtpFrame';
import { ct } from '../../state/career-i18n';
import { TIER_NAME } from '../../engine/rtp/league';
import { RtpIcon } from './RtpIcon';
import type { RoadToProSave } from '../../engine/rtp/types';

const SQUAD_LABEL: Record<string, string> = {
  star: ct('Estrela'), starter: ct('Titular'), rotation: ct('Rotação'), bench: ct('Reserva'),
};
const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

export function RTPTransfer({ save, onAccept, onNegotiate, onDecline }: {
  save: RoadToProSave;
  onAccept: (offerId: string) => void;
  onNegotiate: (offerId: string) => 'raised' | 'withdrawn';
  onDecline: () => void;
}) {
  const offers = save.world.pendingOffers ?? [];
  const [msg, setMsg] = useState<string | null>(null);
  const { team, player } = save;

  const negotiate = (offerId: string) => {
    const res = onNegotiate(offerId);
    setMsg(res === 'raised' ? ct('Eles toparam — salário e bônus subiram!') : ct('A org desistiu da negociação. A proposta foi retirada.'));
  };

  return (
    <RtpFrame onExit={onDecline}>
      {/* STINGER de chegada (v15): a proposta é um MOMENTO, não uma notificação. */}
      {offers.length > 0 && (
        <div className="rtp-offer-stinger" aria-hidden>
          <span className="rtp-offer-stinger-ring"><RtpIcon name="trade" size={22} /></span>
          <span className="rtp-offer-stinger-txt">
            {offers.length > 1 ? `${offers.length} ${ct('PROPOSTAS NA MESA')}` : ct('PROPOSTA NA MESA')}
          </span>
          <span className="rtp-offer-stinger-sub">{ct('seu empresário ligou — tem org querendo você')}</span>
        </div>
      )}
      <div className="rtp-create-head">
        <h1>{ct('Janela de transferências')}</h1>
        <p>{ct('Fim de temporada. Algumas orgs colocaram propostas na mesa. Você decide o próximo passo da carreira.')}</p>
      </div>

      {/* Time atual (referência) */}
      <div className="rtp-current-team">
        <span className="rtp-ct-badge" style={{ background: `linear-gradient(135deg, ${team.colors[0]}, ${team.colors[1]})` }}>{team.tag}</span>
        <div>
          <b>{ct('Hoje')}: {team.teamName}</b>
          <span>{TIER_NAME[team.tier]} · {SQUAD_LABEL[team.squadRole]} · {money(team.contract.wage)}/{ct('sem')} · OVR {player.ovr}</span>
        </div>
      </div>

      {msg && <div className="rtp-note" style={{ marginBottom: 12 }}>{msg}</div>}

      {offers.length === 0 ? (
        <div className="dash-card"><div className="dash-card-body rtp-soon">
          {ct('Sem mais propostas. Você segue no seu time atual.')}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="rtp-cta" onClick={onDecline}>{ct('Continuar carreira')} →</button>
          </div>
        </div></div>
      ) : (
        <div className="rtp-offers">
          {offers.map((o, i) => {
            const better = o.wage > team.contract.wage;
            const stepUp = o.tier !== team.tier;
            return (
              <div key={o.id} className={`rtp-offer${o.kind === 'loan' ? ' loan' : ''}${o.clause ? ' clause' : ''}`} style={{ animationDelay: `${200 + i * 140}ms` }}>
                <div className="rtp-offer-head">
                  <span className="rtp-ct-badge sm" style={{ background: `linear-gradient(135deg, ${o.colors[0]}, ${o.colors[1]})` }}>{o.tag}</span>
                  <div className="rtp-offer-org">
                    <b>{o.orgName}</b>
                    <span>{TIER_NAME[o.tier]}{stepUp && <span className="rtp-offer-up"> <RtpIcon name="arrowUp" size={11} /> {ct('salto de tier')}</span>}</span>
                  </div>
                  {o.kind === 'loan' && <span className="rtp-offer-tag loan"><RtpIcon name="trade" size={11} /> {ct('Empréstimo')}</span>}
                  {o.clause && <span className="rtp-offer-tag clause"><RtpIcon name="spark" size={11} /> {ct('Cláusula')}</span>}
                </div>
                <p className="rtp-offer-note">"{o.note}"</p>
                <div className="rtp-offer-terms">
                  <div><span>{ct('Salário')}</span><b className={better ? 'up' : ''}>{money(o.wage)}/{ct('sem')}</b></div>
                  <div><span>{ct('Função')}</span><b>{SQUAD_LABEL[o.squadRole]}</b></div>
                  <div><span>{ct('Contrato')}</span><b>{o.weeks} {ct('sem')}</b></div>
                  <div><span>{ct('Luvas')}</span><b>{money(o.signingBonus)}</b></div>
                </div>
                <div className="rtp-offer-actions">
                  <button type="button" className="rtp-nextmatch-btn" onClick={() => onAccept(o.id)}>{ct('Aceitar')}</button>
                  <button type="button" className="rtp-btn-ghost" onClick={() => negotiate(o.id)}>{ct('Negociar (+salário)')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {offers.length > 0 && (
        <div className="rtp-footer-actions">
          <button type="button" className="rtp-btn-ghost" onClick={onDecline}>{ct('Recusar todas e ficar')}</button>
        </div>
      )}
    </RtpFrame>
  );
}
