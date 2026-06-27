// Aba Standings — T1.4 do roadmap em
// .claude/plans/faca-um-replanejamento-para-piped-quilt.md.
//
// Saiu de inline no CareerScreen (hubTab === 'standings') pra cá. Reusa
// MatchLine/GSLGroups/CareerTable que foram exportados do CareerScreen
// (vão pra arquivo próprio quando esta migração avançar mais).

import { DashCard } from '../../components/ds';
import { GSLGroups, CareerTable } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import type { SeriesResult, TTeam } from '../../types';
import type { League } from '../../engine/league';

interface Props {
  save: { circuit?: { name?: string } | null };
  league: League;
  table: TTeam[];
  spots: number;
  setSelSeries: (s: { series: SeriesResult; teams: [TTeam, TTeam] }) => void;
  setSelTeam: (t: TTeam) => void;
}

export function StandingsTab({ save, league, table, spots, setSelSeries, setSelTeam }: Props) {
  return (
    <DashCard title={ct('Classificação')}>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {save.circuit?.name ?? 'Circuito'} · fase de grupos (GSL) · top 2 de cada grupo vão ao mata-mata
      </div>
      {league.gsl
        ? <GSLGroups league={league} onOpen={setSelSeries} />
        : <CareerTable table={table} highlightTop={spots} onPick={setSelTeam} detailed />}
      <p className="muted small" style={{ marginTop: 10 }}>
        {league.gsl ? ct('Clique num jogo concluído pra ver o placar.') : ct('Clique em um time para ver elenco, técnico e força.')}
      </p>
    </DashCard>
  );
}
