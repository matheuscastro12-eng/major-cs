// AttributeColumn — T3.1. Mostra os 28 atributos FM-style agrupados em 3
// colunas (Mechanical, Mental, Physical). Cada atributo vira uma linha com
// label + barra colorida + valor 1-20.

import {
  ATTR_LABEL,
  MECHANICAL_KEYS,
  MENTAL_KEYS,
  PHYSICAL_KEYS,
  attrColor,
  type AttrKey,
} from '../../engine/attributes';

interface Props {
  attributes: Record<AttrKey, number>;
}

export function AttributeColumn({ attributes }: Props) {
  return (
    <section style={sectionStyle}>
      <header style={headerStyle}>
        <h3 style={titleStyle}>Atributos</h3>
        <span style={hintStyle}>Escala 1-20 (FM-style)</span>
      </header>

      <div style={gridStyle}>
        <ColumnBlock title="Mecânica" color="#e25a5a" keys={MECHANICAL_KEYS} attrs={attributes} />
        <ColumnBlock title="Mental" color="#5fa4e8" keys={MENTAL_KEYS} attrs={attributes} />
        <ColumnBlock title="Físico" color="#5ed88a" keys={PHYSICAL_KEYS} attrs={attributes} />
      </div>
    </section>
  );
}

function ColumnBlock({
  title,
  color,
  keys,
  attrs,
}: {
  title: string;
  color: string;
  keys: AttrKey[];
  attrs: Record<AttrKey, number>;
}) {
  return (
    <div style={columnStyle}>
      <header style={columnHeaderStyle(color)}>{title}</header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {keys.map((k) => (
          <AttrRow key={k} label={ATTR_LABEL[k]} value={attrs[k]} />
        ))}
      </div>
    </div>
  );
}

function AttrRow({ label, value }: { label: string; value: number }) {
  const color = attrColor(value);
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={barWrapStyle}>
        <span style={{ width: `${(value / 20) * 100}%`, height: '100%', background: color, transition: 'width .2s' }} />
      </span>
      <b style={{ color, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.86rem', minWidth: 22, textAlign: 'right' }}>
        {value}
      </b>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles

const sectionStyle: React.CSSProperties = {
  background: 'var(--em-panel)',
  border: '1px solid var(--em-border)',
  borderRadius: 6,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.86rem',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--em-muted)',
};

const hintStyle: React.CSSProperties = {
  color: 'var(--em-muted)',
  fontSize: '0.72rem',
  fontStyle: 'italic',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const columnStyle: React.CSSProperties = {
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 4,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const columnHeaderStyle = (color: string): React.CSSProperties => ({
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color,
  paddingBottom: 4,
  borderBottom: `1px solid ${color}44`,
});

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.78rem',
  color: 'var(--em-text)',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const barWrapStyle: React.CSSProperties = {
  display: 'block',
  width: 70,
  height: 6,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 2,
  overflow: 'hidden',
  flexShrink: 0,
};
