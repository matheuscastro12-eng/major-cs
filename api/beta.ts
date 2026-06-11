// Controle de acesso ao beta fechado do modo carreira.
// Fluxo: o usuário pede acesso com o nick (action 'request'); o dono aprova ou
// recusa no CRM (#carreira-acessos, action 'list'/'decide' com senha de admin);
// o cliente checa o status (action 'check'). Também aceita o código direto
// (BETA_CODE) como atalho de liberação (compatibilidade).
import { neon } from '@neondatabase/serverless';

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    action?: string;
    nick?: string;
    code?: string;
    password?: string;
    decision?: string;
  };
  const action = String(body.action ?? '');
  const nick = String(body.nick ?? '').trim().slice(0, 24);
  const key = nick.toLowerCase();

  // atalho: código de liberação direto (sem precisar de aprovação)
  if (!action) {
    const expected = (clean(process.env.BETA_CODE) || 'MAJOR2026').toUpperCase();
    const code = String(body.code ?? '').trim().toUpperCase();
    res.status(200).json({ ok: code.length > 0 && code === expected });
    return;
  }

  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'no db' });
    return;
  }
  const sql = neon(url);
  const ensure = () => sql`
    CREATE TABLE IF NOT EXISTS beta_requests (
      nick_key text PRIMARY KEY,
      nick text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

  const adminOk = () => (String(body.password ?? '').trim() === clean(process.env.ADMIN_PASSWORD));

  try {
    await ensure();

    // usuário pede acesso pelo nick
    if (action === 'request') {
      if (!key) { res.status(400).json({ error: 'nick obrigatório' }); return; }
      const existing = await sql`SELECT status FROM beta_requests WHERE nick_key = ${key}`;
      if (existing.length > 0) {
        // já existe: não rebaixa um aprovado; mantém o status atual
        res.status(200).json({ ok: true, status: existing[0].status });
        return;
      }
      await sql`INSERT INTO beta_requests (nick_key, nick) VALUES (${key}, ${nick})`;
      res.status(200).json({ ok: true, status: 'pending' });
      return;
    }

    // cliente consulta o status do próprio nick
    if (action === 'check') {
      if (!key) { res.status(200).json({ status: 'none' }); return; }
      const rows = await sql`SELECT status FROM beta_requests WHERE nick_key = ${key}`;
      res.status(200).json({ status: rows.length ? rows[0].status : 'none' });
      return;
    }

    // ----- admin (senha) -----
    if (action === 'list') {
      if (!adminOk()) { res.status(401).json({ ok: false }); return; }
      const rows = await sql`
        SELECT nick, status, created_at, updated_at FROM beta_requests
        ORDER BY (status = 'pending') DESC, updated_at DESC LIMIT 500`;
      res.status(200).json({ requests: rows });
      return;
    }

    if (action === 'decide') {
      if (!adminOk()) { res.status(401).json({ ok: false }); return; }
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : null;
      if (!key || !decision) { res.status(400).json({ error: 'dados inválidos' }); return; }
      await sql`
        UPDATE beta_requests SET status = ${decision}, updated_at = now() WHERE nick_key = ${key}`;
      res.status(200).json({ ok: true, status: decision });
      return;
    }

    res.status(400).json({ error: 'ação inválida' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
