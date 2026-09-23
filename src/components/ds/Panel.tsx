// Panel e Card do design system (.ds-panel / .ds-card).
// Panel = bloco de gestão "Desk" com cabeçalho em caps condensado e a luz de
// tally (traço à esquerda do título). Card = unidade clicável ou de conteúdo
// dentro de um painel ou grade.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  /** accent = painel em foco na tela; achievement = conquista (troféu, título) */
  tone?: 'default' | 'accent' | 'achievement';
  flush?: boolean;
  /** nível do heading do título (padrão h2) */
  headingLevel?: 2 | 3 | 4;
}

export function Panel({ title, actions, tone = 'default', flush = false, headingLevel = 2, className, children, ...rest }: PanelProps) {
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <section className={cx('ds-panel', tone !== 'default' && `ds-panel--${tone}`, flush && 'ds-panel--flush', className)} {...rest}>
      {(title != null || actions != null) && (
        <header className="ds-panel__head">
          {title != null && <H className="ds-panel__title">{title}</H>}
          {actions != null && <div className="ds-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="ds-panel__body">{children}</div>
    </section>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
}

export function Card({ selected = false, className, children, ...rest }: CardProps) {
  return (
    <div className={cx('ds-card', selected && 'ds-card--selected', className)} {...rest}>
      {children}
    </div>
  );
}

/** Card clicável: é um <button> de verdade (teclado e leitor de tela, UX-12). */
export function CardButton({ selected = false, className, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button type={type} aria-pressed={selected || undefined} className={cx('ds-card', 'ds-card--interactive', selected && 'ds-card--selected', className)} {...rest}>
      {children}
    </button>
  );
}
