// Table densa estilo FM (.ds-table): cabeçalho fixo em caps, linhas de 34px,
// números tabulares alinhados à direita, linha "minha" marcada no acento.
// Tipada por coluna pra não virar tabela de <div> solta.
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from './cx';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** coluna numérica: mono tabular, alinhada à direita */
  num?: boolean;
  dim?: boolean;
  width?: number | string;
}

export function Table<T>({ columns, rows, rowKey, caption, isMe, onRowClick, zebra = false, className, empty }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** legenda pro leitor de tela (visível só pra ele) */
  caption?: string;
  isMe?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  zebra?: boolean;
  className?: string;
  empty?: ReactNode;
}) {
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(row); }
  };
  return (
    <div className={cx('ds-table-wrap', className)}>
      <table className={cx('ds-table', zebra && 'ds-table--zebra')}>
        {caption && <caption className="ds-sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(c.num && 'is-num')} style={c.width != null ? { width: c.width } : undefined}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty != null && (
            <tr><td colSpan={columns.length} className="is-dim">{empty}</td></tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className={cx(isMe?.(row) && 'is-me')}
              data-clickable={onRowClick ? '' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx(c.num && 'is-num', c.dim && 'is-dim')}>{c.cell(row, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
