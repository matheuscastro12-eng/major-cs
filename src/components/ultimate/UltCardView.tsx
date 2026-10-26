// Cartas do Ultimate: a carta estilo FUT (coleção, packs, reveal) e o tile do
// tabuleiro do Squad Builder. Saíram da UltimateSquadScreen (primeiro passo da
// divisão da tela); a lógica de pele/cores vive em cardVisual.ts.
import { memo } from 'react';
import { Coins } from 'lucide-react';
import { Flag, PlayerAvatar } from '../ui';
import { useUltimate } from '../../state/ultimate';
import { ct } from '../../state/career-i18n';
import { isLegacyCard } from '../../engine/bridge/legacyBridge';
import { frameById } from '../../engine/ultimate/cosmetics';
import { rarityInfo } from '../../engine/ultimate/rarities';
import { editionLabel, SEASON_EDITION_BOOST } from '../../engine/ultimate/seasonEdition';
import type { UltCard } from '../../engine/ultimate/cards';
import { cardSkin, FOIL_RARITIES, REGION_CODE, ROLE_CODE, STAT_ROWS, type EditionBadge } from './cardVisual';

// carta estilo FUT: pele premium por raridade (cardSkin), moldura dupla + sheen,
// placa do OVR, 6 substats, foil nas especiais e marca M//CS. `qs` = quick-sell.
// React.memo: as rows do club têm referência estável entre renders → um toast
// não re-renderiza a grade inteira de cartas (custo real em coleção grande).
// [URG-1] `ed` = selo de edição da temporada: em forma (S3, laranja, +OVR) ou Legado S3 (cinza, OVR base)
export const UltCardView = memo(function UltCardView({ card, size = 132, count, qs, evo = 0, ev, ed = null }: { card: UltCard; size?: number; count?: number; qs?: number; evo?: number; ev?: string; ed?: EditionBadge }) {
  const info = rarityInfo(card.rarity);
  const compact = size < 116;
  const h = Math.round(size * 1.4);
  const foil = FOIL_RARITIES.has(card.rarity);
  const s = cardSkin(card.rarity);
  const px = Math.round(size * 0.06);
  // [W2] LEGADO: moldura própria (borda dupla âmbar + faixa "LEGADO") sobre a pele de lenda
  const legacy = isLegacyCard(card);
  // [U10] moldura EQUIPADA do clube: só cosmética, por cima da pele de raridade (não no LEGADO)
  const equippedFrameId = useUltimate((st) => st.state.profile.equippedFrame ?? null);
  const frame = legacy ? null : frameById(equippedFrameId);
  // [URG-2] carta EXCLUSIVA de evento: moldura rosa dupla + selo "EVENTO wknd-…" (por cima da pele de raridade)
  const evTag = ev ? ev.replace(/^wknd-/, '').toUpperCase() : null;
  return (
    <div style={{ width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: qs != null ? 6 : 0 }}>
      <div style={{ position: 'relative', width: size, height: h, borderRadius: 14, overflow: 'hidden', background: legacy ? 'linear-gradient(165deg, #2a1d05 0%, #141821 55%, #3a2a08 100%)' : s.bg, border: `1.5px solid ${evo > 0 ? 'var(--c-win)' : ev ? '#f472b6' : legacy ? '#f3cf6b' : s.frame}`, boxShadow: evo > 0 ? `${s.glow}, 0 0 0 2px var(--c-win), 0 0 20px color-mix(in srgb, var(--c-win) 40%, transparent)` : ev ? `${s.glow}, 0 0 0 2px rgba(244,114,182,0.45), 0 0 18px rgba(244,114,182,0.4)` : legacy ? `${s.glow}, 0 0 0 2px rgba(243,207,107,0.35)` : s.glow }}>
        {ev && <div style={{ position: 'absolute', inset: 3, borderRadius: 11, border: '1px dashed rgba(244,114,182,0.7)', pointerEvents: 'none', zIndex: 2 }} />}
        {evTag && (
          <span title={`Carta exclusiva do evento ${ev}`} style={{ position: 'absolute', bottom: 6, left: 6, zIndex: 2, fontSize: `${(size / 140) * 0.46}rem`, fontWeight: 900, letterSpacing: '0.6px', padding: '1px 5px', borderRadius: 6, background: '#f472b6', color: '#1a0a12', whiteSpace: 'nowrap' }}>EVENTO {evTag}</span>
        )}
        <div style={{ position: 'absolute', inset: 0, background: s.sheen, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 3, borderRadius: 11, border: `1px solid ${legacy ? 'rgba(243,207,107,0.55)' : frame ? frame.inner : s.inner}`, pointerEvents: 'none' }} />
        {frame && <div style={{ position: 'absolute', inset: 0, borderRadius: 14, border: `2px solid ${frame.border}`, pointerEvents: 'none' }} />}
        {frame?.badge && !legacy && (
          <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: `${(size / 140) * 0.48}rem`, fontWeight: 900, letterSpacing: '1px', padding: '1px 5px', borderRadius: 6, background: frame.badgeBg ?? frame.border, color: 'var(--c-ink)' }}>{frame.badge}</span>
        )}
        {foil && <div className="ult-foil" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
        {legacy && (
          <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: `${(size / 140) * 0.5}rem`, fontWeight: 900, letterSpacing: '1px', padding: '1px 6px', borderRadius: 6, background: '#f3cf6b', color: 'var(--c-ink)' }}>LEGADO</span>
        )}
        {evo > 0 && (
          <span style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.56rem', fontWeight: 900, padding: '1px 6px', borderRadius: 10, background: 'var(--c-win)', color: 'var(--c-on-accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>✦{evo}</span>
        )}
        {count != null && count > 1 && (
          <span style={{ position: 'absolute', top: evo > 0 ? 25 : 6, right: 6, zIndex: 2, fontSize: '0.6rem', fontWeight: 900, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>×{count}</span>
        )}
        {/* [URG-1] selo da edição: desce quando o LEGADO/moldura já ocupa o canto */}
        {ed && (
          <span title={ed.current ? `${ct('Edição da temporada')} ${editionLabel(ed.n)} · +${SEASON_EDITION_BOOST} OVR ${ct('até o fim da temporada')}` : `${ct('Legado')} ${editionLabel(ed.n)} · ${ct('a temporada acabou, OVR base')}`}
            style={{ position: 'absolute', top: legacy || frame?.badge ? 25 : 6, left: 6, zIndex: 2, fontSize: `${(size / 140) * 0.5}rem`, fontWeight: 900, letterSpacing: '0.6px', padding: '1px 6px', borderRadius: 6, background: ed.current ? '#f97316' : 'rgba(100,100,110,0.85)', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            {ed.current ? editionLabel(ed.n) : `${ct('LEGADO')} ${editionLabel(ed.n)}`}
          </span>
        )}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: `${px}px ${px}px ${Math.round(size * 0.05)}px` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, minWidth: Math.round(size * 0.26), padding: `${Math.round(size * 0.028)}px 2px`, borderRadius: 8, background: s.plate }}>
              <span style={{ fontSize: `${(size / 140) * 1.78}rem`, fontWeight: 900, color: s.ink, fontFamily: 'var(--font-num)', letterSpacing: '-0.5px' }}>{card.ovr}</span>
              <span style={{ fontSize: `${(size / 140) * 0.56}rem`, fontWeight: 800, color: s.ink, opacity: 0.9, marginTop: 1 }}>{ROLE_CODE[card.role] ?? card.role}</span>
              <span style={{ marginTop: 3 }}><Flag cc={card.country} /></span>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <PlayerAvatar nick={card.nick} size={Math.round(size * (compact ? 0.42 : 0.5))} />
            </div>
          </div>
          <div style={{ fontSize: `${(size / 140) * 0.88}rem`, fontWeight: 900, color: s.ink, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>{card.nick}</div>
          {!compact && (
            <>
              <div style={{ height: 1, background: s.line, margin: '4px 6px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, justifyContent: 'center' }}>
                {STAT_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', justifyContent: 'space-around' }}>
                    {row.map(([k, label]) => (
                      <span key={label} style={{ fontSize: `${(size / 140) * 0.6}rem`, fontFamily: 'var(--font-num)' }}>
                        <b style={{ color: s.ink, fontWeight: 900 }}>{card.stats[k]}</b> <span style={{ color: s.sub, fontWeight: 700 }}>{label}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: `${(size / 140) * 0.54}rem`, fontWeight: 800, color: s.ink, opacity: 0.72 }}>{REGION_CODE[card.region] ?? 'GLB'}</span>
            <span style={{ fontSize: `${(size / 140) * 0.54}rem`, fontWeight: 900, color: s.label, letterSpacing: '0.2px' }}>· {legacy ? 'Legado do RtP' : info.label}</span>
          </div>
        </div>
        {!compact && (
          <span style={{ position: 'absolute', bottom: 3, right: 6, zIndex: 1, fontSize: `${(size / 140) * 0.5}rem`, fontWeight: 900, color: s.mark, fontFamily: 'var(--ut-font-cond)', letterSpacing: '0.3px', pointerEvents: 'none' }}>R<span style={{ color: s.markSlash }}>t</span>M</span>
        )}
      </div>
      {qs != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(184,134,11,0.3)', color: 'var(--c-accent)' }}><Coins size={11} /> +{qs.toLocaleString('pt-BR')}</span>
      )}
    </div>
  );
});

// Tile do TABULEIRO (Squad Builder): o card FUT completo encolhido pra 92px no
// pitch escuro ficava ilegível (nick/labels de baixo contraste, sem stats). Este
// é um tile dedicado, escuro sólido, com OVR/borda na cor da raridade, NICK EM
// BRANCO sobre faixa sólida (contraste garantido) + 3 stats visíveis.
export const PitchTile = memo(function PitchTile({ card, evo = 0, size = 112, ev, ed = null }: { card: UltCard; evo?: number; size?: number; ev?: string; ed?: EditionBadge }) {
  const info = rarityInfo(card.rarity);
  // [URG-2] carta exclusiva de evento: borda rosa no tabuleiro também
  const c = ev ? '#f472b6' : info.color;
  const k = size / 112;
  const stat = (v: number, label: string) => (
    <span key={label} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <b style={{ fontFamily: 'var(--font-num)', fontWeight: 900, fontSize: `${k * 0.74}rem`, color: '#fff' }}>{v}</b>
      <span style={{ fontSize: `${k * 0.44}rem`, fontWeight: 800, color: 'rgba(255,255,255,0.5)', marginTop: 1, letterSpacing: '0.3px' }}>{label}</span>
    </span>
  );
  return (
    <div style={{ width: size, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg, #2b3242 0%, #171a21 100%)', border: `1.5px solid ${c}`, boxShadow: `0 6px 20px rgba(0,0,0,0.55), 0 0 16px color-mix(in srgb, ${c} 33%, transparent)` }}>
      <div style={{ height: 3, background: c }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `${k * 7}px ${k * 8}px ${k * 4}px` }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-num)', fontWeight: 900, fontSize: `${k * 1.4}rem`, color: c, letterSpacing: '-0.5px' }}>{card.ovr}</span>
          <span style={{ fontSize: `${k * 0.5}rem`, fontWeight: 800, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.4px' }}>{ROLE_CODE[card.role] ?? card.role}</span>
          <span style={{ marginTop: 1 }}><Flag cc={card.country} /></span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <PlayerAvatar nick={card.nick} size={Math.round(size * 0.4)} />
        </div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.42)', padding: `${k * 3}px 6px`, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ color: '#fff', fontWeight: 900, fontSize: `${k * 0.76}rem`, textTransform: 'uppercase', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.nick}</span>
        {evo > 0 && <span style={{ fontSize: '0.52rem', fontWeight: 900, color: 'var(--c-win)' }}>✦{evo}</span>}
        {ed && <span style={{ fontSize: '0.5rem', fontWeight: 900, color: ed.current ? '#fb923c' : 'rgba(255,255,255,0.45)' }}>{ed.current ? editionLabel(ed.n) : `L·${editionLabel(ed.n)}`}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: `${k * 5}px 6px ${k * 3}px` }}>
        {stat(card.stats.mira, 'MIR')}{stat(card.stats.reflexo, 'REF')}{stat(card.stats.clutch, 'CLU')}
      </div>
      <div style={{ textAlign: 'center', paddingBottom: k * 5 }}>
        <span style={{ fontSize: `${k * 0.5}rem`, fontWeight: 900, color: c, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{info.label}</span>
      </div>
    </div>
  );
});
