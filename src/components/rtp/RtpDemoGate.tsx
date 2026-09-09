// DEMO do Road to Pro — a TRAVA de conversão. O jogador grátis viveu a peneira
// e as primeiras semanas; aqui a demo termina COM O JOGADOR DELE na tela ("o
// {nick} fica te esperando") e o CTA da vitalícia. O save é o MESMO da versão
// completa (localStorage): comprou → continua exatamente de onde parou e o
// save sobe pra nuvem. Nada se perde — esse é o argumento.
//
// [W1] CLIFFHANGER: se a proposta do clube maior chegou (engine/rtp/demoCliff),
// a trava vira o gancho — "O {clube} quer o {nick}. A proposta expira em 48h"
// — com relógio de parede REAL: openedAt/expiresAt gravados no save na hora em
// que a trava abre. Expirou → a proposta some e a trava volta ao texto normal.
//
// NOTA: root .rtp OBRIGATÓRIO (escopo das vars --rtp-*) — mesma lição do bug
// da Série do Dia (tela fora do RtpShell renderiza crua sem ele).

import { useEffect, useRef } from 'react';
import { ct } from '../../state/career-i18n';
import { trackPaywallView, setCheckoutSrc, trackRtpDemo } from '../../state/track';
import { TIER_NAME } from '../../engine/rtp/league';
import { DEMO_WEEKS, activeDemoCliff, isDemoCliffExpired, openDemoCliff, expireDemoCliff } from '../../engine/rtp/demoCliff';
import type { RoadToProSave } from '../../engine/rtp/types';
import { FounderCounter } from '../FounderCounter';
import { RtpCliffOfferCard, goUpgradeFromCliff, useNow } from './RtpDemoCliff';

export { DEMO_WEEKS }; // semanas jogáveis na demo (a trava fecha na 4ª) — vive no engine (demoCliff.ts)

export function RtpDemoGate({ save, onUpgrade, onExit, onUpdate }: {
  save: RoadToProSave;
  onUpgrade: () => void;
  onExit: () => void;
  onUpdate?: (next: RoadToProSave) => void;   // grava openedAt/expiração do cliffhanger
}) {
  const now = useNow();
  const cliff = activeDemoCliff(save, now);
  // 1x por montagem: telemetria da trava + relógio do cliffhanger (ou expiração).
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    trackPaywallView('rtp-demo-gate');
    const c = save.demoCliff;
    if (!c) return;
    const t = Date.now();
    if (isDemoCliffExpired(c, t)) {
      trackRtpDemo('cliff_expired');
      if (c.status !== 'expired') onUpdate?.(expireDemoCliff(save));
      return;
    }
    trackRtpDemo('cliff_view');
    if (!c.openedAt) onUpdate?.(openDemoCliff(save, t));
  }, [save, onUpdate]);
  // o relógio venceu com a trava aberta: vira "expirada" na hora (sem reload).
  useEffect(() => {
    const c = save.demoCliff;
    if (c && c.status !== 'expired' && isDemoCliffExpired(c, now)) {
      trackRtpDemo('cliff_expired');
      onUpdate?.(expireDemoCliff(save));
    }
  }, [now, save, onUpdate]);

  const p = save.player;
  const goUpgrade = () => { if (cliff) goUpgradeFromCliff(onUpgrade); else { setCheckoutSrc('rtp-demo'); onUpgrade(); } };
  return (
    <div className="rtp rtp-screen rtp-demogate" data-fx="on">
      <div className="rtp-demogate-box">
        {cliff ? (
          <>
            <span className="rtp-demogate-kicker">📩 {ct('PROPOSTA NA MESA')} · {ct('FIM DA DEMO')}</span>
            <h1>{ct('O')} <b>{cliff.offer.orgName}</b> {ct('quer o')} <b>{p.nick}</b>. {ct('A proposta expira em 48h.')}</h1>
            <RtpCliffOfferCard cliff={cliff} nick={p.nick} now={now} />
            <p className="rtp-demogate-pitch">
              {ct('Aceitar, negociar e virar a semana são da vitalícia. Compre agora e a proposta continua na mesa — exatamente esta, com o seu progresso intacto.')}
            </p>
          </>
        ) : (
          <>
            <span className="rtp-demogate-kicker">🧪 {ct('FIM DA DEMO')}</span>
            <h1>{ct('A carreira do')} <b>{p.nick}</b> {ct('está só começando.')}</h1>
            {save.demoCliff?.status === 'expired' && (
              <div className="rtp-note">⌛ {ct('A proposta do')} {save.demoCliff.offer.orgName} {ct('expirou — o mercado não espera. A próxima chega jogando.')}</div>
            )}
          </>
        )}

        {/* o CARD do jogador criado — o motivo emocional de continuar */}
        <div className="rtp-demogate-card">
          <span className="rtp-demogate-ovr">{p.ovr}</span>
          <div>
            <b>{p.nick}</b>
            <span>{p.role} · {save.team.teamName} · {TIER_NAME[save.team.tier] ?? save.team.tier}</span>
            <em>{ct('semana')} {save.world.week} · {ct('temporada')} {save.world.season}</em>
          </div>
        </div>

        {!cliff && (
          <p className="rtp-demogate-pitch">
            {ct('Você viveu a peneira, assinou contrato e treinou as primeiras semanas. A vitalícia libera a carreira INTEIRA — e o seu progresso continua exatamente daqui.')}
          </p>
        )}
        <ul className="rtp-demogate-list">
          <li>✔ {ct('Carreira completa: circuito, promoções, transferências e o MAJOR')}</li>
          <li>✔ {ct('SÉRIE DO DIA — o desafio global com ranking diário')}</li>
          <li>✔ {ct('Vida de pro: perks, moradia, investimentos e legado')}</li>
          <li>✔ {ct('Save na nuvem (5 slots) — jogue no PC e no celular')}</li>
          <li>✔ {ct('E TUDO do jogo: modo Carreira de manager + Ultimate Squad')}</li>
        </ul>

        {/* funil: a demo (lançada em 09/08) é a trava mais nova do jogo e a
            única entre as de maior intenção (mkt-lock, Hero, Pricing, upsell-card)
            que ainda não mostrava a prova social real dos Fundadores — mesmo
            componente, dado real do servidor, sem número inventado. */}
        <FounderCounter style={{ marginBottom: '2px' }} />

        <button type="button" className="rtp-cta rtp-demogate-cta" onClick={goUpgrade}>
          {cliff ? ct('GARANTIR A VITALÍCIA E RESPONDER') : ct('GARANTIR A VITALÍCIA')} · R$ 20 <span>{ct('pagamento único, pra sempre')}</span>
        </button>
        <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar pro menu')}</button>
        <span className="rtp-demogate-keep">💾 {ct('Seu save fica guardado neste navegador — o')} {p.nick} {ct('espera você voltar.')}</span>
      </div>
    </div>
  );
}
