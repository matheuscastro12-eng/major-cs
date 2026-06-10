import { MAP_LABELS } from '../types';
import type { SeriesResult, TTeam } from '../types';
import { MatchBanner } from './flags';
import { Scoreboard } from './Scoreboard';

interface Props {
  series: SeriesResult;
  teams: [TTeam, TTeam];
  event: string;
  onBack: () => void;
}

export function MatchDetail({ series, teams, event, onBack }: Props) {
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
        </div>
      </div>

      <Scoreboard series={series} teams={teams} />
    </div>
  );
}
