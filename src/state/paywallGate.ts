// FLAG do paywall no cliente. A fonte é o GET público /api/liveops (campo
// flags.paywallGate, ver server/paywall-gate.ts). Padrão OFF: sem resposta,
// offline ou erro, nada trava. QA: ?pwgate=1 liga e ?pwgate=0 desliga nesta
// sessão do navegador (sessionStorage), sem tocar no servidor.
//
// Regras (puras, testadas em scripts/test-paywall-gate.mts):
//   - Road to Pro demo: NÃO trava mais na 2ª partida ('rtp-demo-match2' teve 61
//     sessões e 0 checkouts). A demo vai grátis até o fim da semana 3 e o
//     paywall é a proposta do clube (cliffhanger, src 'rtp-demo-cliff'), com a
//     flag ligada ou desligada — regra das semanas em RoadToPro/DEMO_WEEKS;
//   - Major Singapura (campanha jogada): Stage 1 grátis, trava do Stage 2 em diante;
//   - Pick'em: NÃO trava mais (201 sessões, 0 checkouts no 'major-pickem-gate').
import { useSyncExternalStore } from 'react';

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

/** A demo do RtP trava por partidas? Nunca mais: a trava é o fim da semana 3
 *  (proposta do clube). Mantida pura e neutra pra documentar a regra nos testes. */
export function rtpDemoLocked(_gate: boolean, _demo: boolean, _matchesPlayed: number): boolean {
  return false;
}

/** A próxima série da campanha do Major trava? phase 1..3 = Stage, 4 = playoffs */
export function majorPhaseLocked(gate: boolean, paid: boolean, phase: number): boolean {
  return gate && !paid && phase > MAJOR_FREE_STAGE;
}

/** O palpite deste Stage do pick'em trava? Nunca: o pick'em é todo grátis. */
export function pickemStageLocked(_gate: boolean, _paid: boolean, _stage: number): boolean {
  return false;
}
