// [A/B oferta · variante B] CTA "Pagar com Pix" direto no card de oferta:
// benefício claro, preço do servidor (PIX_PRICE_CENTS via /api/account →
// usePrice) e vagas de Fundador SÓ se houver (dado real do /api/account).
import { Zap } from 'lucide-react';
import { ct } from '../state/career-i18n';
import { usePrice } from '../state/price';
import { useFounders } from '../state/founders';
import { foundersLeft } from '../state/offerAb';
import '../styles/pix-panel.css';

export function OfferPixCta({ onPix, benefit, compact = false, showFounders = true }: { onPix: () => void; benefit?: string; compact?: boolean; /** false onde o FounderCounter já aparece no card */ showFounders?: boolean }) {
  const price = usePrice();
  const stats = useFounders();
  const left = showFounders ? foundersLeft(stats) : null;
  return (
    <div className="offer-pix" data-offer-variant="B">
      <p className="offer-pix__benefit">{benefit ?? ct('Road to Pro completo, save na nuvem e 5 carreiras. Pagou, liberou na hora.')}</p>
      <button type="button" className={`btn gold ${compact ? '' : 'big'} offer-pix__btn`} style={{ width: '100%' }} onClick={onPix}>
        <Zap size={16} aria-hidden /> {ct('Pagar com Pix')} · {price}
      </button>
      <small className="offer-pix__meta">
        {ct('pagamento único · sem mensalidade')}
        {left != null && <> · <b>{left} {ct(left === 1 ? 'vaga de Fundador restante' : 'vagas de Fundador restantes')}</b></>}
      </small>
    </div>
  );
}
