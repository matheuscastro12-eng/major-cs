// FLAG do paywall no cliente. A fonte é o GET público /api/liveops (campo
// flags.paywallGate, ver server/paywall-gate.ts). Padrão OFF: sem resposta,
// offline ou erro, nada trava. QA: ?pwgate=1 liga e ?pwgate=0 desliga nesta
// sessão do navegador (sessionStorage), sem tocar no servidor.
//
// Regras (puras, testadas em scripts/test-paywall-gate.mts):
//   - Road to Pro demo: trava DEPOIS da 2ª partida (série) concluída;
//   - Major Singapura (campanha jogada): Stage 1 grátis, trava do Stage 2 em diante;
//   - Pick'em: vitrine + palpite do Stage 1 grátis; Stage 2, 3, playoffs e envio travam.
import { useSyncExternalStore } from 'react';

export const RTP_DEMO_FREE_MATCHES = 2;
export const MAJOR_FREE_STAGE = 1;

const OVERRIDE_KEY = 'rtm-pwgate';
let serverOn = false;
let fetched = false;
const subs = new Set<() => void>();

function readOverride(): boolean | null {
  try {
    const q = new URLSearchParams(window.location.search).get('pwgate');
    if (q === '1' || q === '0') sessionStorage.setItem(OVERRIDE_KEY, q);
    const v = sessionStorage.getItem(OVERRIDE_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

export function paywallGateOn(): boolean {
  const o = readOverride();
  return o ?? serverOn;
}

function load(): void {
  if (fetched) return;
  fetched = true;
  try {
    void fetch('/api/liveops', { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { flags?: { paywallGate?: unknown } } | null) => {
        const on = j?.flags?.paywallGate === true;
        if (on !== serverOn) { serverOn = on; subs.forEach((f) => f()); }
      })
      .catch(() => { /* offline: segue OFF */ });
  } catch { /* sem fetch: OFF */ }
}

/** Estado da flag (re-renderiza quando o servidor responde). */
export function usePaywallGate(): boolean {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); load(); return () => { subs.delete(cb); }; },
    paywallGateOn,
    () => false,
  );
}

/** valor pra registrar nos eventos (variante do experimento) */
export function gateTag(on: boolean): 'on' | 'off' { return on ? 'on' : 'off'; }

/** A demo do RtP trava agora? (depois da 2ª partida concluída) */
export function rtpDemoLocked(gate: boolean, demo: boolean, matchesPlayed: number): boolean {
  return gate && demo && matchesPlayed >= RTP_DEMO_FREE_MATCHES;
}

/** A próxima série da campanha do Major trava? phase 1..3 = Stage, 4 = playoffs */
export function majorPhaseLocked(gate: boolean, paid: boolean, phase: number): boolean {
  return gate && !paid && phase > MAJOR_FREE_STAGE;
}

/** O palpite deste Stage do pick'em trava? (0 = chave dos playoffs) */
export function pickemStageLocked(gate: boolean, paid: boolean, stage: number): boolean {
  return gate && !paid && (stage === 0 || stage > MAJOR_FREE_STAGE);
}
