// Economia server-authoritative do Ultimate Squad (fase 1 — endpoint DORMENTE).
// Carteira + coleção + ledger idempotente no Neon. O cliente ainda NÃO chama
// esta rota (o cutover vem nas fases 2/3); ela só estabelece a fundação.
// Ações (POST body.action): state | tx | packOpen. Só conta PAGA (mesmo gate
// do cloud-save). packOpen (fase 2) rola o pack NO SERVIDOR com as mesmas odds
// do engine do cliente — seed auditável no ledger, replay idempotente.
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  applyUltTransaction,
  getUltState,
  ultEconomySchemaQueries,
  validateUltTx,
  ULT_TX_MAX_OP_ID,
  ULT_TX_SERVER_ONLY_KINDS,
  type SqlTag,
} from '../server/ultimate-economy.js';
import {
  browseListings,
  buyListing,
  cancelListing,
  listCard,
  myListings,
  ultMarketSchemaQueries,
  type MktBrowseFilters,
} from '../server/ultimate-market.js';
import { openPack } from '../server/ultimate-pack.js';

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
  if (!acc[0].paid) { res.status(403).json({ error: 'unpaid', message: 'Este recurso faz parte da conta com save na nuvem.' }); return; }

  if (action === 'state') {
    const state = await getUltState(sql, email);
    res.status(200).json(state);
    return;
  }

  if (action === 'tx') {
    // validação de tamanho/forma ANTES de tocar no banco: op_id ≤ 64 chars,
    // kind na allowlist, cards ≤ 200 entradas, delta inteiro seguro.
    const parsed = validateUltTx(body.tx);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    // kinds do mercado P2P são SERVER-ONLY: aceitar 'trade'/'escrow' aqui
    // deixaria o cliente forjar créditos de venda / custódia falsa.
    if (ULT_TX_SERVER_ONLY_KINDS.includes(parsed.tx.kind)) {
      res.status(400).json({ error: 'kind reservado ao servidor' });
      return;
    }
    const result = await applyUltTransaction(sql, email, parsed.tx);
    if (!result.ok) { res.status(409).json({ error: result.error, credits: result.credits }); return; }
    res.status(200).json({ ok: true, replayed: result.replayed, credits: result.credits });
    return;
  }

  if (action === 'packOpen') {
    // op_id vem do cliente (idempotência de retry); packId só seleciona o pack
    // — custo/odds saem SEMPRE do engine no servidor, nunca do request.
    const rawOp = body.op_id ?? body.opId;
    const opId = typeof rawOp === 'string' ? rawOp.trim() : '';
    if (!opId || opId.length > ULT_TX_MAX_OP_ID) { res.status(400).json({ error: 'op_id inválido (1..64 chars)' }); return; }
    const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
    const r = await openPack(sql, email, { opId, packId });
    if (!r.ok) {
      if (r.error === 'unknown_pack') { res.status(400).json({ error: 'pack desconhecido' }); return; }
      if (r.error === 'op_conflict') { res.status(409).json({ error: 'op_conflict' }); return; }
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
    const r = await listCard(sql, email, { cardId, price });
    if (!r.ok) {
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

  if (action === 'mktMine') {
    const listings = await myListings(sql, email);
    res.status(200).json({ ok: true, listings });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
