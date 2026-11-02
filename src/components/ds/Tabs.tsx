// Tabs acessíveis (.ds-tabs): role=tablist, setas ←/→, Home/End, e o traço do
// acento embaixo da aba ativa. Controlado: quem usa guarda o valor.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export function Tabs<V extends string>({ items, value, onChange, label, className, idPrefix = 'tab' }: {
  items: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  /** nome do grupo de abas pro leitor de tela */
  label: string;
  className?: string;
  /** prefixo dos ids (aba = `${idPrefix}-${value}`, painel = `${idPrefix}-panel-${value}`) */
  idPrefix?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = items.findIndex((it) => it.value === value);
    const pos = enabled.indexOf(cur);
    let next = -1;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={cx('ds-tabs', className)} onKeyDown={onKeyDown}>
      {items.map((it, i) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => { refs.current[i] = el; }}
            id={`${idPrefix}-${it.value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${it.value}`}
            tabIndex={on ? 0 : -1}
            disabled={it.disabled}
            className="ds-tab"
            onClick={() => onChange(it.value)}
          >
            {it.icon}
            {it.label}
            {it.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Painel de uma aba — liga aria-labelledby à aba certa. */
export function TabPanel({ value, idPrefix = 'tab', children, className }: { value: string; idPrefix?: string; children?: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-${value}`} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
