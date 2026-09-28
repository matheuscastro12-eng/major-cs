// Contas (e-mail + senha) + entitlement da conta vitalícia R$20.
// Ações (POST body.action): signup | login | me | checkout | claim | export | delete.
// - senha: scrypt (node:crypto), guardada como "salt:hash".
// - token: HMAC-SHA256 stateless ("body.sig", body = email|exp), env APP_SECRET.
// - checkout: cria a URL do Payment Link ligada à conta autenticada.
// - claim: confirma a sessão do Stripe no retorno; o webhook é a fonte principal.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { ADMIN_SESSION_TTL_SEC, respondMissingSecret, signAccountToken, signAdminSession, verifyAccountToken } from '../server/auth.js';
import {
  accountReference,
  assignFounderNumbers,
  checkoutBase,
  checkoutBelongsToAccount,
  checkoutHasExpectedPrice,
  checkoutIsPaid,
  checkoutUrl,
  cleanEnv,
  COIN_TIERS,
  findPaidCheckoutForEmail,
  passTier,
  PASS_PRICE_CENTS,
  pixAccountPriceCents,
  retrieveCheckout,
  stripeClient,
} from '../server/payments.js';
import { claimPaidOrders } from '../server/paid-credit.js';
import { ultEconomySchemaQueries, type SqlTag } from '../server/ultimate-economy.js';
import { mailConfigured, sendMail } from '../server/mail.js';
import { findReusableCharge, rememberCharge } from '../server/order-settle.js';
import { nickProblem, nickTaken, normalizeNick } from '../server/nick.js';
import { clientIp, rateLimitHit, respondLimited, type RateRule, type RateSql } from '../server/rate-limit.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
// Edição Fundador: selo numerado vitalício pros primeiros que pagam (teto configurável).
const FOUNDER_LIMIT = Number(cleanEnv(process.env.FOUNDER_LIMIT) || '500') || 500;
let accountSchemaPromise: Promise<void> | null = null;
// [O0-46] coinsClaim/passClaim gravam no ledger do Ultimate — DDL da economia
// (idempotente) 1× por instância, só quando um claim roda.
let ultSchemaPromise: Promise<void> | null = null;
function ensureUltSchema(sql: SqlTag): Promise<void> {
  if (!ultSchemaPromise) {
    ultSchemaPromise = (async () => { for (const q of ultEconomySchemaQueries(sql)) await q; })()
      .catch((e) => { ultSchemaPromise = null; throw e; });
  }
  return ultSchemaPromise;
}
let founderAuditAt = 0;
// Cache em memória da contagem pública de Fundadores (prova social). Serve de
// rate-limit natural: por instância, no máximo 1 query/min mesmo sob rajada;
// o Cache-Control público (5 min) segura o resto na CDN/navegador.
let foundersCache: { at: number; founders: number } | null = null;
type AccountSql = NeonQueryFunction<false, false>;

async function ensureAccountSchema(sql: AccountSql): Promise<void> {
  if (!accountSchemaPromise) {
    accountSchemaPromise = sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
      sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
      sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false`,
      sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS founder_no INT`,
      // método de pagamento da conta vitalícia: 'stripe' (cartão) | 'pix' | 'admin' | null (legado). Métricas do CRM.
      sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS payment_method TEXT`,
      // cargo de admin por CONTA: acesso ao CRM vem daqui (não mais por senha/rota secreta).
      sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`,
      // [URG-3] preferência: e-mail quando um rival me passa no ranking (padrão ligado; NULL = ligado).
      sql`CREATE UNIQUE INDEX IF NOT EXISTS rtm_accounts_stripe_ref_idx ON rtm_accounts (stripe_ref) WHERE stripe_ref IS NOT NULL`,
      sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS rtm_payment_sessions (session_id TEXT PRIMARY KEY, email TEXT NOT NULL, stripe_event_id TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS rtm_saves (email TEXT, slot TEXT, data TEXT, updated_at BIGINT DEFAULT 0, PRIMARY KEY (email, slot))`,
      sql`CREATE TABLE IF NOT EXISTS rtm_ranking (email TEXT PRIMARY KEY, nick TEXT, mmr INT DEFAULT 1000, wins INT DEFAULT 0, losses INT DEFAULT 0, peak INT DEFAULT 1000, updated_at TIMESTAMPTZ DEFAULT now())`,
      sql`CREATE TABLE IF NOT EXISTS rtm_season_archive (season INT, email TEXT, nick TEXT, mmr INT, division TEXT, place INT, PRIMARY KEY (season, email))`,
      // pedidos de coins do Ultimate (Pix/Woovi): pending → paid (webhook) → claimed (client credita no save)
      sql`CREATE TABLE IF NOT EXISTS rtm_coin_orders (correlation_id TEXT PRIMARY KEY, email TEXT NOT NULL, tier TEXT NOT NULL, coins INT NOT NULL, cents INT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ)`,
      // método do pedido de coins: 'pix' (Woovi) | 'stripe' (cartão). Métricas do CRM.
      sql`ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'pix'`,
      sql`CREATE INDEX IF NOT EXISTS rtm_coin_orders_email_idx ON rtm_coin_orders (email, status)`,
      // [O0-41] cobrança do pedido pendente (QR/URL) e validade: o 2º clique no
      // passe da mesma temporada devolve a MESMA cobrança (server/order-settle.ts).
      sql`ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS pay_ref TEXT`,
      sql`ALTER TABLE rtm_coin_orders ADD COLUMN IF NOT EXISTS pay_expires_at TIMESTAMPTZ`,
      // re-emissões de coins comprados (jogador perdeu o save local): cada linha é
      // uma restauração; SUM(coins) por e-mail nunca passa do SUM dos pedidos claimed.
      sql`CREATE TABLE IF NOT EXISTS rtm_coin_restores (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL, coins INT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
      sql`CREATE INDEX IF NOT EXISTS rtm_coin_restores_email_idx ON rtm_coin_restores (email)`,
      // reset de senha: código de 6 dígitos por e-mail (hash scrypt, igual à senha),
      // 30min de validade, 5 tentativas, 1 código ativo por e-mail.
      // [O1-10] unicidade do nick sem diferenciar maiúsculas (checada no código; o
      // índice não é UNIQUE porque a base pode ter duplicatas antigas).
      sql`CREATE INDEX IF NOT EXISTS rtm_accounts_nick_lower_idx ON rtm_accounts (lower(nick))`,
      sql`CREATE TABLE IF NOT EXISTS rtm_password_resets (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, attempts INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`,
    ]).then(() => undefined).catch((error) => {
      accountSchemaPromise = null;
      throw error;
    });
  }
  await accountSchemaPromise;
}

// backfill de número de Fundador pra quem pagou e ficou sem (ex.: webhook que
// caiu no meio). Só PREENCHE — número já dado nunca muda (O0-42).
async function auditFounderNumbers(sql: AccountSql): Promise<void> {
  const now = Date.now();
  if (now - founderAuditAt < 5 * 60_000) return;
  founderAuditAt = now;
  try {
    const g = await sql`SELECT EXISTS (
        SELECT 1 FROM rtm_accounts WHERE paid AND founder_no IS NULL AND COALESCE(payment_method, '') <> 'admin'
      ) AND COALESCE((SELECT MAX(founder_no) FROM rtm_accounts), 0) < ${FOUNDER_LIMIT} AS missing`;
    if (g[0]?.missing) await assignFounderNumbers(sql, FOUNDER_LIMIT);
  } catch (error) {
    founderAuditAt = 0;
    throw error;
  }
}

function hashPw(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
function verifyPw(pw: string, stored: string): boolean {
  const [salt, h] = (stored ?? '').split(':');
  if (!salt || !h) return false;
  const calc = scryptSync(pw, salt, 64);
  const orig = Buffer.from(h, 'hex');
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}
// token de conta (HMAC com APP_SECRET, 180 dias) — implementação em server/auth.ts.
const sign = signAccountToken;
const verifyToken = verifyAccountToken;
// Tiers de coins do Ultimate: COIN_TIERS em server/payments.ts (fonte única,
// o woovi-webhook usa a mesma tabela).

// Rate limit por IP e por e-mail (O0-35/SEGU-09), no Postgres (compartilhado
// entre instâncias — ver server/rate-limit.ts). Janelas generosas pro jogador
// normal; o alvo é força bruta de senha (scrypt sem freio), credential stuffing,
// flood de cadastro e o 'me' que chamava o Stripe em toda request.
const RATE = {
  signup: { ip: [10, 3600], email: [5, 3600] },
  login: { ip: [30, 900], email: [10, 900] },
  me: { ip: [120, 60] },
  resetRequest: { ip: [10, 3600], email: [5, 3600] },
  resetConfirm: { ip: [30, 3600], email: [10, 3600] },
  setNick: { ip: [20, 3600], email: [5, 86400] },
} as const;
// reconciliação com o Stripe (list de 100 sessões com expand) no máx. 1x a cada
// 2 min por e-mail: o 'me' de um cadastro pendente não vira flood na API do Stripe.
const STRIPE_RECON_WINDOW_SEC = 120;

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  // GET público: contagem agregada de Fundadores (prova social honesta). Sem
  // auth — é um único número agregado, sem dado pessoal. Cacheável (5 min) e
  // protegido por cache em memória (60s por instância) contra rajadas.
  if (req.method === 'GET') {
    const dbUrl = cleanEnv(process.env.DATABASE_URL);
    if (!dbUrl) { res.status(500).json({ error: 'indisponível' }); return; }
    try {
      if (!foundersCache || Date.now() - foundersCache.at > 60_000) {
        const sql = neon(dbUrl);
        await ensureAccountSchema(sql);
        // números EMITIDOS (o maior founder_no): número de conta revogada fica
        // aposentado e não volta pra fila (O0-42), então "vagas" = teto − isso.
        const r = await sql`SELECT COALESCE(MAX(founder_no), 0)::int AS founders FROM rtm_accounts`;
        foundersCache = { at: Date.now(), founders: Number(r[0]?.founders ?? 0) };
      }
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
      res.status(200).json({ founders: foundersCache.founders, limit: FOUNDER_LIMIT });
    } catch { res.status(500).json({ error: 'indisponível' }); }
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  // falha fechada: sem APP_SECRET nenhum token é assinado nem aceito (SEGU-10).
  if (respondMissingSecret(res)) return;
  const dbUrl = cleanEnv(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl);
  await ensureAccountSchema(sql);

  // Backfill de fundador: dá número a quem pagou e ficou sem (webhook que caiu no
  // meio), na ordem do pagamento, sem mexer em número já dado. Guardado por um
  // SELECT barato (1x a cada 5 min por instância) — sem pendência, fica quieto.
  await auditFounderNumbers(sql);

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const action = String(body.action ?? '');
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? '');
  // [O1-10] nick da conta normalizado (NFKC, sem invisíveis); validado no signup/setNick.
  const nick = normalizeNick(body.nick);
  const ip = clientIp(req.headers);
  const rsql = sql as unknown as RateSql;
  // 429 quando QUALQUER regra (IP ou e-mail) da ação estourou. Devolve true se respondeu.
  const limited = async (name: keyof typeof RATE, em = email): Promise<boolean> => {
    const cfg = RATE[name] as { ip: readonly [number, number]; email?: readonly [number, number] };
    const rules: RateRule[] = [{ key: `${name}:ip:${ip}`, limit: cfg.ip[0], windowSec: cfg.ip[1] }];
    if (cfg.email && em) rules.push({ key: `${name}:email:${em}`, limit: cfg.email[0], windowSec: cfg.email[1] });
    return respondLimited(res, await rateLimitHit(rsql, rules));
  };

  if (action === 'export' || action === 'delete') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Sessão inválida. Entre novamente na conta.' }); return; }
    const accounts = await sql`SELECT email, nick, pass_hash, paid, is_founder, founder_no, created_at FROM rtm_accounts WHERE email=${em}`;
    if (!accounts.length) { res.status(404).json({ error: 'Conta não encontrada.' }); return; }

    if (action === 'export') {
      const [saves, ranking, seasons, payments] = await Promise.all([
        sql`SELECT slot, data, updated_at FROM rtm_saves WHERE email=${em} ORDER BY slot`,
        sql`SELECT nick, mmr, wins, losses, peak, updated_at FROM rtm_ranking WHERE email=${em}`,
        sql`SELECT season, nick, mmr, division, place FROM rtm_season_archive WHERE email=${em} ORDER BY season DESC`,
        sql`SELECT session_id, created_at FROM rtm_payment_sessions WHERE email=${em} ORDER BY created_at DESC`,
      ]);
      res.status(200).json({
        exportedAt: new Date().toISOString(),
        account: {
          email: String(accounts[0].email),
          nick: String(accounts[0].nick ?? ''),
          paid: Boolean(accounts[0].paid),
          founder: Boolean(accounts[0].is_founder),
          founderNo: accounts[0].founder_no != null ? Number(accounts[0].founder_no) : null,
          createdAt: accounts[0].created_at,
        },
        cloudSaves: saves.map((row) => ({ slot: row.slot, data: row.data, updatedAt: Number(row.updated_at ?? 0) })),
        ranking: ranking[0] ?? null,
        seasonHistory: seasons,
        paymentReferences: payments,
        note: 'O hash da senha não integra a exportação por segurança. Dados mantidos diretamente pelo Stripe devem ser solicitados ao processador.',
      });
      return;
    }

    if (!password || !verifyPw(password, String(accounts[0].pass_hash))) {
      res.status(403).json({ error: 'Senha incorreta. A conta não foi excluída.' });
      return;
    }
    await sql.transaction([
      sql`DELETE FROM rtm_saves WHERE email=${em}`,
      sql`DELETE FROM rtm_ranking WHERE email=${em}`,
      sql`DELETE FROM rtm_season_archive WHERE email=${em}`,
      sql`DELETE FROM rtm_payment_sessions WHERE email=${em}`,
      sql`DELETE FROM rtm_paid_emails WHERE email=${em}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${em}`,
      sql`DELETE FROM rtm_accounts WHERE email=${em}`,
    ]);
    res.status(200).json({ deleted: true });
    return;
  }

  // verdadeiro se a conta já está paga, OU se há um e-mail pago pendente (pago
  // antes de criar a conta) — nesse caso, casa e marca a conta.
  // confirma o pagamento de um e-mail: marca como pago, PROMOVE o cadastro pendente
  // em conta paga (se houver) e marca a conta existente como paga.
  const markPaid = async (em: string, sessionId?: string): Promise<void> => {
    const stmts = [
      sql`INSERT INTO rtm_paid_emails (email) VALUES (${em}) ON CONFLICT DO NOTHING`,
      sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref)
          SELECT email, nick, pass_hash, true, ${accountReference(em)} FROM rtm_pending_signups WHERE email=${em}
          ON CONFLICT (email) DO UPDATE SET paid=true`,
      sql`UPDATE rtm_accounts SET paid=true, stripe_ref=${accountReference(em)}, payment_method=COALESCE(payment_method, 'stripe') WHERE email=${em}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${em}`,
    ];
    if (sessionId) stmts.push(sql`INSERT INTO rtm_payment_sessions (session_id, email) VALUES (${sessionId}, ${em}) ON CONFLICT (session_id) DO NOTHING`);
    await sql.transaction(stmts);
    await claimFounder();
  };
  // Edição Fundador: dá número a quem pagou e ainda não tem, na ordem do
  // pagamento. Número já dado nunca muda (O0-42); idempotente.
  const claimFounder = async (): Promise<void> => {
    await assignFounderNumbers(sql, FOUNDER_LIMIT);
    founderAuditAt = Date.now();
  };
  const founderOf = async (em: string): Promise<{ founder: boolean; founderNo: number | null; admin: boolean }> => {
    const r = await sql`SELECT is_founder, founder_no, is_admin FROM rtm_accounts WHERE email=${em}`;
    return { founder: Boolean(r[0]?.is_founder), founderNo: r[0]?.founder_no != null ? Number(r[0].founder_no) : null, admin: Boolean(r[0]?.is_admin) };
  };
  const ensureReference = async (em: string): Promise<void> => {
    await sql`UPDATE rtm_accounts SET stripe_ref=${accountReference(em)} WHERE email=${em} AND stripe_ref IS DISTINCT FROM ${accountReference(em)}`;
  };
  const resolvePaid = async (em: string, knownPaid?: boolean, reconcileStripe = false): Promise<boolean> => {
    if (knownPaid) return true;
    const p = await sql`SELECT 1 FROM rtm_paid_emails WHERE email=${em}`;
    if (p.length) { await markPaid(em); return true; }
    if (reconcileStripe && !(await rateLimitHit(rsql, [{ key: `stripe-recon:${em}`, limit: 1, windowSec: STRIPE_RECON_WINDOW_SEC }])).limited) {
      try {
        const session = await findPaidCheckoutForEmail(stripeClient(), em);
        if (session) { await markPaid(em, session.id); return true; }
      } catch (error) {
        console.error('stripe_reconciliation_failed', error instanceof Error ? error.message : error);
      }
    }
    return false;
  };

  if (action === 'signup') {
    if (await limited('signup')) return;
    if (!/\S+@\S+\.\S+/.test(email) || password.length < 6) { res.status(400).json({ error: 'E-mail inválido ou senha com menos de 6 caracteres.' }); return; }
    const exists = await sql`SELECT 1 FROM rtm_accounts WHERE email=${email}`;
    if (exists.length) { res.status(409).json({ error: 'Já existe uma conta com esse e-mail. Faça login.' }); return; }
    // [O1-10] nick opcional no cadastro, mas se vier: regras + unicidade.
    if (nick) {
      const problem = nickProblem(nick);
      if (problem) { res.status(400).json({ error: problem, field: 'nick' }); return; }
      if (await nickTaken(sql, nick, email)) { res.status(409).json({ error: 'Esse nick já está em uso. Escolha outro.', field: 'nick' }); return; }
    }
    // REGRA: só pago tem conta. Se o e-mail já pagou (antes de cadastrar), cria a
    // conta direto. Senão, guarda como cadastro PENDENTE e manda pro pagamento — a
    // conta só nasce quando o pagamento confirma (claim/webhook promovem o pendente).
    const passHash = hashPw(password);
    const alreadyPaid = await resolvePaid(email, false, true);
    if (alreadyPaid) {
      await sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref) VALUES (${email}, ${nick}, ${passHash}, true, ${accountReference(email)})
                ON CONFLICT (email) DO UPDATE SET nick=EXCLUDED.nick, pass_hash=EXCLUDED.pass_hash, paid=true`;
      await sql`DELETE FROM rtm_pending_signups WHERE email=${email}`;
      await claimFounder();
      res.status(200).json({ token: sign(email), email, nick, paid: true, ...(await founderOf(email)) });
      return;
    }
    await sql`INSERT INTO rtm_pending_signups (email, nick, pass_hash) VALUES (${email}, ${nick}, ${passHash})
              ON CONFLICT (email) DO UPDATE SET nick=EXCLUDED.nick, pass_hash=EXCLUDED.pass_hash, created_at=now()`;
    res.status(200).json({ token: sign(email), email, nick, paid: false, pending: true, founder: false, founderNo: null, admin: false, url: checkoutUrl(email) });
    return;
  }

  if (action === 'login') {
    if (await limited('login')) return;
    const r = await sql`SELECT nick, pass_hash, paid FROM rtm_accounts WHERE email=${email}`;
    if (!r.length || !verifyPw(password, String(r[0].pass_hash))) { res.status(401).json({ error: 'E-mail ou senha incorretos.' }); return; }
    await ensureReference(email);
    const paid = await resolvePaid(email, Boolean(r[0].paid), true);
    if (!paid) { res.status(403).json({ error: 'Esta conta ainda não foi ativada. Finalize o pagamento do save na nuvem.', url: checkoutUrl(email) }); return; }
    res.status(200).json({ token: sign(email), email, nick: r[0].nick, paid: true, ...(await founderOf(email)) });
    return;
  }

  // ── Reset de senha ─────────────────────────────────────────────────────────
  // resetRequest: gera código de 6 dígitos e manda por e-mail. Dois provedores
  // Provedor (Resend ou Gmail SMTP) escolhido em server/mail.ts — o mesmo helper
  // manda o aviso de rival (api/ranking.ts). Resposta SEMPRE {ok:true} quando o
  // envio está configurado — não vaza se o e-mail tem conta (anti-enumeração).
  // Nenhum provedor configurado: 503 honesto.
  if (action === 'resetRequest') {
    if (await limited('resetRequest')) return;
    if (!/\S+@\S+\.\S+/.test(email)) { res.status(400).json({ error: 'E-mail inválido.' }); return; }
    if (!mailConfigured()) {
      res.status(503).json({ error: 'Recuperação de senha temporariamente indisponível. Fale com a gente no suporte.' });
      return;
    }
    const sendResetEmail = (code: string): Promise<boolean> => sendMail({
      to: email,
      subject: `Seu código pra trocar a senha: ${code}`,
      text: `Alguém (esperamos que você) pediu pra trocar a senha da sua conta no Road to Major.\n\nSeu código: ${code}\n\nEle vale por 30 minutos. Se não foi você, ignore este e-mail — sua senha continua a mesma.`,
    });
    // só gera/envia se o e-mail EXISTE (conta ativa ou cadastro pendente) — mas a
    // resposta é idêntica nos dois casos.
    const known = await sql`SELECT 1 FROM rtm_accounts WHERE email=${email} UNION SELECT 1 FROM rtm_pending_signups WHERE email=${email}`;
    if (known.length) {
      // throttle: 1 código por minuto (reenvio silencioso — resposta igual).
      const recent = await sql`SELECT 1 FROM rtm_password_resets WHERE email=${email} AND created_at > now() - interval '60 seconds'`;
      if (!recent.length) {
        const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
        await sql`INSERT INTO rtm_password_resets (email, code_hash, expires_at, attempts, created_at)
                  VALUES (${email}, ${hashPw(code)}, now() + interval '30 minutes', 0, now())
                  ON CONFLICT (email) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0, created_at=now()`;
        // envio falhou: derruba o código (não deixa um reset "fantasma" ativo).
        if (!(await sendResetEmail(code))) {
          await sql`DELETE FROM rtm_password_resets WHERE email=${email}`;
          res.status(502).json({ error: 'Não conseguimos enviar o e-mail agora. Tente de novo em instantes.' });
          return;
        }
      }
    }
    res.status(200).json({ ok: true });
    return;
  }

  // resetConfirm: valida o código e troca a senha (conta ativa E/OU cadastro
  // pendente). Código é de uso único; 5 erros queimam o código.
  if (action === 'resetConfirm') {
    if (await limited('resetConfirm')) return;
    const code = String(body.code ?? '').trim();
    if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: 'Código inválido — são 6 dígitos.' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'A nova senha precisa de pelo menos 6 caracteres.' }); return; }
    const r = await sql`SELECT code_hash, expires_at, attempts FROM rtm_password_resets WHERE email=${email}`;
    if (!r.length || new Date(String(r[0].expires_at)).getTime() < Date.now()) {
      await sql`DELETE FROM rtm_password_resets WHERE email=${email}`;
      res.status(410).json({ error: 'Código expirado ou inexistente. Peça um novo.' });
      return;
    }
    if (Number(r[0].attempts) >= 5) {
      await sql`DELETE FROM rtm_password_resets WHERE email=${email}`;
      res.status(429).json({ error: 'Muitas tentativas. Peça um código novo.' });
      return;
    }
    if (!verifyPw(code, String(r[0].code_hash))) {
      await sql`UPDATE rtm_password_resets SET attempts = attempts + 1 WHERE email=${email}`;
      res.status(401).json({ error: 'Código incorreto.' });
      return;
    }
    const newHash = hashPw(password);
    await sql`UPDATE rtm_accounts SET pass_hash=${newHash} WHERE email=${email}`;
    await sql`UPDATE rtm_pending_signups SET pass_hash=${newHash} WHERE email=${email}`;
    await sql`DELETE FROM rtm_password_resets WHERE email=${email}`;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'me') {
    if (await limited('me')) return;
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Sessão inválida.' }); return; }
    let r = await sql`SELECT nick, paid FROM rtm_accounts WHERE email=${em}`;
    let paid = r.length ? Boolean(r[0].paid) : false;
    if (!paid) {
      // pode ser um cadastro pendente que acabou de pagar — resolvePaid promove
      paid = await resolvePaid(em, false, true);
      r = await sql`SELECT nick, paid FROM rtm_accounts WHERE email=${em}`;
    }
    if (!r.length) { res.status(401).json({ error: 'Conta não encontrada.' }); return; }
    await ensureReference(em);
    res.status(200).json({ email: em, nick: r[0].nick, paid, ...(await founderOf(em)) });
    return;
  }

  // setNick: troca o nick da CONTA (o que aparece no ranking, na Série do Dia,
  // no Draft e no aviso de rival — O1-10). Mesmas regras do cadastro; no máx.
  // 5 trocas por dia por conta.
  if (action === 'setNick') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Sessão inválida.' }); return; }
    if (await limited('setNick', em)) return;
    const problem = nickProblem(nick);
    if (problem) { res.status(400).json({ error: problem, field: 'nick' }); return; }
    if (await nickTaken(sql, nick, em)) { res.status(409).json({ error: 'Esse nick já está em uso. Escolha outro.', field: 'nick' }); return; }
    const upd = await sql`UPDATE rtm_accounts SET nick=${nick} WHERE email=${em} RETURNING email`;
    if (!upd.length) await sql`UPDATE rtm_pending_signups SET nick=${nick} WHERE email=${em}`;
    res.status(200).json({ ok: true, nick });
    return;
  }

  // adminSession: conta com is_admin troca o token de conta por uma SESSÃO de
  // admin curta (12h, server/auth.ts), que os endpoints de admin aceitam no
  // lugar da senha. Substitui a antiga action adminKey, que devolvia a própria
  // ADMIN_PASSWORD ao browser (O0-16/SEGU-07): vazou o localStorage, vazou a
  // chave mestra. Agora vaza, no máximo, uma sessão que expira e que morre na
  // hora se a conta perder o is_admin (conferido no banco a cada request).
  // Não-admin recebe 403 (o painel nem aparece pra ele no cliente).
  if (action === 'adminSession') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Sessão inválida.' }); return; }
    const r = await sql`SELECT is_admin FROM rtm_accounts WHERE email=${em}`;
    if (!r.length || !r[0].is_admin) { res.status(403).json({ error: 'not admin' }); return; }
    res.status(200).json({ session: signAdminSession(em), expiresIn: ADMIN_SESSION_TTL_SEC });
    return;
  }

  if (action === 'checkout') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login antes de pagar.' }); return; }
    await ensureReference(em); // 0 linhas se ainda não há conta (cadastro pendente)
    if (await resolvePaid(em, false, true)) {
      res.status(200).json({ paid: true });
      return;
    }
    res.status(200).json({ paid: false, url: checkoutUrl(em) });
    return;
  }

  // pix: gera uma cobrança Pix no Woovi pra esta conta (correlationID = email).
  // O webhook (/api/woovi-webhook) marca pago quando o Pix cai. Retorna o QR e
  // o BR Code (copia-e-cola) pra mostrar inline no jogo. Requer env OPENPIX_APP_ID.
  if (action === 'pix') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login antes de pagar.' }); return; }
    if (await resolvePaid(em, false, true)) { res.status(200).json({ paid: true }); return; }
    const appId = cleanEnv(process.env.OPENPIX_APP_ID);
    if (!appId) { res.status(500).json({ error: 'Pix indisponível: OPENPIX_APP_ID não configurada.' }); return; }
    // valor em CENTAVOS (R$20 = 2000). Editável via PIX_PRICE_CENTS (mesma régua do Stripe).
    const value = pixAccountPriceCents();
    const nick = String(((await sql`SELECT nick FROM rtm_accounts WHERE email=${em}`)[0]?.nick) ?? '').slice(0, 80) || em;
    try {
      const r = await fetch('https://api.openpix.com.br/api/v1/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: appId },
        body: JSON.stringify({
          correlationID: `rtm-${em}-${Math.floor(Date.now() / 1000)}`,
          value,
          comment: 'Road to Major · conta vitalícia',
          customer: { name: nick, email: em },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) { res.status(502).json({ error: 'Falha ao gerar Pix. Tente de novo.' }); return; }
      const j = (await r.json()) as { charge?: Record<string, unknown> };
      const c = j?.charge ?? {};
      res.status(200).json({
        paid: false,
        qrCodeImage: c.qrCodeImage ?? null,
        brCode: c.brCode ?? null,
        paymentLinkUrl: c.paymentLinkUrl ?? null,
        expiresIn: c.expiresIn ?? null,
      });
    } catch { res.status(502).json({ error: 'Falha ao falar com o Woovi.' }); }
    return;
  }

  // coinsPix: gera cobrança Pix pra um pacote de coins do Ultimate. O prefixo
  // "ultcoins:" no correlationID separa do pagamento de conta no webhook —
  // coins pagos NÃO ativam conta vitalícia. Fluxo: pending → paid (webhook)
  // → claimed (coinsClaim credita no save do cliente).
  if (action === 'coinsPix') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login antes de comprar coins.' }); return; }
    const tier = String(body.tier ?? '');
    const pack = COIN_TIERS[tier];
    if (!pack) { res.status(400).json({ error: 'pacote inválido' }); return; }
    const appId = cleanEnv(process.env.OPENPIX_APP_ID);
    if (!appId) { res.status(500).json({ error: 'Pix indisponível: OPENPIX_APP_ID não configurada.' }); return; }
    const corr = `ultcoins:${tier}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const nick = String(((await sql`SELECT nick FROM rtm_accounts WHERE email=${em}`)[0]?.nick) ?? '').slice(0, 80) || em;
    // pedido ANTES da cobrança: pending órfão (se o Woovi falhar) é inofensivo;
    // o inverso — cobrança paga sem pedido — perderia os coins do jogador.
    await sql`INSERT INTO rtm_coin_orders (correlation_id, email, tier, coins, cents) VALUES (${corr}, ${em}, ${tier}, ${pack.coins}, ${pack.cents}) ON CONFLICT (correlation_id) DO NOTHING`;
    try {
      const r = await fetch('https://api.openpix.com.br/api/v1/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: appId },
        body: JSON.stringify({
          correlationID: corr,
          value: pack.cents,
          comment: `Ultimate · ${pack.label} (${pack.coins.toLocaleString('pt-BR')} coins)`,
          customer: { name: nick, email: em },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) {
        await sql`DELETE FROM rtm_coin_orders WHERE correlation_id=${corr} AND status='pending'`;
        res.status(502).json({ error: 'Falha ao gerar Pix. Tente de novo.' });
        return;
      }
      const j = (await r.json()) as { charge?: Record<string, unknown> };
      const c = j?.charge ?? {};
      res.status(200).json({
        correlationID: corr,
        coins: pack.coins,
        qrCodeImage: c.qrCodeImage ?? null,
        brCode: c.brCode ?? null,
        paymentLinkUrl: c.paymentLinkUrl ?? null,
        expiresIn: c.expiresIn ?? null,
      });
    } catch { res.status(502).json({ error: 'Falha ao falar com o Woovi.' }); }
    return;
  }

  // coinsCheckout: paga um pacote de coins com CARTÃO (Stripe) — pra quem não tem
  // Pix (gringos). Cria uma Checkout Session dinâmica (preço = cents do tier, BRL)
  // com metadata do pedido. O pedido nasce pending (method='stripe') e o
  // stripe-webhook o marca paid quando o cartão aprova. O correlationID reusa o
  // prefixo "ultcoins:" (o webhook filtra por ele → coins NÃO ativam conta).
  if (action === 'coinsCheckout') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login antes de comprar coins.' }); return; }
    const tier = String(body.tier ?? '');
    const pack = COIN_TIERS[tier];
    if (!pack) { res.status(400).json({ error: 'pacote inválido' }); return; }
    const corr = `ultcoins:${tier}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const base = checkoutBase(body.origin); // [O0-40] allowlist; origin desconhecido cai no domínio oficial
    // pedido ANTES da sessão (mesma razão do Pix): pending órfão é inofensivo; o
    // inverso — cartão aprovado sem pedido — perderia os coins do jogador.
    await sql`INSERT INTO rtm_coin_orders (correlation_id, email, tier, coins, cents, method) VALUES (${corr}, ${em}, ${tier}, ${pack.coins}, ${pack.cents}, 'stripe') ON CONFLICT (correlation_id) DO NOTHING`;
    try {
      const session = await stripeClient().checkout.sessions.create({
        mode: 'payment',
        customer_email: em,
        client_reference_id: corr,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: pack.cents,
            product_data: { name: `Ultimate · ${pack.label}`, description: `${pack.coins.toLocaleString('pt-BR')} coins` },
          },
        }],
        metadata: { kind: 'coins', correlationID: corr, tier, coins: String(pack.coins), email: em },
        success_url: `${base}/ultimate?coins=ok`,
        cancel_url: `${base}/ultimate?coins=cancel`,
      });
      if (!session.url) {
        await sql`DELETE FROM rtm_coin_orders WHERE correlation_id=${corr} AND status='pending'`;
        res.status(502).json({ error: 'Falha ao criar checkout. Tente de novo.' });
        return;
      }
      res.status(200).json({ url: session.url, correlationID: corr, coins: pack.coins });
    } catch (error) {
      await sql`DELETE FROM rtm_coin_orders WHERE correlation_id=${corr} AND status='pending'`;
      console.error('coins_checkout_failed', error instanceof Error ? error.message : error);
      res.status(502).json({ error: 'Não consegui falar com o Stripe agora.' });
    }
    return;
  }

  // coinsClaim: coleta os pedidos pagos e ainda não creditados desta conta.
  // [O0-46] O SERVIDOR credita cada pedido no ledger do Ultimate (opId
  // `coins:<correlationID>`, idempotente) ANTES de marcar 'claimed' — ver
  // server/paid-credit.ts. O cliente não soma nada sozinho: absorve os
  // vouchers que o save ainda não viu. Pedidos de PASSE (tier "pass-s<N>")
  // ficam de fora — quem os coleta é o passClaim.
  if (action === 'coinsClaim') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login.' }); return; }
    const esql = sql as unknown as SqlTag;
    await ensureUltSchema(esql);
    const r = await claimPaidOrders(esql, em, 'coins');
    const coins = r.claimed.reduce((acc, o) => acc + o.coins, 0);
    // [U02] orders: o cliente deduplica o evento purchase_fulfilled por pedido (nunca por UI)
    res.status(200).json({ coins, orders: r.claimed.map((o) => ({ orderId: o.orderId, coins: o.coins })), vouchers: r.vouchers, credits: r.credits });
    return;
  }

  // coinsSummary: quanto esta conta já comprou de coins (pedidos claimed).
  // [O0-04] restorable é sempre 0: o "Recuperar compras" foi desligado — um
  // cliente antigo em cache que ainda lê este campo não mostra mais o card.
  if (action === 'coinsSummary') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login.' }); return; }
    const orders = await sql`SELECT coins FROM rtm_coin_orders WHERE email=${em} AND status='claimed'`;
    const purchased = orders.reduce((acc, r) => acc + (Number(r.coins) || 0), 0);
    res.status(200).json({ purchased, restorable: 0 });
    return;
  }

  // coinsRestore: DESLIGADO [O0-04]. Re-emitia SUM(claimed) − SUM(restores)
  // sem olhar o save — cada compra rendia o dobro com um clique (ECON-03).
  // Com o O0-46 a compra já está no ledger do servidor e o cliente absorve os
  // vouchers que faltarem no save; não há mais o que "recuperar" à mão.
  if (action === 'coinsRestore') {
    res.status(410).json({ error: 'Recuperar compras foi desativado: suas compras agora ficam guardadas no servidor.', coins: 0 });
    return;
  }

  // ── Passe Premium do Ultimate (R$ 30,00 · dinheiro real) ──────────────────
  // Mesmo funil dos coins: pedido em rtm_coin_orders com tier "pass-s<N>"
  // (coins=0, cents=3000, N = temporada comprada), correlationID "ultcoins:..."
  // (roteia os webhooks pro caminho de pedidos), pending → paid (webhook) →
  // claimed (passClaim — o CLIENTE liga o premium no save ao coletar).

  // passPix: gera a cobrança Pix (Woovi) do Passe Premium da temporada corrente.
  if (action === 'passPix') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login antes de comprar o passe.' }); return; }
    const season = Math.floor(Number(body.season ?? 0));
    if (!Number.isInteger(season) || season < 1 || season > 9999) { res.status(400).json({ error: 'temporada inválida' }); return; }
    const tier = passTier(season);
    // dupla compra: já existe pedido pago/claimado desta temporada → não cobra 2×.
    // 'paid' ainda não claimado devolve already:true — o cliente coleta e desbloqueia.
    const dup = await sql`SELECT status FROM rtm_coin_orders WHERE email=${em} AND tier=${tier} AND status IN ('paid','claimed') LIMIT 1`;
    if (dup.length) {
      if (String(dup[0].status) === 'paid') { res.status(200).json({ already: true }); return; }
      res.status(409).json({ error: 'Você já comprou o Passe Premium desta temporada.' });
      return;
    }
    // [O0-41] Pix desta temporada ainda aberto → a MESMA cobrança, não uma 2ª.
    const open = await findReusableCharge(sql, em, tier, 'pix');
    if (open) {
      res.status(200).json({ correlationID: open.correlationID, season, qrCodeImage: open.ref.qrCodeImage ?? null, brCode: open.ref.brCode ?? null, paymentLinkUrl: open.ref.paymentLinkUrl ?? null, expiresIn: open.expiresIn, reused: true });
      return;
    }
    const appId = cleanEnv(process.env.OPENPIX_APP_ID);
    if (!appId) { res.status(500).json({ error: 'Pix indisponível: OPENPIX_APP_ID não configurada.' }); return; }
    const corr = `ultcoins:${tier}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const nick = String(((await sql`SELECT nick FROM rtm_accounts WHERE email=${em}`)[0]?.nick) ?? '').slice(0, 80) || em;
    // pedido ANTES da cobrança (mesma razão dos coins): pending órfão é inofensivo;
    // cobrança paga sem pedido perderia o passe do jogador.
    await sql`INSERT INTO rtm_coin_orders (correlation_id, email, tier, coins, cents) VALUES (${corr}, ${em}, ${tier}, 0, ${PASS_PRICE_CENTS}) ON CONFLICT (correlation_id) DO NOTHING`;
    try {
      const r = await fetch('https://api.openpix.com.br/api/v1/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: appId },
        body: JSON.stringify({
          correlationID: corr,
          value: PASS_PRICE_CENTS,
          comment: `Ultimate · Passe Premium (Season ${season})`,
          customer: { name: nick, email: em },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) {
        await sql`DELETE FROM rtm_coin_orders WHERE correlation_id=${corr} AND status='pending'`;
        res.status(502).json({ error: 'Falha ao gerar Pix. Tente de novo.' });
        return;
      }
      const j = (await r.json()) as { charge?: Record<string, unknown> };
      const c = j?.charge ?? {};
      await rememberCharge(sql, corr, { qrCodeImage: c.qrCodeImage ?? null, brCode: c.brCode ?? null, paymentLinkUrl: c.paymentLinkUrl ?? null }, Number(c.expiresIn));
      res.status(200).json({
        correlationID: corr,
        season,
        qrCodeImage: c.qrCodeImage ?? null,
        brCode: c.brCode ?? null,
        paymentLinkUrl: c.paymentLinkUrl ?? null,
        expiresIn: c.expiresIn ?? null,
      });
    } catch { res.status(502).json({ error: 'Falha ao falar com o Woovi.' }); }
    return;
  }

  // passCheckout: paga o Passe Premium com CARTÃO (Stripe) — Checkout Session
  // dinâmica em BRL (sem price id no dashboard), espelho do coinsCheckout.
  if (action === 'passCheckout') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login antes de comprar o passe.' }); return; }
    const season = Math.floor(Number(body.season ?? 0));
    if (!Number.isInteger(season) || season < 1 || season > 9999) { res.status(400).json({ error: 'temporada inválida' }); return; }
    const tier = passTier(season);
    const dup = await sql`SELECT status FROM rtm_coin_orders WHERE email=${em} AND tier=${tier} AND status IN ('paid','claimed') LIMIT 1`;
    if (dup.length) {
      if (String(dup[0].status) === 'paid') { res.status(200).json({ already: true }); return; }
      res.status(409).json({ error: 'Você já comprou o Passe Premium desta temporada.' });
      return;
    }
    // [O0-41] checkout de cartão desta temporada ainda aberto → a MESMA sessão.
    const open = await findReusableCharge(sql, em, tier, 'stripe');
    if (open && typeof open.ref.url === 'string') { res.status(200).json({ url: open.ref.url, correlationID: open.correlationID, season, reused: true }); return; }
    const corr = `ultcoins:${tier}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const base = checkoutBase(body.origin); // [O0-40] allowlist; origin desconhecido cai no domínio oficial
    await sql`INSERT INTO rtm_coin_orders (correlation_id, email, tier, coins, cents, method) VALUES (${corr}, ${em}, ${tier}, 0, ${PASS_PRICE_CENTS}, 'stripe') ON CONFLICT (correlation_id) DO NOTHING`;
    try {
      const session = await stripeClient().checkout.sessions.create({
        mode: 'payment',
        customer_email: em,
        client_reference_id: corr,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: PASS_PRICE_CENTS,
            product_data: { name: 'Ultimate · Passe Premium', description: `Season ${season} — trilha premium do Passe de Temporada` },
          },
        }],
        metadata: { kind: 'pass', correlationID: corr, tier, season: String(season), email: em },
        success_url: `${base}/ultimate?pass=ok`,
        cancel_url: `${base}/ultimate?pass=cancel`,
      });
      if (!session.url) {
        await sql`DELETE FROM rtm_coin_orders WHERE correlation_id=${corr} AND status='pending'`;
        res.status(502).json({ error: 'Falha ao criar checkout. Tente de novo.' });
        return;
      }
      // a sessão da Stripe expira em expires_at (24h por padrão)
      await rememberCharge(sql, corr, { url: session.url }, session.expires_at ? session.expires_at - Math.floor(Date.now() / 1000) : NaN);
      res.status(200).json({ url: session.url, correlationID: corr, season });
    } catch (error) {
      await sql`DELETE FROM rtm_coin_orders WHERE correlation_id=${corr} AND status='pending'`;
      console.error('pass_checkout_failed', error instanceof Error ? error.message : error);
      res.status(502).json({ error: 'Não consegui falar com o Stripe agora.' });
    }
    return;
  }

  // passClaim: coleta os pedidos de PASSE pagos e ainda não claimados.
  // [O0-46] credita no ledger (opId `pass:<season>`, delta 0 — registra o
  // desbloqueio) antes de marcar 'claimed'; devolve os pedidos (orderId +
  // temporada) e os vouchers pro cliente ligar o premium no save.
  if (action === 'passClaim') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Faça login.' }); return; }
    const esql = sql as unknown as SqlTag;
    await ensureUltSchema(esql);
    const r = await claimPaidOrders(esql, em, 'pass');
    const orders = r.claimed
      .map((o) => ({ orderId: o.orderId, season: o.season ?? 0 }))
      .filter((o) => o.season > 0);
    res.status(200).json({ orders, vouchers: r.vouchers, credits: r.credits });
    return;
  }

  // claim: confirma o pagamento pela sessão do Stripe e marca a conta como paga.
  if (action === 'claim') {
    const em = verifyToken(String(body.token ?? ''));
    const cs = String(body.cs ?? '').trim();
    if (!em) { res.status(401).json({ error: 'Faça login antes de confirmar o pagamento.' }); return; }
    if (!cs) { res.status(400).json({ error: 'sessão ausente' }); return; }
    try {
      const session = await retrieveCheckout(stripeClient(), cs);
      if (!checkoutIsPaid(session)) {
        res.status(200).json({ paid: false });
        return;
      }
      if (!checkoutHasExpectedPrice(session)) {
        res.status(400).json({ error: 'Esta sessão não corresponde à conta com save na nuvem.' });
        return;
      }
      if (!checkoutBelongsToAccount(session, em)) {
        res.status(403).json({ error: 'O pagamento pertence a outra conta.' });
        return;
      }
      await markPaid(em, session.id);
      res.status(200).json({ paid: true, ...(await founderOf(em)) });
    } catch (error) {
      console.error('stripe_claim_failed', error instanceof Error ? error.message : error);
      res.status(502).json({ error: 'Não consegui confirmar com o Stripe agora.' });
    }
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
