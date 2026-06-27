// Aba Results — T1.4. Saiu de inline no CareerScreen (hubTab === 'results').

import { DashCard } from '../../components/ds';
import { MatchLine } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import type { SeriesResult, TTeam } from '../../types';
import type { League } from '../../engine/league';

interface Props {
  league: League;
  setSelSeries: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}

export function ResultsTab({ league, setSelSeries }: Props) {
  return (
    <DashCard title={ct('Resultados')}>
      {league.rounds.map((round, r) => (
        <div key={r} className="results-round">
          <div className="muted small section-label" style={{ marginTop: r === 0 ? 0 : 14 }}>
            {ct('Rodada')} {r + 1}{r === league.current && ` ${ct('(atual)')}`}
          </div>
          {round.map((m, i) => <MatchLine key={i} league={league} m={m} onOpen={setSelSeries} />)}
        </div>
      ))}
      <p className="muted small" style={{ marginTop: 12 }}>
        {ct('Clique em qualquer partida finalizada para ver o placar mapa a mapa.')}
      </p>
    </DashCard>
  );
}
