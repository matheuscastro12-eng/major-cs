// Aba Estatísticas — página dedicada de stats da temporada (roadmap #11).
//
// Agrega seasonPlayerStats(league) (rating/K-D/ADR por jogador) + o desempenho
// real por mapa do seu time (computeMapPerformance/save.mapStats). Toggle
// "Liga / Meu time" reaproveita o mesmo dataset filtrando pelo seu elenco.
// Barras em CSS no padrão em-* (sem dependência de chart lib).

import { useMemo, useState } from 'react';
import { DashCard } from '../../components/ds';
import { Flag, PlayerAvatar } from '../../components/ui';
import { ct } from '../../state/career-i18n';
import { computeMapPerformance } from '../../engine/teamMapStats';
import type { SeasonStat } from '../../components/CareerScreen';
import type { Player } from '../../types';

interface Props {
  save: {
    org?: { tag?: string } | null;
    mapStats?: Record<string, { w: number; l: number; rf: number; ra: number }>;
  };
  seasonStats: SeasonStat[];
  mySquadOids: Set<string>;
  openPlayerProfile: (p: Player) => void;
  resolvePlayerById: (id: string) => Player | null;
}

// barra horizontal simples (label · trilho preenchido · valor) no padrão em-*
function StatBar({ label, sub, value, pct, accent, onClick }: {
  label: React.ReactNode;
  sub?: React.ReactNode;
  value: string;
  pct: number; // 0..100
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '0 0 42%', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
        {sub != null && <span style={{ fontSize: '0.72rem', color: 'var(--em-muted,#8a99ab)', fontWeight: 600 }}>{sub}</span>}
      </span>
      <div style={{ flex: 1, height: 9, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, pct))}%`, background: accent ?? 'linear-gradient(90deg,#3a6f8f,#5ea8d8)', borderRadius: 5, transition: 'width .3s ease' }} />
      </div>
      <span style={{ flex: '0 0 auto', minWidth: 42, textAlign: 'right', fontSize: '0.8rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>{value}</span>
    </div>
  );
}

const ROLE_ORDER = ['AWP', 'Entry', 'Rifler', 'Lurker', 'Support', 'IGL'];

export function StatsTab({ save, seasonStats, mySquadOids, openPlayerProfile, resolvePlayerById }: Props) {
  const [scope, setScope] = useState<'league' | 'mine'>('league');
  const myTag = save.org?.tag ?? ct('VOCÊ');

  const scoped = useMemo(
    () => (scope === 'mine' ? seasonStats.filter((s) => mySquadOids.has(s.id)) : seasonStats),
    [scope, seasonStats, mySquadOids],
  );

  const topRating = useMemo(() => [...scoped].sort((a, b) => b.rating - a.rating).slice(0, 5), [scoped]);
  const topAdr = useMemo(() => [...scoped].sort((a, b) => b.adr - a.adr).slice(0, 5), [scoped]);
  const roleDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of scoped) counts[s.role] = (counts[s.role] ?? 0) + 1;
    const rows = ROLE_ORDER.filter((r) => counts[r]).map((r) => ({ role: r, n: counts[r] }));
    // qualquer role fora da ordem conhecida entra no fim
    for (const r of Object.keys(counts)) if (!ROLE_ORDER.includes(r)) rows.push({ role: r, n: counts[r] });
    return rows.sort((a, b) => b.n - a.n);
  }, [scoped]);
  const mapPerf = useMemo(() => computeMapPerformance(save.mapStats).filter((r) => r.inPool), [save.mapStats]);
  const table = useMemo(() => [...scoped].sort((a, b) => b.rating - a.rating).slice(0, 30), [scoped]);

  const openById = (id: string) => {
    const p = resolvePlayerById(id);
    if (p) openPlayerProfile(p);
  };

  const maxAdr = Math.max(1, ...topAdr.map((s) => s.adr));
  const maxRole = Math.max(1, ...roleDist.map((r) => r.n));
  const ratingColor = (r: number) => (r >= 1.1 ? '#5ed88a' : r >= 0.95 ? '#5ea8d8' : '#e8a93b');

  if (seasonStats.length === 0) {
    return (
      <DashCard title={`📊 ${ct('Estatísticas')}`}>
        <p className="muted small">{ct('As estatísticas aparecem após as primeiras partidas da temporada.')}</p>
      </DashCard>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* toggle de escopo */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['league', 'mine'] as const).map((sc) => (
          <button
            key={sc}
            onClick={() => setScope(sc)}
            style={{
              padding: '6px 16px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
              borderRadius: 6, border: '1px solid var(--em-border,#2a3340)',
              background: scope === sc ? 'var(--em-gold,#e8c170)' : 'transparent',
              color: scope === sc ? '#1a1205' : 'var(--em-text,#d6deea)',
              fontFamily: 'inherit',
            }}
          >
            {sc === 'league' ? ct('Liga') : `${ct('Meu time')} · ${myTag}`}
          </button>
        ))}
      </div>

      {scoped.length === 0 ? (
        <DashCard title={`📊 ${myTag}`}>
          <p className="muted small">{ct('Seu time ainda não tem estatísticas neste split.')}</p>
        </DashCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
          {/* Top rating */}
          <DashCard title={`⭐ ${ct('Top rating')}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topRating.map((s, i) => (
                <StatBar
                  key={s.id}
                  onClick={() => openById(s.id)}
                  label={<><span style={{ color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>{i + 1}</span> <Flag cc={s.country} /> {s.nick}</>}
                  sub={s.teamTag}
                  value={s.rating.toFixed(2)}
                  pct={(s.rating / Math.max(1.2, topRating[0].rating)) * 100}
                  accent={`linear-gradient(90deg,#2f6f4a,${ratingColor(s.rating)})`}
                />
              ))}
            </div>
          </DashCard>

          {/* Top fraggers (ADR) */}
          <DashCard title={`💥 ${ct('Top dano (ADR)')}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topAdr.map((s, i) => (
                <StatBar
                  key={s.id}
                  onClick={() => openById(s.id)}
                  label={<><span style={{ color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>{i + 1}</span> <Flag cc={s.country} /> {s.nick}</>}
                  sub={s.teamTag}
                  value={Math.round(s.adr).toString()}
                  pct={(s.adr / maxAdr) * 100}
                  accent="linear-gradient(90deg,#8f5a3a,#e8a93b)"
                />
              ))}
            </div>
          </DashCard>

          {/* Distribuição de funções */}
          <DashCard title={`🎭 ${ct('Distribuição de funções')}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {roleDist.map((r) => (
                <StatBar
                  key={r.role}
                  label={r.role}
                  value={r.n.toString()}
                  pct={(r.n / maxRole) * 100}
                  accent="linear-gradient(90deg,#4a4f7a,#7b80d8)"
                />
              ))}
            </div>
          </DashCard>

          {/* Desempenho por mapa (só do seu time) */}
          {scope === 'mine' && (
            <DashCard title={`🗺️ ${ct('Desempenho por mapa')}`}>
              {mapPerf.every((r) => r.games === 0) ? (
                <p className="muted small">{ct('Jogue algumas séries pra ver seu win-rate por mapa.')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {mapPerf.map((r) => (
                    <StatBar
                      key={r.map}
                      label={r.label}
                      sub={r.games ? `${r.wins}-${r.losses}` : ct('s/ jogos')}
                      value={r.games ? `${Math.round(r.winRate)}%` : '—'}
                      pct={r.winRate}
                      accent={r.winRate >= 55 ? 'linear-gradient(90deg,#2f6f4a,#5ed88a)' : r.winRate >= 45 ? 'linear-gradient(90deg,#6f6f3a,#e8c170)' : 'linear-gradient(90deg,#7a3a3a,#e58a8a)'}
                    />
                  ))}
                </div>
              )}
            </DashCard>
          )}
        </div>
      )}

      {/* Tabela rankeada */}
      {table.length > 0 && (
        <DashCard title={`📋 ${scope === 'mine' ? `${ct('Elenco')} · ${myTag}` : ct('Ranking da liga')} (${table.length})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ color: 'var(--em-muted,#8a99ab)', textAlign: 'right', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>{ct('Jogador')}</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>{ct('Função')}</th>
                  <th style={{ padding: '4px 6px' }}>K/D</th>
                  <th style={{ padding: '4px 6px' }}>ADR</th>
                  <th style={{ padding: '4px 6px' }}>{ct('Rating')}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((s, i) => {
                  const mine = mySquadOids.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => openById(s.id)}
                      style={{
                        cursor: 'pointer', textAlign: 'right',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        background: mine ? 'rgba(232,193,112,0.08)' : undefined,
                      }}
                    >
                      <td style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--em-muted,#8a99ab)', fontFamily: '"JetBrains Mono", monospace' }}>{i + 1}</td>
                      <td style={{ textAlign: 'left', padding: '5px 6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <PlayerAvatar nick={s.nick} size={20} />
                          <Flag cc={s.country} /> <b>{s.nick}</b>
                          <span style={{ color: 'var(--em-muted,#8a99ab)', fontWeight: 600 }}>{s.teamTag}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'left', padding: '5px 6px', color: 'var(--em-muted,#8a99ab)' }}>{s.role}</td>
                      <td style={{ padding: '5px 6px', fontFamily: '"JetBrains Mono", monospace' }}>{s.kd.toFixed(2)}</td>
                      <td style={{ padding: '5px 6px', fontFamily: '"JetBrains Mono", monospace' }}>{Math.round(s.adr)}</td>
                      <td style={{ padding: '5px 6px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, color: ratingColor(s.rating) }}>{s.rating.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DashCard>
      )}
    </div>
  );
}
