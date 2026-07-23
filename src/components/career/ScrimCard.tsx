// Scrim Card — T3.8, elevado pelo #6/#21 (gap Brasval): o manager ESCOLHE o
// sparring real (banda de força + disponibilidade) e o scrim roda o motor de
// partida de verdade. O card lista os elegíveis, joga, e mostra o relatório de
// treino (placar, MVP, rating por titular). Aparece na aba Squad.
//
// Custo + bônus vêm de `SCRIM_INFO` (engine/scrim.ts) pra que mudança no
// engine reflita aqui automaticamente.

import { useState } from 'react';
import { SCRIM_INFO, type ScrimMatchReport, type ScrimOpponentOption } from '../../engine/scrim';
import { Button } from '../ds';
import { TeamBadge } from '../ui';

interface Props {
  scrimsThisSplit: number;
  budget: number;
  opponents: ScrimOpponentOption[];
  report: ScrimMatchReport | null;
  onScrim: (oppId: string) => void;
}

const AVAIL_LABEL: Record<ScrimOpponentOption['avail'], string> = {
  available: 'disponível',
  busy: 'em torneio',
  declined: 'recusou',
};

export function ScrimCard({ scrimsThisSplit, budget, opponents, report, onScrim }: Props) {
  const remaining = SCRIM_INFO.maxPerSplit - scrimsThisSplit;
  const canAfford = budget >= SCRIM_INFO.cost;
  const [picked, setPicked] = useState<string | null>(null);
  const pickedOpt = opponents.find((o) => o.id === picked && o.avail === 'available') ?? null;
  const disabled = remaining <= 0 || !canAfford || !pickedOpt;
  const reason = remaining <= 0
    ? `Limite de ${SCRIM_INFO.maxPerSplit} scrims por split atingido`
    : !canAfford
    ? `Caixa insuficiente (precisa $${SCRIM_INFO.cost.toLocaleString('pt-BR')})`
    : !pickedOpt
    ? 'Escolha um sparring disponível'
    : undefined;

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={kickerStyle}>Treino · Scrim</span>
          <span style={titleStyle}>Escolha o sparring — a partida é de verdade</span>
        </div>
        <span style={quotaStyle(remaining > 0)}>
          <b style={{ fontFamily: '"JetBrains Mono", monospace' }}>{scrimsThisSplit}/{SCRIM_INFO.maxPerSplit}</b>
          <span style={{ fontSize: '0.66rem', color: 'var(--em-muted)', fontWeight: 700, letterSpacing: '0.4px' }}>USADAS</span>
        </span>
      </header>

      {/* seletor de sparring: banda de força ± disponibilidade determinística */}
      <div style={oppGridStyle}>
        {opponents.map((o) => {
          const isPicked = picked === o.id;
          const off = o.avail !== 'available';
          return (
            <button
              key={o.id}
              type="button"
              disabled={off}
              onClick={() => setPicked(o.id)}
              style={oppChipStyle(isPicked, off)}
              title={off ? AVAIL_LABEL[o.avail] : `Força ${o.strength} (${o.diff >= 0 ? '+' : ''}${o.diff} vs você)`}
            >
              <TeamBadge tag={o.tag} colors={o.colors} size={18} logoUrl={o.logoUrl} />
              <span style={{ fontWeight: 700, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.tag}</span>
              <b style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem', color: o.diff > 1 ? '#e58a8a' : o.diff < -1 ? '#5ed88a' : 'var(--em-muted)' }}>
                {o.diff >= 0 ? '+' : ''}{o.diff}
              </b>
              <span style={{ fontSize: '0.6rem', color: off ? '#e58a8a' : '#5ed88a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {AVAIL_LABEL[o.avail]}
              </span>
            </button>
          );
        })}
        {opponents.length === 0 && (
          <span style={{ color: 'var(--em-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
            Sem sparrings na sua banda de força (complete o elenco).
          </span>
        )}
      </div>

      <div style={bonusRowStyle}>
        <Bonus label="Custo" value={`-$${SCRIM_INFO.cost.toLocaleString('pt-BR')}`} tone="neg" />
        <Bonus label="Química" value={`até +${(SCRIM_INFO.chemGain * 1.6).toFixed(1)}/par`} tone="pos" />
        <Bonus label="Fadiga" value={`-${SCRIM_INFO.fatigueReduction} pp`} tone="pos" />
      </div>

      <div style={actionRowStyle}>
        <Button variant="primary" size="md" disabled={disabled} onClick={() => pickedOpt && onScrim(pickedOpt.id)}>
          Jogar scrim{pickedOpt ? ` vs ${pickedOpt.tag}` : ''}
        </Button>
        {reason && (
          <span style={{ color: 'var(--em-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
            {reason}
          </span>
        )}
      </div>

      {/* relatório do último treino: placar real + rating por titular */}
      {report && (
        <div style={reportStyle(report.won)}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ color: report.won ? '#5ed88a' : '#e58a8a', fontFamily: '"JetBrains Mono", monospace' }}>
              {report.won ? 'W' : 'L'} {report.myScore}-{report.oppScore}
            </b>
            <span style={{ fontWeight: 700 }}>vs {report.oppName}</span>
            <span style={{ color: 'var(--em-muted)', fontSize: '0.76rem' }}>{report.mapLabel} · química +{report.chemGain}/par</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {report.lines.map((l) => (
              <span key={l.nick} style={{ fontSize: '0.74rem', fontFamily: '"JetBrains Mono", monospace', color: l.nick === report.mvp ? '#e8c170' : 'var(--em-text)' }}>
                {l.nick === report.mvp ? '★ ' : ''}{l.nick} {l.rating.toFixed(2)} ({l.k}-{l.d})
              </span>
            ))}
          </div>
          <p style={{ margin: 0, color: 'var(--em-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>{report.outcome}</p>
        </div>
      )}
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

const oppGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 8,
};

const oppChipStyle = (picked: boolean, off: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '7px 10px',
  background: picked ? 'color-mix(in srgb, #3a8a8a 18%, var(--em-panel-2))' : 'var(--em-panel-2)',
  border: `1px solid ${picked ? '#3a8a8a' : 'var(--em-border)'}`,
  borderRadius: 4,
  color: 'var(--em-text)',
  cursor: off ? 'not-allowed' : 'pointer',
  opacity: off ? 0.5 : 1,
  minWidth: 0,
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

const reportStyle = (won: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 12px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderLeft: `3px solid ${won ? '#5ed88a' : '#e58a8a'}`,
  borderRadius: 4,
});
