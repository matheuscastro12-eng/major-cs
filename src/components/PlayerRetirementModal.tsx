// Modal de aposentadoria de jogador — T11.3 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Aparece quando o engine de aging (T3.9) retira um jogador da carreira.
// Mostra a bio resumida: nick, país, idade na aposentadoria, pico de carreira,
// títulos e estatísticas agregadas.
//
// Se houver MAIS DE 1 retirada no mesmo split, o consumer dispara uma de cada
// vez (passa o array, modal mostra 1 e ao "Continuar" o consumer dispara a próxima).

import { Modal, Button } from './ds';
import { CareerIcon } from './career/CareerIcon';
import { Flag } from './ui';

export interface PlayerRetirementData {
  nick: string;
  name?: string;
  country?: string;
  age: number;
  /** Pico de OVR alcançado na carreira */
  peakOvr?: number;
  /** Quantidade de títulos ganhos (Majors + circuitos) */
  titles?: number;
  /** Quantos splits jogou na carreira */
  splitsPlayed?: number;
  /** Quantas vezes foi MVP no fim de torneio */
  mvpAwards?: number;
  /** Frase de epílogo opcional */
  epilogue?: string;
}

interface Props {
  data: PlayerRetirementData;
  onClose: () => void;
}

export function PlayerRetirementModal({ data, onClose }: Props) {
  return (
    <Modal open onClose={onClose} title={undefined} size="md" hideClose closeOnBackdrop={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 4px' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <CareerIcon name="medal" size={48} />
          <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '2px', color: 'var(--em-muted)' }}>
            APOSENTADORIA
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {data.country && <Flag cc={data.country} title={data.country} />}
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--em-text)' }}>
              {data.nick}
            </h2>
            <span style={{ fontSize: '0.84rem', color: 'var(--em-muted)' }}>· {data.age} anos</span>
          </div>
          {data.name && data.name !== data.nick && (
            <span style={{ fontSize: '0.78rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
              {data.name}
            </span>
          )}
        </div>

        {/* Stats agregadas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            width: '100%',
            maxWidth: 480,
          }}
        >
          <StatCell label="Pico OVR" value={data.peakOvr?.toString() ?? '—'} accent="#e8c170" />
          <StatCell label="Títulos" value={data.titles?.toString() ?? '0'} accent="#5ed88a" />
          <StatCell label="MVPs" value={data.mvpAwards?.toString() ?? '0'} accent="#9b6fe8" />
          <StatCell label="Splits" value={data.splitsPlayed?.toString() ?? '—'} accent="#5fa4e8" />
        </div>

        {/* Epilogue */}
        <p
          style={{
            margin: 0,
            fontSize: '0.86rem',
            color: 'var(--em-text)',
            fontStyle: 'italic',
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 440,
          }}
        >
          {data.epilogue ??
            `${data.nick} pendura o teclado depois de uma carreira marcante. Que venham os próximos.`}
        </p>

        <Button variant="primary" onClick={onClose}>
          Continuar
        </Button>
      </div>
    </Modal>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 8px',
        background: 'var(--em-panel-2)',
        border: '1px solid var(--em-border)',
        borderRadius: 4,
      }}
    >
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '1.3rem',
          fontWeight: 800,
          color: accent,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
    </div>
  );
}
