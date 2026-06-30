// CoachProfilePage — perfil de carreira do treinador (gap Brasval: CoachProfile).
//
// Transforma save.coachStints (já persistido) numa narrativa de carreira do
// coach: reputação/tier visual, KPIs agregados (summarizeCoach), e timeline de
// passagens por clube com win-rate e troféus de cada stint. Pure-read.

import { useMemo } from 'react';
import { CareerIcon } from '../components/career/CareerIcon';
import {
  summarizeCoach,
  reputationLabel,
  type CoachStint,
} from '../engine/coachCareer';

interface Props {
  stints: CoachStint[];
  /** nick do coach ativo (pra header, se houver) */
  activeCoachNick?: string;
  onClose?: () => void;
}

export function CoachProfilePage({ stints, activeCoachNick, onClose }: Props) {
  const summary = useMemo(() => summarizeCoach(stints), [stints]);
  const ordered = useMemo(() => [...stints].reverse(), [stints]); // recente primeiro
  const repColor =
    summary.reputation >= 90 ? '#e8c170' :
    summary.reputation >= 80 ? '#9bd35c' :
    summary.reputation >= 70 ? '#5fa4e8' :
    summary.reputation >= 55 ? '#cfa75b' : 'var(--em-muted)';

  const headerNick = activeCoachNick ?? ordered[0]?.coachNick ?? '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.66rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 800 }}>
            🎓 Carreira do treinador
          </div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.5rem', fontWeight: 900, color: 'var(--em-text)' }}>
            {headerNick}
          </h2>
        </div>
        {/* Reputação grande */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
            background: `linear-gradient(135deg, ${repColor}1f 0%, transparent 70%)`,
            border: `1px solid ${repColor}66`, borderRadius: 8,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '2rem', fontWeight: 900, color: repColor, lineHeight: 1 }}>
              {summary.reputation}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reputação</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--em-border)', paddingLeft: 12 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: repColor }}>{reputationLabel(summary.reputation)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)' }}>Tier médio {summary.averageTier.toFixed(1)}</div>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Kpi label="Troféus" value={summary.totalTrophies} icon="trophy" accent="#e8c170" />
        <Kpi label="Passagens" value={summary.totalStints} icon="building" />
        <Kpi label="Vitórias" value={summary.totalWins} icon="check" accent="#5ed88a" />
        <Kpi label="Derrotas" value={summary.totalLosses} icon="x" accent="#e58a8a" />
        <Kpi label="Win rate" value={`${Math.round(summary.winRate * 100)}%`} icon="chart" accent={summary.winRate >= 0.5 ? '#5ed88a' : '#e58a8a'} />
      </div>

      {/* Timeline de passagens */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--em-muted)' }}>
          Passagens
        </h3>
        {ordered.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
            Sem passagens registradas ainda.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ordered.map((s, i) => {
              const active = s.endSplit == null;
              const matches = s.wins + s.losses;
              const wr = matches > 0 ? Math.round((s.wins / matches) * 100) : 0;
              const tierColor = s.tier === 1 ? '#e8c170' : s.tier === 2 ? '#9b6fe8' : '#5fa4e8';
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: 'var(--em-panel-2)',
                    border: `1px solid ${active ? 'var(--em-gold)' : 'var(--em-border)'}`,
                    borderLeft: `3px solid ${tierColor}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.92rem', fontWeight: 800, color: 'var(--em-text)' }}>
                      {s.orgName}
                      <span style={{ padding: '1px 6px', background: `${tierColor}22`, color: tierColor, border: `1px solid ${tierColor}66`, borderRadius: 3, fontSize: '0.6rem', fontWeight: 800 }}>
                        TIER {s.tier}
                      </span>
                      {active && <span style={{ fontSize: '0.6rem', color: 'var(--em-gold)', fontWeight: 800, letterSpacing: '0.5px' }}>● ATIVO</span>}
                    </div>
                    <div style={{ marginTop: 3, fontSize: '0.72rem', color: 'var(--em-muted)', fontFamily: '"JetBrains Mono", monospace' }}>
                      Split {s.startSplit}{s.endSplit != null ? `–${s.endSplit}` : '+'} · {s.wins}V {s.losses}D ({wr}%)
                      {s.trophies.length > 0 && <span style={{ color: '#e8c170' }}> · 🏆 {s.trophies.length}</span>}
                    </div>
                    {s.trophies.length > 0 && (
                      <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {s.trophies.map((tr, j) => (
                          <span key={j} style={{ fontSize: '0.66rem', padding: '2px 7px', background: 'rgba(232,193,112,0.12)', border: '1px solid rgba(232,193,112,0.35)', borderRadius: 3, color: '#e8c170' }}>
                            {tr}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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

function Kpi({ label, value, icon, accent }: { label: string; value: number | string; icon: ComponentIconName; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', background: 'var(--em-panel-2)', border: '1px solid var(--em-border)', borderRadius: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: accent ?? 'var(--em-muted)' }}>
        <CareerIcon name={icon} size={13} />
        <b style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: '"JetBrains Mono", monospace', color: accent ?? 'var(--em-text)' }}>{value}</b>
      </span>
      <span style={{ fontSize: '0.62rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}

type ComponentIconName = 'trophy' | 'building' | 'check' | 'x' | 'chart';
