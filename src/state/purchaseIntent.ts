// [U08] INTENÇÃO DE COMPRA — o que o jogador queria comprar quando bateu no login/cadastro.
// Convidado clica em "R$ 10" na Loja do Ultimate → guardamos {produto, tier, aba, origem}
// e abrimos a conta; ao voltar logado (mesma sessão ou retorno do checkout da vitalícia)
// o Ultimate reabre a aba e o produto. NUNCA cobra sozinho: só reabre a tela de compra.
// TTL curto (24h) — intenção velha não persegue ninguém. Só localStorage; sem e-mail.
const KEY = 'rtm-ult-intent-v1';
export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export interface PurchaseIntent {
  v: 1;
  product_kind: 'coins' | 'pass';
  tier?: string;                 // p10 | p15 | p30 (coins)
  method?: 'pix' | 'card';
  tab: 'store' | 'passe';
  src: string;                   // superfície de origem (telemetria)
  at: number;
}

export function normalizeIntent(v: unknown, now: number): PurchaseIntent | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<PurchaseIntent>;
  if (o.v !== 1 || (o.product_kind !== 'coins' && o.product_kind !== 'pass') || (o.tab !== 'store' && o.tab !== 'passe')) return null;
  const at = Number(o.at) || 0;
  if (!at || now - at > INTENT_TTL_MS || at > now + 60_000) return null;
  return { v: 1, product_kind: o.product_kind, tier: typeof o.tier === 'string' ? o.tier : undefined, method: o.method === 'card' ? 'card' : o.method === 'pix' ? 'pix' : undefined, tab: o.tab, src: typeof o.src === 'string' ? o.src : 'store', at };
}

export function saveIntent(i: Omit<PurchaseIntent, 'v' | 'at'>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...i, v: 1, at: Date.now() })); } catch { /* sem storage */ }
}
export function peekIntent(): PurchaseIntent | null {
  try { return normalizeIntent(JSON.parse(localStorage.getItem(KEY) ?? 'null'), Date.now()); } catch { return null; }
}
export function clearIntent(): void { try { localStorage.removeItem(KEY); } catch { /* sem storage */ } }
/** Há intenção viva? (o App usa pra voltar pro Ultimate depois do login/checkout) */
export function hasIntent(): boolean { return peekIntent() !== null; }
