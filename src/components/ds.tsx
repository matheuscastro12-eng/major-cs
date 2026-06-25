// Componentes do "Road to Major — Design System", portados literalmente do
// design kit (componente a componente) para uso no app real. Mantêm os tokens
// --rtm-* e o visual exatos do design. Reutilizados em todas as telas re-skinadas.
import { useState, type CSSProperties, type ReactNode } from 'react';

type BtnVariant = 'primary' | 'gold' | 'danger' | 'ghost';
type BtnSize = 'sm' | 'md' | 'big';

const VARIANTS: Record<BtnVariant, { base: CSSProperties; hover: CSSProperties }> = {
  primary: { base: { background: 'var(--rtm-grad-btn)', color: '#fff', border: 'none', boxShadow: 'var(--rtm-shadow-btn)' }, hover: { background: 'var(--rtm-grad-btn-hover)' } },
  gold: { base: { background: 'var(--rtm-gold-soft)', color: '#1a1205', border: 'none', boxShadow: 'var(--rtm-shadow-btn)' }, hover: { background: 'var(--rtm-gold)' } },
  danger: { base: { background: '#7d2f2f', color: '#fff', border: 'none', boxShadow: 'var(--rtm-shadow-btn)' }, hover: { background: 'var(--rtm-red)' } },
  ghost: { base: { background: 'transparent', color: 'var(--rtm-dim)', border: '1px solid var(--rtm-border)' }, hover: { color: 'var(--rtm-text-strong)', borderColor: 'var(--rtm-blue-bright)' } },
};
const SIZES: Record<BtnSize, CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: '12px' },
  md: { padding: '9px 20px', fontSize: '14px' },
  big: { padding: '13px 34px', fontSize: '16px' },
};

// Painel: a superfície base do design com a faixa de accent (azul/ouro) no header.
export function Panel({ title, actions = null, accent = 'blue', flush = false, children, style = {}, dash = false, className = '' }: {
  title?: ReactNode; actions?: ReactNode; accent?: 'blue' | 'gold' | 'none'; flush?: boolean; children?: ReactNode; style?: CSSProperties; dash?: boolean; className?: string;
}) {
  const accentColor = accent === 'gold' ? 'var(--rtm-gold)' : accent === 'none' ? 'transparent' : 'var(--rtm-blue)';
  return (
    <section className={`${dash ? 'dash-panel' : ''} ${className}`.trim()} style={{ background: 'var(--rtm-panel)', border: '1px solid var(--rtm-border-soft)', borderRadius: 'var(--rtm-radius)', overflow: 'hidden', boxShadow: 'var(--rtm-shadow-panel)', ...style }}>
      {title != null && (
        <header style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--rtm-grad-panel-head)', padding: '10px 14px', borderBottom: '1px solid var(--rtm-border-soft)', boxShadow: `inset 3px 0 0 ${accentColor}`, fontFamily: 'var(--rtm-font-cond)', fontSize: '14px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{title}</span>
          <span style={{ flex: 1 }} />
          {actions}
        </header>
      )}
      <div style={{ padding: flush ? 0 : '14px' }}>{children}</div>
    </section>
  );
}

export function Button({ variant = 'primary', size = 'md', disabled = false, icon = null, children, style = {}, onClick, title }: {
  variant?: BtnVariant; size?: BtnSize; disabled?: boolean; icon?: ReactNode; children?: ReactNode; style?: CSSProperties; onClick?: () => void; title?: string;
}) {
  const [hover, setHover] = useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        fontFamily: 'var(--rtm-font-cond)', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase',
        borderRadius: 'var(--rtm-radius)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'background .12s, box-shadow .12s, transform .05s, color .12s, border-color .12s',
        ...v.base, ...s, ...(hover && !disabled ? v.hover : null), ...style,
      }}
    >
      {icon}{children}
    </button>
  );
}
