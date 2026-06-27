// ComparePage — T9.1 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Compara 2-4 players lado a lado. Cada coluna mostra:
//   - Header: foto, nick, country, OVR, role
//   - 28 atributos FM-style agrupados (Mechanical / Mental / Physical)
//   - Cada linha: barra colorida + valor. Maior valor da linha → highlight gold.
//
// Page standalone — recebe `players: Player[]` e `onClose` via prop.
// Host global (CompareHost) usa pattern dos outros hosts.

import { useMemo } from 'react';
import { Flag, PlayerAvatar, OvrBadge } from '../components/ui';
import {
  ATTR_LABEL,
  MECHANICAL_KEYS,
  MENTAL_KEYS,
  PHYSICAL_KEYS,
  attrColor,
  playerAttributes,
  type AttrKey,
} from '../engine/attributes';
import { playerOvr } from '../engine/ratings';
import {
  subRoleStars,
  dominantSubRole,
  SUBROLE_LABEL,
} from '../engine/subRoles';
import type { Player } from '../types';

interface Props {
  players: Player[];
  onClose?: () => void;
}

export function ComparePage({ players, onClose }: Props) {
  const visible = players.slice(0, 4);

  // Computa atributos de cada player UMA vez
  const allAttrs = useMemo(
    () => visible.map((p) => ({ player: p, attrs: playerAttributes(p) })),
    [visible],
  );

  // Pra cada AttrKey, calcula qual player tem maior valor (pra highlight)
  const bestByAttr: Record<AttrKey, number> = useMemo(() => {
    const out = {} as Record<AttrKey, number>;
    const allKeys: AttrKey[] = [...MECHANICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS];
    for (const k of allKeys) {
      let bestIdx = 0;
      let bestVal = -1;
      allAttrs.forEach((a, i) => {
        if (a.attrs[k] > bestVal) {
          bestVal = a.attrs[k];
          bestIdx = i;
        }
      });
      out[k] = bestIdx;
    }
    return out;
  }, [allAttrs]);

  if (visible.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--em-muted)' }}>
        Nenhum jogador selecionado para comparar.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header com cards dos players */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${visible.length}, 1fr)`,
          gap: 12,
        }}
      >
        {visible.map((p) => {
          const dom = dominantSubRole(p);
          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '14px 10px',
                background: 'var(--em-panel-2)',
                border: '1px solid var(--em-border)',
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <PlayerAvatar nick={p.nick} size={56} />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Flag cc={p.country} />
                <b style={{ fontSize: '1rem', color: 'var(--em-text)' }}>{p.nick}</b>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--em-muted)' }}>{p.name}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <OvrBadge ovr={playerOvr(p)} />
                <span className={`role-pill ${p.role}`}>{p.role}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--em-gold)', fontWeight: 700, marginTop: 4 }}>
                {SUBROLE_LABEL[dom]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Seções de atributos */}
      <AttrSection
        label="Mecânica"
        keys={MECHANICAL_KEYS}
        allAttrs={allAttrs}
        bestByAttr={bestByAttr}
      />
      <AttrSection
        label="Mental"
        keys={MENTAL_KEYS}
        allAttrs={allAttrs}
        bestByAttr={bestByAttr}
      />
      <AttrSection
        label="Físico"
        keys={PHYSICAL_KEYS}
        allAttrs={allAttrs}
        bestByAttr={bestByAttr}
      />

      {/* Sub-roles em estrelas */}
      <SubRolesCompare players={visible} />

      {onClose && (
        <div style={{ textAlign: 'right', borderTop: '1px solid var(--em-border)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: 'var(--em-gold)',
              color: '#1a1205',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function AttrSection({
  label,
  keys,
  allAttrs,
  bestByAttr,
}: {
  label: string;
  keys: AttrKey[];
  allAttrs: { player: Player; attrs: Record<AttrKey, number> }[];
  bestByAttr: Record<AttrKey, number>;
}) {
  const cols = allAttrs.length;
  return (
    <section>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: '0.74rem',
          fontWeight: 800,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--em-muted)',
        }}
      >
        {label}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `120px repeat(${cols}, 1fr)`,
          gap: 4,
          fontSize: '0.78rem',
        }}
      >
        {keys.map((k) => (
          <Row key={k} attrKey={k} allAttrs={allAttrs} bestIdx={bestByAttr[k]} />
        ))}
      </div>
    </section>
  );
}

function Row({
  attrKey,
  allAttrs,
  bestIdx,
}: {
  attrKey: AttrKey;
  allAttrs: { player: Player; attrs: Record<AttrKey, number> }[];
  bestIdx: number;
}) {
  return (
    <>
      <span style={{ color: 'var(--em-muted)', alignSelf: 'center', padding: '4px 0' }}>
        {ATTR_LABEL[attrKey]}
      </span>
      {allAttrs.map((a, i) => {
        const v = a.attrs[attrKey];
        const isBest = i === bestIdx && allAttrs.length > 1;
        const pct = (v / 20) * 100;
        return (
          <div
            key={a.player.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              background: isBest ? 'rgba(232, 193, 112, 0.12)' : 'transparent',
              borderRadius: 3,
              border: isBest ? '1px solid rgba(232, 193, 112, 0.4)' : '1px solid transparent',
            }}
          >
            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: attrColor(v),
                  borderRadius: 2,
                  transition: 'width .2s',
                }}
              />
            </div>
            <b
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                color: isBest ? 'var(--em-gold)' : 'var(--em-text)',
                minWidth: 22,
                textAlign: 'right',
                fontSize: '0.78rem',
              }}
            >
              {v}
            </b>
          </div>
        );
      })}
    </>
  );
}

function SubRolesCompare({ players }: { players: Player[] }) {
  const allStars = players.map((p) => ({ player: p, stars: subRoleStars(p) }));
  return (
    <section>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: '0.74rem',
          fontWeight: 800,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--em-muted)',
        }}
      >
        Sub-roles dominantes
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${players.length}, 1fr)`,
          gap: 8,
        }}
      >
        {allStars.map((a) => {
          const dom = dominantSubRole(a.player);
          return (
            <div
              key={a.player.id}
              style={{
                padding: '10px 12px',
                background: 'var(--em-panel-2)',
                border: '1px solid var(--em-border)',
                borderRadius: 4,
                fontSize: '0.78rem',
              }}
            >
              <div style={{ color: 'var(--em-muted)', fontSize: '0.7rem', marginBottom: 4 }}>
                {a.player.nick}
              </div>
              <div style={{ color: 'var(--em-gold)', fontWeight: 800, fontSize: '0.92rem' }}>
                {SUBROLE_LABEL[dom]}
              </div>
              <div style={{ color: 'var(--em-muted)', fontSize: '0.7rem', marginTop: 2 }}>
                ★ {a.stars[dom].toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
