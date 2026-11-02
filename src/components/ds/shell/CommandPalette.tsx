// Paleta de comandos (⌘K / Ctrl+K / "/"): busca universal de jogador, time,
// tela ou ação. Junta 4 fontes: a busca do modo atual (jogadores, times,
// cartas), as seções do modo, os outros modos e os comandos globais.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { useOverlay } from '../useOverlay';
import type { PaletteItem } from './types';

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** pontuação simples: prefixo > início de palavra > contém; 0 = não bate */
export function scoreMatch(q: string, text: string): number {
  if (!q) return 1;
  const t = norm(text);
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s·/()-]+/).some((w) => w.startsWith(q))) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

export function CommandPalette({ open, onClose, base, search, placeholder }: {
  open: boolean;
  onClose: () => void;
  /** itens fixos (seções, modos, comandos) — filtrados aqui */
  base: PaletteItem[];
  /** busca dinâmica do modo (jogadores, times, cartas) */
  search?: (q: string) => PaletteItem[];
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { ref: boxRef, onKeyDown: trapTab } = useOverlay<HTMLDivElement>(open, onClose);

  const items = useMemo(() => {
    const nq = norm(q);
    const found = nq && search ? search(nq).slice(0, 8) : [];
    const scored = base
      .map((it) => ({ it, s: Math.max(scoreMatch(nq, it.label), scoreMatch(nq, it.sub ?? '') * 0.8) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
    return [...found, ...(nq ? scored.slice(0, 14) : scored)];
  }, [q, base, search]);

  const groups = useMemo(() => {
    const out: { group: string; items: { it: PaletteItem; idx: number }[] }[] = [];
    items.forEach((it, idx) => {
      let g = out.find((x) => x.group === it.group);
      if (!g) { g = { group: it.group, items: [] }; out.push(g); }
      g.items.push({ it, idx });
    });
    return out;
  }, [items]);

  const selected = Math.min(sel, Math.max(0, items.length - 1));
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const run = (it?: PaletteItem) => {
    if (!it) return;
    onClose();
    setQ('');
    it.run();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[selected]); }
  };

  return createPortal(
    <div className="gs-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} className="gs-palette" role="dialog" aria-modal="true" aria-label="Busca e comandos" onKeyDown={trapTab}>
        <label className="gs-palette__search">
          <Search size={18} aria-hidden />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder={placeholder ?? 'Buscar jogador, time, tela ou ação…'}
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="gs-palette-list"
            aria-activedescendant={items[selected] ? `gs-pal-${selected}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <div ref={listRef} className="gs-palette__list" id="gs-palette-list" role="listbox">
          {items.length === 0 && <p className="gs-palette__empty">Nada encontrado para “{q}”.</p>}
          {groups.map((g) => (
            <div key={g.group} className="gs-palette__group" role="group" aria-label={g.group}>
              <div className="gs-palette__glabel">{g.group}</div>
              {g.items.map(({ it, idx }) => {
                const Icon = it.icon ?? ArrowRight;
                return (
                  <button
                    key={`${it.group}-${it.id}`}
                    id={`gs-pal-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={idx === selected}
                    data-idx={idx}
                    className="gs-palette__item"
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => run(it)}
                  >
                    <Icon size={16} aria-hidden className="gs-palette__icon" />
                    <span className="gs-palette__label">{it.label}</span>
                    {it.sub && <span className="gs-palette__sub">{it.sub}</span>}
                    {idx === selected && <CornerDownLeft size={14} aria-hidden className="gs-palette__enter" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <footer className="gs-palette__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>⌘</kbd><kbd>K</kbd> de qualquer tela</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
