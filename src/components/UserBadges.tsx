// UserBadges — T7.3 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Tira de badges que resume conquistas da carreira do user/manager:
//   - Troféus (circuitos vencidos + Majors)
//   - Tier alcançado (1 = elite, ouro)
//   - Lendas (sponsors top, splits jogados, etc.)
//
// Componente puro recebendo derivações JÁ COMPUTADAS — o consumer
// (CareerScreen / ManagerProfile) decide o que passar.

import { CareerIcon, type CareerIconName } from './career/CareerIcon';

export interface UserBadge {
  id: string;
  icon: CareerIconName;
  label: string;
  /** Valor numérico ou texto curto exibido em destaque (ex.: '3', 'Tier 1') */
  value: string | number;
  /** Tom: gold (Majors / topo), green (positivo), blue (info), purple (raro) */
  tone?: 'gold' | 'green' | 'blue' | 'purple' | 'neutral';
  /** Tooltip explicativo */
  hint?: string;
}

interface Props {
  badges: UserBadge[];
  size?: 'sm' | 'md';
}

const TONE_COLORS: Record<NonNullable<UserBadge['tone']>, { bg: string; fg: string; border: string }> = {
  gold:    { bg: 'rgba(232, 193, 112, 0.16)', fg: '#e8c170', border: 'rgba(232, 193, 112, 0.5)' },
  green:   { bg: 'rgba(94, 216, 138, 0.14)',  fg: '#5ed88a', border: 'rgba(94, 216, 138, 0.4)' },
  blue:    { bg: 'rgba(95, 164, 232, 0.14)',  fg: '#5fa4e8', border: 'rgba(95, 164, 232, 0.4)' },
  purple:  { bg: 'rgba(155, 111, 232, 0.14)', fg: '#9b6fe8', border: 'rgba(155, 111, 232, 0.4)' },
  neutral: { bg: 'var(--em-panel-2)',         fg: 'var(--em-text)', border: 'var(--em-border)' },
};

export function UserBadges({ badges, size = 'md' }: Props) {
  if (badges.length === 0) return null;
  const padding = size === 'sm' ? '4px 8px' : '6px 12px';
  const iconSize = size === 'sm' ? 13 : 16;
  const fontValue = size === 'sm' ? '0.86rem' : '1rem';
  const fontLabel = size === 'sm' ? '0.62rem' : '0.66rem';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {badges.map((b) => {
        const colors = TONE_COLORS[b.tone ?? 'neutral'];
        return (
          <div
            key={b.id}
            title={b.hint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              minWidth: 64,
            }}
          >
            <span style={{ color: colors.fg, display: 'inline-flex' }}>
              <CareerIcon name={b.icon} size={iconSize} />
            </span>
            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <b style={{ color: colors.fg, fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, fontSize: fontValue }}>
                {b.value}
              </b>
              <span style={{ color: 'var(--em-muted)', fontSize: fontLabel, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {b.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Helper de fábrica — gera os badges padrão dado o estado da carreira.
// O consumer pode usar este helper OU montar `badges` à mão pra customizar.
export interface CareerBadgeInput {
  circuitTitles: number;
  majorTitles: number;
  splitsPlayed: number;
  tier: number; // 1 = elite … 4 = V-League
  majorApps: number;
}

export function buildCareerBadges(input: CareerBadgeInput): UserBadge[] {
  const out: UserBadge[] = [];
  if (input.majorTitles > 0) {
    out.push({
      id: 'majors',
      icon: 'trophy',
      label: input.majorTitles === 1 ? 'Major' : 'Majors',
      value: input.majorTitles,
      tone: 'gold',
      hint: `${input.majorTitles} Major(es) Mundial vencido(s) — lenda confirmada.`,
    });
  }
  if (input.circuitTitles > 0) {
    out.push({
      id: 'titles',
      icon: 'medal',
      label: input.circuitTitles === 1 ? 'Título' : 'Títulos',
      value: input.circuitTitles,
      tone: 'green',
      hint: `${input.circuitTitles} título(s) de circuito regional.`,
    });
  }
  out.push({
    id: 'tier',
    icon: 'star',
    label: 'Tier',
    value: `T${input.tier}`,
    tone: input.tier === 1 ? 'gold' : input.tier === 2 ? 'purple' : 'blue',
    hint: input.tier === 1 ? 'Tier 1 — elite mundial.' : `Tier ${input.tier} — escalada em andamento.`,
  });
  if (input.majorApps > 0) {
    out.push({
      id: 'majorApps',
      icon: 'globe',
      label: input.majorApps === 1 ? 'Major' : 'Majors',
      value: `${input.majorApps}×`,
      tone: 'blue',
      hint: `Disputou ${input.majorApps} Major(es) Mundial(is).`,
    });
  }
  if (input.splitsPlayed > 0) {
    out.push({
      id: 'splits',
      icon: 'calendar',
      label: 'Splits',
      value: input.splitsPlayed,
      tone: 'neutral',
      hint: `${input.splitsPlayed} split(s) disputado(s) na carreira.`,
    });
  }
  return out;
}
