// Primitivos legados <Panel> e <Button> — reescritos pra usar tokens --em-*
// na Fase 2 do rollout. Mesma API e mesmas props: qualquer consumidor que
// importava de './ds' (Landing, Hall, Leaderboard, ManagerProfile, OnlineScreen
// etc.) recebe o visual em-* automaticamente, sem alterar markup.
//
// O barrel ./ds/ (DashCard, AppShell, Modal, ToastProvider, useToast, etc.)
// é re-exportado abaixo, mantendo a entrada estável.
export { DashCard, AppShell, AppFrame, appDashClass, useAppTheme, Modal, ToastProvider, useToast } from './ds/index';
export type { ModalSize, ToastVariant, ToastItem } from './ds/index';
import { useState, type CSSProperties, type ReactNode } from 'react';

type BtnVariant = 'primary' | 'gold' | 'danger' | 'ghost';
type BtnSize = 'sm' | 'md' | 'big';

const VARIANTS: Record<BtnVariant, { base: CSSProperties; hover: CSSProperties }> = {
  // primary = ação dominante: usa o accent dourado do em-* (alinhado com
  // .em-btn-primary do CSS e .btn.primary dos overrides do body).
  primary: { base: { background: 'var(--em-gold)', color: '#1a1205', border: '1px solid var(--em-gold)' }, hover: { filter: 'brightness(1.06)' } },
  gold:    { base: { background: 'var(--em-gold)', color: '#1a1205', border: '1px solid var(--em-gold)' }, hover: { filter: 'brightness(1.06)' } },
  danger:  { base: { background: 'var(--em-red, #c0392b)', color: '#fff', border: '1px solid var(--em-red, #c0392b)' }, hover: { filter: 'brightness(1.06)' } },
  ghost:   { base: { background: 'transparent', color: 'var(--em-muted)', border: '1px solid var(--em-border)' }, hover: { color: 'var(--em-text)', borderColor: 'var(--em-gold)', background: 'var(--em-panel-2)' } },
};
const SIZES: Record<BtnSize, CSSProperties> = {
  sm:  { padding: '6px 12px', fontSize: '0.76rem' },
  md:  { padding: '9px 18px', fontSize: '0.86rem' },
  big: { padding: '12px 26px', fontSize: '0.96rem' },
};

// Painel: agora um wrapper fino em torno do DashCard estético — superfície
// .em-panel, header com label muted (sem caps forçado), accent dourado quando
// destacado.
export function Panel({ title, actions = null, accent = 'blue', flush = false, children, style = {}, dash = false, className = '' }: {
  title?: ReactNode; actions?: ReactNode; accent?: 'blue' | 'gold' | 'none'; flush?: boolean; children?: ReactNode; style?: CSSProperties; dash?: boolean; className?: string;
}) {
  const accentColor = accent === 'gold' ? 'var(--em-gold)' : accent === 'none' ? 'transparent' : 'var(--em-border-strong)';
  // dash mantém a classe pra compatibilidade com CSS legado que tem .dash-panel
  const cls = `${dash ? 'dash-panel' : ''} ${className}`.trim();
  return (
    <section className={cls} style={{ background: 'var(--em-panel)', border: '1px solid var(--em-border)', borderRadius: '6px', overflow: 'hidden', boxShadow: 'none', color: 'var(--em-text)', ...style }}>
      {title != null && (
        <header style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--em-panel-2)', padding: '10px 14px',
          borderBottom: '1px solid var(--em-border)',
          boxShadow: `inset 3px 0 0 ${accentColor}`,
          fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700,
          letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--em-muted)',
        }}>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--em-text)' }}>{title}</span>
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
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        fontFamily: 'inherit', fontWeight: 600, letterSpacing: 0, textTransform: 'none',
        borderRadius: '5px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'background .12s, filter .12s, transform .05s, color .12s, border-color .12s',
        boxShadow: 'none',
        ...v.base, ...s, ...(hover && !disabled ? v.hover : null), ...style,
      }}
    >
      {icon}{children}
    </button>
  );
}
