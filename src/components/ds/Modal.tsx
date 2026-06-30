// Modal genérico do design system em-*.
// Inclui (de graça): close via ESC, click-outside, focus-trap simples,
// retorno de foco ao gatilho, e auto-foco no primeiro elemento interativo.
//
// Uso:
//   <Modal open={open} onClose={close} title="Confirmar" size="sm"
//     footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" onClick={confirm}>Confirmar</Button></>}>
//     Texto do corpo
//   </Modal>
import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg';

// BUG FIX (caça-bugs): pilha module-level de modais abertos. Cada Modal tinha
// seu próprio listener global de ESC, então abrir um modal sobre outro e apertar
// ESC fechava TODOS de uma vez. Agora só o modal no TOPO da pilha responde ao ESC.
const modalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
  hideClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: ModalSize;
  children?: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  hideClose?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // ESC global + lock no scroll do body enquanto aberto + retorna foco no close
  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = (document.activeElement as HTMLElement) ?? null;
    // entra na pilha; só o topo responde ao ESC (evita fechar modais empilhados)
    const id = Symbol('modal');
    modalStack.push(id);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // auto-foco no primeiro tabbable do modal
    queueMicrotask(() => {
      const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      const idx = modalStack.lastIndexOf(id);
      if (idx >= 0) modalStack.splice(idx, 1);
      // só libera o scroll do body quando NENHUM modal continua aberto
      if (modalStack.length === 0) document.body.style.overflow = prevOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  // focus-trap: ao apertar Tab/Shift+Tab no primeiro/último foco, faz wrap
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const nodes = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }, []);

  const onBackdrop = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose();
  }, [closeOnBackdrop, onClose]);

  if (!open) return null;
  return (
    <div className="em-modal-backdrop" onMouseDown={onBackdrop} role="presentation">
      <div
        ref={ref}
        className={`em-modal em-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onKeyDown={onKeyDown}
      >
        {(title || !hideClose) && (
          <header className="em-modal-head">
            {title != null && <div className="em-modal-title">{title}</div>}
            {!hideClose && (
              <button type="button" className="em-modal-x" onClick={onClose} aria-label="Fechar">
                ✕
              </button>
            )}
          </header>
        )}
        <div className="em-modal-body">{children}</div>
        {footer && <footer className="em-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
