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
const FUNNEL_TYPES = new Set(['paywall_view', 'checkout_open', 'checkout_abandon', 'signup_start', 'signup_done']);

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
