// Modal de evento de time — T3.6 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Recebe o evento + callbacks. Mostra title + body + N choices. Cada choice
// é um botão dedicado (não dá pra usar ConfirmDialog que é 2 botões fixos).
//
// Após escolha, MOSTRA o outcome em 2 etapas:
//   1) User clica em um choice → componente chama `onChoose(choiceId)` que
//      retorna o outcome via Promise<string>.
//   2) Mostra a tela "resultado" com o texto + deltas visuais (budget/morale/board)
//      e botão "Continuar" que fecha (onClose).
//
// O consumer (CareerScreen) renderiza condicionalmente quando
// `save.pendingTeamEvent != null`.

import { useMemo, useState } from 'react';
import { Modal, Button } from './ds';
import {
  teamEventById,
  type TeamEventCategory,
  type TeamEventDef,
  type TeamEventChoice,
} from '../engine/teamEvents';

interface Props {
  eventId: string;
  /** Resolve a escolha no save e devolve outcome + deltas pra preview. */
  onChoose: (choiceId: string) => { outcome: string; deltas: Deltas } | null;
  onClose: () => void;
}

interface Deltas {
  budget?: number;
  board?: number;
  morale?: number;
}

const CAT_LABEL: Record<TeamEventCategory, string> = {
  internal: 'Vestiário',
  media: 'Mídia',
  commercial: 'Comercial',
  training: 'Treino',
  staff: 'Staff',
};

const CAT_COLOR: Record<TeamEventCategory, string> = {
  internal: '#c0392b',
  media: '#7a3a8a',
  commercial: '#b08a3a',
  training: '#3a8a8a',
  staff: '#3a6e8a',
};

export function TeamEventModal({ eventId, onChoose, onClose }: Props) {
  const def = useMemo<TeamEventDef | undefined>(() => teamEventById(eventId), [eventId]);
  const [resolved, setResolved] = useState<{ outcome: string; deltas: Deltas } | null>(null);

  if (!def) {
    // Save corrupted ou versão antiga: fecha gracefully
    return (
      <Modal open onClose={onClose} title="Evento" size="sm" hideClose>
        <p>Evento não encontrado. Pode ter sido removido da versão atual.</p>
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </Modal>
    );
  }

  const onPick = (choice: TeamEventChoice) => {
    const result = onChoose(choice.id);
    if (result) setResolved(result);
  };

  const catColor = CAT_COLOR[def.category];
  const catLabel = CAT_LABEL[def.category];

  return (
    <Modal
      open
      onClose={() => {
        if (resolved) onClose();
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 3,
              background: catColor,
              color: '#fff',
              fontSize: '0.66rem',
              fontWeight: 800,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            {catLabel}
          </span>
          <span>{def.title}</span>
        </div>
      }
      size="md"
      closeOnBackdrop={false}
      hideClose={!resolved}
    >
      {!resolved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ margin: 0, color: 'var(--em-text)', lineHeight: 1.5 }}>{def.body}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {def.choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  background: 'var(--em-panel-2)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 4,
                  color: 'var(--em-text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  transition: 'border-color .12s, background .12s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--em-gold)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--em-border)';
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--em-text)', lineHeight: 1.5, fontStyle: 'italic' }}>
            {resolved.outcome}
          </p>
          <DeltaRow deltas={resolved.deltas} />
          <div style={{ textAlign: 'right' }}>
            <Button variant="primary" onClick={onClose}>
              Continuar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeltaRow({ deltas }: { deltas: Deltas }) {
  const items: { label: string; value: string; tone: 'pos' | 'neg' | 'neutral' }[] = [];
  if (deltas.budget != null && deltas.budget !== 0) {
    items.push({
      label: 'Caixa',
      value: `${deltas.budget > 0 ? '+' : ''}${formatMoney(deltas.budget)}`,
      tone: deltas.budget > 0 ? 'pos' : 'neg',
    });
  }
  if (deltas.morale != null && deltas.morale !== 0) {
    items.push({
      label: 'Moral',
      value: `${deltas.morale > 0 ? '+' : ''}${deltas.morale}`,
      tone: deltas.morale > 0 ? 'pos' : 'neg',
    });
  }
  if (deltas.board != null && deltas.board !== 0) {
    items.push({
      label: 'Diretoria',
      value: `${deltas.board > 0 ? '+' : ''}${deltas.board}`,
      tone: deltas.board > 0 ? 'pos' : 'neg',
    });
  }
  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--em-muted)', fontSize: '0.78rem' }}>
        Sem efeito imediato.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'var(--em-panel-2)',
            border: `1px solid ${it.tone === 'pos' ? 'rgba(94,216,138,0.45)' : it.tone === 'neg' ? 'rgba(229,138,138,0.45)' : 'var(--em-border)'}`,
            borderRadius: 3,
            fontSize: '0.78rem',
            color: 'var(--em-text)',
          }}
        >
          <span style={{ color: 'var(--em-muted)' }}>{it.label}</span>
          <b style={{ color: it.tone === 'pos' ? '#5ed88a' : it.tone === 'neg' ? '#e58a8a' : 'var(--em-text)', fontFamily: '"JetBrains Mono", monospace' }}>
            {it.value}
          </b>
        </span>
      ))}
    </div>
  );
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}
