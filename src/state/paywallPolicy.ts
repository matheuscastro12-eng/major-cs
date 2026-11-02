// Quando a oferta da conta vitalícia aparece SEM o jogador pedir.
//
// Dado real (Neon, 24h de 30/10/2026): 182 sessões viram paywall, com 631
// eventos (~3,5 por sessão), e só 1 sessão abriu o checkout. As origens que
// mais se repetem são passivas: o chip de conta do convidado e o card do Road to
// Pro no Início, e o card de upsell que abre sozinho. A regra:
//   - vitrine passiva (aparece sem clique) só depois do 1º valor: 1ª série
//     concluída, pick'em enviado ou 1º pacote aberto (ou, para quem já jogava
//     antes desta regra, uma carreira/campanha salva no navegador);
//   - interrupção automática (UpsellCard sem clique) no máximo 1x por sessão,
//     além do intervalo de 45 min que o card já tinha;
//   - trava (o jogador tentou usar algo pago), clique explícito e o checkout
//     seguem como antes.

export type FirstValue = 'match' | 'pickem' | 'pack';

const VALUE_KEY = 'rtm-first-value';
// gravado por trackFirstMatchDone (track.ts) na 1ª série concluída
const FIRST_MATCH_KEY = 'rtm-first-match';
const AUTO_KEY = 'rtm-paywall-auto';
let memoryValue = false;
let memoryAuto = false;

/** Marca o 1º valor do jogador neste navegador (só o primeiro fica gravado). */
export function markFirstValue(kind: FirstValue): void {
  memoryValue = true;
  try { if (!localStorage.getItem(VALUE_KEY)) localStorage.setItem(VALUE_KEY, kind); } catch { /* sem storage: fica em memória */ }
}

/** O jogador já teve o 1º valor (série, pick'em ou pacote) neste navegador? */
export function hasFirstValue(): boolean {
  if (memoryValue) return true;
  try { return !!(localStorage.getItem(VALUE_KEY) || localStorage.getItem(FIRST_MATCH_KEY)); } catch { return false; }
}

export interface AutoOfferInput {
  /** clique explícito do jogador (ex.: "Valer no ladder") */
  force: boolean;
  firstValue: boolean;
  /** já houve uma interrupção automática nesta sessão */
  usedThisSession: boolean;
  msSinceLast: number;
  cooldownMs: number;
}

/** A oferta automática pode abrir agora? Puro (testado em scripts/test-paywall-policy.mts). */
export function autoOfferAllowed(i: AutoOfferInput): boolean {
  if (i.force) return true;
  return i.firstValue && !i.usedThisSession && i.msSinceLast >= i.cooldownMs;
}

export function autoOfferUsed(): boolean {
  if (memoryAuto) return true;
  try { return sessionStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}

export function markAutoOfferUsed(): void {
  memoryAuto = true;
  try { sessionStorage.setItem(AUTO_KEY, '1'); } catch { /* sem storage: fica em memória */ }
}
