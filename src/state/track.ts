// Telemetria leve do client: fire-and-forget, nunca atrapalha o jogo.

const SID_KEY = 'rtm-sid';
const PRESENCE_INTERVAL_MS = 30_000;

let stopPresence: (() => void) | null = null;

export function sessionId(): string {
  let sid = localStorage.getItem(SID_KEY);
  if (!sid) {
    sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(SID_KEY, sid);
  }
  return sid;
}

export function track(type: string, data: Record<string, unknown> = {}): void {
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
  const onVisible = () => {
    if (document.visibilityState === 'visible') send();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', send);

  stopPresence = () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', send);
    stopPresence = null;
  };
  return stopPresence;
}

// visita: no máximo 1 evento por sessão de navegação (por hora)
export function trackVisit(): void {
  const key = 'rtm-visit-at';
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 60 * 60 * 1000) return;
  sessionStorage.setItem(key, String(Date.now()));
  track('visit', { ref: document.referrer.slice(0, 120), mobile: window.innerWidth < 720 });
}
