// Comportamento comum de sobreposição (Modal e Sheet): ESC fecha só o do topo
// da pilha, trava o scroll do body, foca o primeiro controle ao abrir, prende o
// Tab dentro e devolve o foco ao gatilho ao fechar.
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

// BUG FIX (caça-bugs): pilha module-level de sobreposições abertas. Cada Modal
// tinha seu próprio listener global de ESC, então abrir um modal sobre outro e
// apertar ESC fechava TODOS de uma vez. Agora só o do TOPO responde ao ESC —
// e Modal e Sheet dividem a mesma pilha.
const overlayStack: symbol[] = [];

export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useOverlay<E extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<E | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // BUG FIX (teclado fecha a cada tecla): este effect NÃO pode depender de
  // `onClose`. Quem consome costuma passar uma função recriada a cada render;
  // se `onClose` estivesse nas deps, cada tecla digitada num input re-rodava o
  // effect e o auto-foco roubava o foco de volta pro primeiro campo — no mobile
  // isso fecha o teclado. Só roda em [open]; o ESC lê o onClose atual via ref.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = (document.activeElement as HTMLElement) ?? null;
    const id = Symbol('overlay');
    overlayStack.push(id);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && overlayStack[overlayStack.length - 1] === id) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => {
      const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      const idx = overlayStack.lastIndexOf(id);
      if (idx >= 0) overlayStack.splice(idx, 1);
      // só libera o scroll do body quando NENHUMA sobreposição continua aberta
      if (overlayStack.length === 0) document.body.style.overflow = prevOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [open]);

  // focus-trap: Tab/Shift+Tab no primeiro/último foco faz wrap
  const onKeyDown = useCallback((e: KeyboardEvent<E>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const nodes = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }, []);

  return { ref, onKeyDown };
}
