// Telemetria leve do client: fire-and-forget, nunca atrapalha o jogo.

const SID_KEY = 'rtm-sid';
// presença a cada 90s (era 30s): corta ~3x as invocações de /api/track sem
// perder a métrica de "online agora". Só dispara com a aba visível.
const PRESENCE_INTERVAL_MS = 90_000;

let stopPresence: (() => void) | null = null;
let memorySid = '';

export function sessionId(): string {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    // Safari privado/WebViews podem bloquear storage. Telemetria nunca deve
    // derrubar a navegação do jogo, então mantém um id apenas em memória.
    if (!memorySid) memorySid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    return memorySid;
  }
}

// FUNIL DE CONVERSÃO (visitante → vitalícia R$20): eventos raros e de alto
// valor — liberados no cliente junto com 'visit'/'ad_click'. Volume é ínfimo
// (1x por sessão por superfície), então não mexe no controle de custo do Neon.
const FUNNEL_TYPES = new Set(['paywall_view', 'checkout_open', 'checkout_abandon', 'checkout_error', 'signup_start', 'signup_done', 'rtp_demo', 'ult_funnel']);

// CORTE DE CUSTO: só 'visit', 'ad_click' e os eventos do FUNIL vão pro servidor.
// Eventos de jogo (game_start, online_*, etc.) viram no-op pra não gerar
// invocação de função nem observability.
export function track(type: string, data: Record<string, unknown> = {}): void {
  // demais tipos existem na allowlist do backend mas estão pausados no cliente
  if (type !== 'visit' && type !== 'ad_click' && !FUNNEL_TYPES.has(type)) return;
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, sid: sessionId(), data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* offline/dev: ignora */
  }
}

export function startPresenceHeartbeat(): () => void {
  if (stopPresence) return stopPresence;

  const send = () => {
    if (document.visibilityState === 'hidden') return;
    track('presence', {
      path: `${window.location.pathname}${window.location.hash}`.slice(0, 120),
      mobile: window.innerWidth < 720,
    });
  };

  send();
  const timer = window.setInterval(send, PRESENCE_INTERVAL_MS);

  stopPresence = () => {
    window.clearInterval(timer);
    stopPresence = null;
  };
  return stopPresence;
}

// ─── Funil de conversão da vitalícia (R$20) ─────────────────────────────────
// paywall_view {src}      → usuário grátis/deslogado VIU uma superfície de venda
//                           (1x por sessão de navegação por src, guarda em memória)
// checkout_open {src,method} → a UI de pagamento realmente abriu (Stripe redirect
//                           ou QR Pix na tela); src = atribuição de PRIMEIRO clique
// checkout_abandon {src,method,secondsOpen} → fechou o QR Pix sem pagar (best-effort)
// signup_start/done {src} → cadastro pré-pagamento (rtm_pending_signups) começou/terminou

// dedupe por sessão por src: Set em memória (não localStorage — recarregar a
// página conta como nova "vista", o que é o comportamento desejado do funil)
const seenPaywalls = new Set<string>();

// atribuição de origem do checkout: PRIMEIRO clique de CTA da sessão vence
// (first-touch). Persistida em sessionStorage porque algumas travas navegam com
// <a href> (reload completo) antes do checkout abrir.
const SRC_KEY = 'rtm-funnel-src';
let memorySrc = '';

/** Registra que uma superfície de venda da vitalícia foi VISTA (1x/sessão/src). */
export function trackPaywallView(src: string): void {
  if (seenPaywalls.has(src)) return;
  seenPaywalls.add(src);
  track('paywall_view', { src });
}

/** Marca a origem (CTA clicado) que levou ao checkout. First-touch: só grava se vazio. */
export function setCheckoutSrc(src: string): void {
  if (getCheckoutSrc()) return;
  memorySrc = src;
  try { sessionStorage.setItem(SRC_KEY, src); } catch { /* storage bloqueado: fica em memória */ }
}

function getCheckoutSrc(): string {
  try { return sessionStorage.getItem(SRC_KEY) || memorySrc; } catch { return memorySrc; }
}

/** A UI de pagamento da vitalícia abriu de verdade (redirect Stripe ou QR Pix). */
export function trackCheckoutOpen(method: 'stripe' | 'pix'): void {
  track('checkout_open', { src: getCheckoutSrc() || 'direto', method });
}

/** QR Pix da vitalícia fechado sem pagamento confirmado (best-effort). */
export function trackCheckoutAbandon(method: 'stripe' | 'pix', secondsOpen: number): void {
  track('checkout_abandon', { src: getCheckoutSrc() || 'direto', method, secondsOpen: Math.round(secondsOpen) });
}

/** beginCheckout()/beginPix() rejeitou (sessão expirada, erro do Stripe/Woovi):
 *  o checkout_open já tinha sido contado, mas até aqui a falha ficava muda —
 *  sem esse evento não dá pra separar "abriu e desistiu" de "nem chegou a abrir". */
export function trackCheckoutError(method: 'stripe' | 'pix', reason: string): void {
  track('checkout_error', { src: getCheckoutSrc() || 'direto', method, reason: reason.slice(0, 120) });
}

// ─── FUNIL DA DEMO DO RtP ────────────────────────────────────────────────────
// A demo grátis (1a02084) é a maior alavanca de conversão do jogo, mas nasceu
// cega: só a TRAVA emitia telemetria (paywall_view 'rtp-demo-gate'). Dava pra
// ver quanta gente BATE na trava e nenhuma noção de quanta gente ENTROU — sem
// denominador não existe taxa de conversão, só um número solto.
//
// Estes passos fecham o funil e, principalmente, mostram ONDE o jogador desiste:
//   open    → abriu o RtP em modo demo               (denominador)
//   created → passou a peneira e criou o jogador     (o gargalo mais provável)
//   week N  → sobreviveu até a semana N (2..DEMO_WEEKS+1)
//   ...então paywall_view 'rtp-demo-gate' (trava) e checkout_open src 'rtp-demo'.
//
// [W1] CLIFFHANGER: na última semana grátis chega uma proposta de clube maior
// que só a vitalícia deixa aceitar (engine/rtp/demoCliff.ts). Dois degraus a
// mais medem o gancho contra a trava antiga:
//   cliff_view    → o jogador VIU a proposta (banner da semana 3 ou trava)
//   cliff_expired → voltou depois das 48h e achou a proposta expirada
// e o checkout que nasce do gancho leva src 'rtp-demo-cliff' (vs 'rtp-demo').
//
// Custo: ~5 eventos por sessão de demo, todos dentro de uma janela em que o
// compute do Neon já está acordado — não estende active_time, que é o que
// realmente pesa na conta. Dedupe por sessão em cada passo.
export type RtpDemoStep = 'open' | 'created' | 'week' | 'cliff_view' | 'cliff_expired';

export function trackRtpDemo(step: RtpDemoStep, week?: number): void {
  const key = week === undefined ? `rtp_demo_${step}` : `rtp_demo_${step}_${week}`;
  if (seenPaywalls.has(key)) return; // re-render/StrictMode não duplica
  seenPaywalls.add(key);
  track('rtp_demo', week === undefined ? { step } : { step, week });
}

// [U02] FUNIL DO ULTIMATE — eventos de MARCO, um tipo só ('ult_funnel') com
// {step,...}, mesmo desenho do rtp_demo. Nada por round; dedupe por sessão em
// cada degrau (a 1ª e a 2ª partida são degraus distintos de propósito:
// "concluiu a 1ª" e "começou a 2ª" são os denominadores do plano).
//   enter                → abriu o Ultimate (denominador)           {guest}
//   starter_claimed      → recebeu o time inicial
//   match_started        → começou a 1ª partida                     {mode}
//   match_completed      → a 1ª partida foi decidida                {mode, won}
//   squad_adjusted       → mexeu no squad (slot) depois do starter
//   second_match_started → começou a 2ª partida                     {mode}
//   offer_viewed         → viu a Loja / o Passe                     {product_kind, src}
//   purchase_intent      → clicou em comprar (coins/passe)          {product_kind, src, method}
//   purchase_fulfilled   → claim CONFIRMADO pelo servidor            {product_kind, orderId?}
//     (o servidor marca 'claimed' uma vez por pedido — é a confirmação
//     autoritativa; evento de UI sozinho não conta como receita).
// Nunca leva e-mail, token ou valor pago. Denominadores (plano U02): conclusão
// da 1ª partida por 'enter'; 2ª partida por 'match_completed'; 1ª compra por
// 'enter'. Custo: ≤ ~10 eventos por sessão, com o compute do Neon já acordado.
export type UltFunnelStep =
  | 'enter' | 'starter_claimed' | 'match_started' | 'match_completed' | 'squad_adjusted'
  | 'second_match_started' | 'offer_viewed' | 'purchase_intent' | 'purchase_fulfilled' | 'target_selected';
export type UltProductKind = 'coins' | 'pass' | 'account';

export function trackUltFunnel(step: UltFunnelStep, data: Record<string, string | number | boolean> = {}): void {
  // purchase_fulfilled deduplica pelo PEDIDO (um evento por pedido confirmado);
  // os demais, 1x por sessão por degrau (+ product_kind, quando houver).
  const suffix = step === 'purchase_fulfilled' ? String(data.orderId ?? '') : String(data.product_kind ?? '');
  const key = `ult_funnel_${step}${suffix ? `_${suffix}` : ''}`;
  if (seenPaywalls.has(key)) return;
  seenPaywalls.add(key);
  track('ult_funnel', { step, ...data });
}

/** Cadastro pré-pagamento: 'start' no submit (1x/sessão), 'done' no sucesso. */
export function trackSignup(step: 'start' | 'done'): void {
  const key = `signup_${step}`;
  if (seenPaywalls.has(key)) return; // reusa o guard de sessão (retries não duplicam)
  seenPaywalls.add(key);
  track(key, { src: getCheckoutSrc() || 'direto' });
}

// visita: no máximo 1 evento por sessão de navegação (por hora)
export function trackVisit(): void {
  try {
    const key = 'rtm-visit-at';
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60 * 60 * 1000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sem sessionStorage, envia uma visita por carregamento; track() já é
    // fire-and-forget e não interfere no jogo.
  }
  track('visit', { ref: document.referrer.slice(0, 120), mobile: window.innerWidth < 720 });
}
