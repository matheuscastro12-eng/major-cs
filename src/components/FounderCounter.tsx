// Contador de Fundadores — prova social REAL (números do servidor, nunca
// inventados). Se o fetch falhar ou o dado for inválido, NÃO renderiza nada.
// Esgotou (founders >= limit)? Diz isso honestamente e, quando o total real
// de contas pagas já chegou do servidor, troca a mensagem muda por esse
// número — ainda prova social, sem reabrir uma vaga que não existe. Todas as
// superfícies que o usam já são free-only.
import type { CSSProperties } from 'react';
import { useFounders } from '../state/founders';
import { ct } from '../state/career-i18n';

const pad3 = (n: number) => `#${String(n).padStart(3, '0')}`;

export function FounderCounter({ style }: { style?: CSSProperties }) {
  const stats = useFounders();
  if (!stats) return null; // sem dado real → sem contador (nunca um número fake)
  const left = Math.max(0, stats.limit - stats.founders);
  const soldOut = left <= 0;
  // funil: os 500 Fundadores esgotaram em 24/08 — desde então essas 14
  // superfícies (Landing, Home, UpsellCard, RtP, Ultimate...) só mostravam
  // "esgotada", sem nenhum número: a prova social que existia (vagas caindo)
  // ficou muda bem no momento da decisão. paidTotal é real (mesma query do
  // founders/limit) — se ainda não chegou, mantém a frase antiga em vez de
  // inventar um número.
  const hasPaidTotal = typeof stats.paidTotal === 'number' && stats.paidTotal > 0;
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
        hasPaidTotal
          ? <>★ {ct('Edição Fundador esgotada')} · {ct('já são')} {stats.paidTotal} {ct('jogadores com conta vitalícia')}</>
          : <>{ct('Edição Fundador esgotada — a conta vitalícia segue disponível.')}</>
      ) : (
        <>
          ★ {ct('Seja o Fundador')} {pad3(stats.founders + 1)} {ct('de')} {stats.limit} · {ct('restam')} {left} {left === 1 ? ct('vaga') : ct('vagas')}
        </>
      )}
    </span>
  );
}
