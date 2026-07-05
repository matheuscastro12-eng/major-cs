// Mercado JOGADOR↔JOGADOR do Ultimate Squad — fase B (cliente). Só REDE aqui:
// wrappers tipados das actions mktList/mktBuy/mktCancel/mktBrowse/mktMine de
// /api/ultimate-economy (fase A em server/ultimate-market.ts). As mutações
// LOCAIS (carta sai/volta da coleção, credits) ficam em ultimate.ts
// (marketListCard/marketCardSold/marketCardReturned/marketBuyApply) e NÃO
// passam pelo espelho-sombra: as pernas 'escrow'/'trade' já nasceram no ledger
// do servidor — espelhar duplicaria (mesma supressão do openPackCloud).
//
// Regras de ouro (iguais às do shadow): nunca lança, nunca bloqueia a UI além
// do próprio await; conta grátis/deslogada devolve 'unpaid' sem tocar na rede.

import { getToken } from './account';
import { captureError } from './errlog';
import { estimateCardValue, type UltCard } from '../engine/ultimate/cards';

// ESPELHO das constantes de server/ultimate-market.ts (âncora única =
// estimateCardValue, compartilhado via engine) — usadas pra UX instantânea;
// o servidor re-valida tudo e devolve min/max na rejeição.
export const MKT_TAX_RATE = 0.05; // 5% queimados na venda
export const MKT_PRICE_FLOOR_MULT = 0.5;
export const MKT_PRICE_CEIL_MULT = 3;
export const MKT_MAX_ACTIVE_LISTINGS = 10;
export const MKT_LISTING_TTL_H = 48;

export function mktPriceBounds(card: Pick<UltCard, 'ovr' | 'rarity'>): { min: number; max: number } {
  const value = estimateCardValue(card.ovr, card.rarity);
  return {
    min: Math.max(1, Math.ceil(value * MKT_PRICE_FLOOR_MULT)),
    max: Math.max(1, Math.floor(value * MKT_PRICE_CEIL_MULT)),
  };
}

// quanto o vendedor recebe depois da taxa (o resto é queimado no servidor)
export function mktSellerProceeds(price: number): number {
  return Math.ceil(price * (1 - MKT_TAX_RATE));
}

// ------------------------------------------------------------------- shapes

export interface MktBrowseItem {
  id: number;
  cardKey: string;
  price: number;
  expiresAt: string;
  mine: boolean; // listagem minha (a rota marca; e-mail do vendedor nunca vaza)
}

export type MktMineStatus = 'active' | 'sold' | 'cancelled' | 'expired';
export interface MktMineItem {
  id: number;
  cardId: string;
  cardKey: string;
  price: number;
  status: MktMineStatus;
  createdAt: string;
  expiresAt: string;
  soldAt: string | null;
}

export type MktListOutcome =
  | { ok: true; listingId: number; expiresAt: string }
  | { ok: false; error: 'invalid_price'; min?: number; max?: number }
  | { ok: false; error: 'listing_cap'; cap: number }
  | { ok: false; error: 'special_not_listable' | 'not_owner' | 'unknown_card' | 'unpaid' | 'offline' | 'unknown' };

export type MktBuyOutcome =
  | { ok: true; replayed: boolean; credits: number; listingId: number; cardId: string; cardKey: string; price: number }
  | { ok: false; error: 'insufficient_credits'; credits: number }
  | { ok: false; error: 'not_active' | 'not_found' | 'self_buy' | 'unpaid' | 'offline' | 'unknown' };

export type MktCancelOutcome =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'not_active' | 'unpaid' | 'offline' | 'unknown' };

// -------------------------------------------------------------------- rede

interface PostResult { status: number; data: Record<string, unknown> | null }

// POST cru na rota da economia (status 0 = falha de rede/timeout). Nunca lança.
async function post(body: Record<string, unknown>): Promise<PostResult> {
  const token = getToken();
  if (!token) return { status: 401, data: null };
  try {
    const r = await fetch('/api/ultimate-economy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, token }),
    });
    const data = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: r.status, data };
  } catch { return { status: 0, data: null }; }
}

const num = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// 401/403 → conta deslogada/grátis; 0/5xx/429 → offline (a UI mostra estado amigável)
function commonFail(status: number): 'unpaid' | 'offline' | null {
  if (status === 401 || status === 403) return 'unpaid';
  if (status === 0 || status === 429 || status >= 500) return 'offline';
  return null;
}

// ------------------------------------------------------------------ actions

// Lista uma cópia (cardId = OwnedCard.id) por `price`. Sucesso ⇒ o SERVIDOR já
// tirou a carta da coleção server-side (custódia) — o chamador espelha no local
// via marketListCard (sem shadow).
export async function mktList(cardId: string, price: number): Promise<MktListOutcome> {
  try {
    const { status, data } = await post({ action: 'mktList', cardId, price });
    if (status >= 200 && status < 300 && data) {
      return { ok: true, listingId: num(data.listingId), expiresAt: str(data.expiresAt) };
    }
    const cf = commonFail(status);
    if (cf) return { ok: false, error: cf };
    const err = str(data?.error);
    // 400 'preço fora da faixa' vem com min/max do catálogo do servidor
    if (data && (data.min != null || data.max != null)) {
      return { ok: false, error: 'invalid_price', min: data.min != null ? num(data.min) : undefined, max: data.max != null ? num(data.max) : undefined };
    }
    if (status === 409 && data?.cap != null) return { ok: false, error: 'listing_cap', cap: num(data.cap, MKT_MAX_ACTIVE_LISTINGS) };
    if (err.includes('especiais')) return { ok: false, error: 'special_not_listable' };
    if (err === 'not_owner') return { ok: false, error: 'not_owner' };
    if (err === 'unknown_card') return { ok: false, error: 'unknown_card' };
    if (err.includes('preço')) return { ok: false, error: 'invalid_price' };
    return { ok: false, error: 'unknown' };
  } catch (e) {
    captureError(e, 'ult-mkt');
    return { ok: false, error: 'unknown' };
  }
}

// Compra uma listagem. Sucesso ⇒ o servidor já debitou o comprador, creditou o
// vendedor e moveu a carta — o chamador aplica no local via marketBuyApply
// (sem shadow). Idempotente no servidor (op_id 'mkt-buy:<id>').
export async function mktBuy(listingId: number): Promise<MktBuyOutcome> {
  try {
    const { status, data } = await post({ action: 'mktBuy', listingId });
    if (status >= 200 && status < 300 && data) {
      return {
        ok: true, replayed: data.replayed === true, credits: num(data.credits),
        listingId: num(data.listingId, listingId), cardId: str(data.cardId), cardKey: str(data.cardKey), price: num(data.price),
      };
    }
    const cf = commonFail(status);
    if (cf) return { ok: false, error: cf };
    const err = str(data?.error);
    if (err === 'insufficient_credits') return { ok: false, error: 'insufficient_credits', credits: num(data?.credits) };
    if (status === 404 || err === 'not_found' || err.includes('não encontrada')) return { ok: false, error: 'not_found' };
    if (err === 'self_buy') return { ok: false, error: 'self_buy' };
    if (err === 'not_active') return { ok: false, error: 'not_active' };
    return { ok: false, error: 'unknown' };
  } catch (e) {
    captureError(e, 'ult-mkt');
    return { ok: false, error: 'unknown' };
  }
}

// Cancela uma listagem MINHA ativa. Sucesso ⇒ a carta já voltou server-side —
// o chamador devolve no local via marketCardReturned (sem shadow).
export async function mktCancel(listingId: number): Promise<MktCancelOutcome> {
  try {
    const { status, data } = await post({ action: 'mktCancel', listingId });
    if (status >= 200 && status < 300) return { ok: true };
    const cf = commonFail(status);
    if (cf) return { ok: false, error: cf };
    if (status === 404) return { ok: false, error: 'not_found' };
    if (str(data?.error) === 'not_active') return { ok: false, error: 'not_active' };
    return { ok: false, error: 'unknown' };
  } catch (e) {
    captureError(e, 'ult-mkt');
    return { ok: false, error: 'unknown' };
  }
}

// Vitrine pública (cap 50 no servidor; 'cheap' é o default de lá também).
export async function mktBrowse(filters: { cardKey?: string; maxPrice?: number; sort?: 'cheap' | 'new' } = {}): Promise<{ ok: true; listings: MktBrowseItem[] } | { ok: false; error: 'unpaid' | 'offline' | 'unknown' }> {
  try {
    const { status, data } = await post({
      action: 'mktBrowse',
      ...(filters.cardKey ? { cardKey: filters.cardKey } : {}),
      ...(filters.maxPrice ? { maxPrice: Math.trunc(filters.maxPrice) } : {}),
      sort: filters.sort === 'new' ? 'new' : 'cheap',
    });
    if (status >= 200 && status < 300 && data) {
      const raw = Array.isArray(data.listings) ? data.listings : [];
      const listings: MktBrowseItem[] = [];
      for (const l of raw) {
        if (!l || typeof l !== 'object') continue;
        const ll = l as Record<string, unknown>;
        const id = num(ll.id);
        const cardKey = str(ll.cardKey);
        if (!id || !cardKey) continue;
        listings.push({ id, cardKey, price: num(ll.price), expiresAt: str(ll.expiresAt), mine: ll.mine === true });
      }
      return { ok: true, listings };
    }
    return { ok: false, error: commonFail(status) ?? 'unknown' };
  } catch (e) {
    captureError(e, 'ult-mkt');
    return { ok: false, error: 'unknown' };
  }
}

// Minhas listagens (todas as situações, cap 30) — é daqui que saem os retornos
// (expirada/cancelada em outro aparelho) e os PROCEEDS de venda.
export async function mktMine(): Promise<{ ok: true; listings: MktMineItem[] } | { ok: false; error: 'unpaid' | 'offline' | 'unknown' }> {
  try {
    const { status, data } = await post({ action: 'mktMine' });
    if (status >= 200 && status < 300 && data) {
      const raw = Array.isArray(data.listings) ? data.listings : [];
      const listings: MktMineItem[] = [];
      for (const l of raw) {
        if (!l || typeof l !== 'object') continue;
        const ll = l as Record<string, unknown>;
        const id = num(ll.id);
        const cardKey = str(ll.cardKey);
        const s = str(ll.status);
        if (!id || !cardKey) continue;
        listings.push({
          id, cardKey,
          cardId: str(ll.cardId),
          price: num(ll.price),
          status: (['active', 'sold', 'cancelled', 'expired'].includes(s) ? s : 'active') as MktMineStatus,
          createdAt: str(ll.createdAt),
          expiresAt: str(ll.expiresAt),
          soldAt: ll.soldAt == null ? null : str(ll.soldAt),
        });
      }
      return { ok: true, listings };
    }
    return { ok: false, error: commonFail(status) ?? 'unknown' };
  } catch (e) {
    captureError(e, 'ult-mkt');
    return { ok: false, error: 'unknown' };
  }
}

// --------------------------------------------------- ledger local "já vi"

// Marca listagens já PROCESSADAS no cliente ('sold:<id>' = proceeds creditados;
// 'back:<id>' = carta devolvida à coleção local). Sem isso, cada poll do
// mktMine re-creditaria a venda / re-devolveria a carta. Best-effort: se o
// storage falhar, o pior caso é crédito duplicado LOCAL — a reconciliação do
// boot (servidor→local nunca; local vence, mas o ledger fica como auditoria)
// e o cap de 300 tags mantêm o dano limitado.
const SEEN_KEY = 'rtm-ult-mkt-seen-v1';
const SEEN_CAP = 300;

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export function mktSeenHas(tag: string): boolean {
  return loadSeen().includes(tag);
}

export function mktMarkSeen(tag: string): void {
  try {
    const arr = loadSeen();
    if (arr.includes(tag)) return;
    arr.push(tag);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-SEEN_CAP)));
  } catch { /* storage indisponível — best-effort */ }
}
