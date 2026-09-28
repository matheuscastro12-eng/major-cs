// Skeleton (.ds-skeleton): placeholder no FORMATO da tela enquanto carrega.
// aria-hidden: quem anuncia o carregamento é o container (aria-busy).
import type { CSSProperties } from 'react';
import { cx } from './cx';

export function Skeleton({ variant = 'block', width, height, className, style }: {
  variant?: 'text' | 'block' | 'circle';
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cx('ds-skeleton', variant !== 'block' && `ds-skeleton--${variant}`, className)}
      style={{ width, height, ...style }}
    />
  );
}
