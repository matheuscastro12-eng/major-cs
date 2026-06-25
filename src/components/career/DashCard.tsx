import type { ReactNode } from 'react';

export function DashCard({ title, info, actions, flush, children, className = '' }: {
  title?: ReactNode;
  info?: string;
  actions?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dash-card ${className}`.trim()}>
      {title != null && (
        <header className="dash-card-head">
          <b>{title}</b>
          <span style={{ flex: 1 }} />
          {actions}
          {info && <span className="dash-info" title={info}>i</span>}
        </header>
      )}
      <div className={`dash-card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}
