// Peças pequenas compartilhadas pelo modo Online.
import { useState, type CSSProperties, type ReactNode } from 'react';

// Campo de formulário no estilo do design (label em caps + input/controle + dica).
export function Field({ label, hint, children, style = {} }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {label != null && <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700, color: 'var(--em-muted)', marginBottom: 6 }}>{label}</label>}
      {children}
      {hint != null && <div style={{ fontSize: '11px', color: 'var(--rtm-faint)', marginTop: 5, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

// Input padrão das telas online.
export const onlineInputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px',
  background: 'var(--em-panel)', border: '1px solid var(--em-border-strong)', color: 'var(--em-text)',
  fontSize: '14px', fontFamily: 'var(--rtm-font)', outline: 'none',
};

// Controle segmentado (toggle) no estilo do design.
export function Seg({ options, value, onChange, accent = 'blue' }: {
  options: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void; accent?: 'blue' | 'gold';
}) {
  const onBg = accent === 'gold' ? 'var(--em-gold)' : 'var(--rtm-grad-btn)';
  const onColor = accent === 'gold' ? '#1a1205' : '#fff';
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'var(--em-panel)', border: '1px solid var(--em-border)', borderRadius: '6px' }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} style={{ flex: 1, cursor: 'pointer', padding: '7px 10px', borderRadius: 'var(--rtm-radius-sm)', border: 'none', fontFamily: 'var(--rtm-font-cond)', fontWeight: 700, fontSize: '13px', letterSpacing: '.5px', textTransform: 'uppercase', background: on ? onBg : 'transparent', color: on ? onColor : 'var(--em-muted)', boxShadow: on ? 'var(--rtm-shadow-btn)' : 'none', transition: 'background .12s, color .12s' }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Checkbox no estilo do design (linha clicável).
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <label onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${checked || hover ? 'var(--em-border-strong)' : 'var(--em-border)'}`, background: checked ? 'color-mix(in srgb, var(--em-gold) 14%, transparent)' : 'transparent', fontSize: '13px', color: checked ? 'var(--em-text)' : 'var(--em-muted)', transition: 'background .12s, color .12s, border-color .12s' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--em-gold)', width: 15, height: 15, flexShrink: 0 }} />
      {children}
    </label>
  );
}

export function BackBar({ onHub, onExit }: { onHub?: () => void; onExit: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
      {onHub && <button type="button" onClick={onHub} style={{ background: 'none', border: 'none', color: 'var(--rtm-link)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>← Hub online</button>}
      <button type="button" onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--rtm-faint)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>Menu</button>
    </div>
  );
}

const ROLE_COLOR: Record<string, string> = { AWP: '#d8a943', Entry: '#e25a5a', IGL: '#6fc3df', Support: '#6fd06f', Lurker: '#c792ea', Rifler: '#9fb6cd' };
export function RoleTag({ role }: { role: string }) {
  const c = ROLE_COLOR[role] ?? 'var(--em-muted)';
  return <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: c, background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`, padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>{role}</span>;
}

export const avatarHueFor = (accent?: string) => accent || 'var(--em-gold)';
