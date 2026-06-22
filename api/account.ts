// Contas (e-mail + senha) + entitlement da conta vitalícia R$20.
// Ações (POST body.action): signup | login | me | checkout | claim | export | delete.
// - senha: scrypt (node:crypto), guardada como "salt:hash".
// - token: HMAC-SHA256 stateless ("body.sig", body = email|exp), env APP_SECRET.
// - checkout: cria a URL do Payment Link ligada à conta autenticada.
// - claim: confirma a sessão do Stripe no retorno; o webhook é a fonte principal.
import { neon } from '@neondatabase/serverless';
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import {
  accountReference,
  checkoutBelongsToAccount,
  checkoutHasExpectedPrice,
  checkoutIsPaid,
  checkoutUrl,
  cleanEnv,
  findPaidCheckoutForEmail,
  retrieveCheckout,
  stripeClient,
} from '../server/payments.js';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const APP_SECRET = () => cleanEnv(process.env.APP_SECRET) || `fallback:${cleanEnv(process.env.DATABASE_URL) || 'dev'}`;
const TTL = 60 * 60 * 24 * 180; // 180 dias

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
function sign(email: string): string {
  const body = `${email}|${Math.floor(Date.now() / 1000) + TTL}`;
  const sig = createHmac('sha256', APP_SECRET()).update(body).digest('base64url');
  return `${Buffer.from(body).toString('base64url')}.${sig}`;
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
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  const dbUrl = cleanEnv(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl);
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS rtm_accounts_stripe_ref_idx ON rtm_accounts (stripe_ref) WHERE stripe_ref IS NOT NULL`,
    sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_payment_sessions (session_id TEXT PRIMARY KEY, email TEXT NOT NULL, stripe_event_id TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    // cadastro pendente: credenciais de quem iniciou o signup mas ainda NÃO pagou.
    // Vira conta de verdade só quando o pagamento confirma (regra: só pago tem conta).
    sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_saves (email TEXT, slot TEXT, data TEXT, updated_at BIGINT DEFAULT 0, PRIMARY KEY (email, slot))`,
    sql`CREATE TABLE IF NOT EXISTS rtm_ranking (email TEXT PRIMARY KEY, nick TEXT, mmr INT DEFAULT 1000, wins INT DEFAULT 0, losses INT DEFAULT 0, peak INT DEFAULT 1000, updated_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_season_archive (season INT, email TEXT, nick TEXT, mmr INT, division TEXT, place INT, PRIMARY KEY (season, email))`,
  ]);

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const action = String(body.action ?? '');
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? '');
  const nick = String(body.nick ?? '').trim().slice(0, 40);

  if (action === 'export' || action === 'delete') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Sessão inválida. Entre novamente na conta.' }); return; }
    const accounts = await sql`SELECT email, nick, pass_hash, paid, created_at FROM rtm_accounts WHERE email=${em}`;
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
      sql`UPDATE rtm_accounts SET paid=true, stripe_ref=${accountReference(em)} WHERE email=${em}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${em}`,
    ];
    if (sessionId) stmts.push(sql`INSERT INTO rtm_payment_sessions (session_id, email) VALUES (${sessionId}, ${em}) ON CONFLICT (session_id) DO NOTHING`);
    await sql.transaction(stmts);
  };
  const ensureReference = async (em: string): Promise<void> => {
    await sql`UPDATE rtm_accounts SET stripe_ref=${accountReference(em)} WHERE email=${em} AND stripe_ref IS DISTINCT FROM ${accountReference(em)}`;
  };
  const resolvePaid = async (em: string, knownPaid?: boolean, reconcileStripe = false): Promise<boolean> => {
    if (knownPaid) return true;
    const p = await sql`SELECT 1 FROM rtm_paid_emails WHERE email=${em}`;
    if (p.length) { await markPaid(em); return true; }
    if (reconcileStripe) {
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
    if (!/\S+@\S+\.\S+/.test(email) || password.length < 6) { res.status(400).json({ error: 'E-mail inválido ou senha com menos de 6 caracteres.' }); return; }
    const exists = await sql`SELECT 1 FROM rtm_accounts WHERE email=${email}`;
    if (exists.length) { res.status(409).json({ error: 'Já existe uma conta com esse e-mail. Faça login.' }); return; }
    // REGRA: só pago tem conta. Se o e-mail já pagou (antes de cadastrar), cria a
    // conta direto. Senão, guarda como cadastro PENDENTE e manda pro pagamento — a
    // conta só nasce quando o pagamento confirma (claim/webhook promovem o pendente).
    const passHash = hashPw(password);
    const alreadyPaid = await resolvePaid(email, false, true);
    if (alreadyPaid) {
      await sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref) VALUES (${email}, ${nick}, ${passHash}, true, ${accountReference(email)})
                ON CONFLICT (email) DO UPDATE SET nick=EXCLUDED.nick, pass_hash=EXCLUDED.pass_hash, paid=true`;
      await sql`DELETE FROM rtm_pending_signups WHERE email=${email}`;
      res.status(200).json({ token: sign(email), email, nick, paid: true });
      return;
    }
    await sql`INSERT INTO rtm_pending_signups (email, nick, pass_hash) VALUES (${email}, ${nick}, ${passHash})
              ON CONFLICT (email) DO UPDATE SET nick=EXCLUDED.nick, pass_hash=EXCLUDED.pass_hash, created_at=now()`;
    res.status(200).json({ token: sign(email), email, nick, paid: false, pending: true, url: checkoutUrl(email) });
    return;
  }

  if (action === 'login') {
    const r = await sql`SELECT nick, pass_hash, paid FROM rtm_accounts WHERE email=${email}`;
    if (!r.length || !verifyPw(password, String(r[0].pass_hash))) { res.status(401).json({ error: 'E-mail ou senha incorretos.' }); return; }
    await ensureReference(email);
    const paid = await resolvePaid(email, Boolean(r[0].paid), true);
    if (!paid) { res.status(403).json({ error: 'Esta conta ainda não foi ativada. Finalize o pagamento do save na nuvem.', url: checkoutUrl(email) }); return; }
    res.status(200).json({ token: sign(email), email, nick: r[0].nick, paid: true });
    return;
  }

  if (action === 'me') {
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
    res.status(200).json({ email: em, nick: r[0].nick, paid });
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
      res.status(200).json({ paid: true });
    } catch (error) {
      console.error('stripe_claim_failed', error instanceof Error ? error.message : error);
      res.status(502).json({ error: 'Não consegui confirmar com o Stripe agora.' });
    }
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
