// ScarPills (W4) — pills dos traits ADQUIRIDOS do técnico, com tooltip
// (origem + efeito + prazo). Só leitura: recebe a lista do save e o split
// atual pra separar ativo de expirado (expirado aparece apagado se `showExpired`).

import { activeScars, describeScarEffects, describeScarTerm, type CoachScar } from '../../engine/career/scars';
import { ct } from '../../state/career-i18n';

interface Props {
  scars: CoachScar[] | undefined;
  split: number;
  showExpired?: boolean;
  compact?: boolean;
}

export function ScarPills({ scars, split, showExpired = false, compact = false }: Props) {
  const list = showExpired ? (scars ?? []) : activeScars(scars, split);
  if (list.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.map((s, i) => {
        const active = s.expires == null || s.expires >= split;
        const color = s.tone === 'good' ? 'var(--em-green)' : 'var(--em-red)';
        const tip = [
          `${s.name} — ${s.description}`,
          `${ct('Origem:')} ${s.origin}`,
          ...describeScarEffects(s).map((e) => `• ${e}`),
          `${ct('Prazo:')} ${describeScarTerm(s, split)}`,
        ].join('\n');
        return (
          <span
            key={`${s.id}-${s.since}-${i}`}
            title={tip}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: compact ? '2px 8px' : '4px 10px', borderRadius: 999,
              border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
              color: active ? 'var(--em-text)' : 'var(--em-muted)',
              fontSize: compact ? '0.68rem' : '0.74rem', fontWeight: 600,
              opacity: active ? 1 : 0.55, cursor: 'help', whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            {s.name}
            <span style={{ fontSize: '0.6rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
              S{s.since}{s.expires != null ? `→${s.expires}` : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}
