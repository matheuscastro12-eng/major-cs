// CRM de contas pagas (admin). Lista contas, concede/remove acesso vitalício e
// consulta o pagamento no Stripe por e-mail. Protegido pela senha de admin
// (env ADMIN_PASSWORD), mesmo padrão do api/beta.ts.
// Ações (POST body.action): list | grant | revoke | stripe.
import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync } from 'node:crypto';
import { accountReference, cleanEnv, findPaidCheckoutForEmail, normalizeEmail, stripeClient } from '../server/payments.js';

// mesmo formato "salt:hash" (scrypt) do api/account.ts, pro login validar igual.
function hashPw(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const dbUrl = cleanEnv(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }

  // auth admin (mesma senha do CRM de times)
  const adminPass = cleanEnv(process.env.ADMIN_PASSWORD);
  if (!adminPass || String(body.password ?? '').trim() !== adminPass) { res.status(401).json({ ok: false }); return; }

  const sql = neon(dbUrl);
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`ALTER TABLE rtm_accounts ADD COLUMN IF NOT EXISTS stripe_ref TEXT`,
    sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS rtm_pending_signups (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
  ]);

  const action = String(body.action ?? '');
  const email = normalizeEmail(String(body.email ?? ''));
  const emailValid = /\S+@\S+\.\S+/.test(email);

  if (action === 'list') {
    const q = String(body.query ?? '').trim().toLowerCase();
    const like = `%${q}%`;
    const accounts = q
      ? await sql`SELECT email, nick, paid, created_at, (stripe_ref IS NOT NULL) AS has_ref FROM rtm_accounts WHERE lower(email) LIKE ${like} OR lower(coalesce(nick,'')) LIKE ${like} ORDER BY paid DESC, created_at DESC LIMIT 200`
      : await sql`SELECT email, nick, paid, created_at, (stripe_ref IS NOT NULL) AS has_ref FROM rtm_accounts ORDER BY paid DESC, created_at DESC LIMIT 200`;
    // e-mails pagos que ainda não viraram conta (pagou antes de cadastrar)
    const orphanPaid = await sql`SELECT p.email, p.created_at FROM rtm_paid_emails p WHERE NOT EXISTS (SELECT 1 FROM rtm_accounts a WHERE a.email = p.email) ORDER BY p.created_at DESC LIMIT 200`;
    const counts = await sql`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE paid)::int AS paid,
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7,
        count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30,
        count(*) FILTER (WHERE paid AND created_at > now() - interval '30 days')::int AS paid30
      FROM rtm_accounts`;
    const orphanCount = await sql`SELECT count(*)::int AS n FROM rtm_paid_emails p WHERE NOT EXISTS (SELECT 1 FROM rtm_accounts a WHERE a.email = p.email)`;
    res.status(200).json({
      accounts: accounts.map((a) => ({ email: String(a.email), nick: a.nick ? String(a.nick) : null, paid: !!a.paid, created_at: a.created_at, hasRef: !!a.has_ref })),
      orphanPaid: orphanPaid.map((p) => ({ email: String(p.email), created_at: p.created_at })),
      total: counts[0]?.total ?? 0, paidTotal: counts[0]?.paid ?? 0,
      new7: counts[0]?.new7 ?? 0, new30: counts[0]?.new30 ?? 0, paid30: counts[0]?.paid30 ?? 0,
      orphanTotal: orphanCount[0]?.n ?? 0,
    });
    return;
  }

  if (action === 'grant') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    await sql.transaction([
      sql`INSERT INTO rtm_paid_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`,
      // se houver cadastro pendente, promove em conta paga
      sql`INSERT INTO rtm_accounts (email, nick, pass_hash, paid, stripe_ref)
          SELECT email, nick, pass_hash, true, ${accountReference(email)} FROM rtm_pending_signups WHERE email=${email}
          ON CONFLICT (email) DO UPDATE SET paid=true`,
      sql`UPDATE rtm_accounts SET paid=true WHERE email=${email}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
    ]);
    const hasAccount = await sql`SELECT 1 FROM rtm_accounts WHERE email=${email}`;
    res.status(200).json({ ok: true, email, applied: hasAccount.length > 0 });
    return;
  }

  if (action === 'revoke') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    await sql.transaction([
      sql`DELETE FROM rtm_paid_emails WHERE email=${email}`,
      sql`UPDATE rtm_accounts SET paid=false WHERE email=${email}`,
      sql`DELETE FROM rtm_pending_signups WHERE email=${email}`,
    ]);
    res.status(200).json({ ok: true, email });
    return;
  }

  // define/reseta a senha de um usuário (suporte: quem pagou e esqueceu a senha).
  // O admin digita a nova senha no painel; aqui ela é HASHEADA (scrypt) e gravada.
  if (action === 'setpassword') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    const newPass = String(body.newPassword ?? '');
    if (newPass.length < 6) { res.status(400).json({ error: 'senha precisa de ao menos 6 caracteres' }); return; }
    const hash = hashPw(newPass);
    const upd = await sql`UPDATE rtm_accounts SET pass_hash=${hash} WHERE email=${email} RETURNING email`;
    // se ainda for só cadastro pendente (pagou mas conta não nasceu), atualiza lá também
    await sql`UPDATE rtm_pending_signups SET pass_hash=${hash} WHERE email=${email}`;
    res.status(200).json({ ok: true, email, applied: upd.length > 0 });
    return;
  }

  // consulta o pagamento real no Stripe por e-mail
  if (action === 'stripe') {
    if (!emailValid) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    try {
      const session = await findPaidCheckoutForEmail(stripeClient(), email);
      if (!session) { res.status(200).json({ found: false }); return; }
      res.status(200).json({
        found: true,
        sessionId: session.id,
        amount: session.amount_total ?? null,
        currency: session.currency ?? null,
        created: session.created ?? null,
        paymentStatus: session.payment_status ?? null,
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'Stripe indisponível' });
    }
    return;
  }

  res.status(400).json({ error: 'ação inválida' });
}
