// Card de histórico do coach — T3.11 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Lista os stints (passagens por org) do coach atual. Cada stint mostra:
//   org · período (split N → M) · troféus · win-rate · tier
// Header: chip de REPUTAÇÃO 0-99 colorido.

import { useMemo } from 'react';
import {
  reputationColor,
  reputationLabel,
  summarizeCoach,
  type CoachStint,
} from '../../engine/coachCareer';

interface Props {
  stints: CoachStint[];
  coachNick?: string;
}

export function CoachStintsCard({ stints, coachNick }: Props) {
  const summary = useMemo(() => summarizeCoach(stints), [stints]);
  const repColor = reputationColor(summary.reputation);
  const repLabel = reputationLabel(summary.reputation);

  return (
    <section style={sectionStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={kickerStyle}>Carreira do coach</span>
          <span style={nickStyle}>{coachNick ?? '—'}</span>
        </div>
        <div style={repChipStyle(repColor)}>
          <span style={{ color: 'var(--em-muted)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.4px' }}>REPUTAÇÃO</span>
          <b style={{ color: repColor, fontFamily: '"JetBrains Mono", monospace', fontSize: '1.6rem', lineHeight: 1 }}>
            {summary.reputation}
          </b>
          <span style={{ color: 'var(--em-text)', fontSize: '0.72rem', fontWeight: 600 }}>{repLabel}</span>
        </div>
      </header>

      <div style={statsRowStyle}>
        <StatChip label="Stints" value={summary.totalStints} />
        <StatChip label="Troféus" value={summary.totalTrophies} tone="gold" />
        <StatChip label="V/D" value={`${summary.totalWins}-${summary.totalLosses}`} />
        <StatChip label="Win rate" value={`${Math.round(summary.winRate * 100)}%`} />
      </div>

      {stints.length === 0 ? (
        <p style={emptyStyle}>Nenhum stint registrado ainda. Resultados serão contabilizados conforme você joga.</p>
      ) : (
        <ol style={listStyle}>
          {[...stints].reverse().map((s, i) => (
            <li key={`${s.coachId}-${s.startSplit}-${i}`} style={stintItemStyle(s.endSplit == null)}>
              <div style={stintHeaderStyle}>
                <span style={{ fontWeight: 700, color: 'var(--em-text)' }}>
                  {s.orgTag ? `${s.orgTag} · ` : ''}{s.orgName}
                </span>
                <span style={{ color: 'var(--em-muted)', fontSize: '0.74rem', fontFamily: '"JetBrains Mono", monospace' }}>
                  Split {s.startSplit} → {s.endSplit ?? 'agora'}
                </span>
              </div>
              <div style={stintMetaStyle}>
                <span>Tier <b>{s.tier}</b></span>
                <span>· {s.wins}V {s.losses}D</span>
                <span style={{ color: 'var(--em-gold)' }}>· {s.trophies.length} troféu{s.trophies.length === 1 ? '' : 's'}</span>
              </div>
              {s.trophies.length > 0 && (
                <div style={trophyRowStyle}>
                  {s.trophies.map((t, ti) => (
                    <span key={ti} style={trophyChipStyle}>{t}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StatChip({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'neutral' | 'gold' }) {
  const color = tone === 'gold' ? 'var(--em-gold)' : 'var(--em-text)';
  return (
    <div style={statChipStyle}>
      <span style={{ color: 'var(--em-muted)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <b style={{ color, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.96rem' }}>
        {value}
      </b>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles

const sectionStyle: React.CSSProperties = {
  background: 'var(--em-panel)',
  border: '1px solid var(--em-border)',
  borderLeft: '3px solid #5a8aa8',
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

const nickStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'var(--em-text)',
};

const repChipStyle = (color: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 2,
  padding: '6px 14px',
  background: 'var(--em-panel-2)',
  border: `1px solid ${color}55`,
  borderRadius: 4,
});

const statsRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
};

const statChipStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '6px 10px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 3,
};

const emptyStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--em-muted)',
  fontSize: '0.84rem',
  fontStyle: 'italic',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const stintItemStyle = (active: boolean): React.CSSProperties => ({
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderLeft: active ? '3px solid var(--em-gold)' : '3px solid var(--em-border)',
  borderRadius: 3,
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

const stintHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 10,
};

const stintMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  color: 'var(--em-muted)',
  fontSize: '0.78rem',
  fontFamily: '"JetBrains Mono", monospace',
};

const trophyRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 4,
};

const trophyChipStyle: React.CSSProperties = {
  padding: '2px 8px',
  background: 'rgba(232, 169, 59, 0.10)',
  border: '1px solid rgba(232, 169, 59, 0.45)',
  borderRadius: 3,
  color: 'var(--em-gold)',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.3px',
};
