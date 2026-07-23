// CareerTimeline (#51 do gap Brasval) — a história da org como NARRATIVA
// escaneável: agrupada por temporada (ano = MAJOR_EVERY splits), cada split
// vira um marco com chip colorido por resultado (título, Major, top 4, fundo
// da tabela). Fica no topo da HistoryTab; a tabela detalhada segue abaixo.

import type { SplitRecord } from '../CareerScreen';
import { PLACE_SHORT, MAJOR_EVERY } from '../CareerScreen';
import { ct } from '../../state/career-i18n';
import { IconTrophy } from './DashIcons';

type Tone = 'gold' | 'good' | 'mid' | 'bad';

interface Milestone {
  split: number;
  text: string;
  tone: Tone;
  major?: string; // texto do chip de Major (se disputou)
  majorGold?: boolean;
}

const TONE_COLOR: Record<Tone, string> = {
  gold: 'var(--em-gold)',
  good: 'var(--em-green)',
  mid: 'var(--em-muted)',
  bad: 'var(--em-red)',
};

function milestoneOf(h: SplitRecord): Milestone {
  const tone: Tone = h.champion ? 'gold' : h.position > 0 && h.position <= 4 ? 'good' : h.position >= 9 ? 'bad' : 'mid';
  const text = h.champion
    ? `${ct('CAMPEÃO do')} ${h.circuit}`
    : h.position > 0
      ? `${h.position}º ${ct('no')} ${h.circuit}`
      : h.circuit;
  const major = h.major ? `Major: ${PLACE_SHORT[h.major.placement]}` : undefined;
  return { split: h.split, text, tone, major, majorGold: h.major?.champion };
}

export function CareerTimeline({ history }: { history: SplitRecord[] }) {
  if (history.length === 0) return null;
  // agrupa por temporada (mais recente primeiro), preservando ordem dos splits
  const byYear = new Map<number, Milestone[]>();
  for (const h of history) {
    const year = Math.max(1, Math.ceil(h.split / MAJOR_EVERY));
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(milestoneOf(h));
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
      {years.map((year) => (
        <div key={year} style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 74 }}>
            <b style={{ fontSize: '0.72rem', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--em-muted)' }}>
              {ct('Temporada')} {year}
            </b>
            <div style={{ flex: 1, width: 2, background: 'var(--em-border)', marginTop: 6, borderRadius: 1 }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', paddingBottom: 4 }}>
            {byYear.get(year)!.map((m) => (
              <span key={m.split} style={chipStyle(TONE_COLOR[m.tone], m.tone === 'gold')}>
                {m.tone === 'gold' && <IconTrophy size={12} />}
                <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>S{m.split}</span>
                {m.text}
                {m.major && (
                  <b style={{ color: m.majorGold ? 'var(--em-gold)' : 'var(--em-text)', fontSize: '0.7rem' }}>
                    · {m.majorGold ? ct('CAMPEÃO DO MAJOR') : m.major}
                  </b>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const chipStyle = (color: string, strong: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 999,
  border: `1px solid color-mix(in srgb, ${color} ${strong ? '65%' : '40%'}, transparent)`,
  background: `color-mix(in srgb, ${color} ${strong ? '14%' : '8%'}, transparent)`,
  color: strong ? color : 'var(--em-text)',
  fontSize: '0.76rem',
  fontWeight: strong ? 700 : 500,
});
