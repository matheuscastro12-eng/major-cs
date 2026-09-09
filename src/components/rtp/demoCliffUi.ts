// [W1] utilitários de UI do cliffhanger (fora do arquivo de componentes por
// causa do fast-refresh): relógio de parede pro countdown e o CTA com a
// atribuição própria do gancho.

import { useEffect, useState } from 'react';
import { setCheckoutSrc } from '../../state/track';

// relógio de parede pro countdown (tick a cada 30s — o prazo é em horas).
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

// O CTA do gancho: atribuição própria ('rtp-demo-cliff') pra medir contra a
// trava antiga ('rtp-demo'). First-touch: quem clicou aqui primeiro fica aqui.
export function goUpgradeFromCliff(onUpgrade: () => void): void {
  setCheckoutSrc('rtp-demo-cliff');
  onUpgrade();
}
