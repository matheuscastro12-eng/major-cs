// Modal de eliminação em torneio — T11.4 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Aparece quando o user é eliminado de um Major (ou torneio relevante).
// Mostra fase de eliminação + placement + prize ganho. Tom CINZA (não
// destrutivo), com chance de redenção ("o próximo é o seu").

import { Modal, Button } from './ds';
import { CareerIcon } from './career/CareerIcon';
import type { PlacementCode } from '../engine/swiss';

export interface TournamentEliminationData {
  tournamentName: string;
  placement: PlacementCode;
  prize: number;
  /** Frase opcional contextual (ex.: "perdeu na semifinal pra MIBR") */
  contextLine?: string;
}

interface Props {
  data: TournamentEliminationData;
  onClose: () => void;
}

const PLACEMENT_LABEL: Record<PlacementCode, string> = {
  champion: 'Campeão',
  runnerup: 'Vice-campeão',
  semi: 'Semifinal',
  quarters: 'Quartas de final',
  playoffs: 'Playoffs',
  swiss: 'Fase Suíça',
};

const PLACEMENT_RANGE: Record<PlacementCode, string> = {
  champion: '1º',
  runnerup: '2º',
  semi: '3º-4º',
  quarters: '5º-8º',
  playoffs: '9º-16º',
  swiss: '17º-32º',
};

const PLACEMENT_ACCENT: Record<PlacementCode, string> = {
  champion: '#ffd45e',
  runnerup: '#c0c0c0',
  semi: '#cd7f32', // bronze
  quarters: '#8a8a8a',
  playoffs: '#5a5a5a',
  swiss: '#4a4a4a',
};

export function TournamentEliminationModal({ data, onClose }: Props) {
  const accent = PLACEMENT_ACCENT[data.placement];
  const placementLabel = PLACEMENT_LABEL[data.placement];
  const placementRange = PLACEMENT_RANGE[data.placement];

  return (
    <Modal open onClose={onClose} title={undefined} size="md" hideClose closeOnBackdrop={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '8px 4px', textAlign: 'center' }}>
        <CareerIcon name="medal" size={56} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '2.5px', color: 'var(--em-muted)' }}>
            ELIMINADO
          </span>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--em-text)' }}>
            {data.tournamentName}
          </h2>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '2.2rem',
                fontWeight: 800,
                color: accent,
              }}
            >
              {placementRange}
            </span>
            <span style={{ fontSize: '0.94rem', color: 'var(--em-text)' }}>{placementLabel}</span>
          </div>
        </div>

        {data.prize > 0 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              background: 'var(--em-panel-2)',
              border: '1px solid var(--em-border)',
              borderRadius: 4,
            }}
          >
            <CareerIcon name="coin" size={13} />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.88rem', fontWeight: 700, color: 'var(--em-text)' }}>
              {formatMoney(data.prize)}
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--em-muted)' }}>de prêmio</span>
          </div>
        )}

        {data.contextLine && (
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--em-muted)', fontStyle: 'italic', maxWidth: 400 }}>
            {data.contextLine}
          </p>
        )}

        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--em-text)', maxWidth: 380, lineHeight: 1.4 }}>
          Não foi dessa vez. O próximo torneio começa em breve — hora de revisar o que falhou e voltar mais forte.
        </p>

        <Button variant="primary" onClick={onClose}>
          Continuar
        </Button>
      </div>
    </Modal>
  );
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}
