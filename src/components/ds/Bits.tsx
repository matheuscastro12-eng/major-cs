// Peças pequenas da "nova interface": selo de OVR dourado, barra fina,
// chip de função (cor da função do CS), avatar com anel da função e linha de
// lista estilo FM. Só classes .ds-* (primitives.css) e tokens.
import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

const ROLE_VAR: Record<string, string> = {
  Rifler: 'var(--c-role-rifler)', Entry: 'var(--c-role-entry)', AWP: 'var(--c-role-awp)',
  IGL: 'var(--c-role-igl)', Support: 'var(--c-role-support)', Lurker: 'var(--c-role-lurker)',
};
export function roleColor(role?: string): string { return ROLE_VAR[role ?? ''] ?? 'var(--c-ink-dim)'; }

export function Ovr({ value, size = 'md', className }: { value: number | string; size?: 'sm' | 'md'; className?: string }) {
  return <span className={cx('ds-ovr', size === 'sm' && 'ds-ovr--sm', className)} aria-label={`OVR ${value}`}>{value}</span>;
}

/** barra fina 0–100; tone = cor (token) ou 'gold' */
export function Bar({ value, tone, lg = false, label }: { value: number; tone?: string; lg?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const gold = tone === 'gold';
  return (
    <span className={cx('ds-bar', gold && 'ds-bar--gold', lg && 'ds-bar--lg')} role={label ? 'img' : undefined} aria-label={label}>
      <i style={{ width: `${pct}%`, ...(tone && !gold ? { '--bar': tone } as CSSProperties : null) }} />
    </span>
  );
}

export function RoleChip({ role, children }: { role?: string; children?: ReactNode }) {
  return <span className="ds-chip" style={{ '--chip': roleColor(role) } as CSSProperties}>{children ?? role}</span>;
}

export function Chip({ color, children }: { color?: string; children: ReactNode }) {
  return <span className="ds-chip" style={color ? ({ '--chip': color } as CSSProperties) : undefined}>{children}</span>;
}

export function Avatar({ name, role, size = 44, ring }: { name: string; role?: string; size?: number; ring?: string }) {
  return (
    <span className="ds-avatar" aria-hidden style={{ '--av': `${size}px`, '--ring': ring ?? roleColor(role) } as CSSProperties}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
