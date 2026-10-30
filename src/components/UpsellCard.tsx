import { useEffect, useRef, useState } from 'react';
import { AccountError, useAccount, beginPix, fetchMe, type PixCharge } from '../state/account';
import { setCheckoutSrc, trackCheckoutAbandon, trackCheckoutOpen, trackPaywallView } from '../state/track';
import { ct } from '../state/career-i18n';
import { FounderCounter } from './FounderCounter';
import { useFounders } from '../state/founders';
import { priceLabel, usePrice } from '../state/price';
import { pixErrorKind, type PixErrorKind } from '../state/pixView';
import { PixPanel } from './PixPanel';
import { autoOfferAllowed, autoOfferUsed, hasFirstValue, markAutoOfferUsed } from '../state/paywallPolicy';

// Card de ativação (upsell) pra contas GRÁTIS. Abre em momentos estratégicos do
// jogo (fim de split, título conquistado, etc.) via evento global, o usuário pode
// fechar, mas tem um CTA pra criar a conta vitalícia. Respeita um cooldown pra não
// encher o saco. Contas pagas nunca veem.
//
// Disparo de qualquer lugar:  window.dispatchEvent(new CustomEvent('rtm:upsell', { detail: { trigger: 'split-win' } }))

const COOLDOWN_MS = 1000 * 60 * 45; // no máximo 1 vez a cada 45 min
const LAST_KEY = 'rtm_upsell_last';

// mensagem do topo por gatilho (contexto), pra parecer natural e não genérico
const HOOKS: Record<string, string> = {
  'split-win': 'Você acabou de conquistar um título. Que tal guardar essa campanha pra sempre?',
  'major': 'Campanha histórica! Não perca esse progresso.',
  'major-stage': 'Você se classificou pro MAJOR! Esse momento é histórico — garante ele na nuvem.',
  'world-1': 'TOPO DO MUNDO! Você é o #1 do VRS. Apoiadores eternizam essa marca no ladder vitalício.',
  'milestone': 'Sua carreira está ficando séria. Garanta que ela não se perca.',
  'save-risk': 'Seu progresso fica só neste navegador. Uma conta guarda tudo na nuvem.',
  'promotion': 'Subiu de divisão! Garanta essa evolução com save na nuvem.',
  'market': 'Montando seu elenco? Save na nuvem pra não perder o time dos sonhos.',
  'ranked-free': 'Você está jogando ranqueada, mas no grátis o MMR não conta no ladder. Ative pra valer.',
  'online-done': 'Boa partida! No grátis o resultado some ao fechar a aba — ative pra contar no ladder mundial.',
  'draft-win': 'Mandou bem no Major! Crie sua conta e leve isso pra uma carreira de verdade.',
  'founder': 'Os 500 primeiros viram FUNDADORES (selo #001–#500). Número baixo é troféu — garanta o seu.',
  'return': 'Que bom te ver de volta! Apoiadores nunca perdem progresso — a conta sincroniza tudo.',
  'custom-builder': 'Modo Custom é exclusivo de Vitalícia: crie sua org E os 5 jogadores manualmente (nick, role, atributos) com coach próprio.',
  'academy-rename': 'Editar o nick dos prospects é exclusivo de Vitalícia. Vire apoiador pra customizar o pipeline da sua academia.',
  default: 'Leve sua carreira pro próximo nível.',
};

export function UpsellCard({ onUpgrade, onGuestUpgrade, onPixPaid }: { onUpgrade: () => void; onGuestUpgrade?: () => void; onPixPaid: () => void }) {
  usePrice(); // re-renderiza quando o preço do servidor chega
  const { account } = useAccount();
  // funil: dado real (rtm_accounts) mostra os 500 Fundadores esgotados (500/500).
  // A lista de benefícios prometia o selo de Fundador com número baixo pra
  // QUALQUER comprador, contradizendo o FounderCounter logo abaixo (que já
  // avisa "esgotada" honestamente) — a mesma tela dizia duas coisas opostas no
  // momento decisivo da compra. Sem dado (fetch ainda não voltou) o item some
  // por padrão, igual ao FounderCounter: número/promessa nunca aparece sem
  // certeza.
  const founderStats = useFounders();
  const founderSlotsLeft = founderStats ? founderStats.founders < founderStats.limit : false;
  const [open, setOpen] = useState(false);
  const [hook, setHook] = useState(HOOKS.default);
  // Pix inline: contas já autenticadas (é o público do UpsellCard) não precisam de
  // cadastro pra gerar a cobrança — dado real mostra que Pix confirma bem mais que
  // o Stripe (checkout_open×rtm_paid_emails), mas essa superfície só oferecia Stripe.
  // A tela do QR é o PixPanel (a mesma do modal de conta da Landing).
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [pixAt, setPixAt] = useState(0); // quando a cobrança chegou (base do prazo do Woovi)
  const [pixBusy, setPixBusy] = useState(false);
  const [pixErr, setPixErr] = useState<PixErrorKind | null>(null);
  // o polling automático bateu no teto de 15 min: a tela pede o "verificar agora"
  const [pollPaused, setPollPaused] = useState(false);
  const pixOpenedAt = useRef(0);
  const pixConfirmed = useRef(false);
  // funil: dado real (checkout_abandon, method=pix, 28d) mostra 35,6% dos
  // QRs abertos (21 de 59) fechando sem pagar, com quase 40% desses abandonos
  // (9 de 24, bucket <15s–<60s) acontecendo ANTES dos 60s — ou seja, antes de
  // qualquer reassurance aparecer aqui. A Landing já validou antecipar esse
  // mesmo aviso pra 25s (commit 113cc3d) com base num achado idêntico; esta
  // superfície (upsell in-game, a que mais abre checkout_open do funil) ficou
  // parada nos 60s antigos. Alinha no mesmo timer já comprovado.
  const [pixWaitLong, setPixWaitLong] = useState(false);
  useEffect(() => {
    if (!pix) { setPixWaitLong(false); return; }
    const t = window.setTimeout(() => setPixWaitLong(true), 25_000);
    return () => window.clearTimeout(t);
  }, [pix]);
  useEffect(() => {
    if (pixWaitLong) trackPaywallView('upsell-pix-wait-longo'); // funil: reassurance exibida — src próprio (mede esta superfície, como 'pix-wait-longo' mede a Landing)
  }, [pixWaitLong]);
  // funil: dado real (checkout_abandon, method=pix, 21d, achado anterior) já
  // mostrava abandono concentrado antes dos 60s — motivou a saída honesta pro
  // cartão desde a abertura do QR (não só depois do timer). A Landing já
  // validou essa saída (não é novidade aqui, só o alinhamento do timer acima).
  const [cardSwitching, setCardSwitching] = useState(false);
  const pixSwitchedMethod = useRef(false); // trocou pro cartão em vez de desistir — não conta como abandono
  useEffect(() => {
    if (pix) trackPaywallView('upsell-pix-cartao-cedo'); // funil: src próprio (mede esta superfície separada da troca já existente na Landing)
  }, [pix]);
  const switchToCard = () => {
    if (cardSwitching) return;
    setCardSwitching(true);
    pixSwitchedMethod.current = true;
    close();
    onUpgrade();
  };

  useEffect(() => {
    const onEvt = (e: Event) => {
      if (account?.paid) return; // pagos nunca veem
      const trigger = (e as CustomEvent).detail?.trigger as string | undefined;
      const force = Boolean((e as CustomEvent).detail?.force); // clique explícito do usuário fura o cooldown
      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      // disparo automático: só depois do 1º valor, 1x por sessão e com o
      // cooldown (state/paywallPolicy.ts); clique explícito abre sempre
      if (!autoOfferAllowed({ force, firstValue: hasFirstValue(), usedThisSession: autoOfferUsed(), msSinceLast: Date.now() - last, cooldownMs: COOLDOWN_MS })) return;
      if (!force) markAutoOfferUsed();
      setHook(HOOKS[trigger ?? 'default'] ?? HOOKS.default);
      setCardSwitching(false); // botão de cartão destravado a cada abertura (só UI)
      setOpen(true);
      trackPaywallView('upsell-card'); // funil: card de upsell exibido (1x/sessão)
      localStorage.setItem(LAST_KEY, String(Date.now()));
    };
    window.addEventListener('rtm:upsell', onEvt);
    return () => window.removeEventListener('rtm:upsell', onEvt);
  }, [account?.paid]);

  // polling do Pix: mesmo padrão do modal de checkout da Landing (pausa em aba
  // oculta, teto de 15min, re-checa ao voltar pra aba).
  useEffect(() => {
    if (!pix) return;
    let alive = true;
    const startedAt = Date.now();
    const CAP_MS = 15 * 60_000;
    setPollPaused(false);
    const check = async () => {
      try { const me = await fetchMe(); if (alive && me?.paid) { pixConfirmed.current = true; setPix(null); setOpen(false); onPixPaid(); } } catch { /* ignora */ }
    };
    const t = window.setInterval(() => {
      if (Date.now() - startedAt > CAP_MS) { window.clearInterval(t); if (alive) setPollPaused(true); return; }
      if (document.hidden) return;
      void check();
    }, 6000);
    const onVis = () => { if (alive && !document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [pix, onPixPaid]);

  // "Já paguei, verificar agora": o mesmo /me do polling, na hora que a pessoa
  // pede (igual ao modal da Landing; aqui sem paywall_view, que não tem src desta
  // superfície).
  const [checkingNow, setCheckingNow] = useState(false);
  const checkPixNow = async () => {
    if (!pix || checkingNow) return;
    setCheckingNow(true);
    try {
      const me = await fetchMe();
      if (me?.paid) { pixConfirmed.current = true; setPix(null); setOpen(false); onPixPaid(); }
    } catch { /* segue esperando o polling automático */ }
    setCheckingNow(false);
  };

  if (!open || account?.paid) return null;

  const close = () => {
    if (pix && !pixConfirmed.current && !pixSwitchedMethod.current) trackCheckoutAbandon('pix', (Date.now() - pixOpenedAt.current) / 1000);
    setPix(null); setPixErr(null); setPixBusy(false);
    pixOpenedAt.current = 0; // a próxima abertura do card é outro checkout (conta outro checkout_open)
    setOpen(false);
  };

  // Também é o "Gerar novo código" / "Tentar de novo" do PixPanel: o
  // checkout_open conta só a 1ª vez que um QR aparece nesta abertura do card, e o
  // pixOpenedAt (base do abandono) fica nessa 1ª vez.
  const payPix = async () => {
    if (pixBusy) return;
    setCheckoutSrc('upsell-card');
    setPixBusy(true); setPixErr(null);
    try {
      const charge = await beginPix();
      if (!charge) { pixConfirmed.current = true; setPix(null); setOpen(false); onPixPaid(); return; } // já estava paga
      setPix(charge); setPixAt(Date.now());
      if (!pixOpenedAt.current) {
        pixOpenedAt.current = Date.now();
        trackCheckoutOpen('pix'); // funil: QR Pix aberto direto do upsell in-game
      }
    } catch (e) {
      // sem token o beginPix nem chega no servidor: é sessão (como o 401)
      setPixErr(pixErrorKind(e instanceof AccountError ? e.status : 401));
    }
    setPixBusy(false);
  };
  // com o Pix pedido, o card vira só o Pix: antes o QR entrava embaixo da lista e
  // dos botões e, no celular, ficava fora da tela (o overlay não rolava)
  const pixMode = !!pix || pixBusy || !!pixErr;

  return (
    <div className={`upsell-overlay${pixMode ? ' upsell-overlay--pix' : ''}`} role="dialog" aria-modal="true" onClick={close}>
      <div className="upsell-card" onClick={(e) => e.stopPropagation()}>
        <button className="upsell-x" onClick={close} aria-label={ct('fechar')}>✕</button>
        <div className="upsell-kicker">{ct('Conta vitalícia')}</div>
        {pixMode ? (
          <PixPanel
            charge={pix}
            chargeAt={pixAt}
            generating={pixBusy}
            error={pixErr}
            onRegenerate={() => void payPix()}
            /* saída honesta pro cartão — visível desde que o QR abre, mesmo padrão
               já validado no modal de conta da Landing. Pix segue o CTA primário
               e o QR não some; só quem não quer esperar tem pra onde ir. */
            /* sem QR ainda (erro ao gerar) é o mesmo botão de cartão do card */
            onCard={pix ? switchToCard : () => { setCheckoutSrc('upsell-card'); close(); onUpgrade(); }}
            cardSwitching={cardSwitching}
            /* reassurance honesta a partir dos 25s (ver comentário do pixWaitLong) */
            waitLong={pixWaitLong}
            onCheckNow={() => void checkPixNow()}
            checkingNow={checkingNow}
            pollPaused={pollPaused}
          />
        ) : (
          <>
            <h3 className="upsell-title">{ct(hook)}</h3>
            <ul className="upsell-list">
              <li><b>{ct('Save na nuvem')}</b> {ct('· jogue em qualquer aparelho e nunca perca a carreira')}</li>
              <li><b>{ct('Até 5 carreiras')}</b> {ct('· toque várias orgs ao mesmo tempo')}</li>
              <li><b>{ct('Ranqueada com pontuação')}</b> {ct('· suba no ladder e dispute o topo')}</li>
              <li><b>{ct('Perfil e selo de apoiador')}</b> {ct('· identidade no jogo todo')}</li>
              {founderSlotsLeft && (
                <li><b>{ct('Selo de Fundador #001–#500')}</b> {ct('· logo própria do clube + número baixo é troféu (500 primeiros)')}</li>
              )}
            </ul>
            {/* prova social real: única superfície de venda com tráfego relevante que ainda não mostrava (iter48) */}
            <FounderCounter style={{ marginBottom: '4px' }} />
            <div className="upsell-actions">
              {account ? (
                <>
                  {/* Pix vira o CTA primário aqui: dado real (checkout_open × rtm_paid_emails)
                      mostra Pix confirmando bem mais que o Stripe, e essa era a única
                      superfície de venda que nunca oferecia Pix (só o redirect pro Stripe). */}
                  <button className="btn gold big" disabled={pixBusy} onClick={payPix}>
                    {pixBusy ? ct('Aguarde…') : `${ct('Pagar com Pix')} · ${priceLabel()}`}
                  </button>
                  <button className="upsell-card-btn" disabled={pixBusy} onClick={() => { setCheckoutSrc('upsell-card'); close(); onUpgrade(); }}>
                    {ct('Ativar com cartão (Stripe)')}
                  </button>
                </>
              ) : (
                /* funil: convidado (sem token) não consegue pagar direto — beginPix/
                   beginCheckout exigem login e os botões acima quebravam pra ele (28d:
                   154 checkout_open Stripe × 6 Pix nesta superfície, e o botão Pix
                   "primário" nunca decolou — sinal de que boa parte desse tráfego
                   nem tinha conta). Manda pro fluxo de cadastro+pagamento da landing,
                   que já lida com convidado do início ao fim. */
                <button className="btn gold big" onClick={() => { setCheckoutSrc('upsell-card'); close(); (onGuestUpgrade ?? onUpgrade)(); }}>
                  {ct('Criar conta e ativar')} · {priceLabel()}
                </button>
              )}
              <button className="upsell-later" onClick={close}>{ct('Agora não')}</button>
            </div>
          </>
        )}
        <div className="upsell-foot">{ct('Pagamento único. Sem mensalidade. Apoia o desenvolvimento do jogo.')}</div>
      </div>
    </div>
  );
}
