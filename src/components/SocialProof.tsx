// [paywall v2] linha de prova social do paywall — números reais do servidor
// (state/socialProof.ts). Nada confiável → não renderiza nada.
import type { CSSProperties } from 'react';
import { useFounders } from '../state/founders';
import { socialProofLines } from '../state/socialProof';
import { ct } from '../state/career-i18n';

export function SocialProof({ style }: { style?: CSSProperties }) {
  const { managers, soldOut } = socialProofLines(useFounders(), ct);
  if (!managers && !soldOut) return null;
  return (
    <span className="paywall-proof" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.76rem', fontWeight: 700, color: 'var(--em-gold, #e8c170)', ...style }}>
      {managers && <span>👥 {managers}</span>}
      {soldOut && <span style={{ color: 'var(--em-muted, rgba(255,255,255,0.6))' }}>★ {soldOut}</span>}
    </span>
  );
}
