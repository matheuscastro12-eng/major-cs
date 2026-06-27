// SubRoleStars — T3.3 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Renderiza estrelas 0-5 pra cada sub-role de um player. Usado no
// CareerPlayerPage abaixo do AttributeColumn. Destaca a sub-role DOMINANTE
// com borda dourada.
//
// Sub-roles são calculadas on-demand via subRoleStars(player) — não
// armazenadas no save (custo barato, ~µs por player).

import { Panel } from '../ds';
import type { Player } from '../../types';
import {
  subRoleStars,
  dominantSubRole,
  SUBROLE_LABEL,
  SUBROLE_DESC,
  SUBROLE_ORDER,
  type SubRole,
} from '../../engine/subRoles';

interface Props {
  player: Player;
}

export function SubRoleStars({ player }: Props) {
  const stars = subRoleStars(player);
  const dom = dominantSubRole(player);

  return (
    <Panel title="Sub-roles">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SUBROLE_ORDER.map((sr) => (
          <SubRoleRow
            key={sr}
            subRole={sr}
            stars={stars[sr]}
            isDominant={sr === dom}
          />
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: '0.72rem', color: 'var(--em-muted)' }}>
        Sub-roles derivam da função, atributos e estilo. A sub-role dominante (★ dourada) define o nicho tático do jogador.
      </p>
    </Panel>
  );
}

function SubRoleRow({
  subRole,
  stars,
  isDominant,
}: {
  subRole: SubRole;
  stars: number;
  isDominant: boolean;
}) {
  const fullStars = Math.floor(stars);
  const halfStar = stars - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  const labelColor = isDominant ? 'var(--em-gold)' : 'var(--em-text)';
  const labelWeight = isDominant ? 800 : 600;

  return (
    <div
      title={SUBROLE_DESC[subRole]}
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: isDominant ? '4px 8px' : '4px 0',
        borderRadius: 3,
        background: isDominant ? 'rgba(232, 169, 59, 0.08)' : 'transparent',
        border: isDominant ? '1px solid var(--em-gold)' : '1px solid transparent',
      }}
    >
      <span style={{ color: labelColor, fontWeight: labelWeight, fontSize: '0.82rem' }}>
        {SUBROLE_LABEL[subRole]}
      </span>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star key={`f${i}`} fill="var(--em-gold)" />
        ))}
        {halfStar && <Star fill="var(--em-gold)" half />}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star key={`e${i}`} fill="rgba(255,255,255,0.18)" />
        ))}
      </span>
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.76rem',
          color: 'var(--em-muted)',
          minWidth: 30,
          textAlign: 'right',
        }}
      >
        {stars.toFixed(1)}
      </span>
    </div>
  );
}

function Star({ fill, half = false }: { fill: string; half?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: 'block' }}>
      <defs>
        {half && (
          <linearGradient id="half-star-grad">
            <stop offset="50%" stopColor={fill} />
            <stop offset="50%" stopColor="rgba(255,255,255,0.18)" />
          </linearGradient>
        )}
      </defs>
      <path
        d="M12 2 L15.09 8.26 L22 9.27 L17 14.14 L18.18 21.02 L12 17.77 L5.82 21.02 L7 14.14 L2 9.27 L8.91 8.26 Z"
        fill={half ? 'url(#half-star-grad)' : fill}
      />
    </svg>
  );
}
