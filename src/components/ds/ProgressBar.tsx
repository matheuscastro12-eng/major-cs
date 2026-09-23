// ProgressBar (.ds-progress): barra fina com rótulo e valor tabular. O tom
// segue a regra de cor: accent (progresso comum), achievement (rumo a uma
// conquista), win/loss/warn (medidor de resultado), ct/t (lado).
import type { ReactNode } from 'react';
import { cx } from './cx';

export function ProgressBar({ value, max = 100, label, valueText, tone = 'accent', size = 'md', className }: {
  value: number;
  max?: number;
  label?: ReactNode;
  /** texto do valor (padrão: porcentagem) */
  valueText?: string;
  tone?: 'accent' | 'win' | 'loss' | 'warn' | 'achievement' | 'ct' | 't';
  size?: 'md' | 'lg';
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const shown = valueText ?? `${Math.round(pct)}%`;
  return (
    <div className={cx('ds-progress', tone !== 'accent' && `ds-progress--${tone}`, size === 'lg' && 'ds-progress--lg', className)}>
      {(label != null || valueText != null) && (
        <div className="ds-progress__row">
          <span>{label}</span>
          <span className="ds-progress__value">{shown}</span>
        </div>
      )}
      <div
        className="ds-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={shown}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className="ds-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
