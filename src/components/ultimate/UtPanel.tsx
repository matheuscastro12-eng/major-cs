// Card estilo BUT/Brasval: acento colorido no topo-esquerdo, label caps
// condensada, slot à direita e círculo "i" de info. Ver styles/ultimate.css.
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export function UtPanel({
  label,
  icon,
  info,
  right,
  accent = 'red',
  flush = false,
  children,
  className = '',
}: {
  label: ReactNode;
  icon?: ReactNode;
  info?: string;
  right?: ReactNode;
  accent?: 'red' | 'green' | 'amber' | 'purple';
  flush?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ut-panel ut-panel--${accent} ${className}`.trim()}>
      <header className="ut-panel__head">
        {icon}
        <span className="ut-panel__label">{label}</span>
        {right && <span className="ut-panel__right">{right}</span>}
        {info && (
          <span className="ut-panel__info" title={info} aria-label={info}>
            <Info size={11} strokeWidth={2.5} />
          </span>
        )}
      </header>
      <div className={`ut-panel__body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

// Empty-state padrão dos cards (ícone + título + descrição, centralizado).
export function UtEmpty({ icon, title, sub, accent }: { icon: ReactNode; title: string; sub: string; accent?: string }) {
  return (
    <div className="ut-empty">
      {accent && <div className="ut-empty__accent">{accent}</div>}
      <span className="ut-empty__icon">{icon}</span>
      <div className="ut-empty__title">{title}</div>
      <div className="ut-empty__sub">{sub}</div>
    </div>
  );
}
