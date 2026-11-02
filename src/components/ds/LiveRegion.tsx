// Região aria-live central (O1-53): um único anunciador pro app inteiro.
// Resultado de round, pack aberto, vitória no ranked: chame announce('...')
// de qualquer lugar e o leitor de tela lê, sem cada tela montar a sua região.
import { useEffect, useState } from 'react';

type Listener = (msg: string, urgent: boolean) => void;
const listeners = new Set<Listener>();

/** Anuncia uma mensagem pro leitor de tela. urgent=true interrompe (assertive). */
export function announce(msg: string, urgent = false): void {
  listeners.forEach((fn) => fn(msg, urgent));
}

/** Montar UMA vez (App). Duas regiões: educada e urgente. */
export function LiveRegion() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  useEffect(() => {
    const fn: Listener = (msg, urgent) => {
      // limpa e reescreve no próximo frame: repetir a mesma frase também é lido
      const set = urgent ? setAssertive : setPolite;
      set('');
      requestAnimationFrame(() => set(msg));
    };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return (
    <>
      <div className="ds-sr-only" role="status" aria-live="polite" aria-atomic="true">{polite}</div>
      <div className="ds-sr-only" role="alert" aria-live="assertive" aria-atomic="true">{assertive}</div>
    </>
  );
}
