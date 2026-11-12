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
import { SocialProof } from '../SocialProof';
import { useFounders } from '../../state/founders';
import { RtpCliffOfferCard } from './RtpDemoCliff';
import { goUpgradeFromCliff, useNow } from './demoCliffUi';
import { RtpFrame } from './RtpFrame';
import { priceLabel, usePrice } from '../../state/price';

export { DEMO_WEEKS }; // semanas jogáveis na demo (a trava fecha na 4ª) — vive no engine (demoCliff.ts)

export function RtpDemoGate({ save, onUpgrade, onExit, onBack, onUpdate, src = 'rtp-demo-gate', gateTag }: {
  save: RoadToProSave;
  /** origem do paywall_view sem proposta na mesa (padrão 'rtp-demo-gate'). Com a
   *  proposta do clube ativa a trava É o paywall do cliffhanger: 'rtp-demo-cliff'. */
  src?: string;
  /** estado da flag do paywall ('on'|'off'), vai no paywall_view para comparar */
  gateTag?: 'on' | 'off';
  onUpgrade: () => void;
  onExit: () => void;
  /** Voltar da topbar: aberta pela Série do Dia, volta pro hub; senão sai */
  onBack?: () => void;
  onUpdate?: (next: RoadToProSave) => void;   // grava openedAt/expiração do cliffhanger
}) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  const now = useNow();
  const cliff = activeDemoCliff(save, now);
  const founders = useFounders();
  // [paywall v2] a proposta do clube no fim da semana 3 é O paywall: a view
  // leva o mesmo src do checkout que nasce dela ('rtp-demo-cliff').
  const viewSrc = cliff ? 'rtp-demo-cliff' : src;
  // 1x por montagem: telemetria da trava + relógio do cliffhanger (ou expiração).
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    trackPaywallView(viewSrc, gateTag ? { paywallGate: gateTag } : {});
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
  }, [save, onUpdate, viewSrc, gateTag]);
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
  const goUpgrade = () => { if (cliff) goUpgradeFromCliff(onUpgrade); else { setCheckoutSrc(src === 'rtp-demo-gate' ? 'rtp-demo' : src); onUpgrade(); } };
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

        {/* [paywall v2] LOSS FRAMING: o que some se ele parar agora — só o que o
            jogo faz de verdade (proposta com relógio real, save só local na demo). */}
        <div className="rtp-demogate-loss">
          <b>{ct('Se parar agora, você perde:')}</b>
          <ul>
            {cliff && <li>✖ {ct('A proposta do')} {cliff.offer.orgName} — {ct('ela expira e não volta igual')}</li>}
            <li>✖ {ct('A carreira do')} {p.nick} ({ct('OVR')} {p.ovr}, {save.team.teamName}) {ct('parada na semana')} {save.world.week}</li>
            <li>✖ {ct('As')} {DEMO_WEEKS} {ct('semanas de progresso: o save da demo fica só neste navegador — limpar o cache ou trocar de aparelho apaga tudo')}</li>
          </ul>
        </div>
        {/* 'VOCÊ LEVA': só o que o código trava de verdade pra quem não pagou */}
        <b className="rtp-demogate-take">{ct('Você leva')}</b>
        <ul className="rtp-demogate-list">
          <li>✔ {ct('A carreira inteira do Road to Pro, continuando DESTE save (o mesmo jogador, o mesmo clube)')}</li>
          <li>✔ {ct('SÉRIE DO DIA — o desafio global com ranking diário')}</li>
          <li>✔ {ct('Save na nuvem — saves extras da Carreira de manager, no PC e no celular')}</li>
          <li>✔ {ct('Mercado do Ultimate Squad')}</li>
          <li>✔ {ct('Weekend League e rank salvo no ranking persistente do online')}</li>
          {gateTag === 'on' && <li>✔ {ct('A campanha inteira do Major Singapura (do Stage 2 à final)')}</li>}
          {founders && founders.founders < founders.limit && <li>✔ {ct('Selo de Fundador numerado (enquanto houver vagas)')}</li>}
        </ul>

        {/* prova social REAL (GET /api/account): sem dado → some */}
        <SocialProof />
        {founders && founders.founders < founders.limit && <FounderCounter style={{ marginBottom: '2px' }} />}

        <button type="button" className="rtp-cta rtp-demogate-cta paywall-sticky-cta" onClick={goUpgrade}>
          {cliff ? ct('GARANTIR A VITALÍCIA E RESPONDER') : ct('GARANTIR A VITALÍCIA')} · {priceLabel()} <span>{ct('pagamento único, pra sempre')}</span>
        </button>
        <button type="button" className="rtp-btn-ghost" onClick={onExit}>{ct('Voltar pro menu')}</button>
        <span className="rtp-demogate-keep">💾 {ct('Seu save fica guardado neste navegador — o')} {p.nick} {ct('espera você voltar.')}</span>
      </div>
    </div>
    </RtpFrame>
  );
}
