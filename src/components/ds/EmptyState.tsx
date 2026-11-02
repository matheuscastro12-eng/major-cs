// EmptyState (.ds-empty): tela vazia é convite pra agir — título diz o que
// falta, texto diz o próximo passo, e a ação resolve.
import type { ReactNode } from 'react';
import { cx } from './cx';

export function EmptyState({ icon, title, children, action, className }: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('ds-empty', className)}>
      {icon != null && <span className="ds-empty__icon" aria-hidden>{icon}</span>}
      <h3 className="ds-empty__title">{title}</h3>
      {children != null && <p className="ds-empty__text">{children}</p>}
      {action != null && <div className="ds-empty__action">{action}</div>}
    </div>
  );
}
