// Aba Bracket — T1.4. Saiu de inline no CareerScreen (hubTab === 'bracket').

import { DashCard } from '../../components/ds';
import {
  GamePlanPicker,
  GSLBracket,
  PlayoffBracket,
  type GamePlan,
  type Playoff,
} from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import { leagueTeam, type League, type LeagueMatch } from '../../engine/league';
import type { SeriesResult, TTeam } from '../../types';

interface Props {
  save: {
    circuit?: { name?: string } | null;
    playoff?: Playoff | null;
    gamePlan?: GamePlan;
  };
  league: League;
  opp: TTeam | null;
  myMatch: LeagueMatch | null | undefined;
  update: (patch: { gamePlan?: GamePlan }) => void;
  playMine: () => void;
  simMine: () => void;
  setSelSeries: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
}

export function BracketTab({
  save,
  league,
  opp,
  myMatch,
  update,
  playMine,
  simMine,
  setSelSeries,
}: Props) {
  return (
    <DashCard title={ct('Chave')}>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {save.circuit?.name ?? 'Circuito'} · chave da fase de grupos (GSL · dupla eliminação) — top 2 de cada grupo vão ao mata-mata
      </div>
      {opp && myMatch && (
        <div className="bracket-play">
          <span className="muted small">
            {ct('Sua próxima partida:')} <b>{opp.name}</b> · {(myMatch.bo ?? 3) === 1 ? 'MD1' : (myMatch.bo ?? 3) === 5 ? 'MD5' : 'MD3'}
          </span>
          <GamePlanPicker plan={save.gamePlan ?? 'disciplined'} onPick={(p) => update({ gamePlan: p })} />
          <span className="spacer" />
          <button className="btn gold" onClick={playMine}>▶ JOGAR</button>
          <button className="btn ghost small" onClick={simMine}>⏩ Simular</button>
        </div>
      )}
      {league.gsl
        ? <GSLBracket league={league} onOpen={setSelSeries} />
        : <p className="muted small">{ct('Este circuito não usa fase de grupos GSL.')}</p>}
      {save.playoff && (
        <div style={{ marginTop: 18 }}>
          <PlayoffBracket
            p={save.playoff}
            teamOf={(id: string) => leagueTeam(league, id)}
            onOpen={(s: SeriesResult, ts: [TTeam, TTeam]) => setSelSeries({ series: s, teams: ts })}
          />
        </div>
      )}
      <p className="muted small" style={{ marginTop: 10 }}>
        {ct('Clique num confronto concluído pra ver o placar completo da série.')}
      </p>
    </DashCard>
  );
}
