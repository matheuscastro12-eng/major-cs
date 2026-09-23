// Economia server-authoritative do Ultimate Squad.
// Carteira + coleção + ledger idempotente no Neon.
// Ações (POST body.action): state | tx | packOpen | mkt*. packOpen rola o pack
// NO SERVIDOR com as mesmas odds do engine do cliente — seed auditável no
// ledger, replay idempotente. [O0-02] `tx` do cliente só grava SAÍDAS
// (spend/pack/sbc/quicksell valorado no servidor); todo crédito positivo nasce
// em fluxo do servidor. Carteira congelada (frozen_at) bloqueia mercado e packs.
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  applyClientUltTx,
  getUltState,
  isUltWalletFrozen,
  ultEconomySchemaQueries,
  ultFrozenMessage,
  ULT_TX_MAX_OP_ID,
  type SqlTag,
} from '../server/ultimate-economy.js';
import {
  browseListings,
  buyListing,
  cancelListing,
  cardSales,
  listCard,
  myListings,
  recentSales,
  ultMarketSchemaQueries,
  type MktBrowseFilters,
} from '../server/ultimate-market.js';
// LAZY: a cadeia do engine (ultimate-pack → cards → src/data/*) NÃO pode ser
// importada em top-level — na Vercel ela quebra no runtime ESM (imports sem
// extensão) e derrubava a rota INTEIRA no load (mercado "não conecta",
// 2026-07-05). Ver server/ultimate-catalog-lazy.ts.
import { loadMktCardLookup, loadPackModule, loadQuicksellValuer } from '../server/ultimate-catalog-lazy.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const APP_SECRET = () => clean(process.env.APP_SECRET) || `fallback:${clean(process.env.DATABASE_URL) ?? 'dev'}`;

const rlBuckets = new Map<string, { count: number; resetAt: number }>();
let schemaReady = false;

function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (rlBuckets.size > 5000) rlBuckets.clear();
  const current = rlBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rlBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function clientIp(headers?: Record<string, string | string[] | undefined>): string {
  const raw = headers?.['x-forwarded-for'] ?? headers?.['x-real-ip'] ?? '';
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  return value.split(',')[0].trim() || 'unknown';
}

function verifyToken(token: string): string | null {
  const [b64, sig] = (token ?? '').split('.');
  if (!b64 || !sig) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  const expect = createHmac('sha256', APP_SECRET()).update(body).digest('base64url');
  const sb = Buffer.from(sig); const eb = Buffer.from(expect);
  if (sb.length !== eb.length || !timingSafeEqual(sb, eb)) return null;
  const [email, exp] = body.split('|');
  if (!email || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return email;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const ip = clientIp(req.headers);
  if (rateLimited(`ip:${ip}`, 180)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  let body: Record<string, unknown>;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  const action = String(body.action ?? '');
  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra usar a economia do Ultimate.' }); return; }
  // limites por ação: tx 120/min; listagens 30/min (anti-spam do mercado);
  // resto (inclui mktBuy) 60/min.
  const actionLimit = action === 'tx' ? 120 : action === 'mktList' ? 30 : 60;
  if (rateLimited(`account:${email}:${action}`, actionLimit)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'muitas requisições' });
    return;
  }

  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl) as unknown as SqlTag;
  if (!schemaReady) {
    for (const q of ultEconomySchemaQueries(sql)) await q;
    for (const q of ultMarketSchemaQueries(sql)) await q;
    schemaReady = true;
  }

  const acc = await (sql`SELECT paid FROM rtm_accounts WHERE email=${email}`);
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  // Ultimate aberto a QUALQUER conta logada (grátis ou vitalícia) — sem gate de paid.

  // [O0-02] carteira congelada pelo admin (varredura do ledger): mercado e
  // packs pausados até a contestação. 423 + mensagem padrão pro jogador.
  const frozenReply = () => res.status(423).json({ error: 'wallet_frozen', message: ultFrozenMessage(clean(process.env.SUPPORT_EMAIL)) });
  const guardedAction = action === 'mktList' || action === 'mktBuy' || action === 'packOpen';
  const frozen = action === 'state' || guardedAction ? await isUltWalletFrozen(sql, email) : false;
  if (frozen && guardedAction) { frozenReply(); return; }

  if (action === 'state') {
    const state = await getUltState(sql, email);
    res.status(200).json(frozen ? { ...state, frozen: true, frozenMessage: ultFrozenMessage(clean(process.env.SUPPORT_EMAIL)) } : state);
    return;
  }

  if (action === 'tx') {
    // [O0-02] forma + allowlist do cliente (só spend/pack/sbc/quicksell, sem
    // op:'add', sem crédito positivo) + quicksell valorado NO SERVIDOR — ver
    // applyClientUltTx. 'grant'/'reward'/'admin'/'escrow'/'trade' → 400.
    const r = await applyClientUltTx(sql, email, body.tx, () => loadQuicksellValuer(new Date()));
    res.status(r.status).json(r.body);
    return;
  }

  if (action === 'packOpen') {
    // op_id vem do cliente (idempotência de retry); packId só seleciona o pack
    // — custo/odds saem SEMPRE do engine no servidor, nunca do request.
    const rawOp = body.op_id ?? body.opId;
    const opId = typeof rawOp === 'string' ? rawOp.trim() : '';
    if (!opId || opId.length > ULT_TX_MAX_OP_ID) { res.status(400).json({ error: 'op_id inválido (1..64 chars)' }); return; }
    const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
    const packMod = await loadPackModule();
    if (!packMod) {
      // cadeia do engine não carrega neste runtime — o cliente (3b) trata 5xx
      // como offline e cai pro roll local com espelho shadow. Nada trava.
      res.status(503).json({ error: 'catalog_unavailable' });
      return;
    }
    const r = await packMod.openPack(sql, email, { opId, packId });
    if (!r.ok) {
      if (r.error === 'unknown_pack') { res.status(400).json({ error: 'pack desconhecido' }); return; }
      if (r.error === 'op_conflict') { res.status(409).json({ error: 'op_conflict' }); return; }
      if (r.error === 'pack_unavailable') { res.status(409).json({ error: 'pack_unavailable' }); return; }
      res.status(409).json({ error: r.error, credits: r.credits });
      return;
    }
    res.status(200).json({
      ok: true, replayed: r.replayed, credits: r.credits,
      packId: r.packId, cost: r.cost, seed: r.seed, cards: r.cards,
    });
    return;
  }

  // ----------------------------------------------------- mercado P2P (fase A)
  // Mesmo gate pago/HMAC das outras ações. Toda operação expira listagens
  // vencidas antes (lazy) — ver server/ultimate-market.ts.

  if (action === 'mktList') {
    const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
    const price = Number(body.price ?? 0);
    if (!cardId || cardId.length > 80) { res.status(400).json({ error: 'cardId inválido' }); return; }
    if (!Number.isSafeInteger(price) || price <= 0) { res.status(400).json({ error: 'preço inválido' }); return; }
    const r = await listCard(sql, email, { cardId, price }, await loadMktCardLookup(new Date()));
    if (!r.ok) {
      if (r.error === 'catalog_unavailable') { res.status(503).json({ error: 'catalog_unavailable' }); return; }
      if (r.error === 'invalid_price') { res.status(400).json({ error: 'preço fora da faixa', min: r.min, max: r.max }); return; }
      if (r.error === 'special_not_listable') { res.status(400).json({ error: 'cartas especiais não são listáveis' }); return; }
      if (r.error === 'listing_cap') { res.status(409).json({ error: 'limite de listagens ativas', cap: r.cap }); return; }
      res.status(r.error === 'not_owner' ? 403 : 400).json({ error: r.error });
      return;
    }
    res.status(200).json({ ok: true, listingId: r.listingId, expiresAt: r.expiresAt, price: r.price });
    return;
  }

  if (action === 'mktBuy') {
    const listingId = Number(body.listingId ?? 0);
    const r = await buyListing(sql, email, { listingId });
    if (!r.ok) {
      if (r.error === 'not_found') { res.status(404).json({ error: 'listagem não encontrada' }); return; }
      if (r.error === 'insufficient_credits') { res.status(409).json({ error: r.error, credits: r.credits }); return; }
      res.status(409).json({ error: r.error });
      return;
    }
    res.status(200).json({
      ok: true, replayed: r.replayed, credits: r.credits,
      listingId: r.listingId, cardId: r.cardId, cardKey: r.cardKey, price: r.price,
    });
    return;
  }

  if (action === 'mktCancel') {
    const listingId = Number(body.listingId ?? 0);
    const r = await cancelListing(sql, email, { listingId });
    if (!r.ok) {
      res.status(r.error === 'not_found' ? 404 : 409).json({ error: r.error });
      return;
    }
    res.status(200).json({ ok: true, listingId: r.listingId });
    return;
  }

  if (action === 'mktBrowse') {
    const filters: MktBrowseFilters = {
      cardKey: typeof body.cardKey === 'string' ? body.cardKey : undefined,
      maxPrice: Number.isSafeInteger(Number(body.maxPrice)) ? Number(body.maxPrice) : undefined,
      sort: body.sort === 'new' ? 'new' : 'cheap',
    };
    const listings = await browseListings(sql, filters);
    // vitrine pública não vaza e-mail do vendedor — só marca as minhas.
    res.status(200).json({
      ok: true,
      listings: listings.map((l) => ({
        id: l.id, cardKey: l.cardKey, price: l.price, expiresAt: l.expiresAt, mine: l.sellerEmail === email,
      })),
    });
    return;
  }

  if (action === 'mktSales') {
    // Histórico de vendas (price discovery). Com cardKey → últimas vendas +
    // agregado daquela carta; sem cardKey → fita global "vendidas agora".
    // Mesmo rate limit padrão do mktBrowse (60/min via bucket por ação).
    const cardKey = typeof body.cardKey === 'string' ? body.cardKey.trim().slice(0, 160) : '';
    if (cardKey) {
      const s = await cardSales(sql, cardKey);
      res.status(200).json({ ok: true, cardKey, n: s.n, avgPrice: s.avgPrice, lastPrice: s.lastPrice, sales: s.sales });
      return;
    }
    const recent = await recentSales(sql);
    res.status(200).json({ ok: true, recent });
    return;
  }

  if (action === 'mktMine') {
    const listings = await myListings(sql, email);
    res.status(200).json({ ok: true, listings });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
