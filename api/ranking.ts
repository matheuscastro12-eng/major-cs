// Ranking competitivo do modo online: MMR + ladder persistidos por conta.
// Só conta PAGA salva ranking (o modelo: ranking salvo é da conta vitalícia).
// Ações (POST body.action): me | ladder | report.
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const APP_SECRET = () => clean(process.env.APP_SECRET) || `fallback:${clean(process.env.DATABASE_URL) ?? 'dev'}`;

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

// divisões estilo CS (do menor ao maior)
const DIVISIONS: [number, string][] = [[0, 'Prata'], [1200, 'Ouro Nova'], [1600, 'Mestre Guardião'], [1900, 'Águia'], [2200, 'Global Elite']];
const divFor = (mmr: number) => [...DIVISIONS].reverse().find(([m]) => mmr >= m)?.[1] ?? 'Prata';
const K_WIN = 25, K_LOSS = 20;

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const dbUrl = clean(process.env.DATABASE_URL);
  if (!dbUrl) { res.status(500).json({ error: 'DATABASE_URL não configurada' }); return; }
  const sql = neon(dbUrl);
  await sql`CREATE TABLE IF NOT EXISTS rtm_ranking (email TEXT PRIMARY KEY, nick TEXT, mmr INT DEFAULT 1000, wins INT DEFAULT 0, losses INT DEFAULT 0, peak INT DEFAULT 1000, updated_at TIMESTAMPTZ DEFAULT now())`;

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const action = String(body.action ?? '');

  // ladder público (top 50 + total). Não exige token.
  if (action === 'ladder') {
    const rows = await sql`SELECT nick, email, mmr, wins, losses FROM rtm_ranking ORDER BY mmr DESC, wins DESC LIMIT 50`;
    const total = await sql`SELECT count(*)::int AS n FROM rtm_ranking`;
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({
      total: total[0]?.n ?? 0,
      ladder: rows.map((r, i) => ({ rank: i + 1, nick: String(r.nick ?? 'manager'), mmr: Number(r.mmr), division: divFor(Number(r.mmr)), wins: Number(r.wins), losses: Number(r.losses) })),
    });
    return;
  }

  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra acessar o ranking.' }); return; }

  // só conta paga tem ranking salvo
  const acc = await sql`SELECT paid, nick FROM rtm_accounts WHERE email=${email}`;
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  if (!acc[0].paid) { res.status(403).json({ error: 'unpaid', message: 'O ranking salvo é da conta vitalícia.' }); return; }
  const nick = String((body.nick as string) || acc[0].nick || 'manager').slice(0, 40);

  const myRow = async () => {
    const r = await sql`SELECT mmr, wins, losses, peak FROM rtm_ranking WHERE email=${email}`;
    if (!r.length) return null;
    const rk = await sql`SELECT count(*)::int AS n FROM rtm_ranking WHERE mmr > ${Number(r[0].mmr)}`;
    return { mmr: Number(r[0].mmr), wins: Number(r[0].wins), losses: Number(r[0].losses), peak: Number(r[0].peak), division: divFor(Number(r[0].mmr)), rank: (rk[0]?.n ?? 0) + 1 };
  };

  if (action === 'me') {
    await sql`INSERT INTO rtm_ranking (email, nick) VALUES (${email}, ${nick}) ON CONFLICT (email) DO UPDATE SET nick=${nick}`;
    res.status(200).json(await myRow());
    return;
  }

  if (action === 'report') {
    const won = !!body.won;
    await sql`INSERT INTO rtm_ranking (email, nick) VALUES (${email}, ${nick}) ON CONFLICT (email) DO UPDATE SET nick=${nick}`;
    const cur = await sql`SELECT mmr FROM rtm_ranking WHERE email=${email}`;
    const before = Number(cur[0]?.mmr ?? 1000);
    const delta = won ? K_WIN : -Math.min(K_LOSS, before);
    const after = Math.max(0, before + delta);
    await sql`UPDATE rtm_ranking SET mmr=${after}, wins=wins+${won ? 1 : 0}, losses=losses+${won ? 0 : 1}, peak=GREATEST(peak, ${after}), updated_at=now() WHERE email=${email}`;
    res.status(200).json({ delta, before, after, division: divFor(after), me: await myRow() });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
