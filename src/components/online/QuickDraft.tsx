// Draft rápido reutilizável: escolhe N lendas do pool. Usado por Major + Gauntlet.
// Porta fiel do OnlineDraftPick.jsx.
import { useState } from 'react';
import { Button } from '../ds';
import { Flag, OvrBadge, PlayerAvatar } from '../ui';
import { RoleTag } from './bits';
import type { PoolPlayer } from './onlineData';

const ROLES = ['AWP', 'Entry', 'IGL', 'Support', 'Lurker'];

export function QuickDraft({ pool, count, title, subtitle, accent, onDone, onBack }: {
  pool: PoolPlayer[];
  count: number;
  title: string;
  subtitle: string;
  accent?: string;
  onDone: (picked: PoolPlayer[], avg: number) => void;
  onBack?: () => void;
}) {
  const top = pool.slice(0, 24);
  const [picked, setPicked] = useState<PoolPlayer[]>([]);
  const tone = accent || 'var(--rtm-green-bright)';

  const toggle = (p: PoolPlayer) => {
    if (picked.find((x) => x.nick === p.nick)) { setPicked(picked.filter((x) => x.nick !== p.nick)); return; }
    if (picked.length >= count) return;
    setPicked([...picked, p]);
  };
  const avg = picked.length ? Math.round(picked.reduce((a, p) => a + p.ovr, 0) / picked.length) : 0;
  const full = picked.length >= count;

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
        {onBack && <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--rtm-link)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>← Voltar</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-cond)', fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)', letterSpacing: '.5px' }}>{title}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--rtm-dim)', fontSize: '13.5px' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>Time · OVR médio</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: '24px', fontWeight: 800, color: full ? tone : 'var(--rtm-text-strong)' }}>{picked.length}/{count} · {avg || '—'}</div>
          </div>
          <Button variant="gold" disabled={!full} onClick={() => onDone(picked, avg)} style={{ opacity: full ? 1 : 0.5 }}>Confirmar time →</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {Array.from({ length: count }).map((_, i) => {
          const p = picked[i];
          return (
            <div key={i} style={{ flex: '1 1 0', minWidth: '120px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--rtm-radius)', background: p ? 'rgba(67,130,182,.12)' : 'var(--rtm-bg-deep)', border: `1px solid ${p ? tone : 'var(--rtm-border-soft)'}`, borderStyle: p ? 'solid' : 'dashed' }}>
              {p ? (
                <>
                  <PlayerAvatar nick={p.nick} size={28} />
                  <span style={{ minWidth: 0 }}><div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '13px', color: 'var(--rtm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nick}</div><RoleTag role={p.role} /></span>
                </>
              ) : <span style={{ fontSize: '11px', color: 'var(--rtm-faint)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{ROLES[i]}</span>}
            </div>
          );
        })}
      </div>

      <div className="rtm-pcards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(146px, 1fr))', gap: '10px' }}>
        {top.map((p) => {
          const on = !!picked.find((x) => x.nick === p.nick);
          return (
            <button key={p.nick} type="button" onClick={() => toggle(p)} disabled={!on && full} style={{ position: 'relative', textAlign: 'center', cursor: (!on && full) ? 'default' : 'pointer', background: on ? 'rgba(67,130,182,.18)' : 'var(--rtm-panel-2)', border: `1px solid ${on ? tone : 'var(--rtm-border-soft)'}`, borderRadius: 'var(--rtm-radius)', padding: '12px 8px', opacity: (!on && full) ? 0.45 : 1, transition: 'opacity .15s' }}>
              <OvrBadge ovr={p.ovr} />
              <PlayerAvatar nick={p.nick} size={42} />
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: '14px', fontWeight: 700, color: 'var(--rtm-text-strong)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nick}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '4px' }}><Flag cc={p.country} /><RoleTag role={p.role} /></div>
              {on && <div style={{ position: 'absolute', top: '6px', left: '6px', width: '20px', height: '20px', borderRadius: '50%', background: tone, color: '#06121d', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
