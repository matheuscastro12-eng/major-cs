import { useState } from 'react';
import { MAP_LABELS } from '../types';
import type { SeriesResult, TTeam } from '../types';
import { MatchBanner } from './flags';
import { Scoreboard } from './Scoreboard';
import { LiveCanvasGame } from './LiveCanvasGame';

interface Props {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  event: string;
  onBack: () => void;
}

// Replay 2D (broadcast LiveCanvasGame) — feature em beta, escondida do user
// final por enquanto. Reativa via `?broadcast=1` na URL (opt-in pra dev/preview).
// Quando o canvas tiver pathfinding/LOS reais, vira a visualização padrão.
const SHOW_REPLAY_2D = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('broadcast') === '1';

export function MatchDetail({ series, teams, event, onBack }: Props) {
  const [broadcastMapIdx, setBroadcastMapIdx] = useState<number | null>(null);

  return (
    <div className="fade-in">
      <div className="panel">
        <div className="panel-head">
          Detalhes da série
          <span className="spacer" />
          <button className="btn" onClick={onBack}>
            ← Voltar
          </button>
        </div>
        <div className="panel-body">
          <MatchBanner
            teamA={teams[0]}
            teamB={teams[1]}
            event={event}
            scoreA={series.mapScore[0]}
            scoreB={series.mapScore[1]}
            winner={series.winner}
          />
          <div className="map-pills" style={{ paddingTop: 14 }}>
            {series.maps.map((m, i) => (
              <span key={i} className="map-pill">
                {MAP_LABELS[m.map]}
                {m.pickedBy >= 0 ? ` (pick ${teams[m.pickedBy as 0 | 1].tag})` : ' (decider)'}{' '}
                <b>
                  <span className={m.winner === 0 ? 'mw' : 'ml'}>{m.score[0]}</span>:
                  <span className={m.winner === 1 ? 'mw' : 'ml'}>{m.score[1]}</span>
                </b>
              </span>
            ))}
          </div>
          {/* Replay 2D (broadcast LiveCanvasGame) escondido — feature em beta,
             ainda não está pronta. Pra reativar, defina `?broadcast=1` na URL ou
             remova a flag SHOW_REPLAY_2D abaixo. */}
          {SHOW_REPLAY_2D && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 14 }}>
              {series.maps.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBroadcastMapIdx(i)}
                  title="Replay 2D do mapa (beta)"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: broadcastMapIdx === i ? 'var(--em-gold)' : 'transparent',
                    color: broadcastMapIdx === i ? '#1a1205' : 'var(--em-text)',
                    border: '1px solid var(--em-border)',
                    borderRadius: 3,
                  }}
                >
                  ▶ Replay 2D · {MAP_LABELS[m.map]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {SHOW_REPLAY_2D && broadcastMapIdx != null && series.maps[broadcastMapIdx] && (
        <div style={{ paddingTop: 14 }}>
          <LiveCanvasGame
            mapResult={series.maps[broadcastMapIdx]}
            teams={teams}
            userIdx={0}
            series={series}
            event={event}
            autoplay
            onClose={() => setBroadcastMapIdx(null)}
          />
        </div>
      )}

      <Scoreboard series={series} teams={teams} />
    </div>
  );
}
