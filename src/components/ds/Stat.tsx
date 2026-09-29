// Stat (.ds-stat): número tabular grande + rótulo em caps. Pra OVR, caixa,
// K/D, pontos. delta mostra variação com a cor de resultado.
import type { ReactNode } from 'react';
import { cx } from './cx';

export function Stat({ label, value, delta, hint, size = 'md', className }: {
  label: ReactNode;
  value: ReactNode;
  /** número positivo = verde (sobe), negativo = vermelho; string é mostrada crua */
  delta?: number | string;
  hint?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dir = typeof delta === 'number' ? (delta > 0 ? 'up' : delta < 0 ? 'down' : null) : null;
  const deltaText = typeof delta === 'number' ? `${delta > 0 ? '+' : ''}${delta}` : delta;
  return (
    <div className={cx('ds-stat', size !== 'md' && `ds-stat--${size}`, className)}>
      <span className="ds-stat__label">{label}</span>
      <span className="ds-stat__value">{value}</span>
      {delta != null && <span className={cx('ds-stat__delta', dir && `ds-stat__delta--${dir}`)}>{deltaText}</span>}
      {hint != null && <span className="ds-stat__hint">{hint}</span>}
    </div>
  );
}
