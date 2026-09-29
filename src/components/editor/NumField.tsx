// [fase 4 · frente EDITOR] Campo numérico com faixa: digita livre (texto
// local), grava só números válidos (cortados à faixa) e normaliza ao sair.
import { useState } from 'react';
import { attrBand } from '../ds/index';

export function NumField({ value, min, max, onChange, label, id, band = false, wide = false }: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  id?: string;
  /** pinta pela faixa de atributo 1–20 */
  band?: boolean;
  wide?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value);
  const n = Number(shown);
  const invalid = shown.trim() === '' || !Number.isFinite(n) || n < min || n > max;
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className={`edb-num${wide ? ' edb-num--wide' : ''}`}
      value={shown}
      aria-label={label}
      aria-invalid={invalid || undefined}
      data-band={band ? attrBand(value) : undefined}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
        setText(raw);
        const v = Number(raw);
        if (raw !== '' && Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.round(v))));
      }}
      onBlur={() => setText(null)}
    />
  );
}
