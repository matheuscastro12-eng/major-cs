// Preço da conta vitalícia no FRONT. Fonte única é o servidor (env
// PIX_PRICE_CENTS, lida por server/payments.ts → accountPriceCents) e exposta
// em GET /api/account → { priceCents }. Aqui: cache em memória + localStorage,
// busca 1x por sessão e avisa os componentes (usePrice) quando chega.
// Trocar o preço = mudar PIX_PRICE_CENTS na Vercel; nenhum texto tem R$ fixo.
import { useSyncExternalStore } from 'react';
import { careerLang } from './career-i18n';

export const DEFAULT_PRICE_CENTS = 2000;
const KEY = 'rtm_price_cents';
let cents = readCache();
let started = false;
const subs = new Set<() => void>();

function readCache(): number {
  try { const n = Number(localStorage.getItem(KEY)); if (Number.isFinite(n) && n >= 100) return Math.round(n); } catch { /* sem storage */ }
  return DEFAULT_PRICE_CENTS;
}

export function setPriceCents(n: unknown): void {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 100 || v === cents) return;
  cents = v;
  try { localStorage.setItem(KEY, String(v)); } catch { /* ok */ }
  subs.forEach((f) => f());
}

// [paywall] GET ?price=1 não passa pelo banco (responde mesmo com o Neon frio).
// Falhou? libera nova tentativa no próximo subscribe — antes era 1x por sessão e
// a home ficava no padrão (R$ 20) enquanto o checkout cobrava o do servidor.
// O /me, o checkout e o Pix também devolvem priceCents (state/account.ts adota).
export function loadPrice(): void {
  if (started || typeof fetch !== 'function') return;
  started = true;
  void fetch('/api/account?price=1', { method: 'GET' })
    .then((r) => r.json())
    .then((d: { priceCents?: unknown }) => {
      if (Number(d?.priceCents) >= 100) setPriceCents(d.priceCents);
      else started = false;
    })
    .catch(() => { started = false; /* fica no cache/padrão até a próxima tentativa */ });
}

export function priceCents(): number { return cents; }

const LOCALE = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' } as const;
/** "R$ 35,00" (pt/es) · "R$35.00" (en). Idioma do ct() atual. */
export function priceLabel(c = cents): string {
  const loc = LOCALE[careerLang() as keyof typeof LOCALE] ?? 'pt-BR';
  try { return new Intl.NumberFormat(loc, { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(c / 100); }
  catch { return `R$ ${(c / 100).toFixed(2).replace('.', ',')}`; }
}

/** Troca o marcador {preço} pelo preço formatado. */
export function withPrice(s: string): string { return s.split('{preço}').join(priceLabel()); }

function subscribe(f: () => void): () => void { subs.add(f); loadPrice(); return () => { subs.delete(f); }; }
/** Hook: re-renderiza quando o preço do servidor chega. Devolve o rótulo formatado. */
export function usePrice(): string {
  useSyncExternalStore(subscribe, priceCents, priceCents);
  return priceLabel();
}
