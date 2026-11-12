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

// FUNIL DE CONVERSÃO (visitante → vitalícia): eventos raros e de alto
// valor — liberados no cliente junto com 'visit'/'ad_click'. Volume é ínfimo
// (1x por sessão por superfície), então não mexe no controle de custo do Neon.
// share_card {kind, channel} entra aqui: 1 evento por clique em compartilhar —
// volume ínfimo e é o numerador do K-factor (quanto compartilhamento vira visita).
const FUNNEL_TYPES = new Set([
  'paywall_view', 'checkout_open', 'checkout_abandon', 'checkout_error', 'checkout_blocked', 'pix_copy_click', 'signup_start', 'signup_done', 'rtp_demo', 'ult_funnel', 'share_card',
  // [medição do Major e da ativação] marcos raros, sem dado pessoal (só sid, ref e o modo/superfície)
  'major_sg_view', 'major_vitrine_click', 'major_pickem_submit', 'major_sg_campaign_done', 'first_match_done',
  // game_start/game_end (modo clássico): o corte de custo 3bf5f3f transformou
  // TODO evento fora desta lista em no-op no cliente, e eles sumiram do admin
  // (api/metrics.ts ainda os conta). Volume: 1 por campeonato iniciado/terminado
  // — ordem de grandeza do first_match_done, não do presence.
  'game_start', 'game_end',
  // Pix confirmado na tela (polling viu a conta paga): fecha o funil do QR
  'pix_confirmed',
]);
// Marcos que valem 1x por sessão do navegador (sessionStorage, então F5 não
// repete): a chave inclui a superfície quando houver. Volume esperado: ≤ 5
// eventos por sessão, todos com o compute do Neon já acordado pela visita.
const ONCE_PER_SESSION = new Set(['major_sg_view', 'major_vitrine_click', 'major_pickem_submit', 'major_sg_campaign_done']);
const ONCE_KEY = 'rtm-once';
const memoryOnce = new Set<string>();

/** chave de dedupe de um marco: tipo + superfície (se houver). Puro, testado em scripts/test-track-funnel.mts */
export function onceKey(type: string, data: Record<string, unknown>): string {
  const surface = typeof data.surface === 'string' ? data.surface : '';
  return surface ? `${type}:${surface}` : type;
}

function seenOnce(key: string): boolean {
  if (memoryOnce.has(key)) return true;
  memoryOnce.add(key);
  try {
    const raw = sessionStorage.getItem(ONCE_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (list.includes(key)) return true;
    list.push(key);
    sessionStorage.setItem(ONCE_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* storage bloqueado: fica o dedupe em memória */ }
  return false;
}
// eventos de VENDA que carregam o ref de compartilhamento da sessão (first-touch)
const REF_TYPES = new Set(['paywall_view', 'checkout_open', 'checkout_abandon', 'checkout_error', 'pix_copy_click', 'signup_start', 'signup_done']);

// ─── ATRIBUIÇÃO DE COMPARTILHAMENTO ──────────────────────────────────────────
// Links gerados por state/shareLink.ts chegam com ?ref=daily&utm_source=share…
// O PRIMEIRO ref da sessão fica em sessionStorage e é injetado nos eventos de
// venda acima — assim dá pra ligar "post no X / grade no grupo" → Pix.
const REF_KEY = 'rtm-ref';
let memoryRef = '';

/** só [a-z0-9-_], até `max` chars — o que vier fora disso é descartado. */
function attrParam(v: string | null, max = 40): string {
  if (!v) return '';
  const s = v.toLowerCase().slice(0, max);
  return /^[a-z0-9_-]+$/.test(s) ? s : '';
}

function getShareRef(): string {
  try { return sessionStorage.getItem(REF_KEY) || memoryRef; } catch { return memoryRef; }
}

// utm first-touch da sessão (vai junto do cadastro/pedido de coins → colunas ref/utm)
const UTM_KEY = 'rtm-utm';
let memoryUtm: Record<string, string> = {};
function rememberUtm(u: Record<string, string>): void {
  if (!Object.keys(u).length) return;
  try { if (sessionStorage.getItem(UTM_KEY)) return; sessionStorage.setItem(UTM_KEY, JSON.stringify(u)); } catch { if (Object.keys(memoryUtm).length) return; }
  memoryUtm = u;
}
/** ref/utm first-touch da sessão (só [a-z0-9-_]); vazio quando não houver. */
export function sessionAttribution(): Record<string, string> {
  let utm: Record<string, string> = memoryUtm;
  try { const raw = sessionStorage.getItem(UTM_KEY); if (raw) utm = JSON.parse(raw) as Record<string, string>; } catch { /* memória */ }
  const ref = getShareRef();
  return { ...(ref ? { ref } : {}), ...utm };
}

// variante do A/B dos cards de oferta (state/offerAb.ts registra o getter — evita import circular)
const OFFER_AB_TYPES = new Set(['paywall_view', 'checkout_open', 'signup_done']);
let offerVariantGetter: (() => string) | null = null;
export function registerOfferVariant(get: () => string): void { offerVariantGetter = get; }
function withOfferVariant(type: string, data: Record<string, unknown>): Record<string, unknown> {
  if (!OFFER_AB_TYPES.has(type) || !offerVariantGetter || data.offerVariant !== undefined) return data;
  try { return { ...data, offerVariant: offerVariantGetter() }; } catch { return data; }
}

function rememberShareRef(ref: string): void {
  if (!ref || getShareRef()) return; // first-touch
  memoryRef = ref;
  try { sessionStorage.setItem(REF_KEY, ref); } catch { /* storage bloqueado: fica em memória */ }
}

// CORTE DE CUSTO: só 'visit', 'ad_click' e os eventos do FUNIL vão pro servidor.
// Eventos de jogo (game_start, online_*, etc.) viram no-op pra não gerar
// invocação de função nem observability.
export function track(type: string, data: Record<string, unknown> = {}): void {
  // demais tipos existem na allowlist do backend mas estão pausados no cliente
  if (type !== 'visit' && type !== 'ad_click' && !FUNNEL_TYPES.has(type)) return;
  if (ONCE_PER_SESSION.has(type) && seenOnce(onceKey(type, data))) return;
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, sid: sessionId(), data: withOfferVariant(type, withShareRef(type, data)) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* offline/dev: ignora */
  }
}

function withShareRef(type: string, data: Record<string, unknown>): Record<string, unknown> {
  if (!REF_TYPES.has(type) || data.ref !== undefined) return data;
  const ref = getShareRef();
  return ref ? { ...data, ref } : data;
}

/** Clique num botão de compartilhar. channel: 'x' (intent), 'native' (navigator.share), 'copy' (clipboard/download). */
export type ShareChannel = 'x' | 'native' | 'copy';
export function trackShare(kind: string, channel: ShareChannel): void {
  track('share_card', { kind: kind.slice(0, 40), channel });
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

// ─── Funil de conversão da vitalícia ─────────────────────────────────
// paywall_view {src}      → usuário grátis/deslogado VIU uma superfície de venda
//                           (1x por sessão do navegador por src, em sessionStorage)
// checkout_open {src,method} → a UI de pagamento realmente abriu (Stripe redirect
//                           ou QR Pix na tela); src = atribuição de PRIMEIRO clique
// checkout_abandon {src,method,secondsOpen,step,copied,copyFailed} → fechou o QR Pix sem pagar (best-effort)
// pix_copy_click {src,ok} → tocou em "Copiar código Pix" (ok=false: cópia bloqueada)
// signup_start/done {src} → cadastro pré-pagamento (rtm_pending_signups) começou/terminou

// paywall_view: 1x por sessão do navegador por src (sessionStorage, como os
// marcos do Major). Antes era só em memória e cada recarga contava outra vista:
// 631 eventos para 182 sessões em 24h (30/10). Agora o evento acompanha o que o
// jogador viu: cada superfície uma vez por sessão (ver state/paywallPolicy.ts).
// Os outros degraus do funil (rtp_demo, ult_funnel, signup) seguem com o
// dedupe em memória abaixo.
const seenPaywalls = new Set<string>();

// atribuição de origem do checkout: PRIMEIRO clique de CTA da sessão vence
// (first-touch). Persistida em sessionStorage porque algumas travas navegam com
// <a href> (reload completo) antes do checkout abrir.
const SRC_KEY = 'rtm-funnel-src';
let memorySrc = '';

/** Registra que uma superfície de venda da vitalícia foi VISTA (1x/sessão/src). */
export function trackPaywallView(src: string, extra: Record<string, string | number> = {}): void {
  // 1x por sessão por superfície (e por momento, quando a superfície tem vários)
  if (seenOnce(`paywall_view:${src}${extra.moment ? `:${extra.moment}` : ''}`)) return;
  // src segue igual (as consultas antigas dependem dele); surface/trigger são o
  // recorte que o Growth pediu: onde apareceu e o que fez aparecer.
  track('paywall_view', { src, surface: src, trigger: paywallTrigger(src), ...extra });
}

// [paywall] Início: o portal mostra várias vitrines ao mesmo tempo (card RtP com
// preço, card Ultimate com cadeado, pill "Vire Fundador", chip do convidado) e
// cada uma virava um paywall_view com src próprio — o convidado que já jogou
// gerava home-rtp + acct-chip-guest (2 views) na MESMA visita. Agora a visita ao
// Início conta 1 paywall_view: src = a vitrine principal (ordem de
// homePaywallSurfaces) e `surfaces` lista todas as que estavam na tela.
export function trackHomePaywallView(surfaces: readonly string[]): void {
  if (!surfaces.length) return;
  if (seenOnce('paywall_view:home')) return;
  const src = surfaces[0];
  track('paywall_view', { src, surface: src, trigger: paywallTrigger(src), surfaces: surfaces.join(',') });
}

// O que fez a oferta aparecer:
//   gate     → o jogador tentou usar algo travado (demo do RtP, mercado, Ultimate sem conta…)
//   checkout → já está no pagamento (avisos dentro do QR Pix / nudge do checkout)
//   surface  → viu uma vitrine de venda navegando (landing, Início, perfil, ranking…)
const PAYWALL_GATES = new Set(['rtp-demo-gate', 'rtp-demo-cliff', 'mkt-lock', 'home-ultimate', 'wl-guest', 'wl-free', 'rtp-demo-match2', 'major-sg-gate', 'major-pickem-gate']);
const PAYWALL_IN_CHECKOUT = new Set(['pix-wait-longo', 'pix-cartao-cedo', 'upsell-pix-cartao-cedo', 'checkout-nudge', 'upsell-nudge']);
export type PaywallTrigger = 'gate' | 'checkout' | 'surface';
export function paywallTrigger(src: string): PaywallTrigger {
  if (PAYWALL_GATES.has(src)) return 'gate';
  if (PAYWALL_IN_CHECKOUT.has(src)) return 'checkout';
  return 'surface';
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
  if (method === 'pix') resetPixCheckout(); // abertura nova do QR: copiar volta a contar
  // product: este checkout é só o da conta vitalícia; coins e Passe vão no
  // ult_funnel (purchase_intent {product_kind}).
  track('checkout_open', { src: getCheckoutSrc() || 'direto', method, product: 'vitalicia' });
}

/** QR Pix da vitalícia fechado sem pagamento confirmado (best-effort). */
export function trackCheckoutAbandon(method: 'stripe' | 'pix', secondsOpen: number): void {
  const base = { src: getCheckoutSrc() || 'direto', method, secondsOpen: Math.round(secondsOpen) };
  track('checkout_abandon', method === 'pix' ? { ...base, ...pixAbandonData() } : base);
}

// ─── Passo do Pix (checkout_abandon.step e pix_copy_click) ──────────────────
// 25 de 40 checkouts (28 dias) abandonam o QR Pix, e até aqui o abandono só
// dizia QUANTO tempo o QR ficou aberto, não ONDE a pessoa parou. O QR da
// vitalícia é sempre a PixPanel (modal de conta da Landing e UpsellCard): ela
// informa aqui a vista em que está e se o código foi copiado.
//   step       → vista na hora de fechar: 'gerando' | 'qr' | 'espera' (passou
//                dos 25s, com o aviso) | 'expirou' | 'erro'
//   copied     → copiou o "copia e cola" pelo menos 1x nesta abertura
//   copyFailed → o navegador bloqueou a cópia (ficou o código para copiar à mão)
// pix_qr_shown NÃO é evento novo: é o checkout_open {method:'pix'}, que já sai
// quando o QR chega na tela.
export type PixStep = 'gerando' | 'qr' | 'espera' | 'expirou' | 'erro';

/** Passo do Pix a partir da vista da PixPanel. Puro, testado em scripts/test-track-funnel.mts */
export function pixStep(v: { view: 'loading' | 'error' | 'expired' | 'ready'; error: boolean; waitLong: boolean }): PixStep {
  if (v.error || v.view === 'error') return 'erro';
  if (v.view === 'expired') return 'expirou';
  if (v.view === 'loading') return 'gerando';
  return v.waitLong ? 'espera' : 'qr';
}

const pixCheckout = { step: 'gerando' as PixStep, copied: false, copyFailed: false, copyTracked: new Set<boolean>() };

function resetPixCheckout(): void {
  pixCheckout.copied = false;
  pixCheckout.copyFailed = false;
  pixCheckout.copyTracked.clear();
}

/** A PixPanel avisa a vista atual (a cada troca de vista). */
export function setPixStep(step: PixStep): void {
  pixCheckout.step = step;
}

/** o que vai junto do checkout_abandon do Pix */
export function pixAbandonData(): { step: PixStep; copied: boolean; copyFailed: boolean } {
  return { step: pixCheckout.step, copied: pixCheckout.copied, copyFailed: pixCheckout.copyFailed };
}

/** Clique em "Copiar código Pix". ok=false: o navegador bloqueou a cópia.
 *  No máximo 1 evento de cada (ok e falha) por abertura do QR. */
export function trackPixCopy(ok: boolean): void {
  if (ok) pixCheckout.copied = true; else pixCheckout.copyFailed = true;
  if (pixCheckout.copyTracked.has(ok)) return;
  pixCheckout.copyTracked.add(ok);
  track('pix_copy_click', { src: getCheckoutSrc() || 'direto', ok });
}

/** beginCheckout()/beginPix() rejeitou (sessão expirada, erro do Stripe/Woovi):
 *  o checkout_open já tinha sido contado, mas até aqui a falha ficava muda —
 *  sem esse evento não dá pra separar "abriu e desistiu" de "nem chegou a abrir". */
export function trackCheckoutError(method: 'stripe' | 'pix', reason: string): void {
  track('checkout_error', { src: getCheckoutSrc() || 'direto', method, reason: reason.slice(0, 120) });
}

/** Clicou em "Pagar com Pix"/"Ativar com cartão" com o cadastro incompleto —
 *  antes disso o botão só ficava desabilitado, sem dizer o motivo. 1x/sessão
 *  por motivo (não é pra medir quantos cliques, é pra medir ONDE as pessoas
 *  travam: e-mail, senha curta, senhas diferentes ou termos não aceitos). */
export function trackCheckoutBlocked(reason: string): void {
  const key = `checkout_blocked_${reason}`;
  if (seenPaywalls.has(key)) return;
  seenPaywalls.add(key);
  track('checkout_blocked', { src: getCheckoutSrc() || 'direto', reason });
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
//   weekend_event_enter  → entrou na fila do evento de fim de semana  {eventId}
//   season_pack_open     → abriu o Pacote da Temporada [URG-1]        {season}
//   community_goal_share → copiou/compartilhou a meta comunitária    {weekId} [URG-5]
//   community_goal_claim → resgatou o prêmio da meta comunitária     {weekId, packTier?} [URG-5]
//     (o servidor marca 'claimed' uma vez por pedido — é a confirmação
//     autoritativa; evento de UI sozinho não conta como receita).
//   rival_overtaken_seen → [URG-3] viu no Hub o bloco "fulano te passou"  {count}
//     (gatilho de retorno: mede quantas visitas nascem de uma ultrapassagem)
// Nunca leva e-mail, token ou valor pago. Denominadores (plano U02): conclusão
// da 1ª partida por 'enter'; 2ª partida por 'match_completed'; 1ª compra por
// 'enter'. Custo: ≤ ~10 eventos por sessão, com o compute do Neon já acordado.
export type UltFunnelStep =
  | 'enter' | 'starter_claimed' | 'match_started' | 'match_completed' | 'squad_adjusted'
  | 'second_match_started' | 'offer_viewed' | 'purchase_intent' | 'purchase_fulfilled' | 'target_selected'
  | 'weekend_event_enter' // [URG-2] entrou na fila do evento de fim de semana {eventId}
  | 'streak_at_risk_seen' | 'season_pack_open' | 'rival_overtaken_seen' // [URG-4] viu o aviso vermelho "você perde N dias em Xh" {days, hoursLeft}
  | 'community_goal_share' | 'community_goal_claim';
export type UltProductKind = 'coins' | 'pass' | 'account';

export function trackUltFunnel(step: UltFunnelStep, data: Record<string, string | number | boolean> = {}): void {
  // purchase_fulfilled deduplica pelo PEDIDO (um evento por pedido confirmado);
  // os demais, 1x por sessão por degrau (+ product_kind, quando houver).
  const suffix = step === 'purchase_fulfilled' ? String(data.orderId ?? '') : String(data.product_kind ?? '');
  const key = `ult_funnel_${step}${suffix ? `_${suffix}` : ''}`;
  if (seenPaywalls.has(key)) return;
  seenPaywalls.add(key);
  track('ult_funnel', { step, ...data });
  if (step === 'match_completed') trackFirstMatchDone('ultimate');
}

// ─── ATIVAÇÃO: tempo até o 1º valor ─────────────────────────────────────────
// first_match_done {mode, secs}: a PRIMEIRA partida/série concluída neste
// navegador (Draft, Modo Major ou Ultimate), com os segundos desde a primeira
// visita. 1 evento por navegador na vida (localStorage), nada pessoal.
const FIRST_SEEN_KEY = 'rtm-first-seen';
const FIRST_MATCH_KEY = 'rtm-first-match';

function markFirstSeen(nowMs: number): void {
  try { if (!localStorage.getItem(FIRST_SEEN_KEY)) localStorage.setItem(FIRST_SEEN_KEY, String(nowMs)); } catch { /* sem storage */ }
}

/** payload do first_match_done. secs = null quando não há registro da 1ª visita. Puro. */
export function firstMatchPayload(mode: string, firstSeenMs: number | null, nowMs: number): { mode: string; secs: number | null } {
  const secs = firstSeenMs && nowMs >= firstSeenMs ? Math.round((nowMs - firstSeenMs) / 1000) : null;
  return { mode: mode.slice(0, 20), secs };
}

export function trackFirstMatchDone(mode: 'draft' | 'major' | 'ultimate'): void {
  let firstSeen: number | null;
  try {
    if (localStorage.getItem(FIRST_MATCH_KEY)) return;
    localStorage.setItem(FIRST_MATCH_KEY, '1');
    firstSeen = Number(localStorage.getItem(FIRST_SEEN_KEY)) || null;
  } catch {
    return; // sem storage não dá pra garantir "1x por navegador": não envia
  }
  track('first_match_done', firstMatchPayload(mode, firstSeen, Date.now()));
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
  markFirstSeen(Date.now()); // base do first_match_done (tempo até o 1º valor)
  // ATENÇÃO: até out/2026 `data.ref` do visit era o document.referrer. Agora
  // `ref` é a origem do link compartilhado (?ref=) e o referrer vai em `referrer`.
  // Só LÊ a query — limpar a URL é responsabilidade do App.tsx. Lido ANTES do
  // dedupe: quem volta pelo link de um post dentro da mesma hora ainda grava o ref.
  let attr: Record<string, string> = {};
  try {
    const q = new URLSearchParams(window.location.search);
    const ref = attrParam(q.get('ref'));
    rememberShareRef(ref);
    attr = {
      ref,
      utm_source: attrParam(q.get('utm_source')),
      utm_medium: attrParam(q.get('utm_medium')),
      utm_campaign: attrParam(q.get('utm_campaign')),
      path: window.location.pathname.slice(0, 80),
    };
    for (const k of Object.keys(attr)) if (!attr[k]) delete attr[k];
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (attr[k]) utm[k] = attr[k];
    rememberUtm(utm);
  } catch { /* URL inacessível: segue sem atribuição */ }
  try {
    const key = 'rtm-visit-at';
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60 * 60 * 1000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sem sessionStorage, envia uma visita por carregamento; track() já é
    // fire-and-forget e não interfere no jogo.
  }
  track('visit', { ...attr, referrer: document.referrer.slice(0, 120), mobile: window.innerWidth < 720 });
}
