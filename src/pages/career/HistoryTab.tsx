// Aba History — T1.4. Saiu de inline no CareerScreen (hubTab === 'history').

import { DashCard } from '../../components/ds';
import { CareerTimeline } from '../../components/career/CareerTimeline';
import { PLACE_SHORT, type SplitRecord } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import { formatMoney } from '../../engine/ratings';

interface OrgAggregate {
  circuitTitles: number;
  majorApps: number;
  majorTitles: number;
  totalPrize: number;
  bestPlacement: string | number;
}

interface Props {
  save: { split: number; history: SplitRecord[] };
  org: OrgAggregate;
}

export function HistoryTab({ save, org }: Props) {
  return (
    <DashCard title={ct('Histórico da carreira')}>
      <div className="career-statgrid">
        <div className="cstat"><b>{save.split - 1}</b><span>{ct('Splits disputados')}</span></div>
        <div className="cstat"><b className="pos">{org.circuitTitles}</b><span>{ct('Títulos de circuito')}</span></div>
        <div className="cstat"><b className="gold-text">{org.majorTitles}</b><span>{ct('Majors vencidos')}</span></div>
        <div className="cstat"><b>{org.majorApps}</b><span>{ct('Majors disputados')}</span></div>
        <div className="cstat"><b>{formatMoney(org.totalPrize)}</b><span>{ct('Prêmios na história')}</span></div>
        <div className="cstat"><b>{org.bestPlacement}</b><span>{ct('Melhor campanha')}</span></div>
      </div>
      <div className="muted small section-label">{ct('Linha do tempo')}</div>
      {/* #51: narrativa visual por temporada (chips de marco); tabela detalhada abaixo */}
      <CareerTimeline history={save.history} />
      {save.history.length === 0 ? (
        <p className="muted small">{ct('Sua organização ainda não encerrou nenhum split. A história começa agora.')}</p>
      ) : (
        <table className="stats">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Split</th>
              <th style={{ textAlign: 'left' }}>{ct('Campeonato')}</th>
              <th>Pos</th>
              <th>V-D</th>
              <th>Major</th>
              <th>{ct('Prêmio')}</th>
            </tr>
          </thead>
          <tbody>
            {[...save.history].reverse().map((h, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left' }}>{h.split}</td>
                <td style={{ textAlign: 'left' }}>{h.circuit}{h.champion && ' 🏆'}</td>
                <td>{h.position || '-'}º</td>
                <td>{h.wins}-{h.losses}</td>
                <td className={h.major?.champion ? 'gold-text' : undefined}>
                  {h.major ? `${PLACE_SHORT[h.major.placement]}${h.major.champion ? ' 🌍🏆' : ''}` : '-'}
                </td>
                <td>{formatMoney(h.prize)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashCard>
  );
}
