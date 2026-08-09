// DEMO do Road to Pro — a TRAVA de conversão. O jogador grátis viveu a peneira
// e as primeiras semanas; aqui a demo termina COM O JOGADOR DELE na tela ("o
// {nick} fica te esperando") e o CTA da vitalícia. O save é o MESMO da versão
// completa (localStorage): comprou → continua exatamente de onde parou e o
// save sobe pra nuvem. Nada se perde — esse é o argumento.
//
// NOTA: root .rtp OBRIGATÓRIO (escopo das vars --rtp-*) — mesma lição do bug
// da Série do Dia (tela fora do RtpShell renderiza crua sem ele).

import { useEffect } from 'react';
import { ct } from '../../state/career-i18n';
import { trackPaywallView, setCheckoutSrc } from '../../state/track';
import { TIER_NAME } from '../../engine/rtp/league';
import type { RoadToProSave } from '../../engine/rtp/types';

export const DEMO_WEEKS = 3; // semanas jogáveis na demo (a trava fecha na 4ª)

export function RtpDemoGate({ save, onUpgrade, onExit }: {
  save: RoadToProSave;
  onUpgrade: () => void;
  onExit: () => void;
}) {
  useEffect(() => { trackPaywallView('rtp-demo-gate'); }, []);
  const p = save.player;
  const goUpgrade = () => { setCheckoutSrc('rtp-demo'); onUpgrade(); };
  return (
    <div className="rtp rtp-screen rtp-demogate" data-fx="on">
      <div className="rtp-demogate-box">
        <span className="rtp-demogate-kicker">🧪 {ct('FIM DA DEMO')}</span>
        <h1>{ct('A carreira do')} <b>{p.nick}</b> {ct('está só começando.')}</h1>

        {/* o CARD do jogador criado — o motivo emocional de continuar */}
        <div className="rtp-demogate-card">
          <span className="rtp-demogate-ovr">{p.ovr}</span>
          <div>
            <b>{p.nick}</b>
            <span>{p.role} · {save.team.teamName} · {TIER_NAME[save.team.tier] ?? save.team.tier}</span>
            <em>{ct('semana')} {save.world.week} · {ct('temporada')} {save.world.season}</em>
          </div>
        </div>

        <p className="rtp-demogate-pitch">
          {ct('Você viveu a peneira, assinou contrato e treinou as primeiras semanas. A vitalícia libera a carreira INTEIRA — e o seu progresso continua exatamente daqui.')}
        </p>
        <ul className="rtp-demogate-list">
          <li>✔ {ct('Carreira completa: circuito, promoções, transferências e o MAJOR')}</li>
          <li>✔ {ct('SÉRIE DO DIA — o desafio global com ranking diário')}</li>
          <li>✔ {ct('Vida de pro: perks, moradia, investimentos e legado')}</li>
          <li>✔ {ct('Save na nuvem (5 slots) — jogue no PC e no celular')}</li>
          <li>✔ {ct('E TUDO do jogo: modo Carreira de manager + Ultimate Squad')}</li>
        </ul>

        <button type="button" className="rtp-cta rtp-demogate-cta" onClick={goUpgrade}>
          {ct('GARANTIR A VITALÍCIA')} · R$ 20 <span>{ct('pagamento único, pra sempre')}</span>
        </button>
        <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar pro menu')}</button>
        <span className="rtp-demogate-keep">💾 {ct('Seu save fica guardado neste navegador — o')} {p.nick} {ct('espera você voltar.')}</span>
      </div>
    </div>
  );
}
