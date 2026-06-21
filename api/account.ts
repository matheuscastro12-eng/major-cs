// Contas (e-mail + senha) + entitlement da conta vitalícia R$20.
// Ações (POST body.action): signup | login | me | claim.
// - senha: scrypt (node:crypto), guardada como "salt:hash".
// - token: HMAC-SHA256 stateless ("body.sig", body = email|exp), env APP_SECRET.
// - claim: confere a sessão de Checkout do Stripe (env STRIPE_SECRET_KEY) e marca
//   a conta como paga. (O webhook é um reforço opcional pra Pix assíncrono.)
import { neon } from '@neondatabase/serverless';
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const APP_SECRET = () => clean(process.env.APP_SECRET) || `fallback:${clean(process.env.DATABASE_URL) ?? 'dev'}`;
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
  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl);
  await sql`CREATE TABLE IF NOT EXISTS rtm_accounts (email TEXT PRIMARY KEY, nick TEXT, pass_hash TEXT NOT NULL, paid BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS rtm_paid_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`;

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const action = String(body.action ?? '');
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? '');
  const nick = String(body.nick ?? '').trim().slice(0, 40);

  // verdadeiro se a conta já está paga, OU se há um e-mail pago pendente (pago
  // antes de criar a conta) — nesse caso, casa e marca a conta.
  const resolvePaid = async (em: string, knownPaid?: boolean): Promise<boolean> => {
    if (knownPaid) return true;
    const p = await sql`SELECT 1 FROM rtm_paid_emails WHERE email=${em}`;
    if (p.length) { await sql`UPDATE rtm_accounts SET paid=true WHERE email=${em}`; return true; }
    return false;
  };

  if (action === 'signup') {
    if (!/\S+@\S+\.\S+/.test(email) || password.length < 6) { res.status(400).json({ error: 'E-mail inválido ou senha com menos de 6 caracteres.' }); return; }
    const exists = await sql`SELECT 1 FROM rtm_accounts WHERE email=${email}`;
    if (exists.length) { res.status(409).json({ error: 'Já existe uma conta com esse e-mail. Faça login.' }); return; }
    await sql`INSERT INTO rtm_accounts (email, nick, pass_hash) VALUES (${email}, ${nick}, ${hashPw(password)})`;
    res.status(200).json({ token: sign(email), email, nick, paid: await resolvePaid(email) });
    return;
  }

  if (action === 'login') {
    const r = await sql`SELECT nick, pass_hash, paid FROM rtm_accounts WHERE email=${email}`;
    if (!r.length || !verifyPw(password, String(r[0].pass_hash))) { res.status(401).json({ error: 'E-mail ou senha incorretos.' }); return; }
    res.status(200).json({ token: sign(email), email, nick: r[0].nick, paid: await resolvePaid(email, Boolean(r[0].paid)) });
    return;
  }

  if (action === 'me') {
    const em = verifyToken(String(body.token ?? ''));
    if (!em) { res.status(401).json({ error: 'Sessão inválida.' }); return; }
    const r = await sql`SELECT nick, paid FROM rtm_accounts WHERE email=${em}`;
    if (!r.length) { res.status(401).json({ error: 'Conta não encontrada.' }); return; }
    res.status(200).json({ email: em, nick: r[0].nick, paid: await resolvePaid(em, Boolean(r[0].paid)) });
    return;
  }

  // claim: confirma o pagamento pela sessão do Stripe e marca a conta como paga.
  if (action === 'claim') {
    const em = verifyToken(String(body.token ?? ''));
    const cs = String(body.cs ?? '').trim();
    if (!em) { res.status(401).json({ error: 'Faça login antes de confirmar o pagamento.' }); return; }
    if (!cs) { res.status(400).json({ error: 'sessão ausente' }); return; }
    // aceita STRIPE_SECRET_KEY ou só STRIPE (nome usado no Vercel)
    const key = clean(process.env.STRIPE_SECRET_KEY) || clean(process.env.STRIPE);
    if (!key) { res.status(500).json({ error: 'STRIPE_SECRET_KEY/STRIPE não configurada' }); return; }
    try {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(cs)}`, { headers: { Authorization: `Bearer ${key}` } });
      const s = (await r.json()) as { payment_status?: string; customer_details?: { email?: string }; customer_email?: string };
      const paidStatus = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
      const sessEmail = (s.customer_details?.email ?? s.customer_email ?? '').toLowerCase();
      if (paidStatus) {
        // marca o e-mail da sessão como pago (mesmo que difira do logado) e, se
        // bater com o logado, libera a conta na hora.
        if (sessEmail) await sql`INSERT INTO rtm_paid_emails (email) VALUES (${sessEmail}) ON CONFLICT DO NOTHING`;
        await sql`INSERT INTO rtm_paid_emails (email) VALUES (${em}) ON CONFLICT DO NOTHING`;
        await sql`UPDATE rtm_accounts SET paid=true WHERE email=${em}`;
        res.status(200).json({ paid: true });
      } else {
        res.status(200).json({ paid: false });
      }
    } catch {
      res.status(502).json({ error: 'Não consegui confirmar com o Stripe agora.' });
    }
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
