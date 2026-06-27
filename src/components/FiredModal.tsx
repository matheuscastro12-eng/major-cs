// FiredModal — T11.5 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Modal cinematográfico exibido quando a diretoria DEMITE o manager por
// falhas repetidas no objetivo do split. Pattern dos outros modais T11:
//   - Header com gradiente RED (em vez de gold das outras celebrações)
//   - Quote narrativo do board chairman
//   - Stats finais da run (splits jogados, troféus, sponsors perdidos)
//   - Duas ações: reiniciar carreira (wipe slot) ou continuar como "free agent"
//
// Acessível via host global pra ser disparado de qualquer lugar.

import { Modal, Button } from './ds';

export interface FiredModalData {
  orgName: string;
  splitsManaged: number;
  circuitTitles: number;
  majorTitles: number;
  sponsorsLost: number;
  reason: string;
  /** Texto curto do chairman (gerado pelo caller pra variar) */
  quote: string;
}

interface Props {
  data: FiredModalData | null;
  onClose: () => void;
  onRestart: () => void;
}

export function FiredModal({ data, onClose, onRestart }: Props) {
  if (!data) return null;

  return (
    <Modal open={!!data} onClose={onClose} title="" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'stretch' }}>
        {/* Header dramático */}
        <header
          style={{
            margin: '-22px -22px 0',
            padding: '36px 32px 26px',
            background: 'linear-gradient(180deg, rgba(192, 57, 43, 0.22) 0%, rgba(192, 57, 43, 0.04) 100%)',
            borderBottom: '2px solid rgba(192, 57, 43, 0.5)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              color: '#c0392b',
              letterSpacing: '3px',
              fontWeight: 800,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Comunicado oficial
          </div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>
            Você foi demitido
          </h2>
          <div style={{ marginTop: 6, fontSize: '0.84rem', color: 'var(--em-muted)' }}>
            {data.orgName}
          </div>
        </header>

        {/* Quote */}
        <blockquote
          style={{
            margin: 0,
            padding: '14px 18px',
            background: 'var(--em-panel-2)',
            borderLeft: '3px solid #c0392b',
            borderRadius: '0 4px 4px 0',
            color: 'var(--em-text)',
            fontStyle: 'italic',
            fontSize: '0.92rem',
            lineHeight: 1.55,
          }}
        >
          "{data.quote}"
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--em-muted)', fontStyle: 'normal' }}>
            — Diretoria
          </div>
        </blockquote>

        {/* Motivo */}
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            Motivo declarado
          </div>
          <p style={{ margin: 0, color: 'var(--em-text)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            {data.reason}
          </p>
        </div>

        {/* Stats finais */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}
        >
          <Stat label="Splits" value={data.splitsManaged} />
          <Stat label={data.circuitTitles === 1 ? 'Título' : 'Títulos'} value={data.circuitTitles} tone="green" />
          <Stat label={data.majorTitles === 1 ? 'Major' : 'Majors'} value={data.majorTitles} tone="gold" />
          <Stat label="Sponsors perdidos" value={data.sponsorsLost} tone="red" />
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--em-border)', paddingTop: 14 }}>
          <Button variant="ghost" onClick={onClose}>
            Continuar (livre)
          </Button>
          <Button variant="primary" onClick={onRestart}>
            Reiniciar carreira
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'green' | 'gold' | 'red' | 'neutral' }) {
  const colors: Record<string, string> = {
    green: '#5ed88a',
    gold: '#e8c170',
    red: '#e58a8a',
    neutral: 'var(--em-text)',
  };
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '10px 6px',
        background: 'var(--em-panel-2)',
        border: '1px solid var(--em-border)',
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace', color: colors[tone] }}>
        {value}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
