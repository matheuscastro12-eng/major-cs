// Scrim Card — T3.8. Botão "Treinar scrim" + status (X/2 usadas) + descrição
// dos bônus. Aparece na aba Squad do CareerScreen.
//
// Custo + bônus vêm de `SCRIM_INFO` (engine/scrim.ts) pra que mudança no
// engine reflita aqui automaticamente.

import { SCRIM_INFO } from '../../engine/scrim';
import { Button } from '../ds';

interface Props {
  scrimsThisSplit: number;
  budget: number;
  onScrim: () => void;
}

export function ScrimCard({ scrimsThisSplit, budget, onScrim }: Props) {
  const remaining = SCRIM_INFO.maxPerSplit - scrimsThisSplit;
  const canAfford = budget >= SCRIM_INFO.cost;
  const disabled = remaining <= 0 || !canAfford;
  const reason = remaining <= 0
    ? `Limite de ${SCRIM_INFO.maxPerSplit} scrims por split atingido`
    : !canAfford
    ? `Caixa insuficiente (precisa $${SCRIM_INFO.cost.toLocaleString('pt-BR')})`
    : undefined;

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={kickerStyle}>Treino · Scrim semanal</span>
          <span style={titleStyle}>Marcar scrim contra outra org</span>
        </div>
        <span style={quotaStyle(remaining > 0)}>
          <b style={{ fontFamily: '"JetBrains Mono", monospace' }}>{scrimsThisSplit}/{SCRIM_INFO.maxPerSplit}</b>
          <span style={{ fontSize: '0.66rem', color: 'var(--em-muted)', fontWeight: 700, letterSpacing: '0.4px' }}>USADAS</span>
        </span>
      </header>

      <div style={bonusRowStyle}>
        <Bonus label="Custo" value={`-$${SCRIM_INFO.cost.toLocaleString('pt-BR')}`} tone="neg" />
        <Bonus label="Química" value={`+${SCRIM_INFO.chemGain} por par`} tone="pos" />
        <Bonus label="Fadiga" value={`-${SCRIM_INFO.fatigueReduction} pp`} tone="pos" />
      </div>

      <div style={actionRowStyle}>
        <Button variant="primary" size="md" disabled={disabled} onClick={onScrim}>
          Treinar scrim
        </Button>
        {reason && (
          <span style={{ color: 'var(--em-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
            {reason}
          </span>
        )}
      </div>
    </section>
  );
}

function Bonus({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? '#5ed88a' : '#e58a8a';
  return (
    <div style={bonusChipStyle}>
      <span style={{ color: 'var(--em-muted)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <b style={{ color, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.86rem' }}>{value}</b>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles

const cardStyle: React.CSSProperties = {
  background: 'var(--em-panel)',
  border: '1px solid var(--em-border)',
  borderLeft: '3px solid #3a8a8a',
  borderRadius: 6,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 14,
};

const kickerStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--em-muted)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--em-text)',
};

const quotaStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 2,
  padding: '4px 12px',
  background: 'var(--em-panel-2)',
  border: `1px solid ${active ? '#3a8a8a55' : 'var(--em-border)'}`,
  borderRadius: 3,
  color: active ? 'var(--em-text)' : 'var(--em-muted)',
});

const bonusRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
};

const bonusChipStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '6px 10px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 3,
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};
