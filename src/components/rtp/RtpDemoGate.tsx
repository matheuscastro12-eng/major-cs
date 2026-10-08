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
import { DEMO_WEEKS, activeDemoCliff, isDemoCliffExpired, openDemoCliff, expireDemoCliff, rearmDemoCliff, deliverDemoCliff, cliffRound } from '../../engine/rtp/demoCliff';
import type { RoadToProSave } from '../../engine/rtp/types';
import { FounderCounter } from '../FounderCounter';
import { RtpCliffOfferCard } from './RtpDemoCliff';
import { goUpgradeFromCliff, useNow } from './demoCliffUi';
import { RtpFrame } from './RtpFrame';

export { DEMO_WEEKS }; // semanas jogáveis na demo (a trava fecha na 4ª) — vive no engine (demoCliff.ts)

export function RtpDemoGate({ save, onUpgrade, onExit, onBack, onUpdate }: {
  save: RoadToProSave;
  onUpgrade: () => void;
  onExit: () => void;
  /** Voltar da topbar: aberta pela Série do Dia, volta pro hub; senão sai */
  onBack?: () => void;
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
    const t = Date.now();
    // SEGUNDA CHANCE: expirada há 3+ dias e ainda com rodada → o clube volta
    // com a proposta revisada. Antes de tratar expiração (senão ela seria lida
    // como expirada de novo). Passo próprio 'cliff_rearmed' fica pra depois:
    // RtpDemoStep (state/track.ts) é union fechada e não é deste PR — a
    // reabertura conta como 'cliff_view' (rodada 2 visível no save: round).
    const base = rearmDemoCliff(save, t);
    const c = base.demoCliff;
    if (!c) return;
    if (isDemoCliffExpired(c, t)) {
      trackRtpDemo('cliff_expired');
      if (c.status !== 'expired') onUpdate?.(expireDemoCliff(base, t));
      return;
    }
    trackRtpDemo('cliff_view');
    let next = c.openedAt ? base : openDemoCliff(base, t);
    // a 1ª rodada foi pra mesa na virada da semana 4; a revisada nasce já com a
    // trava aberta, então entra na mesa agora — quem compra a vê ao sair da trava.
    if (base !== save) next = deliverDemoCliff(next, t);
    if (next !== save) onUpdate?.(next);
  }, [save, onUpdate]);
  // o relógio venceu com a trava aberta: vira "expirada" na hora (sem reload).
  useEffect(() => {
    const c = save.demoCliff;
    if (c && c.status !== 'expired' && isDemoCliffExpired(c, now)) {
      trackRtpDemo('cliff_expired');
      onUpdate?.(expireDemoCliff(save, now));
    }
  }, [now, save, onUpdate]);

  const p = save.player;
  const revised = !!cliff && cliffRound(cliff) > 1;   // 2ª rodada: a proposta revisada
  const goUpgrade = () => { if (cliff) goUpgradeFromCliff(onUpgrade); else { setCheckoutSrc('rtp-demo'); onUpgrade(); } };
  // no shell (RtpFrame): trilho, topbar e Voltar, como as outras telas de
  // fluxo do RtP; antes ocupava a tela inteira, sem saída além do botão
  return (
    <RtpFrame onExit={onBack ?? onExit} kicker={ct('Fim da demo')}>
    <div className="rtp-demogate">
      <div className="rtp-demogate-box">
        {cliff ? (
          <>
            <span className="rtp-demogate-kicker">📩 {ct('PROPOSTA NA MESA')} · {ct('FIM DA DEMO')}</span>
            {revised ? (
              <h1>{ct('O')} <b>{cliff.offer.orgName}</b> {ct('voltou com uma proposta revisada. Última chance: expira em 48h.')}</h1>
            ) : (
              <h1>{ct('O')} <b>{cliff.offer.orgName}</b> {ct('quer o')} <b>{p.nick}</b>. {ct('A proposta expira em 48h.')}</h1>
            )}
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
    </RtpFrame>
  );
}
