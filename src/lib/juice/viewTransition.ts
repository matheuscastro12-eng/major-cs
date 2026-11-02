// Helper de View Transitions (ULTRAPLAN §4: transição entre o hub e os modos).
// Onde document.startViewTransition existe, a troca de tela ganha o
// crossfade/morph do browser; onde não existe (Firefox antigo, Safari < 18)
// ou com reduced-motion, a atualização roda direto, sem animação — o
// resultado final é idêntico, só a transição some.
//
// Com React, envolva o setState que troca a tela em flushSync para o DOM
// estar atualizado quando o browser tirar o "depois":
//   withViewTransition(() => flushSync(() => setScreen('rtp')));

import { prefersReducedMotion } from './prefs';

type UpdateFn = () => void | Promise<void>;

interface ViewTransitionLike {
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  ready: Promise<void>;
  skipTransition(): void;
}

type StartVT = (cb: UpdateFn) => ViewTransitionLike;

export interface ViewTransitionOptions {
  /**
   * Classe posta no <html> durante a transição, para CSS específico
   * (ex.: 'vt-forward' / 'vt-back' mudando a direção do slide).
   */
  className?: string;
  /** Ignora reduced-motion (quase nunca: só para transições sem movimento). */
  force?: boolean;
}

export function viewTransitionsSupported(): boolean {
  return typeof document !== 'undefined'
    && typeof (document as Document & { startViewTransition?: StartVT }).startViewTransition === 'function';
}

/**
 * Roda `update` dentro de uma View Transition quando possível. Resolve
 * quando a transição termina (ou logo após o update, no fallback). Erro no
 * update propaga; erro da transição em si (ex.: pulada) é engolido.
 */
export async function withViewTransition(update: UpdateFn, opts: ViewTransitionOptions = {}): Promise<void> {
  const reduce = !opts.force && prefersReducedMotion();
  if (!viewTransitionsSupported() || reduce) {
    await update();
    return;
  }
  const root = document.documentElement;
  if (opts.className) root.classList.add(opts.className);
  try {
    const start = (document as Document & { startViewTransition: StartVT }).startViewTransition.bind(document);
    const vt = start(update);
    // updateCallbackDone rejeita se o próprio update falhou: propaga.
    await vt.updateCallbackDone;
    await vt.finished.catch(() => {});
  } finally {
    if (opts.className) root.classList.remove(opts.className);
  }
}
