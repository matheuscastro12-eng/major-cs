// Card da oferta inicial do Ultimate ([U08]). Não renderiza nada enquanto
// starterOfferVisibility() !== 'visible' — hoje: flag OFF, enabled=false e sem
// preço, então fica sempre invisível. O jogador escolhe UMA das opções.
import { useState } from 'react';
import { Gift } from 'lucide-react';
import { STARTER_OFFER, formatBRL, starterOfferVisibility, type OrderLike, type StarterOfferOption } from '../../engine/ultimate/starterOffer';
import { ct } from '../../state/career-i18n';

export function UltimateStarterOffer({ orders, matchesPlayed, onBuy }: { orders: OrderLike[]; matchesPlayed: number; onBuy: (opt: StarterOfferOption['id']) => void }) {
  const [pick, setPick] = useState<StarterOfferOption['id']>(STARTER_OFFER.options[0].id);
  if (starterOfferVisibility(STARTER_OFFER, orders, matchesPlayed) !== 'visible' || STARTER_OFFER.priceCents == null) return null;
  return (
    <div className="ut-coinshop ut-starter" data-offer="starter">
      <div className="ut-coinshop__head">
        <span className="ut-coinshop__title"><Gift size={14} /> {ct('Oferta inicial')}</span>
        <span className="ut-coinshop__sub">{ct('Uma vez por conta · escolha um')}</span>
      </div>
      <div className="ut-coinshop__grid">
        {STARTER_OFFER.options.map((o) => (
          <button key={o.id} type="button" className={`ut-coinpack${pick === o.id ? ' is-best' : ''}`} aria-pressed={pick === o.id} onClick={() => setPick(o.id)}>
            <span className="ut-coinpack__name">{ct(o.name)}</span>
            <span className="ut-coinpack__bonus is-base">{ct(o.desc)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="ut-coinpack is-best" onClick={() => onBuy(pick)}>
        <span className="ut-coinpack__price">{ct('Levar')} · {formatBRL(STARTER_OFFER.priceCents)}</span>
      </button>
    </div>
  );
}
