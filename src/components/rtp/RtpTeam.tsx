import { useMemo } from 'react';
import { ct } from '../../state/career-i18n';
import { Flag, TeamBadge } from '../ui';
import { DashCard } from '../career/DashCard';
import { RtpIcon } from './RtpIcon';
import { circuitRanking, TIER_NAME } from '../../engine/rtp/circuit';
import { ROLE_LABEL } from '../../engine/rtp/matchSim';
import type { RoadToProSave } from '../../engine/rtp/types';

const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

// Aba TIME (v15): a casa do seu elenco. Cartões dos 5 (você + 4 colegas reais),
// entrosamento por colega, confiança do coach, sua função no elenco e o clube
// (contrato/força no field). O que o Vestiário mostrava espremido, aqui respira.
export function RtpTeam({ save }: { save: RoadToProSave }) {
  const { player, team, life, world } = save;
  const circuit = world.league;

  const fieldRank = useMemo(() => {
    if (!circuit) return 0;
    return circuitRanking(circuit).findIndex((t) => t.isUser) + 1;
  }, [circuit]);

  const coach = Math.round(life.rel.coach);
  const coachCol = coach >= 66 ? 'var(--rtp-win)' : coach >= 40 ? 'var(--rtp-warn)' : 'var(--rtp-loss)';
  const chemAvg = Math.round(
    Object.values(team.chem).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(team.chem).length),
  );

  const roster = [
    { id: 'hero', nick: player.nick, name: player.name, role: player.role, country: player.country, ovr: player.ovr, form: player.form, hero: true, chem: null as number | null },
    ...team.teammates.map((m) => ({
      id: m.id, nick: m.nick, name: m.name, role: m.role, country: m.country, ovr: m.ovr, form: m.form ?? 1, hero: false,
      chem: Math.round(team.chem[m.sourcePlayerId] ?? 30),
    })),
  ];

  return (
    <>
      {/* O clube */}
      <DashCard title={ct('Seu clube')} className="rtp-team-club">
        <div className="rtp-team-club-head">
          <TeamBadge tag={team.tag} colors={team.colors} size={54} logoUrl={team.logo} />
          <div className="rtp-team-club-id">
            <b>{team.teamName}</b>
            <span>{TIER_NAME[team.tier]}{fieldRank > 0 ? ` · #${fieldRank} ${ct('no circuito')}` : ''}</span>
          </div>
          <span className={`rtp-team-role r-${team.squadRole}`}>{ROLE_LABEL[team.squadRole]}</span>
        </div>
        <div className="rtp-team-club-stats">
          <div><span>{ct('Salário')}</span><b>{money(team.contract.wage)}/{ct('sem')}</b></div>
          <div><span>{ct('Contrato')}</span><b className={team.contract.weeksLeft <= 6 ? 'rtp-ct-warning' : undefined}>{team.contract.weeksLeft > 0 ? `${team.contract.weeksLeft} ${ct('sem')}` : ct('EXPIRADO')}</b></div>
          <div><span>{ct('Entrosamento médio')}</span><b>{chemAvg}</b></div>
        </div>
      </DashCard>

      {/* Coach */}
      <DashCard title={ct('Comissão técnica')}>
        <div className="rtp-vest-coach">
          <span className="rtp-vest-k"><RtpIcon name="users" size={13} /> {ct('Confiança do coach')}</span>
          <div className="rtp-vest-bar"><i style={{ width: `${coach}%`, background: coachCol }} /></div>
          <b style={{ color: coachCol }}>{coach}</b>
        </div>
        <p className="rtp-soon" style={{ marginTop: 8 }}>
          {coach >= 66 ? ct('O coach confia em você — sua vaga aguenta uma fase ruim.')
            : coach >= 40 ? ct('Relação neutra: entregue em quadra que a vaga segue sua.')
              : ct('O coach está de olho. Uma sequência ruim te manda pro banco.')}
        </p>
      </DashCard>

      {/* Elenco */}
      <DashCard title={ct('Elenco')} flush>
        <div className="rtp-team-roster">
          {roster.map((p) => (
            <div key={p.id} className={`rtp-team-card${p.hero ? ' hero' : ''}`}>
              <div className="rtp-team-card-top">
                <span className="rtp-team-card-ovr">{p.ovr}</span>
                <div className="rtp-team-card-id">
                  <b><Flag cc={p.country} /> {p.nick}{p.hero && <span className="rtp-ov-youtag">{ct('você')}</span>}</b>
                  <span>{p.name !== '—' ? p.name : ''}</span>
                </div>
                <span className="rtp-team-card-role">{p.role}</span>
              </div>
              <div className="rtp-team-card-meters">
                <div className="rtp-team-meter">
                  <span>{ct('Forma')}</span>
                  <div className="rtp-vest-bar sm"><i style={{ width: `${Math.round(((p.form - 0.85) / 0.3) * 100)}%`, background: p.form >= 1.02 ? 'var(--rtp-win)' : p.form <= 0.95 ? 'var(--rtp-loss)' : 'var(--rtp-warn)' }} /></div>
                  <b>{p.form.toFixed(2)}</b>
                </div>
                {p.chem != null && (
                  <div className="rtp-team-meter">
                    <span>{ct('Entrosamento')}</span>
                    <div className="rtp-vest-bar sm"><i style={{ width: `${p.chem}%`, background: p.chem >= 60 ? 'var(--rtp-win)' : p.chem >= 35 ? 'var(--rtp-signal)' : 'var(--rtp-ink-faint)' }} /></div>
                    <b>{p.chem}</b>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DashCard>
    </>
  );
}
