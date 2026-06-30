// TrophyRoomPage — sala de troféus da carreira (gap Brasval: Trophies page).
//
// Vitrine visual das conquistas do time ao longo da carreira, lida 100% de
// dados que JÁ persistimos em save.history (SplitRecord[]): cada circuito
// vencido (champion) e cada Major (major.champion / placement). Pure-read,
// sem migração de save.
//
// Agrupa por tipo (Majors > Circuitos), mostra medalha, split, prêmio e
// posição. Header com contadores grandes. Padrão em-* / DashCard.

import { useMemo } from 'react';
import { CareerIcon } from '../components/career/CareerIcon';

interface TrophyEntry {
  kind: 'major' | 'circuit';
  title: string;
  split: number;
  prize: number;
  /** posição final (1 = campeão). Major usa placement code mapeado. */
  placementLabel: string;
  champion: boolean;
}

// shape mínimo do SplitRecord que consumimos (evita acoplar ao tipo fechado)
interface HistoryRow {
  split: number;
  circuit: string;
  position: number;
  prize: number;
  champion: boolean;
  major?: { placement: string; champion: boolean } | null;
}

interface Props {
  history: HistoryRow[];
  orgName: string;
  currentSplit: number;
  onClose?: () => void;
}

const MAJOR_NAMES = [
  'PGL Major', 'BLAST.tv Major', 'IEM Major', 'ESL One Major', 'Perfect World Major',
];
const majorName = (split: number) => MAJOR_NAMES[(split - 1) % MAJOR_NAMES.length];

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 2)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
};

const PLACEMENT_LABEL: Record<string, string> = {
  champion: '1º · Campeão',
  runnerup: '2º · Vice',
  semi: 'Top 4',
  quarters: 'Top 8',
  playoffs: 'Playoffs',
  swiss: 'Fase suíça',
};

export function TrophyRoomPage({ history, orgName, currentSplit, onClose }: Props) {
  const { majors, circuits, totalPrize } = useMemo(() => {
    const majorsArr: TrophyEntry[] = [];
    const circuitsArr: TrophyEntry[] = [];
    let prize = 0;
    for (const r of history) {
      prize += r.prize ?? 0;
      // Major: registra qualquer participação com placement (campeão ou não, só vitrine de campeão)
      if (r.major?.champion) {
        majorsArr.push({
          kind: 'major',
          title: majorName(r.split),
          split: r.split,
          prize: r.prize ?? 0,
          placementLabel: PLACEMENT_LABEL.champion,
          champion: true,
        });
      }
      // Circuito vencido
      if (r.champion) {
        circuitsArr.push({
          kind: 'circuit',
          title: r.circuit,
          split: r.split,
          prize: r.prize ?? 0,
          placementLabel: '1º · Campeão',
          champion: true,
        });
      }
    }
    return { majors: majorsArr.reverse(), circuits: circuitsArr.reverse(), totalPrize: prize };
  }, [history]);

  const empty = majors.length === 0 && circuits.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            🏆 Sala de troféus
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 900, color: 'var(--em-text)' }}>
            {orgName}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--em-muted)' }}>
            Conquistas ao longo de {currentSplit} {currentSplit === 1 ? 'split' : 'splits'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Counter label="Majors" value={majors.length} tone="gold" icon="trophy" />
          <Counter label="Circuitos" value={circuits.length} tone="green" icon="medal" />
          <Counter label="Em prêmios" value={fmtMoney(totalPrize)} tone="neutral" icon="coin" />
        </div>
      </header>

      {empty ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--em-panel)',
            border: '1px dashed var(--em-border)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: '2.5rem', opacity: 0.5 }}>🏆</div>
          <p style={{ margin: '8px 0 0', color: 'var(--em-muted)', fontSize: '0.88rem' }}>
            A vitrine está vazia. Vença circuitos e Majors pra construir sua coleção.
          </p>
        </div>
      ) : (
        <>
          {majors.length > 0 && (
            <Section title="Majors" subtitle="O ápice da temporada">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {majors.map((t, i) => <TrophyCard key={`m${i}`} t={t} />)}
              </div>
            </Section>
          )}
          {circuits.length > 0 && (
            <Section title="Circuitos" subtitle="Títulos de tier ao longo do caminho">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {circuits.map((t, i) => <TrophyCard key={`c${i}`} t={t} />)}
              </div>
            </Section>
          )}
        </>
      )}

      {onClose && (
        <div style={{ textAlign: 'right', borderTop: '1px solid var(--em-border)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '6px 16px', background: 'var(--em-gold)', color: '#1a1205', border: 'none', borderRadius: 4, fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function TrophyCard({ t }: { t: TrophyEntry }) {
  const isMajor = t.kind === 'major';
  const accent = isMajor ? '#e8c170' : '#5ed88a';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        background: `linear-gradient(160deg, ${accent}1a 0%, var(--em-panel) 70%)`,
        border: `1px solid ${accent}66`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: accent, color: '#1a1205', borderRadius: '50%', flexShrink: 0,
          }}
        >
          <CareerIcon name={isMajor ? 'trophy' : 'medal'} size={20} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--em-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.title}
          </div>
          <div style={{ fontSize: '0.68rem', color: accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {t.placementLabel}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--em-border)', paddingTop: 8, fontSize: '0.74rem' }}>
        <span style={{ color: 'var(--em-muted)' }}>Split {t.split}</span>
        <b style={{ fontFamily: '"JetBrains Mono", monospace', color: '#5ed88a' }}>{fmtMoney(t.prize)}</b>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--em-text)' }}>
          {title}
        </h3>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--em-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Counter({ label, value, tone, icon }: { label: string; value: number | string; tone: 'gold' | 'green' | 'neutral'; icon: 'trophy' | 'medal' | 'coin' }) {
  const colors: Record<string, string> = { gold: '#e8c170', green: '#5ed88a', neutral: 'var(--em-text)' };
  return (
    <div
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '8px 14px', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)', borderRadius: 6, minWidth: 70,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: colors[tone] }}>
        <CareerIcon name={icon} size={14} />
        <b style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace' }}>{value}</b>
      </span>
      <span style={{ fontSize: '0.6rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}
