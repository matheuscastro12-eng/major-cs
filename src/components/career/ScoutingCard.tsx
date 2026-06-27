// Scouting Card — T3.12. Mostra scout contratado (ou opções pra contratar) +
// últimos relatórios entregues. Aparece na aba Squad do CareerScreen.

import {
  PROMISE_COLOR,
  REGION_LABEL,
  SCOUTS,
  scoutById,
  type ScoutReport,
} from '../../engine/scouting';
import { Button } from '../ds';

interface Props {
  hiredScoutId?: string | null;
  scoutReports: ScoutReport[];
  budget: number;
  onHire: (scoutId: string) => void;
  onFire: () => void;
}

export function ScoutingCard({ hiredScoutId, scoutReports, budget, onHire, onFire }: Props) {
  const hired = hiredScoutId ? scoutById(hiredScoutId) : null;
  // últimos 5 relatórios, mais recente primeiro
  const recentReports = [...scoutReports].reverse().slice(0, 5);

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={kickerStyle}>Scouting · Olhar pro mercado</span>
          <span style={titleStyle}>
            {hired ? `Scout: ${hired.name}` : 'Nenhum scout contratado'}
          </span>
        </div>
        {hired && (
          <Button variant="ghost" size="sm" onClick={onFire}>
            Dispensar
          </Button>
        )}
      </header>

      {hired && (
        <div style={hiredMetaStyle}>
          <span><b>Tier {hired.tier}</b></span>
          <span>· {REGION_LABEL[hired.region] ?? hired.region}</span>
          <span style={{ color: '#e58a8a' }}>· ${hired.salaryPerSplit.toLocaleString('pt-BR')}/split</span>
          <span style={{ color: 'var(--em-muted)' }}>· precisão {Math.round(hired.accuracy * 100)}%</span>
        </div>
      )}

      {!hired && (
        <div style={availListStyle}>
          {SCOUTS.map((s) => {
            const canAfford = budget >= s.salaryPerSplit;
            return (
              <div key={s.id} style={scoutOptStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ fontWeight: 700, color: 'var(--em-text)', fontSize: '0.88rem' }}>{s.name}</span>
                  <span style={{ color: 'var(--em-muted)', fontSize: '0.74rem' }}>
                    Tier {s.tier} · {REGION_LABEL[s.region] ?? s.region} · precisão {Math.round(s.accuracy * 100)}%
                  </span>
                  <span style={{ color: '#e58a8a', fontSize: '0.76rem', fontFamily: '"JetBrains Mono", monospace' }}>
                    ${s.salaryPerSplit.toLocaleString('pt-BR')}/split
                  </span>
                </div>
                <Button variant="primary" size="sm" disabled={!canAfford} onClick={() => onHire(s.id)}>
                  Contratar
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {hired && recentReports.length > 0 && (
        <div style={reportsBlockStyle}>
          <h4 style={reportsHeadingStyle}>Últimos relatórios</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentReports.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
          </div>
        </div>
      )}

      {hired && recentReports.length === 0 && (
        <p style={hintStyle}>
          Relatórios começam a chegar no próximo split. Aguarde a virada.
        </p>
      )}
    </section>
  );
}

function ReportRow({ report }: { report: ScoutReport }) {
  const color = PROMISE_COLOR[report.promise];
  return (
    <div style={reportRowStyle(color)}>
      <span style={promiseChipStyle(color)}>{report.promise}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: 'var(--em-text)', fontSize: '0.86rem' }}>
          {report.playerNick} · {report.playerAge}a · {report.playerRole}
        </span>
        <span style={{ color: 'var(--em-muted)', fontSize: '0.74rem', fontStyle: 'italic' }}>
          {report.note}
        </span>
      </div>
      <span style={ovrChipStyle}>
        <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', fontWeight: 700, letterSpacing: '0.4px' }}>OVR ESTIM.</span>
        <b style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1rem', color: 'var(--em-text)' }}>
          {report.reportedOvr}
        </b>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles

const cardStyle: React.CSSProperties = {
  background: 'var(--em-panel)',
  border: '1px solid var(--em-border)',
  borderLeft: '3px solid #b08a3a',
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

const hiredMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  fontSize: '0.84rem',
  color: 'var(--em-text)',
  flexWrap: 'wrap',
};

const availListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const scoutOptStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '8px 12px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 3,
};

const reportsBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  borderTop: '1px solid var(--em-border)',
  paddingTop: 10,
};

const reportsHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--em-muted)',
};

const reportRowStyle = (accent: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderLeft: `3px solid ${accent}`,
  borderRadius: 3,
});

const promiseChipStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: `${color}22`,
  border: `1px solid ${color}`,
  borderRadius: 4,
  color,
  fontWeight: 800,
  fontSize: '0.92rem',
  fontFamily: '"JetBrains Mono", monospace',
});

const ovrChipStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 0,
  padding: '4px 10px',
  background: 'var(--em-panel)',
  border: '1px solid var(--em-border)',
  borderRadius: 3,
};

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: 'var(--em-muted)',
  fontStyle: 'italic',
};
