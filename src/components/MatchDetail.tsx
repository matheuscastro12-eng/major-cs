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

export function MatchDetail({ series, teams, event, onBack }: Props) {
  // T2.5 piloto: replay 2D do mapa selecionado. Beta — fica atrás de um toggle
  // pra não substituir o Scoreboard textual atual (que segue como fonte da
  // verdade dos dados). Quando o canvas tiver pathfinding/LOS reais, vira
  // a visualização padrão. Ver .claude/plans/faca-um-planejamento-para-piped-quilt.md
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
          {/* Botões pra abrir o broadcast 2D de cada mapa */}
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
        </div>
      </div>

      {broadcastMapIdx != null && series.maps[broadcastMapIdx] && (
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
