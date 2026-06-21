// Peças pequenas compartilhadas pelo modo Online.

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
  const c = ROLE_COLOR[role] ?? 'var(--rtm-dim)';
  return <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: c, background: `color-mix(in srgb, ${c} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`, padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>{role}</span>;
}

export const avatarHueFor = (accent?: string) => accent || '#4382b6';
