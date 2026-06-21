// Card de jogador estilo FUT (Ultimate Team) — replica o design system "Road to
// Major". Gradiente por tier (steel/gold/icon conforme OVR), OVR + função +
// bandeira, avatar, nome e 6 sub-stats. Reutilizado em Hub / Elenco / perfis.
import { useState, type CSSProperties } from 'react';
import { Flag, PlayerAvatar } from './ui';
import { playerOvr } from '../engine/ratings';
import type { Player } from '../types';

interface Tier { grad: string; ink: string; sub: string; ring: string; }
function futTier(ovr: number): Tier {
  if (ovr >= 93) return { grad: 'linear-gradient(160deg, #f6dd91 0%, #d8a943 45%, #9c7322 100%)', ink: '#2a1c05', sub: 'rgba(42,28,5,.6)', ring: '#f3cf6b' };
  if (ovr >= 88) return { grad: 'linear-gradient(160deg, #d8b65a 0%, #b08a3e 55%, #7a5e25 100%)', ink: '#241a06', sub: 'rgba(36,26,6,.6)', ring: '#d8a943' };
  return { grad: 'linear-gradient(160deg, #6f8194 0%, #46566a 55%, #2c3a4b 100%)', ink: '#0c151e', sub: 'rgba(12,21,30,.6)', ring: '#9fb6cd' };
}

// 6 sub-stats determinísticas a partir de nick + OVR + função (estáveis por nick)
function futStats(nick: string, ovr: number, role: string): Record<string, number> {
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) & 255;
  const j = (n: number) => ((h >> n) & 7) - 3;
  const clamp = (v: number) => Math.max(58, Math.min(99, Math.round(v)));
  return {
    AIM: clamp(ovr + (role === 'AWP' || role === 'Entry' ? 4 : -2) + j(0)),
    REF: clamp(ovr + (role === 'AWP' ? 3 : 0) + j(1)),
    UTL: clamp(ovr + (role === 'IGL' || role === 'Support' ? 5 : -3) + j(2)),
    CLU: clamp(ovr + (role === 'Lurker' || role === 'AWP' ? 4 : 0) + j(3)),
    ENT: clamp(ovr + (role === 'Entry' ? 6 : role === 'IGL' ? -4 : 0) + j(0)),
    MOV: clamp(ovr + (role === 'Lurker' || role === 'Entry' ? 3 : 0) + j(1)),
  };
}

export function FutCard({ player, size = 'md', onClick }: { player: Player; size?: 'md' | 'lg'; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  const ovr = playerOvr(player);
  const t = futTier(ovr);
  const s = futStats(player.nick, ovr, player.role);
  const lg = size === 'lg';
  const w = lg ? 230 : 168;
  const av = lg ? 92 : 64;
  const cond: CSSProperties = { fontFamily: 'var(--font-cond)', fontWeight: 800 };
  const statRow = (entries: [string, number][]) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: lg ? '14px' : '9px' }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{ ...cond, display: 'flex', gap: '4px', fontSize: lg ? '15px' : '12.5px', color: t.ink, fontVariantNumeric: 'tabular-nums' }}>
          <span>{v}</span><span style={{ color: t.sub, fontWeight: 700 }}>{k}</span>
        </span>
      ))}
    </div>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: w, border: 'none', padding: 0, cursor: onClick ? 'pointer' : 'default', flexShrink: 0,
        borderRadius: '14px', background: t.grad, color: t.ink, position: 'relative',
        boxShadow: hover ? `0 16px 36px rgba(0,0,0,.5), 0 0 0 1px ${t.ring}` : '0 6px 18px rgba(0,0,0,.4)',
        transform: hover && onClick ? 'translateY(-4px)' : 'none', transition: 'transform .12s, box-shadow .12s',
        overflow: 'hidden', textAlign: 'center',
      }}
    >
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,.18), transparent 40%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: lg ? '14px 16px 0' : '10px 12px 0' }}>
        <div style={{ textAlign: 'left', lineHeight: 1 }}>
          <div style={{ ...cond, fontSize: lg ? '38px' : '28px' }}>{ovr}</div>
          <div style={{ ...cond, fontSize: lg ? '14px' : '11px', letterSpacing: '.5px', color: t.sub }}>{(player.role || '').toUpperCase().slice(0, 3) || 'PRO'}</div>
        </div>
        <Flag cc={player.country} />
      </div>
      <div style={{ position: 'relative', marginTop: lg ? '-6px' : '-4px' }}>
        <PlayerAvatar nick={player.nick} size={av} />
      </div>
      <div style={{ position: 'relative', margin: lg ? '8px 14px 0' : '6px 10px 0', borderTop: `1px solid ${t.sub}`, paddingTop: lg ? '7px' : '5px' }}>
        <div style={{ ...cond, fontSize: lg ? '22px' : '16px', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.nick}</div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: lg ? '6px' : '4px', padding: lg ? '8px 10px 16px' : '6px 8px 12px' }}>
        {statRow([['AIM', s.AIM], ['REF', s.REF], ['UTL', s.UTL]])}
        {statRow([['CLU', s.CLU], ['ENT', s.ENT], ['MOV', s.MOV]])}
      </div>
    </button>
  );
}
