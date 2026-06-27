// InfrastructurePage — T10.1 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Page dedicada pros 3 prédios da org (gym/training, analyst-room,
// psychologist-room). Cada card mostra:
//   - Header: ícone, nome, nível atual com bolinhas (0-3)
//   - Descrição do benefit (em prosa)
//   - Próximo nível: custo + ganho esperado (texto curto)
//   - Botão "Investir" (desabilitado se MAX ou sem grana)
// Header da page: upkeep total no split + caixa atual.
//
// Reusa engine de facilities.ts. Recebe `facilities` e `budget` + handler
// `onUpgrade(key)` que o caller (CareerScreen) processa (debita + aplica).

import { CareerIcon, type CareerIconName } from '../components/career/CareerIcon';
import {
  FACILITY_MAX_LEVEL,
  facilityUpgradeCost,
  facilityUpkeep,
  type Facilities,
  type FacilityKey,
} from '../engine/career/facilities';
// formatMoney local (mesmo padrão dos outros modais T11)
function formatMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

interface FacilityMeta {
  key: FacilityKey;
  icon: CareerIconName;
  name: string;
  tagline: string;
  benefitByLevel: (level: number) => string;
}

const META: FacilityMeta[] = [
  {
    key: 'training',
    icon: 'dumbbell',
    name: 'Centro de treino',
    tagline: 'Acelera evolução de potencial.',
    benefitByLevel: (lv) => {
      if (lv === 0) return 'Sem bônus de progressão.';
      return `+${lv} chance/split de cada jovem (≤24 anos) evoluir +1 OVR.`;
    },
  },
  {
    key: 'analyst',
    icon: 'chart',
    name: 'Sala de analista',
    tagline: 'Prepara mapas favoritos antes da série.',
    benefitByLevel: (lv) => {
      if (lv === 0) return 'Sem ajuste em map prefs.';
      return `+${(lv * 0.45).toFixed(2)} em map_pref dos 3 mapas mais fortes (boost de preparo).`;
    },
  },
  {
    key: 'psychologist',
    icon: 'brain',
    name: 'Sala de psicólogo',
    tagline: 'Estabiliza moral pós-derrota.',
    benefitByLevel: (lv) => {
      if (lv === 0) return 'Sem correção automática de morale.';
      return `Cada split, moral converge para 70 a ${Math.round(lv * 8)}% por jogador (anti-tilt).`;
    },
  },
];

interface Props {
  facilities: Facilities;
  budget: number;
  onUpgrade: (key: FacilityKey) => void;
  onClose?: () => void;
}

export function InfrastructurePage({ facilities, budget, onUpgrade, onClose }: Props) {
  const upkeep = facilityUpkeep(facilities);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--em-text)' }}>
            Infraestrutura
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--em-muted)' }}>
            Investimentos que aceleram seu elenco e prep dos jogos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <HudPill label="Caixa" value={formatMoney(budget)} tone="green" />
          <HudPill label="Upkeep / split" value={`-${formatMoney(upkeep)}`} tone={upkeep > 0 ? 'red' : 'neutral'} />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {META.map((m) => (
          <FacilityCard
            key={m.key}
            meta={m}
            level={facilities[m.key]}
            budget={budget}
            onUpgrade={() => onUpgrade(m.key)}
          />
        ))}
      </div>

      {onClose && (
        <div style={{ textAlign: 'right', borderTop: '1px solid var(--em-border)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: 'var(--em-gold)',
              color: '#1a1205',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function FacilityCard({
  meta,
  level,
  budget,
  onUpgrade,
}: {
  meta: FacilityMeta;
  level: number;
  budget: number;
  onUpgrade: () => void;
}) {
  const cost = facilityUpgradeCost(meta.key, level);
  const isMax = level >= FACILITY_MAX_LEVEL;
  const canAfford = budget >= cost;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        background: 'var(--em-panel)',
        border: '1px solid var(--em-border)',
        borderRadius: 6,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            background: level > 0 ? 'var(--em-gold)' : 'var(--em-panel-2)',
            color: level > 0 ? '#1a1205' : 'var(--em-muted)',
            borderRadius: 6,
          }}
        >
          <CareerIcon name={meta.icon} size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--em-text)' }}>{meta.name}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--em-muted)' }}>{meta.tagline}</div>
        </div>
      </header>

      {/* Nível em bolinhas */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3].map((slot) => (
          <span
            key={slot}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: slot <= level ? 'var(--em-gold)' : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
        <span style={{ fontSize: '0.78rem', fontFamily: '"JetBrains Mono", monospace', color: 'var(--em-text)', fontWeight: 700, marginLeft: 6 }}>
          {level}/{FACILITY_MAX_LEVEL}
        </span>
      </div>

      {/* Benefit atual */}
      <div
        style={{
          padding: '8px 10px',
          background: 'var(--em-panel-2)',
          borderRadius: 4,
          fontSize: '0.78rem',
          color: 'var(--em-text)',
          lineHeight: 1.4,
        }}
      >
        <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
          Atual (nv {level})
        </div>
        {meta.benefitByLevel(level)}
      </div>

      {/* Próximo nível + upgrade */}
      {isMax ? (
        <div
          style={{
            padding: '10px 12px',
            background: 'rgba(232, 193, 112, 0.12)',
            border: '1px solid rgba(232, 193, 112, 0.4)',
            borderRadius: 4,
            textAlign: 'center',
            color: 'var(--em-gold)',
            fontWeight: 800,
            fontSize: '0.84rem',
          }}
        >
          MAX
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(94, 216, 138, 0.08)',
              border: '1px solid rgba(94, 216, 138, 0.25)',
              borderRadius: 4,
              fontSize: '0.76rem',
              color: 'var(--em-text)',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontSize: '0.66rem', color: '#5ed88a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2, fontWeight: 700 }}>
              Próximo nv ({level + 1})
            </div>
            {meta.benefitByLevel(level + 1)}
          </div>
          <button
            type="button"
            disabled={!canAfford}
            onClick={onUpgrade}
            style={{
              padding: '8px 12px',
              background: canAfford ? 'var(--em-gold)' : 'var(--em-panel-2)',
              color: canAfford ? '#1a1205' : 'var(--em-muted)',
              border: canAfford ? 'none' : '1px solid var(--em-border)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontWeight: 800,
              fontSize: '0.84rem',
              cursor: canAfford ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Investir</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{formatMoney(cost)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function HudPill({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'neutral' }) {
  const colors: Record<string, { fg: string; bg: string; border: string }> = {
    green: { fg: '#5ed88a', bg: 'rgba(94, 216, 138, 0.12)', border: 'rgba(94, 216, 138, 0.4)' },
    red: { fg: '#e58a8a', bg: 'rgba(229, 138, 138, 0.12)', border: 'rgba(229, 138, 138, 0.4)' },
    neutral: { fg: 'var(--em-text)', bg: 'var(--em-panel-2)', border: 'var(--em-border)' },
  };
  const c = colors[tone];
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        padding: '6px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        lineHeight: 1.1,
      }}
    >
      <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <b style={{ fontFamily: '"JetBrains Mono", monospace', color: c.fg, fontSize: '0.92rem', fontWeight: 800 }}>{value}</b>
    </div>
  );
}
