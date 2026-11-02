// Sheet (.ds-sheet): bottom sheet no celular, diálogo centrado a partir de
// 640px. É o substituto dos modais centralizados no mobile (ULTRAPLAN §4.5).
// Comportamento de sobreposição (ESC, foco, trava de scroll) em useOverlay.
import { useId, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useOverlay } from './useOverlay';
import { cx } from './cx';

export function Sheet({ open, onClose, title, children, footer, size = 'md', closeOnScrim = true, closeLabel = 'Fechar' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  closeOnScrim?: boolean;
  closeLabel?: string;
}) {
  const { ref, onKeyDown } = useOverlay<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const onScrim = (e: MouseEvent<HTMLDivElement>) => {
    if (closeOnScrim && e.target === e.currentTarget) onClose();
  };
  return createPortal(
    <div className="ds-sheet-scrim" onMouseDown={onScrim} role="presentation">
      <div ref={ref} className={cx('ds-sheet', size === 'lg' && 'ds-sheet--lg')} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <span className="ds-sheet__grip" aria-hidden />
        <header className="ds-sheet__head">
          <h2 id={titleId} className="ds-sheet__title">{title}</h2>
          <button type="button" className="ds-btn ds-btn--ghost ds-btn--icon" onClick={onClose} aria-label={closeLabel}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="ds-sheet__body">{children}</div>
        {footer != null && <footer className="ds-sheet__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
