import { ct } from '../../state/career-i18n';
import { RtpIcon } from './RtpIcon';
import { DashCard } from '../career/DashCard';
import { TIER_NAME } from '../../engine/rtp/league';
import type { RoadToProSave } from '../../engine/rtp/types';

const SQUAD_LABEL: Record<string, string> = {
  star: ct('Estrela'), starter: ct('Titular'), rotation: ct('Rotação'), bench: ct('Reserva'),
};
const money = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;

export function RtpMarket({ save }: { save: RoadToProSave }) {
  const { team, world, player, sponsors } = save;
  const c = team.contract;
  const offers = world.pendingOffers ?? [];

  return (
    <>
      <DashCard title={ct('Contrato atual')}>
        <div className="rtp-contract">
          <div className="rtp-contract-org">
            <span className="rtp-ct-badge" style={{ background: `linear-gradient(135deg, ${team.colors[0]}, ${team.colors[1]})` }}>
              {team.logo ? <img src={team.logo} alt={team.tag} /> : team.tag}
            </span>
            <div>
              <b>{team.teamName}</b>
              <span>{TIER_NAME[team.tier]} · {SQUAD_LABEL[team.squadRole]} · OVR {player.ovr}</span>
            </div>
          </div>
          <div className="rtp-contract-grid">
            <div><span>{ct('Salário')}</span><b>{money(c.wage)}<i>/{ct('sem')}</i></b></div>
            <div><span>{ct('Tempo restante')}</span><b>{c.weeksLeft} <i>{ct('sem')}</i></b></div>
            <div><span>{ct('Cláusula de multa')}</span><b>{money(c.buyout)}</b></div>
          </div>
          {world.loanReturn && (
            <div className="rtp-loan-banner">
              <RtpIcon name="trade" size={14} /> {ct('Emprestado por')} {team.teamName}. {ct('Volta pra')} <b>{world.loanReturn.teamName}</b> {ct('no fim da temporada — a menos que brilhe (top 2) e seja comprado.')}
            </div>
          )}
        </div>
      </DashCard>

      <DashCard title={ct('Janela de transferências')}>
        {offers.length > 0 ? (
          <div className="rtp-note">{offers.length} {ct('proposta(s) na mesa — resolva na tela de transferências ao fim da temporada.')}</div>
        ) : (
          <div className="rtp-soon">
            <RtpIcon name="trade" size={16} /> {ct('Sem propostas no momento. Vá bem na liga e ganhe fama para atrair orgs maiores no fim da temporada.')}
          </div>
        )}
      </DashCard>

      <DashCard title={ct('Patrocínios pessoais')}>
        {sponsors.length === 0 ? (
          <div className="rtp-soon">{ct('Nenhum patrocínio ativo. Eventos de mídia e fama alta abrem portas.')}</div>
        ) : (
          <div className="rtp-sponsors">
            {sponsors.map((sp) => (
              <div key={sp.id} className="rtp-sponsor">
                <b>{sp.brand}</b>
                <span>{money(sp.perWeek)}/{ct('sem')} · {sp.weeksLeft} {ct('sem')} · +{sp.fameBonus} {ct('fama')}</span>
              </div>
            ))}
          </div>
        )}
      </DashCard>
    </>
  );
}
