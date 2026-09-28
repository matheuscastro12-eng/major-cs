// Table densa estilo FM (.ds-table): cabeçalho fixo em caps, linhas na altura
// da densidade (--row-h), números tabulares alinhados à direita, linha "minha"
// marcada em dourado, ordenação por coluna (clique no cabeçalho; aria-sort) e
// visões de colunas (Geral · Atributos · Contratos · Desempenho) via `view`.
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cx } from './cx';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** coluna numérica: tabular, alinhada à direita */
  num?: boolean;
  dim?: boolean;
  width?: number | string;
  /** valor pra ordenar (liga a ordenação da coluna) */
  sort?: (row: T) => number | string;
  /** visões em que a coluna aparece (sem = todas) */
  views?: string[];
}

export function Table<T>({
  columns, rows, rowKey, caption, isMe, onRowClick, zebra = false, className, empty, view, defaultSort, tall = false,
  boxed = false, selected,
}: {
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
  /** visão de colunas ativa (filtra por Column.views) */
  view?: string;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** linhas altas (elenco com avatar) */
  tall?: boolean;
  /** borda própria (tabela solta, fora de painel) */
  boxed?: boolean;
  /** linhas marcadas (ex.: comparação) */
  selected?: (row: T) => boolean;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const cols = view ? columns.filter((c) => !c.views || c.views.includes(view)) : columns;
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    const out = [...rows].sort((a, b) => {
      const x = get(a); const y = get(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
      return sort.dir === 'asc' ? r : -r;
    });
    return out;
  }, [rows, sort, columns]);

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(row); }
  };
  const toggleSort = (c: Column<T>) => {
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: c.key, dir: c.num ? 'desc' : 'asc' }));
  };
  return (
    <div className={cx('ds-table-wrap', boxed && 'ds-table-wrap--boxed', className)}>
      <table className={cx('ds-table', zebra && 'ds-table--zebra', tall && 'ds-table--tall')}>
        {caption && <caption className="ds-sr-only">{caption}</caption>}
        <thead>
          <tr>
            {cols.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(c.num && 'is-num')}
                  style={c.width != null ? { width: c.width } : undefined}
                  aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sort ? (
                    <button type="button" onClick={() => toggleSort(c)}>
                      {c.header}
                      {on && (sort!.dir === 'asc' ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && empty != null && (
            <tr><td colSpan={cols.length} className="is-dim">{empty}</td></tr>
          )}
          {sorted.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className={cx(isMe?.(row) && 'is-me')}
              data-selected={selected?.(row) ? '' : undefined}
              data-clickable={onRowClick ? '' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined}
            >
              {cols.map((c) => (
                <td key={c.key} className={cx(c.num && 'is-num', c.dim && 'is-dim')}>{c.cell(row, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Segmented control / toggle group (pílulas). role=radiogroup, setas navegam. */
export function Segmented<V extends string>({ items, value, onChange, label, className }: {
  items: { value: V; label: ReactNode; count?: number }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  className?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((it) => it.value === value);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    if (n < 0) return;
    e.preventDefault();
    onChange(items[n].value);
    (e.currentTarget.querySelectorAll('button')[n] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div className={cx('ds-seg', className)} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={it.value === value}
          tabIndex={it.value === value ? 0 : -1}
          className="ds-seg__btn"
          onClick={() => onChange(it.value)}
        >
          {it.label}
          {it.count != null && it.count > 0 && <span className="ds-seg__count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
