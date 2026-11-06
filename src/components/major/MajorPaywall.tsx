// Trava do Major Singapura / Pick'em para quem não tem a vitalícia (flag do
// paywall, state/paywallGate.ts — padrão OFF). A vitrine e o Stage 1 seguem
// grátis; daqui pra frente o card mostra o benefício, o preço do servidor e
// abre o checkout por cima da tela (UpsellCard via rtm:upsell, Pix primeiro).
import { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Button, Panel } from '../ds';
import { setCheckoutSrc, trackPaywallView } from '../../state/track';
import { priceLabel, usePrice } from '../../state/price';
import { FounderCounter } from '../FounderCounter';

export type MajorGateSrc = 'major-sg-gate' | 'major-pickem-gate';

const COPY: Record<MajorGateSrc, { title: string; body: string }> = {
  'major-sg-gate': {
    title: 'Libere o resto do Major',
    body: 'Continue a campanha até a final com o seu time, com o save na nuvem e sem limite de Majors.',
  },
  'major-pickem-gate': {
    title: 'Libere o pick\'em completo',
    body: 'Stage 2, Stage 3, a chave dos playoffs e o envio pro ranking do pick\'em ficam liberados pra sempre.',
  },
};

export function MajorPaywall({ src }: { src: MajorGateSrc }) {
  usePrice(); // re-renderiza quando o preço do servidor chega (nada fixo no código)
  useEffect(() => { trackPaywallView(src, { paywallGate: 'on' }); }, [src]);
  const c = COPY[src];
  const open = () => {
    setCheckoutSrc(src);
    window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: src, force: true } }));
  };
  return (
    <Panel title={c.title} accent="gold">
      <p className="msg-muted"><Lock size={14} aria-hidden /> {c.body}</p>
      <div className="msg-toolbar">
        <Button variant="primary" onClick={open}>Liberar com a vitalícia · {priceLabel()}</Button>
      </div>
      <p className="msg-muted">Pagamento único · Pix ou cartão</p>
      {/* funil: trava nova (paywallGate ligada em 02/11) — 95 paywall_view em 5
          dias e NENHUM clique chegou a abrir o UpsellCard (moment ausente nos
          paywall_view de upsell-card desde então). É a única trava de venda do
          jogo sem a prova social real do FounderCounter — todas as outras
          (home-rtp, acct-chip-guest, mkt-lock, ultimate-guest, wl-free,
          upsell-card) já mostram. Alinha esta ao padrão. */}
      <FounderCounter style={{ marginTop: 2 }} />
    </Panel>
  );
}
