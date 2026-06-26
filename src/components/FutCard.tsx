// Card de jogador estilo FUT — versão em-* (padrão Veto/Draft).
// 3 tiers por OVR: icon (93+, dourado bright), gold (88-92), neutro (<88, charcoal,
// sem azul). Hover lift + ring dourado. Tipografia herdada (sem font-cond).
// Reutilizado em Hub / Elenco / perfis.
import { useState, type CSSProperties } from 'react';
import { Flag, PlayerAvatar } from './ui';
import { playerOvr } from '../engine/ratings';
import type { Player } from '../types';

interface Tier { grad: string; ink: string; sub: string; ring: string; tag: 'icon' | 'gold' | 'neutral'; }
function futTier(ovr: number): Tier {
  if (ovr >= 93) return {
    tag: 'icon',
    grad: 'linear-gradient(160deg, #f6dd91 0%, #d8a943 45%, #8a6818 100%)',
    ink: '#231603', sub: 'rgba(35,22,3,.62)', ring: '#f3cf6b',
  };
  if (ovr >= 88) return {
    tag: 'gold',
    grad: 'linear-gradient(160deg, #d8b65a 0%, #a6822f 55%, #6a4e1c 100%)',
    ink: '#1f1404', sub: 'rgba(31,20,4,.6)', ring: '#d8a943',
  };
  return {
    tag: 'neutral',
    grad: 'linear-gradient(160deg, #3a3a3a 0%, #262626 55%, #181818 100%)',
    ink: '#f1f1f1', sub: 'rgba(255,255,255,.42)', ring: 'rgba(255,255,255,.18)',
  };
}

// 6 sub-stats determinísticas a partir de nick + OVR + função
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
  // Tipografia inherit (sem font-cond), com peso alto pra manter impacto
  const num: CSSProperties = { fontWeight: 800, fontFamily: 'inherit', letterSpacing: '0.2px' };
  const statRow = (entries: [string, number][]) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: lg ? '14px' : '9px' }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{ ...num, display: 'flex', gap: '4px', fontSize: lg ? '0.92rem' : '0.78rem', color: t.ink, fontVariantNumeric: 'tabular-nums' }}>
          <span>{v}</span><span style={{ color: t.sub, fontWeight: 700 }}>{k}</span>
        </span>
      ))}
    </div>
  );
  // Ring dourado em hover (independente do tier), pra leitura consistente
  const hoverRing = onClick && hover ? `0 14px 32px rgba(0,0,0,.5), 0 0 0 2px var(--em-gold)` : `0 6px 18px rgba(0,0,0,.4), 0 0 0 1px ${t.ring}`;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`em-futcard em-futcard--${t.tag}`}
      style={{
        width: w, border: 'none', padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        borderRadius: '10px',
        background: t.grad,
        color: t.ink,
        position: 'relative',
        boxShadow: hoverRing,
        transform: hover && onClick ? 'translateY(-4px)' : 'none',
        transition: 'transform .15s, box-shadow .15s',
        overflow: 'hidden',
        textAlign: 'center',
        fontFamily: 'inherit',
      }}
    >
      {/* Glare diagonal sutil */}
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,.14), transparent 42%)', pointerEvents: 'none' }} />
      {/* Tag de raridade canto superior (sem ser invasivo) */}
      {t.tag !== 'neutral' && (
        <span style={{
          position: 'absolute', top: 6, right: 6, padding: '1px 6px', borderRadius: 4,
          fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase',
          background: 'rgba(0,0,0,.18)', color: t.ink, opacity: 0.75,
        }}>{t.tag === 'icon' ? 'Icon' : 'Gold'}</span>
      )}
      {/* Header: OVR + função + bandeira */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: lg ? '14px 16px 0' : '10px 12px 0' }}>
        <div style={{ textAlign: 'left', lineHeight: 1 }}>
          <div style={{ ...num, fontSize: lg ? '2.4rem' : '1.75rem', lineHeight: 0.95 }}>{ovr}</div>
          <div style={{ ...num, fontSize: lg ? '0.78rem' : '0.66rem', letterSpacing: '0.6px', color: t.sub, marginTop: 2 }}>{(player.role || '').toUpperCase().slice(0, 3) || 'PRO'}</div>
        </div>
        <Flag cc={player.country} />
      </div>
      {/* Avatar */}
      <div style={{ position: 'relative', marginTop: lg ? '-6px' : '-4px' }}>
        <PlayerAvatar nick={player.nick} size={av} />
      </div>
      {/* Nick */}
      <div style={{ position: 'relative', margin: lg ? '8px 14px 0' : '6px 10px 0', borderTop: `1px solid ${t.sub}`, paddingTop: lg ? '7px' : '5px' }}>
        <div style={{ ...num, fontSize: lg ? '1.3rem' : '0.98rem', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.nick}</div>
      </div>
      {/* 6 sub-stats */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: lg ? '6px' : '4px', padding: lg ? '8px 10px 16px' : '6px 8px 12px' }}>
        {statRow([['AIM', s.AIM], ['REF', s.REF], ['UTL', s.UTL]])}
        {statRow([['CLU', s.CLU], ['ENT', s.ENT], ['MOV', s.MOV]])}
      </div>
    </button>
  );
}
