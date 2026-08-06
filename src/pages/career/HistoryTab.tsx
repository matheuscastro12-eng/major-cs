// Aba History — T1.4. Saiu de inline no CareerScreen (hubTab === 'history').

import { useState } from 'react';
import { DashCard } from '../../components/ds';
import { CareerTimeline } from '../../components/career/CareerTimeline';
import { PLACE_SHORT, type SplitRecord } from '../../components/CareerScreen';
import { ct } from '../../state/career-i18n';
import { formatMoney } from '../../engine/ratings';
import { shareCareerCard, type CareerShareData } from '../../state/careerShareCard';
import { track } from '../../state/track';
import type { YearAwards } from '../../engine/awards';

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
  /** identidade da org pro card de share (nome/tag) */
  identity?: { name: string; tag?: string };
  /** #27: noites de premiação passadas (galeria consultável) */
  awards?: YearAwards[];
}

export function HistoryTab({ save, org, identity, awards }: Props) {
  const [sharing, setSharing] = useState<'idle' | 'busy' | 'saved'>('idle');

  const doShareCard = async () => {
    if (sharing === 'busy') return;
    setSharing('busy');
    const data: CareerShareData = {
      orgName: identity?.name || 'Minha org',
      tag: identity?.tag,
      splits: Math.max(save.split - 1, save.history.length),
      titles: org.circuitTitles,
      majorsWon: org.majorTitles,
      majorsPlayed: org.majorApps,
      prizeLabel: formatMoney(org.totalPrize),
      bestLabel: String(org.bestPlacement),
      seq: save.history.map((h) => ({
        champion: h.champion,
        top4: h.position > 0 && h.position <= 4,
        bottom: h.position >= 9,
        major: h.major ? (h.major.champion ? 'won' as const : 'played' as const) : undefined,
      })),
    };
    track('career_share_card', { splits: data.splits, titles: data.titles, majors: data.majorsWon });
    const how = await shareCareerCard(data);
    setSharing(how === 'saved' ? 'saved' : 'idle');
    if (how === 'saved') setTimeout(() => setSharing('idle'), 2200);
  };

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
      {/* card "minha carreira em 1 print" — a fita da carreira como imagem */}
      {save.history.length > 0 && (
        <button
          type="button"
          className="btn-ghost"
          style={{ margin: '10px 0 4px', padding: '8px 14px', border: '1px solid var(--em-gold)', borderRadius: 6, background: 'rgba(216,169,67,.07)', color: 'var(--em-gold)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem' }}
          onClick={() => { void doShareCard(); }}
          disabled={sharing === 'busy'}
        >
          {sharing === 'busy' ? ct('Gerando…') : sharing === 'saved' ? ct('PNG salvo + texto copiado 😉') : `📸 ${ct('Minha carreira em 1 print')}`}
        </button>
      )}
      {/* #27: GALERIA DE PRÊMIOS — as noites de premiação da sua era, pra sempre */}
      {awards && awards.length > 0 && (
        <>
          <div className="muted small section-label">🏆 {ct('Galeria de Prêmios')}</div>
          <div className="hist-awards">
            {[...awards].sort((a, b) => b.year - a.year).map((y) => (
              <div key={y.year} className="hist-awards-year">
                <b>{ct('Temporada')} {y.year}</b>
                <div className="hist-awards-list">
                  {y.winners.map((w, i) => (
                    <div key={i} className="hist-award">
                      <span className="hist-award-label">{w.label}</span>
                      <b>{w.playerNick ?? w.coachNick ?? (w.lineup ? w.lineup.map((s) => s.nick).join(' · ') : '—')}</b>
                      <em>{w.reason}</em>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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
