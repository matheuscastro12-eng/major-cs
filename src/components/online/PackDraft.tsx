// Draft "estilo Major" (pacotes/cartas) reutilizável, montado a partir de um
// pool de jogadores. Cada rodada abre um pacote e o jogador escolhe 1 carta.
// Usado pelo Gauntlet (e pronto pra outros modos solo).
import { useMemo, useState } from 'react';
import { Panel } from '../ds';
import { Flag, OvrBadge, PlayerAvatar } from '../ui';
import { RoleTag } from './bits';
import type { PoolPlayer } from './onlineData';

const ROLE_KEYS: { role: string; label: string }[] = [
  { role: 'AWP', label: 'AWP' },
  { role: 'IGL', label: 'IGL' },
  { role: 'Entry', label: 'Entry' },
];

export function PackDraft({ pool, count = 5, title, subtitle, accent, onBack, onDone }: {
  pool: PoolPlayer[];
  count?: number;
  title: string;
  subtitle: string;
  accent?: string;
  onBack?: () => void;
  onDone: (picked: PoolPlayer[], avg: number) => void;
}) {
  const tone = accent || 'var(--rtm-gold)';
  // monta `count` pacotes de 5 cartas distintas a partir do topo do pool
  const packs = useMemo(() => {
    const top = pool.slice(0, count * 5);
    return Array.from({ length: count }, (_, i) => top.slice(i * 5, i * 5 + 5));
  }, [pool, count]);

  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<PoolPlayer[]>([]);
  const [revealed, setRevealed] = useState(false);

  const pack = packs[round] ?? [];
  const avg = picked.length ? Math.round(picked.reduce((a, p) => a + p.ovr, 0) / picked.length) : 0;
  const rolesPresent = new Set(picked.map((p) => p.role));

  const pick = (p: PoolPlayer) => {
    const next = [...picked, p];
    setPicked(next);
    if (next.length >= count) {
      onDone(next, Math.round(next.reduce((a, x) => a + x.ovr, 0) / next.length));
      return;
    }
    setRound((r) => r + 1);
    setRevealed(false);
  };

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
        {onBack && <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--rtm-link)', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>← Voltar</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--rtm-font-cond)', fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)', letterSpacing: '.5px' }}>{title}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--rtm-dim)', fontSize: '13.5px' }}>{subtitle}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--rtm-dim)', fontWeight: 700 }}>Time · OVR médio</div>
          <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '24px', fontWeight: 800, color: tone }}>{picked.length}/{count} · {avg || '—'}</div>
        </div>
      </div>

      <Panel title={`Pacote ${Math.min(round + 1, count)} de ${count}`} accent="gold" style={{ marginBottom: '16px' }}>
        {!revealed ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <button type="button" onClick={() => setRevealed(true)} style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '26px 44px', borderRadius: 'var(--rtm-radius)', background: 'linear-gradient(160deg, rgba(216,169,67,.18), rgba(13,17,22,.5))', border: `1px solid ${tone}` }}>
              <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: 'var(--rtm-gold)' }}>RTM</span>
              <b style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--rtm-text-strong)' }}>Abrir cartas</b>
              <small style={{ fontSize: '11px', color: 'var(--rtm-dim)' }}>5 opções · escolha 1</small>
            </button>
            <p style={{ color: 'var(--rtm-dim)', fontSize: '13px', marginTop: '14px' }}>As cinco cartas do pacote serão reveladas. Escolha uma para o seu elenco.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
            {pack.map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p)} style={{ position: 'relative', textAlign: 'center', cursor: 'pointer', background: 'var(--rtm-panel-2)', border: '1px solid var(--rtm-border-soft)', borderRadius: 'var(--rtm-radius)', padding: '12px 8px' }}>
                <OvrBadge ovr={p.ovr} />
                <PlayerAvatar nick={p.nick} size={44} />
                <div style={{ fontFamily: 'var(--rtm-font-cond)', fontSize: '14px', fontWeight: 700, color: 'var(--rtm-text-strong)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nick}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '4px' }}><Flag cc={p.country} /><RoleTag role={p.role} /></div>
                <div style={{ marginTop: '8px', fontSize: '10px', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: tone }}>Contratar</div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* time sendo montado */}
      <div>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--rtm-dim)', fontWeight: 700, marginBottom: '8px' }}>Seu time ({picked.length}/{count})</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: '8px' }}>
          {Array.from({ length: count }).map((_, i) => {
            const p = picked[i];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: 'var(--rtm-radius)', background: p ? 'var(--rtm-panel-2)' : 'var(--rtm-bg-deep)', border: '1px solid var(--rtm-border-soft)', borderStyle: p ? 'solid' : 'dashed', minHeight: '46px' }}>
                {p ? (
                  <>
                    <PlayerAvatar nick={p.nick} size={30} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--rtm-font-cond)', fontWeight: 700, fontSize: '13px', color: 'var(--rtm-text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Flag cc={p.country} /> {p.nick} <span style={{ color: 'var(--rtm-gold)', fontVariantNumeric: 'tabular-nums' }}>{p.ovr}</span></span>
                      <RoleTag role={p.role} />
                    </span>
                  </>
                ) : <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--rtm-faint)' }}>vazio</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--rtm-dim)' }}>Funções:</span>
          {ROLE_KEYS.map((k) => {
            const ok = rolesPresent.has(k.role);
            return <span key={k.role} style={{ fontSize: '11px', fontWeight: 700, color: ok ? 'var(--rtm-green-bright)' : 'var(--rtm-faint)' }}>{ok ? '✓' : '✗'} {k.label}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
