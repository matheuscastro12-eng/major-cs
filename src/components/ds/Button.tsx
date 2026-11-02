// Button do design system "Broadcast Desk" (src/styles/primitives.css, .ds-btn).
// Hover, foco e pressionado são CSS puro — sem useState de hover (UX-10) — e o
// alvo cresce pra 44px em tela de toque. Variantes:
//   primary     → a ação principal da tela, no acento do modo (uma por tela)
//   secondary   → ações comuns
//   ghost       → ação terciária, barra de ferramentas
//   danger      → destrutiva (demitir, apagar save)
//   achievement → dourado de conquista/premium; nunca como botão comum (UX-03)
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'achievement';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** botão só com ícone: exige aria-label */
  iconOnly?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block = false, icon, iconRight, iconOnly = false, loading = false, className, children, type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('ds-btn', `ds-btn--${variant}`, size !== 'md' && `ds-btn--${size}`, block && 'ds-btn--block', iconOnly && 'ds-btn--icon', className)}
      {...rest}
    >
      {loading ? <span className="ds-btn__spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});
