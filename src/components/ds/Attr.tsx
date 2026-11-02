// Número de atributo 1–20 pintado pela faixa (tokens --c-attr-1..5), o mesmo
// corte do attrColor de engine/attributes.ts: 16+ elite, 13+ bom, 10+ ok,
// 7+ fraco, abaixo disso ruim. Use em tabela, perfil e peek.
import { cx } from './cx';

export function attrBand(v: number): 1 | 2 | 3 | 4 | 5 {
  if (v >= 16) return 5;
  if (v >= 13) return 4;
  if (v >= 10) return 3;
  if (v >= 7) return 2;
  return 1;
}

export function AttrValue({ value, size = 'md', className }: { value: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const v = Math.max(1, Math.min(20, Math.round(value)));
  return <span className={cx('ds-attr', size !== 'md' && `ds-attr--${size}`, className)} data-band={attrBand(v)}>{v}</span>;
}

/** Legenda das 5 faixas (1–6 · 7–9 · 10–12 · 13–15 · 16–20). */
export function AttrLegend() {
  const bands: [string, number][] = [['1–6', 3], ['7–9', 8], ['10–12', 11], ['13–15', 14], ['16–20', 18]];
  return (
    <div className="ds-attr-legend" aria-label="Escala de atributos de 1 a 20">
      {bands.map(([t, v]) => <span key={t} data-band={attrBand(v)}>{t}</span>)}
    </div>
  );
}
