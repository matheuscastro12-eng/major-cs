// Scoreboard topo do broadcast — espelha o estilo do print de referência:
// [Lista de mapas]   [TAG  PLACAR  CLOCK  PLACAR  TAG]   [Torneio]
//                    [Round X · alive vs alive]
//                                                 [Killer  weapon  Victim]
//
// Cores: time vermelho (esquerda) e azul (direita) — convenção broadcast CS.
// Os tons exatos saem dos colors do TTeam quando definidos.

import type { TTeam, MapId } from '../../types';
import { MAP_LABELS } from '../../types';
import type { LiveState, LiveEvent } from '../../lib/liveCanvasSim';

interface Props {
  state: LiveState;
  teams: [TTeam, TTeam];
  // série inteira (pra mostrar lista de mapas com placar agregado)
  seriesScores?: { map: MapId; score: [number, number] }[];
  currentMap: MapId;
  // contexto do torneio (label livre)
  event?: string;
}

function teamSideColor(side: 't' | 'ct'): string {
  return side === 't' ? '#c0392b' : '#2872c0';
}

function teamTagColor(team: TTeam, side: 't' | 'ct'): string {
  // Prefere a cor do time se definida; senão cai pro lado.
  return team.colors?.[0] ?? teamSideColor(side);
}

export function LiveScoreboard({ state, teams, seriesScores = [], currentMap, event }: Props) {
  const side0 = state.agents.find((a) => a.team === 0)?.side ?? 't';
  const side1 = state.agents.find((a) => a.team === 1)?.side ?? 'ct';
  const aliveT = state.agents.filter((a) => a.side === 't' && a.alive).length;
  const aliveCT = state.agents.filter((a) => a.side === 'ct' && a.alive).length;
  const clockTxt = state.phase === 'freeze'
    ? 'FREEZE'
    : state.phase === 'postRound'
    ? 'END'
    : state.spike.planted
    ? `BOMB ${Math.max(0, state.spike.timer).toFixed(1)}s`
    : formatClock(Math.max(0, 95 - state.roundClock));

  // último kill como killfeed superior direito
  const lastKill = [...state.events].reverse().find((e): e is LiveEvent & { killerId: string; victimId: string } =>
    e.kind === 'kill' && !!e.killerId && !!e.victimId,
  );
  const killer = lastKill && state.agents.find((a) => a.id === lastKill.killerId);
  const victim = lastKill && state.agents.find((a) => a.id === lastKill.victimId);

  return (
    <div className="live-scoreboard" style={scoreboardStyle}>
      {/* esquerda: lista de mapas */}
      <div style={mapsListStyle}>
        {seriesScores.map((m) => (
          <div key={m.map} style={mapsItemStyle(m.map === currentMap)}>
            <span style={{ fontWeight: 700, fontSize: '0.74rem' }}>{MAP_LABELS[m.map]?.toUpperCase() ?? m.map.toUpperCase()}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.72rem' }}>
              {m.score[0]} - {m.score[1]}
            </span>
          </div>
        ))}
      </div>

      {/* centro: placar grande */}
      <div style={centerStyle}>
        <div style={teamHeaderStyle('right')}>
          <span style={{ ...tagStyle, color: '#fff', background: teamTagColor(teams[0], side0) }}>{teams[0].tag}</span>
        </div>
        <div style={scoreCenterStyle}>
          <span style={scoreStyle(side0)}>{state.score[0]}</span>
          <div style={clockBlockStyle}>
            <div style={clockTextStyle}>{clockTxt}</div>
            <div style={roundTextStyle}>ROUND {state.roundIdx + 1}</div>
          </div>
          <span style={scoreStyle(side1)}>{state.score[1]}</span>
        </div>
        <div style={teamHeaderStyle('left')}>
          <span style={{ ...tagStyle, color: '#fff', background: teamTagColor(teams[1], side1) }}>{teams[1].tag}</span>
        </div>
      </div>

      {/* direita: torneio + killfeed */}
      <div style={rightStyle}>
        {event && <div style={eventBadgeStyle}>{event}</div>}
        {killer && victim && (
          <div style={killfeedStyle}>
            <span style={{ color: teamSideColor(killer.side), fontWeight: 700 }}>{killer.nick}</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem' }}>→</span>
            <span style={{ color: teamSideColor(victim.side), fontWeight: 700 }}>{victim.nick}</span>
          </div>
        )}
      </div>

      {/* sub-linha: alive vs alive */}
      <div style={aliveRowStyle}>
        <span style={{ color: teamSideColor(side0), fontWeight: 700 }}>{aliveT}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>VS</span>
        <span style={{ color: teamSideColor(side1), fontWeight: 700 }}>{aliveCT}</span>
      </div>
    </div>
  );
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles (inline — convenção do projeto, design tokens via CSS vars)

const scoreboardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr 2fr 1fr',
  alignItems: 'center',
  padding: '10px 18px',
  background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), rgba(0,0,0,0.35))',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  minHeight: 70,
};

const mapsListStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  color: '#fff',
};

const mapsItemStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '4px 6px',
  borderBottom: active ? '2px solid var(--em-gold)' : '2px solid transparent',
  opacity: active ? 1 : 0.65,
});

const centerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: 14,
};

const teamHeaderStyle = (align: 'left' | 'right'): React.CSSProperties => ({
  display: 'flex',
  justifyContent: align === 'left' ? 'flex-start' : 'flex-end',
});

const tagStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 3,
  fontWeight: 800,
  fontSize: '0.92rem',
  letterSpacing: '0.5px',
};

const scoreCenterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const scoreStyle = (side: 't' | 'ct'): React.CSSProperties => ({
  color: teamSideColor(side),
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '1.9rem',
  fontWeight: 800,
  minWidth: 38,
  textAlign: 'center',
});

const clockBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  borderLeft: '1px solid rgba(255,255,255,0.18)',
  borderRight: '1px solid rgba(255,255,255,0.18)',
  padding: '0 14px',
  minWidth: 110,
};

const clockTextStyle: React.CSSProperties = {
  color: '#fff',
  fontFamily: '"JetBrains Mono", monospace',
  fontWeight: 700,
  fontSize: '1.1rem',
};

const roundTextStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.5)',
  fontSize: '0.66rem',
  letterSpacing: '0.8px',
  fontWeight: 700,
};

const rightStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
};

const eventBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 3,
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontSize: '0.74rem',
  fontWeight: 700,
  letterSpacing: '0.4px',
};

const killfeedStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 6px',
  fontSize: '0.84rem',
};

const aliveRowStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: -10,
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '2px 16px',
  background: 'rgba(10,12,18,0.85)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#fff',
};
