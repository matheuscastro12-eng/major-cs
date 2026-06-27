// Modal cinematográfico de Year-end Awards — T3.10 do roadmap em
// .claude/plans/faca-um-planejamento-para-piped-quilt.md.
//
// Mostra cada award em "slide" individual (1 por vez) com fade-in e accent
// dourado. User navega via "Continuar" — no último, fecha. Aparece
// automaticamente quando `save.pendingYearAwards != null`.
//
// Visualmente inspirado em ceremônia de premiação (preto + dourado, números
// grandes, citação). Sem framer-motion ainda — usa CSS transitions inline.

import { useEffect, useState } from 'react';
import { Modal, Button } from './ds';
import type { AwardKind, YearAwards } from '../engine/awards';

interface Props {
  awards: YearAwards;
  onClose: () => void;
}

const KIND_ACCENT: Record<AwardKind, string> = {
  mvp: '#e8c170',          // ouro
  rookie: '#6fd0c1',       // turquesa (frescor)
  mostImproved: '#9b6fe8', // roxo
  coachOfYear: '#e8a93b',  // âmbar
  breakout: '#5ed88a',     // verde (surpresa)
};

const KIND_HEADER: Record<AwardKind, string> = {
  mvp: 'MVP DO ANO',
  rookie: 'REVELAÇÃO',
  mostImproved: 'MAIOR EVOLUÇÃO',
  coachOfYear: 'TÉCNICO DO ANO',
  breakout: 'SURPRESA',
};

export function YearAwardsModal({ awards, onClose }: Props) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  // Re-trigger fade-in ao avançar slide
  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [slideIdx]);

  const winner = awards.winners[slideIdx];
  const isLast = slideIdx >= awards.winners.length - 1;

  const advance = () => {
    if (isLast) onClose();
    else setSlideIdx((i) => i + 1);
  };

  if (!winner) {
    onClose();
    return null;
  }

  const accent = KIND_ACCENT[winner.kind];
  const headerLabel = KIND_HEADER[winner.kind];
  const recipient = winner.playerNick ?? winner.coachNick ?? '—';

  return (
    <Modal
      open
      onClose={() => {
        // Bloqueia fechar via Esc/backdrop pra a cerimônia rodar até o fim.
      }}
      title={`Cerimônia · Ano ${awards.year}`}
      size="md"
      closeOnBackdrop={false}
      hideClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 340 }}>
        {/* Progress dots — quais awards já foram mostrados */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {awards.winners.map((_w, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i === slideIdx ? accent : i < slideIdx ? 'var(--em-muted)' : 'var(--em-panel-2)',
                border: '1px solid var(--em-border)',
                transition: 'background .2s',
              }}
            />
          ))}
        </div>

        {/* Slide cinematográfico — re-monta a cada slide pra dar fade */}
        <div
          key={animKey}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            padding: '20px 10px',
            background: `radial-gradient(ellipse at center, ${accent}22 0%, transparent 70%)`,
            borderRadius: 6,
            animation: 'em-award-fadein .55s ease both',
          }}
        >
          {/* Category header */}
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              letterSpacing: '2px',
              color: accent,
              textTransform: 'uppercase',
            }}
          >
            {headerLabel}
          </div>

          {/* Trophy emoji-free — uso de border + cor */}
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.2rem',
              fontWeight: 800,
              color: accent,
              background: 'var(--em-panel-2)',
              border: `3px solid ${accent}`,
              boxShadow: `0 0 30px ${accent}66`,
            }}
          >
            {winner.kind === 'coachOfYear' ? 'C' : winner.kind === 'rookie' ? 'R' : winner.kind === 'mostImproved' ? '↑' : winner.kind === 'breakout' ? '!' : '★'}
          </div>

          {/* Recipient */}
          <div
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: 'var(--em-text)',
              letterSpacing: '0.5px',
              textAlign: 'center',
            }}
          >
            {recipient}
          </div>

          {/* Label completo */}
          <div
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: accent,
              letterSpacing: '0.5px',
              textAlign: 'center',
            }}
          >
            {winner.label}
          </div>

          {/* Reason */}
          <p
            style={{
              margin: 0,
              maxWidth: 380,
              textAlign: 'center',
              color: 'var(--em-muted)',
              fontSize: '0.86rem',
              lineHeight: 1.5,
              fontStyle: 'italic',
            }}
          >
            "{winner.reason}"
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--em-muted)', fontSize: '0.74rem' }}>
            {slideIdx + 1} de {awards.winners.length}
          </span>
          <Button variant="primary" onClick={advance}>
            {isLast ? 'Encerrar cerimônia' : 'Próximo prêmio'}
          </Button>
        </div>
      </div>

      {/* Animação keyframe inline */}
      <style>{`
        @keyframes em-award-fadein {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </Modal>
  );
}
