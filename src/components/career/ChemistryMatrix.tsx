// Matriz de química do elenco — T3.4 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Heatmap 5x5: cada célula (i, j) mostra a química do par. Diagonal vazia
// (próprio = self). Cores variam de vermelho (estranhos) a verde (excelente).
// Avg dos pares também é exibido como "team chemistry".

import { useMemo } from 'react';
import {
  averageStarterChemistry,
  chemColor,
  chemLabel,
  getPairChem,
  type ChemistryState,
} from '../../engine/chemistry';

interface Props {
  state: ChemistryState;
  /** Lista dos 5 starters (ou menos). Cada item: id canonical + nick exibido. */
  players: { id: string; nick: string }[];
  /** Opcional — título custom. Default: "Química do elenco". */
  title?: string;
}

export function ChemistryMatrix({ state, players, title = 'Química do elenco' }: Props) {
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const avg = useMemo(() => averageStarterChemistry(state, ids), [state, ids]);
  const avgRounded = Math.round(avg);

  if (players.length < 2) {
    return (
      <section style={sectionStyle}>
        <header style={headerStyle}>
          <h3 style={titleStyle}>{title}</h3>
        </header>
        <p style={emptyStyle}>Adicione pelo menos 2 jogadores ao elenco pra calcular química.</p>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <header style={headerStyle}>
        <h3 style={titleStyle}>{title}</h3>
        <span style={avgChipStyle(chemColor(avg))}>
          <span style={{ color: 'var(--em-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.4px' }}>MÉDIA</span>
          <b style={{ color: chemColor(avg), fontFamily: '"JetBrains Mono", monospace' }}>{avgRounded}</b>
          <span style={{ fontSize: '0.74rem', color: 'var(--em-text)' }}>{chemLabel(avg)}</span>
        </span>
      </header>

      <div style={gridContainerStyle}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={headerCellStyle} />
              {players.map((p) => (
                <th key={`h-${p.id}`} style={headerCellStyle} title={p.nick}>
                  <span style={nickStyle}>{p.nick.slice(0, 6).toUpperCase()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={`r-${row.id}`}>
                <th style={rowHeaderStyle} title={row.nick}>
                  <span style={nickStyle}>{row.nick.slice(0, 6).toUpperCase()}</span>
                </th>
                {players.map((col) => {
                  if (row.id === col.id) {
                    return <td key={`d-${col.id}`} style={diagonalCellStyle} />;
                  }
                  const v = getPairChem(state, row.id, col.id);
                  return (
                    <td
                      key={`c-${row.id}-${col.id}`}
                      style={cellStyle(v)}
                      title={`${row.nick} × ${col.nick}: ${Math.round(v)} (${chemLabel(v)})`}
                    >
                      {Math.round(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={hintStyle}>
        Química sobe quando jogadores jogam juntos. Decai levemente quando o elenco fica parado.
      </p>
    </section>
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
  gap: 12,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.86rem',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--em-muted)',
};

const avgChipStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px',
  background: 'var(--em-panel-2)',
  border: `1px solid ${color}55`,
  borderRadius: 3,
  fontSize: '0.86rem',
});

const gridContainerStyle: React.CSSProperties = {
  overflowX: 'auto',
};

const headerCellStyle: React.CSSProperties = {
  padding: '6px 4px',
  fontSize: '0.66rem',
  fontWeight: 700,
  color: 'var(--em-muted)',
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  minWidth: 56,
  textAlign: 'center',
};

const rowHeaderStyle: React.CSSProperties = {
  ...headerCellStyle,
  textAlign: 'right',
  paddingRight: 8,
  minWidth: 72,
};

const nickStyle: React.CSSProperties = {
  display: 'inline-block',
  maxWidth: 64,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

const diagonalCellStyle: React.CSSProperties = {
  border: '1px solid var(--em-border)',
  background:
    'repeating-linear-gradient(45deg, var(--em-panel-2), var(--em-panel-2) 4px, var(--em-panel) 4px, var(--em-panel) 8px)',
  padding: '14px',
};

const cellStyle = (v: number): React.CSSProperties => {
  const color = chemColor(v);
  return {
    border: '1px solid var(--em-border)',
    background: `${color}22`,
    color,
    textAlign: 'center',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 700,
    fontSize: '0.84rem',
    padding: '12px 6px',
    cursor: 'default',
  };
};

const emptyStyle: React.CSSProperties = {
  color: 'var(--em-muted)',
  fontSize: '0.86rem',
  fontStyle: 'italic',
  margin: 0,
};

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.74rem',
  color: 'var(--em-muted)',
  fontStyle: 'italic',
};
