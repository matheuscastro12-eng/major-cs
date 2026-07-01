// Save na nuvem (conta vitalícia): sincroniza o save da carreira entre aparelhos.
// Modelo last-write-wins por timestamp do cliente. Só conta PAGA persiste.
// Ações (POST body.action): pull | push.
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface Res { status: (code: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void; }
const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();
const APP_SECRET = () => clean(process.env.APP_SECRET) || `fallback:${clean(process.env.DATABASE_URL) ?? 'dev'}`;
const MAX_BYTES = 2_000_000; // teto defensivo por slot (~2MB)

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
  await sql`CREATE TABLE IF NOT EXISTS rtm_saves (email TEXT, slot TEXT, data TEXT, updated_at BIGINT DEFAULT 0, PRIMARY KEY (email, slot))`;

  let body: Record<string, unknown> = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { /* vazio */ }
  const action = String(body.action ?? '');

  const email = verifyToken(String(body.token ?? ''));
  if (!email) { res.status(401).json({ error: 'Entre na sua conta pra usar o save na nuvem.' }); return; }

  const acc = await sql`SELECT paid FROM rtm_accounts WHERE email=${email}`;
  if (!acc.length) { res.status(401).json({ error: 'conta não encontrada' }); return; }
  if (!acc[0].paid) { res.status(403).json({ error: 'unpaid', message: 'Este recurso faz parte da conta com save na nuvem.' }); return; }

  const slot = String(body.slot ?? 'career').slice(0, 40);

  if (action === 'pull') {
    const since = Number(body.since) || 0;
    const r = await sql`SELECT data, updated_at FROM rtm_saves WHERE email=${email} AND slot=${slot}`;
    if (!r.length) { res.status(200).json({ data: null, updatedAt: 0 }); return; }
    const data = String(r[0].data ?? '');
    const updatedAt = Number(r[0].updated_at ?? 0);
    // pull condicional: se o cliente já tem esta versão (ou mais nova) e NÃO é um
    // tombstone (''), devolve só o timestamp — sem o blob de até 2MB. Corta o Fast
    // Origin Transfer do login/sync quando o aparelho já está sincronizado.
    // Tombstone SEMPRE vai inteiro (é vazio) pra a exclusão continuar propagando.
    if (since > 0 && data !== '' && updatedAt <= since) { res.status(200).json({ unchanged: true, updatedAt }); return; }
    res.status(200).json({ data, updatedAt });
    return;
  }

  if (action === 'push') {
    const data = String(body.data ?? '');
    // data vazio = tombstone (lápide) de exclusão. NÃO é erro: grava '' com o
    // timestamp pra que o last-write-wins marque o slot como apagado e ele não
    // ressuscite no próximo sync. Antes isso retornava 400 e o save voltava.
    if (data && Buffer.byteLength(data, 'utf8') > MAX_BYTES) { res.status(413).json({ error: 'save grande demais' }); return; }
    const updatedAt = Number(body.updatedAt) || Date.now();
    await sql`
      INSERT INTO rtm_saves (email, slot, data, updated_at) VALUES (${email}, ${slot}, ${data}, ${updatedAt})
      ON CONFLICT (email, slot) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at >= rtm_saves.updated_at`;
    res.status(200).json({ ok: true, updatedAt, deleted: !data });
    return;
  }

  res.status(400).json({ error: 'ação desconhecida' });
}
