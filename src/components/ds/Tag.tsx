// Tag, Badge e LiveBadge (.ds-tag / .ds-badge / .ds-live).
// Tag = rótulo curto em caps com o chanfro de scorebug. O tom diz o que é:
// accent (novo/destaque), win/loss (resultado), achievement (conquista),
// ct/t (lado), epic (raro), warn (atenção). Badge = contador numérico.
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type TagTone = 'neutral' | 'accent' | 'solid' | 'win' | 'loss' | 'warn' | 'achievement' | 'ct' | 't' | 'epic';

export function Tag({ tone = 'neutral', icon, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone; icon?: ReactNode }) {
  return (
    <span className={cx('ds-tag', tone !== 'neutral' && `ds-tag--${tone}`, className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}

export function Badge({ tone = 'accent', className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: 'accent' | 'loss' | 'muted' }) {
  return (
    <span className={cx('ds-badge', tone !== 'accent' && `ds-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}

/** Faixa AO VIVO de transmissão (vermelho + ponto pulsando). */
export function LiveBadge({ children = 'Ao vivo', className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('ds-live', className)} {...rest}>
      {children}
    </span>
  );
}
