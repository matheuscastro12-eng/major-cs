// InfoTip (.ds-infotip): o "por quê" de uma mecânica, tocável. Substitui o
// atributo title=, que não aparece no toque (UX-12). Abre no toque/clique e
// no hover/foco do desktop; fecha no ESC, no clique fora e ao perder o foco.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';

export function InfoTip({ children, label = 'Mais informações', align = 'center', placement = 'above', className }: {
  /** o texto da explicação */
  children: ReactNode;
  /** nome acessível do botão "i" */
  label?: string;
  align?: 'start' | 'center' | 'end';
  placement?: 'above' | 'below';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // aberto por toque/clique: não fecha ao tirar o mouse
  const wrap = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setPinned(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setPinned(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={cx('ds-infotip', align !== 'center' && `ds-infotip--${align}`, placement === 'below' && 'ds-infotip--below', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
    >
      <button
        type="button"
        className="ds-infotip__btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => { const next = !(open && pinned); setOpen(next); setPinned(next); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false); }}
      >
        i
      </button>
      {open && <span id={id} role="tooltip" className="ds-infotip__pop">{children}</span>}
    </span>
  );
}
