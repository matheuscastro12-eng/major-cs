// MetaPage — T9.2 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Snapshot agregado do estado competitivo: distribuição de roles no top da
// temporada, países mais representados, mapas mais picados, troféus do
// usuário no histórico, e champion da temporada por região.
//
// Inputs: top players (qualquer corte que o caller queira) + scene mundial
// + histórico do usuário. Renderiza tudo em chips/listas/barras.

import { useMemo } from 'react';
import { Flag, TeamBadge } from '../components/ui';
import { CareerIcon } from '../components/career/CareerIcon';
import { MACRO_REGION_LABELS, type MacroRegion } from '../data/regions';
import { MAP_LABELS, type MapId } from '../types';

interface MetaPlayer {
  nick: string;
  country: string;
  role: string;
}

interface MetaRegionChamp {
  reg: MacroRegion;
  champTag: string;
  champName: string;
  champColors: [string, string];
}

interface MetaMapCount {
  map: MapId;
  count: number;
}

interface Props {
  /** Players considerados "top da temporada" (de top20 ou similar) */
  topPlayers: MetaPlayer[];
  /** Campeões atuais por região (da WorldTab) */
  regionChamps: MetaRegionChamp[];
  /** Mapas mais picados no split atual (já agregado) */
  mapPicks: MetaMapCount[];
  /** Total de troféus do usuário na carreira */
  userTrophies: { circuits: number; majors: number };
  /** Split atual (pro header) */
  currentSplit: number;
  onClose?: () => void;
}

export function MetaPage({
  topPlayers,
  regionChamps,
  mapPicks,
  userTrophies,
  currentSplit,
  onClose,
}: Props) {
  // Distribuição de roles no top
  const roleDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of topPlayers) counts.set(p.role, (counts.get(p.role) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([role, n]) => ({ role, n, pct: (n / topPlayers.length) * 100 }));
  }, [topPlayers]);

  // Países mais representados no top
  const countryDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of topPlayers) counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [topPlayers]);

  // Top map picks ordenados
  const sortedMaps = useMemo(
    () => [...mapPicks].sort((a, b) => b.count - a.count),
    [mapPicks],
  );
  const maxMapCount = sortedMaps[0]?.count ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--em-text)' }}>
            Meta da temporada
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--em-muted)' }}>
            Snapshot agregado · Split {currentSplit}
          </p>
        </div>
        {(userTrophies.circuits > 0 || userTrophies.majors > 0) && (
          <div style={{ display: 'inline-flex', gap: 8 }}>
            {userTrophies.majors > 0 && (
              <span style={statChip('gold')}>
                <CareerIcon name="trophy" size={14} />
                <b style={chipVal}>{userTrophies.majors}</b>
                <span style={chipLabel}>{userTrophies.majors === 1 ? 'Major' : 'Majors'}</span>
              </span>
            )}
            {userTrophies.circuits > 0 && (
              <span style={statChip('green')}>
                <CareerIcon name="medal" size={14} />
                <b style={chipVal}>{userTrophies.circuits}</b>
                <span style={chipLabel}>{userTrophies.circuits === 1 ? 'Título' : 'Títulos'}</span>
              </span>
            )}
          </div>
        )}
      </header>

      {/* Grid principal: 2 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Section title="Distribuição de roles no top">
          {roleDist.length === 0 ? (
            <Empty />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roleDist.map(({ role, n, pct }) => (
                <div key={role} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px', gap: 8, alignItems: 'center' }}>
                  <span className={`role-pill ${role}`}>{role}</span>
                  <div style={barBg}>
                    <div style={{ ...barFill, width: `${pct}%`, background: roleColor(role) }} />
                  </div>
                  <span style={chipVal}>{n}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Países mais fortes no top">
          {countryDist.length === 0 ? (
            <Empty />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {countryDist.map(([country, n]) => (
                <div
                  key={country}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    background: 'var(--em-panel-2)',
                    border: '1px solid var(--em-border)',
                    borderRadius: 4,
                    fontSize: '0.82rem',
                  }}
                >
                  <Flag cc={country} />
                  <b style={chipVal}>{n}</b>
                  <span style={{ color: 'var(--em-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                    {country}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Mapas mais picados */}
      <Section title="Mapas mais picados nesta temporada">
        {sortedMaps.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedMaps.map(({ map, count }) => {
              const pct = (count / maxMapCount) * 100;
              return (
                <div key={map} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 50px', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--em-text)', fontWeight: 600, fontSize: '0.84rem' }}>
                    {MAP_LABELS[map]}
                  </span>
                  <div style={barBg}>
                    <div style={{ ...barFill, width: `${pct}%`, background: 'var(--em-gold)' }} />
                  </div>
                  <span style={chipVal}>{count}×</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Campeões regionais */}
      <Section title="Campeões regionais atuais">
        {regionChamps.length === 0 ? (
          <Empty />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 8,
            }}
          >
            {regionChamps.map((r) => (
              <div
                key={r.reg}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'var(--em-panel-2)',
                  border: '1px solid var(--em-border)',
                  borderRadius: 4,
                }}
              >
                <TeamBadge tag={r.champTag} colors={r.champColors} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--em-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {MACRO_REGION_LABELS[r.reg]}
                  </div>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--em-text)',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.champName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components / styles

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3
        style={{
          margin: 0,
          fontSize: '0.72rem',
          fontWeight: 800,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--em-muted)',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          padding: 14,
          background: 'var(--em-panel)',
          border: '1px solid var(--em-border)',
          borderRadius: 6,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Empty() {
  return (
    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--em-muted)', fontStyle: 'italic' }}>
      Sem dados ainda — volta após jogar mais partidas.
    </p>
  );
}

function roleColor(role: string): string {
  const map: Record<string, string> = {
    AWP: '#5fa4e8',
    IGL: '#9b6fe8',
    Entry: '#e8a93b',
    Support: '#5ed88a',
    Lurker: '#c0392b',
    Rifler: '#a0a0a0',
  };
  return map[role] ?? 'var(--em-gold)';
}

const barBg: React.CSSProperties = {
  height: 8,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 4,
  overflow: 'hidden',
};

const barFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 4,
  transition: 'width .2s',
};

const chipVal: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
  fontWeight: 800,
  color: 'var(--em-text)',
  fontSize: '0.84rem',
};

const chipLabel: React.CSSProperties = {
  color: 'var(--em-muted)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

function statChip(tone: 'gold' | 'green'): React.CSSProperties {
  const colors: Record<'gold' | 'green', { bg: string; border: string }> = {
    gold: { bg: 'rgba(232, 193, 112, 0.14)', border: 'rgba(232, 193, 112, 0.5)' },
    green: { bg: 'rgba(94, 216, 138, 0.14)', border: 'rgba(94, 216, 138, 0.45)' },
  };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: colors[tone].bg,
    border: `1px solid ${colors[tone].border}`,
    borderRadius: 4,
  };
}
