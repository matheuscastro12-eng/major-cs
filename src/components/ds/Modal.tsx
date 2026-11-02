// Modal genérico do design system em-*.
// Inclui (de graça): close via ESC, click-outside, focus-trap simples,
// retorno de foco ao gatilho, e auto-foco no primeiro elemento interativo.
//
// Uso:
//   <Modal open={open} onClose={close} title="Confirmar" size="sm"
//     footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" onClick={confirm}>Confirmar</Button></>}>
//     Texto do corpo
//   </Modal>
import { useCallback, type MouseEvent, type ReactNode } from 'react';
import { useOverlay } from './useOverlay';

export type ModalSize = 'sm' | 'md' | 'lg';

// ESC do topo da pilha, trava de scroll, auto-foco, focus-trap e retorno de
// foco vivem em useOverlay (dividido com o Sheet).
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
  const { ref, onKeyDown } = useOverlay<HTMLDivElement>(open, onClose);

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

