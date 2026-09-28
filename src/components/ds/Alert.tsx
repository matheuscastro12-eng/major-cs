// Alert (.ds-alert): mensagem em linha com tom. danger/warn anunciam na hora
// (role=alert); info/success são educados (role=status). Erro diz o que houve
// e como resolver, sem pedir desculpa.
import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { cx } from './cx';

export type AlertTone = 'info' | 'success' | 'warn' | 'danger';

const ICON: Record<AlertTone, ReactNode> = {
  info: <Info size={18} aria-hidden />,
  success: <CircleCheck size={18} aria-hidden />,
  warn: <TriangleAlert size={18} aria-hidden />,
  danger: <CircleX size={18} aria-hidden />,
};

export function Alert({ tone = 'info', title, children, action, className }: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** botão/link à direita (ex.: "Tentar de novo") */
  action?: ReactNode;
  className?: string;
}) {
  const urgent = tone === 'danger' || tone === 'warn';
  return (
    <div role={urgent ? 'alert' : 'status'} className={cx('ds-alert', tone !== 'info' && `ds-alert--${tone}`, className)}>
      <span className="ds-alert__icon">{ICON[tone]}</span>
      <div className="ds-alert__body">
        {title != null && <strong className="ds-alert__title">{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}
