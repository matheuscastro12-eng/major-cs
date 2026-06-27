// Player Talk Modal — T3.7 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Permite o manager conversar com UM jogador específico. Fluxo:
//   1) Tela 1: escolher TÓPICO (playtime/effort/defend/behavior/extension/praise)
//   2) Tela 2: escolher TOM (firm/friendly/motivational)
//   3) Tela 3: outcome com narrativa + delta de morale visível
//
// Cooldown: 1 por player a cada 2 splits. Se em cooldown, o modal mostra
// mensagem em vez das opções.

import { useState } from 'react';
import { Modal, Button } from './ds';
import {
  TALK_TOPICS,
  TALK_TONES,
  canTalkNow,
  resolvePlayerTalk,
  type TalkTopicId,
  type TalkTone,
  type TalkResult,
  type PlayerTalkState,
} from '../engine/playerTalks';

interface Props {
  playerNick: string;
  playerState: PlayerTalkState;
  /** Aplica o resultado no save (atualiza morale + lastTalkAt). */
  onResolve: (result: TalkResult) => void;
  onClose: () => void;
}

type Stage = 'topic' | 'tone' | 'outcome' | 'cooldown';

export function PlayerTalkModal({ playerNick, playerState, onResolve, onClose }: Props) {
  const initialStage: Stage = canTalkNow(playerState) ? 'topic' : 'cooldown';
  const [stage, setStage] = useState<Stage>(initialStage);
  const [topic, setTopic] = useState<TalkTopicId | null>(null);
  const [result, setResult] = useState<TalkResult | null>(null);

  const pickTone = (tone: TalkTone) => {
    if (!topic) return;
    const r = resolvePlayerTalk(playerState, topic, tone);
    setResult(r);
    setStage('outcome');
    onResolve(r);
  };

  const closeAfterOutcome = () => {
    onClose();
  };

  const title = `Conversa com ${playerNick}`;

  if (stage === 'cooldown') {
    return (
      <Modal open onClose={onClose} title={title} size="sm">
        <p style={{ margin: 0, color: 'var(--em-text)', lineHeight: 1.5 }}>
          Você acabou de conversar com {playerNick} recentemente. Espere mais um split
          antes de outra conversa pra não saturar o vestiário.
        </p>
        <div style={{ textAlign: 'right', marginTop: 14 }}>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => {
        // Permite fechar a qualquer momento; outcome aplica via onResolve
        if (stage === 'outcome') closeAfterOutcome();
        else onClose();
      }}
      title={title}
      size="md"
      closeOnBackdrop={stage !== 'outcome'}
      hideClose={stage === 'outcome'}
    >
      {stage === 'topic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: 'var(--em-muted)', fontSize: '0.86rem' }}>
            Sobre o que você quer conversar?
          </p>
          {TALK_TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTopic(t.id);
                setStage('tone');
              }}
              style={topicBtnStyle}
              onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--em-gold)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--em-border)'}
            >
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t.label}</span>
              <span style={{ color: 'var(--em-muted)', fontSize: '0.76rem' }}>{t.description}</span>
            </button>
          ))}
        </div>
      )}

      {stage === 'tone' && topic && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, color: 'var(--em-muted)', fontSize: '0.86rem' }}>
            Em que tom? <span style={{ color: 'var(--em-text)', fontWeight: 600 }}>
              {TALK_TOPICS.find((t) => t.id === topic)?.label}
            </span>
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {TALK_TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTone(t.id)}
                style={toneBtnStyle}
                onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--em-gold)'}
                onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--em-border)'}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => setStage('topic')}>
              ← Voltar
            </Button>
          </div>
        </div>
      )}

      {stage === 'outcome' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--em-text)', lineHeight: 1.5, fontStyle: 'italic' }}>
            {result.outcome.outcome}
          </p>
          <MoraleDeltaChip delta={result.outcome.moraleDelta} tone={result.outcome.tone} />
          <div style={{ textAlign: 'right', marginTop: 6 }}>
            <Button variant="primary" onClick={closeAfterOutcome}>Continuar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MoraleDeltaChip({ delta, tone }: { delta: number; tone: 'positive' | 'neutral' | 'negative' }) {
  const color = tone === 'positive' ? '#5ed88a' : tone === 'negative' ? '#e58a8a' : 'var(--em-text)';
  const border = tone === 'positive' ? 'rgba(94,216,138,0.45)' : tone === 'negative' ? 'rgba(229,138,138,0.45)' : 'var(--em-border)';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 12px',
      background: 'var(--em-panel-2)',
      border: `1px solid ${border}`,
      borderRadius: 3,
      fontSize: '0.84rem',
      color: 'var(--em-text)',
      width: 'fit-content',
    }}>
      <span style={{ color: 'var(--em-muted)' }}>Moral do jogador</span>
      <b style={{ color, fontFamily: '"JetBrains Mono", monospace' }}>
        {delta > 0 ? '+' : ''}{delta}
      </b>
    </span>
  );
}

const topicBtnStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  background: 'var(--em-panel-2)',
  border: '1px solid var(--em-border)',
  borderRadius: 4,
  color: 'var(--em-text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  transition: 'border-color .12s',
};

const toneBtnStyle: React.CSSProperties = {
  flex: 1,
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
};
