// Contador de Fundadores — prova social REAL (números do servidor, nunca
// inventados). Se o fetch falhar ou o dado for inválido, NÃO renderiza nada.
// Esgotou (founders >= limit)? Diz isso honestamente e volta pra copy da
// vitalícia comum. Todas as superfícies que o usam já são free-only.
import type { CSSProperties } from 'react';
import { useFounders } from '../state/founders';
import { ct } from '../state/career-i18n';

const pad3 = (n: number) => `#${String(n).padStart(3, '0')}`;

export function FounderCounter({ style }: { style?: CSSProperties }) {
  const stats = useFounders();
  if (!stats) return null; // sem dado real → sem contador (nunca um número fake)
  const left = Math.max(0, stats.limit - stats.founders);
  const soldOut = left <= 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.74rem',
        fontWeight: 700,
        letterSpacing: '0.2px',
        color: soldOut ? 'var(--em-muted, rgba(255,255,255,0.55))' : 'var(--em-gold, #e8c170)',
        ...style,
      }}
    >
      {soldOut ? (
        <>{ct('Edição Fundador esgotada — a conta vitalícia segue disponível.')}</>
      ) : (
        <>
          ★ {ct('Seja o Fundador')} {pad3(stats.founders + 1)} {ct('de')} {stats.limit} · {ct('restam')} {left} {left === 1 ? ct('vaga') : ct('vagas')}
        </>
      )}
    </span>
  );
}
