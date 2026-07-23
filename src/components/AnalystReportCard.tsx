// AnalystReportCard — T3.13. Mostra o relatório do analista sobre o adversário
// antes da partida. Recebe o report + nome dos times.
//
// Layout:
//   ┌─────────────────────────────────────────────┐
//   │ 📊 RELATÓRIO  · Ameaça: [ELITE]              │
//   ├─────────────────────────────────────────────┤
//   │ Narrativa contextual                          │
//   ├─────────────────────────────────────────────┤
//   │ Star: PLAYER (OVR · Role)                    │
//   │ Elo fraco: PLAYER (OVR · Role)               │
//   ├─────────────────────────────────────────────┤
//   │ Ban prioritário: MIRAGE, INFERNO              │
//   │ Pick natural: NUKE                            │
//   ├─────────────────────────────────────────────┤
//   │ ⚠ Composição sem AWP/IGL (se houver)         │
//   └─────────────────────────────────────────────┘

import { MAP_LABELS } from '../types';
import type { AnalystReport } from '../engine/analystReport';
import { THREAT_LABEL, THREAT_COLOR } from '../engine/analystReport';

interface Props {
  report: AnalystReport;
  oppName: string;
  oppTag?: string;
}

export function AnalystReportCard({ report, oppName, oppTag }: Props) {
  const threatColor = THREAT_COLOR[report.threatLevel];

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <span style={iconStyle}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={titleStyle}>Relatório do analista</div>
          <div style={subtitleStyle}>
            {oppTag ? `${oppTag} · ` : ''}{oppName}
          </div>
        </div>
        <span style={threatChipStyle(threatColor)}>
          <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>AMEAÇA</span>
          <b style={{ color: threatColor, fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {THREAT_LABEL[report.threatLevel]}
          </b>
        </span>
      </header>

      <p style={narrativeStyle}>{report.narrative}</p>

      <div style={gridStyle}>
        <PlayerChip label="Estrela" value={report.starPlayer.nick} sub={`${report.starPlayer.ovr} · ${report.starPlayer.role}`} tone="warning" />
        <PlayerChip label="Elo fraco" value={report.weakLink.nick} sub={`${report.weakLink.ovr} · ${report.weakLink.role}`} tone="positive" />
      </div>

      <div style={mapsRowStyle}>
        {/* #25 — anexa o W-L REAL da sua run a cada recomendação (quando há amostra) */}
        <MapChip label="Ban prioritário" maps={report.recommendedBans.map((m) => withRecord(m, report))} tone="danger" />
        <MapChip label="Nossa pick" maps={[withRecord(report.recommendedPick, report)]} tone="success" />
      </div>

      {report.missingRoles.length > 0 && (
        <div style={warningStyle}>
          <span>⚠</span>
          <span>
            Composição sem <b>{report.missingRoles.join(', ')}</b> — explore isso na execução.
          </span>
        </div>
      )}
    </section>
  );
}

// "Nuke (você: 1-4)" quando a run tem histórico naquele mapa; só o nome senão.
function withRecord(m: string, report: AnalystReport): string {
  const label = MAP_LABELS[m] ?? m;
  const rec = report.realRecord?.[m as keyof NonNullable<AnalystReport['realRecord']>];
  return rec ? `${label} (você: ${rec.w}-${rec.l})` : label;
}

function PlayerChip({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'warning' | 'positive' }) {
  const color = tone === 'warning' ? '#e25a5a' : '#5ed88a';
  return (
    <div style={playerChipStyle(color)}>
      <span style={{ color: 'var(--em-muted)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ color: 'var(--em-text)', fontWeight: 700, fontSize: '0.96rem' }}>{value}</span>
      <span style={{ color, fontSize: '0.74rem', fontFamily: '"JetBrains Mono", monospace' }}>{sub}</span>
    </div>
  );
}

function MapChip({ label, maps, tone }: { label: string; maps: string[]; tone: 'danger' | 'success' }) {
  const color = tone === 'danger' ? '#e25a5a' : '#5ed88a';
  return (
    <div style={mapChipStyle}>
      <span style={{ color: 'var(--em-muted)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {maps.map((m) => (
          <span
            key={m}
            style={{
              padding: '3px 10px',
              background: `${color}22`,
              border: `1px solid ${color}55`,
              borderRadius: 3,
              color,
              fontWeight: 700,
              fontSize: '0.76rem',
              letterSpacing: '0.3px',
            }}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles

const cardStyle: React.CSSProperties = {
  background: 'var(--em-panel)',
  border: '1px solid var(--em-border)',
  borderLeft: '3px solid #7a3a8a',
  borderRadius: 6,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const iconStyle: React.CSSProperties = {
  fontSize: '1.4rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--em-muted)',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--em-text)',
};

const threatChipStyle = (color: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 2,
  padding: '4px 10px',
  background: 'var(--em-panel-2)',
  border: `1px solid ${color}55`,
  borderRadius: 3,
});

const narrativeStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--em-text)',
  fontSize: '0.86rem',
  lineHeight: 1.5,
  fontStyle: 'italic',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
};

const playerChipStyle = (color: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 12px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderLeft: `3px solid ${color}`,
  borderRadius: 3,
});

const mapsRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
};

const mapChipStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 12px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 3,
};

const warningStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  background: 'rgba(232,169,59,0.10)',
  border: '1px solid rgba(232,169,59,0.45)',
  borderRadius: 3,
  fontSize: '0.84rem',
  color: 'var(--em-text)',
};
