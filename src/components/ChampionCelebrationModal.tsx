// Modal cinematográfico de campeonato — T11.1 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Aparece quando o user GANHA um torneio (circuito ou Major). Mostra troféu
// grande em ouro, nome do torneio, prize ganho. Acent dourado pesado.
// Reusa Modal do design system com tema cinematográfico.

import { useEffect, useState } from 'react';
import { Modal, Button } from './ds';
import { CareerIcon } from './career/CareerIcon';

export interface ChampionCelebrationData {
  /** Nome do torneio: 'Major Mundial', 'BLAST Premier Brasília', etc. */
  tournamentName: string;
  /** Nome/tag da org campeã */
  orgName: string;
  /** Tier do troféu: 'major' = world title (ouro intenso), 'circuit' = regional (ouro claro) */
  tier: 'major' | 'circuit';
  /** Prize em USD */
  prize: number;
  /** Texto opcional de epílogo (ex.: "primeiro título do BR no mundial") */
  flavor?: string;
}

interface Props {
  data: ChampionCelebrationData;
  onClose: () => void;
}

export function ChampionCelebrationModal({ data, onClose }: Props) {
  // entrada com fade — pequeno efeito sem framer-motion
  const [phase, setPhase] = useState<'enter' | 'shown'>('enter');
  useEffect(() => {
    const t = setTimeout(() => setPhase('shown'), 60);
    return () => clearTimeout(t);
  }, []);

  const accent = data.tier === 'major' ? '#ffd45e' : '#e8a93b';
  const accentGlow = data.tier === 'major' ? 'rgba(255, 212, 94, 0.6)' : 'rgba(232, 169, 59, 0.45)';
  const subtitle = data.tier === 'major' ? 'CAMPEÃO DO MUNDO' : 'CAMPEÃO REGIONAL';

  return (
    <Modal open onClose={onClose} title={undefined} size="md" hideClose closeOnBackdrop={false}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          padding: '14px 6px',
          textAlign: 'center',
          opacity: phase === 'enter' ? 0 : 1,
          transform: phase === 'enter' ? 'translateY(8px)' : 'translateY(0)',
          transition: 'opacity .4s ease, transform .4s ease',
        }}
      >
        {/* Troféu gigante com glow */}
        <div
          style={{
            color: accent,
            filter: `drop-shadow(0 0 24px ${accentGlow})`,
            animation: 'cc-pulse 2s ease-in-out infinite',
          }}
        >
          <CareerIcon name="trophy" size={88} />
        </div>
        <style>{`@keyframes cc-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }`}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '3px',
              color: accent,
            }}
          >
            {subtitle}
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: '1.6rem',
              fontWeight: 800,
              color: 'var(--em-text)',
              letterSpacing: '0.5px',
            }}
          >
            {data.tournamentName}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.92rem', color: 'var(--em-text)' }}>
            {data.orgName}
          </p>
        </div>

        {/* Prize */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 22px',
            background: 'var(--em-panel-2)',
            border: `1px solid ${accent}`,
            borderRadius: 4,
          }}
        >
          <CareerIcon name="coin" size={16} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1.2rem', fontWeight: 800, color: accent }}>
            {formatMoney(data.prize)}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--em-muted)' }}>em prêmio</span>
        </div>

        {data.flavor && (
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--em-muted)', fontStyle: 'italic', maxWidth: 380 }}>
            {data.flavor}
          </p>
        )}

        <Button variant="gold" size="big" onClick={onClose}>
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
