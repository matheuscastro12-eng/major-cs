// "Retomar o Pix": lembra, só neste navegador, que a pessoa abriu o QR da
// vitalícia e saiu sem pagar — pra oferecer "continuar de onde parou" na
// volta, em vez de ela ter que achar o CTA de novo do zero. Puramente local
// (localStorage), nunca manda e-mail/SMS, e some sozinho quando a conta virar
// paga (useAccount já traz isso) ou depois de 7 dias (o preço não muda, mas
// depois disso o lembrete vira ruído, não ajuda ninguém).
//
// Dado real (28d): 26 checkout_abandon de método pix — a maioria dos QRs
// abertos (events.type='checkout_abandon'). Volume baixo pra separar a causa
// exata (ver track.ts: step/copied só chegaram recém), então isto é uma
// melhoria heurística: dar uma segunda chance de 1 toque pra quem já mostrou
// intenção real de pagar, sem inventar urgência nem mudar o preço.
const KEY = 'rtm-pix-resume-v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PixResume { src: string; at: number }

/** Pura (sem localStorage): decide se um registro ainda vale. Testada em scripts/test-pix-resume.mts */
export function pixResumeValid(p: { src?: unknown; at?: unknown } | null | undefined, now: number): PixResume | null {
  if (!p || typeof p.src !== 'string' || typeof p.at !== 'number') return null;
  if (now - p.at > TTL_MS || now < p.at) return null;
  return { src: p.src, at: p.at };
}

/** Chamada no checkout_abandon do Pix (track.ts): guarda a origem e a hora. */
export function markPixResume(src: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ src, at: Date.now() })); } catch { /* storage bloqueado: sem lembrete, sem quebra */ }
}

/** Some com o registro (ex.: a pessoa pediu "agora não"). */
export function clearPixResume(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** null se nunca abandonou um Pix, já tratou ou o registro passou dos 7 dias. */
export function getPixResume(now = Date.now()): PixResume | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return pixResumeValid(JSON.parse(raw) as { src?: unknown; at?: unknown }, now);
  } catch { return null; }
}
