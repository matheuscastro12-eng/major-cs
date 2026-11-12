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
const AUTO_KEY = 'rtm-paywall-moments';
let memoryValue = false;

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

// Correção do Matheus (02/11): a oferta aparece nos MOMENTOS de valor (trava,
// fim de partida/campanha, palpite do Major fechado, volta do visitante), no
// máximo 1x por momento e com um teto por sessão que é configurável para o
// teste A/B: variante 'a' = 1 por sessão (45 min entre ofertas), 'b' = 3 por
// sessão (10 min). A variante sai do sid (estável na sessão) e pode ser forçada
// com ?pw=a|b para QA. Vai junto do paywall_view (cap) para comparar as duas.
export type PaywallVariant = 'a' | 'b';
export const PAYWALL_VARIANTS: Record<PaywallVariant, { cap: number; cooldownMs: number }> = {
  a: { cap: 1, cooldownMs: 45 * 60_000 },
  b: { cap: 3, cooldownMs: 10 * 60_000 },
};

/** variante a partir do sid (hash simples, metade/metade). Puro. */
export function variantOf(sid: string, override?: string | null): PaywallVariant {
  if (override === 'a' || override === 'b') return override;
  let h = 0;
  for (let i = 0; i < sid.length; i++) h = (h * 31 + sid.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? 'a' : 'b';
}

export interface AutoOfferInput {
  /** clique explícito do jogador (ex.: "Valer no ladder") */
  force: boolean;
  firstValue: boolean;
  /** momento que pediu a oferta (o trigger do rtm:upsell) */
  moment: string;
  /** momentos que já mostraram a oferta nesta sessão */
  shown: string[];
  cap: number;
  msSinceLast: number;
  cooldownMs: number;
}

/** A oferta automática pode abrir agora? Puro (testado em scripts/test-paywall-policy.mts). */
export function autoOfferAllowed(i: AutoOfferInput): boolean {
  if (i.force) return true;
  return i.firstValue && !i.shown.includes(i.moment) && i.shown.length < i.cap && i.msSinceLast >= i.cooldownMs;
}

/** momentos que já mostraram a oferta nesta sessão */
let memoryShown: string[] = [];
export function autoOffersShown(): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(AUTO_KEY) || '[]') as unknown; if (Array.isArray(v)) return v.map(String); } catch { /* sem storage */ }
  return memoryShown;
}

export function markAutoOfferShown(moment: string): void {
  const next = [...new Set([...autoOffersShown(), moment])];
  memoryShown = next;
  try { sessionStorage.setItem(AUTO_KEY, JSON.stringify(next)); } catch { /* sem storage: fica em memória */ }
}

// [paywall] Vitrines da vitalícia visíveis no Início, em ordem de prioridade (a
// 1ª vira o src do ÚNICO paywall_view da visita — ver trackHomePaywallView).
export interface HomePaywallInput {
  rtpLocked: boolean;      // card do Road to Pro com preço/cadeado (só depois do 1º valor)
  ultimateLocked: boolean; // card do Ultimate com cadeado
  freeAccount: boolean;    // logado sem vitalícia: pill "Vire Fundador"
  guest: boolean;          // convidado: chip de conta (só depois do 1º valor)
}
export function homePaywallSurfaces(i: HomePaywallInput): string[] {
  const out: string[] = [];
  if (i.rtpLocked) out.push('home-rtp'); // 1º: mantém o src que o funil do A/B já consulta
  if (i.ultimateLocked) out.push('home-ultimate');
  if (i.freeAccount) out.push('home-pill');
  if (i.guest) out.push('acct-chip-guest');
  return out;
}
