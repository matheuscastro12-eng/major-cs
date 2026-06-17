// Monitoramento de erro do client: captura crash de runtime e manda pro servidor,
// fire-and-forget. Frugal de propósito: deduplica por mensagem e manda no máximo
// alguns por sessão, pra não virar enxurrada de chamada nem custo de DB.
import { sessionId } from './track';

const MAX_PER_SESSION = 6;
let sent = 0;
let installed = false;
const seen = new Set<string>();

function report(kind: string, message: string, stack: string): void {
  const msg = (message || '').trim();
  if (!msg) return;
  const key = msg.slice(0, 140);
  if (seen.has(key) || sent >= MAX_PER_SESSION) return;
  seen.add(key);
  sent++;
  try {
    fetch('/api/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sid: sessionId(),
        kind,
        message: msg.slice(0, 500),
        stack: (stack || '').slice(0, 2000),
        url: `${location.pathname}${location.hash}`.slice(0, 300),
        ua: navigator.userAgent.slice(0, 300),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* offline/dev: ignora */
  }
}

// reporte manual (ex.: Error Boundary do React, que window.onerror não pega)
export function captureError(err: unknown, kind = 'react'): void {
  const e = err as { message?: string; stack?: string } | undefined;
  report(kind, (e && e.message) || String(err), (e && e.stack) || '');
}

export function installErrorLogging(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e: ErrorEvent) => {
    // ignora erro de carregamento de recurso (img/script sem message)
    const m = e.message || (e.error && (e.error as Error).message) || '';
    if (!m) return;
    report('error', m, (e.error && (e.error as Error).stack) || '');
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    const m = typeof r === 'string' ? r : r?.message || String(r);
    report('promise', m, (typeof r === 'object' && r?.stack) || '');
  });
}
