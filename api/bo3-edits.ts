// Edições GLOBAIS do dataset de CS2 (carreira): o admin edita no CRM e vale pra
// TODOS os jogadores. Guardado numa linha única (id=1) no Neon. GET é sem cache
// (no-store) de propósito: a alteração do admin aparece pra todo mundo na hora,
// sem cache de CDN sobrepondo. POST é protegido por ADMIN_PASSWORD.
import { neon } from '@neondatabase/serverless';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: Res,
) {
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }
  const sql = neon(url);
  // cria a tabela na primeira chamada (uma linha única id=1 com o JSON)
  await sql`CREATE TABLE IF NOT EXISTS bo3_edits (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`;

  if (req.method === 'GET' || !req.method) {
    res.setHeader('Cache-Control', 'no-store'); // sempre fresco: nada de cache sobrepondo a edição
    try {
      const rows = await sql`SELECT data FROM bo3_edits WHERE id = 1`;
      const data = rows[0]?.data ?? { players: {}, teams: {} };
      res.status(200).json({ edits: data });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    const expected = clean(process.env.ADMIN_PASSWORD);
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      password?: string;
      edits?: { players?: Record<string, unknown>; teams?: Record<string, unknown> };
    };
    if (!expected || (body.password ?? '').toString().trim() !== expected) {
      res.status(401).json({ ok: false });
      return;
    }
    const edits = {
      players: body.edits?.players && typeof body.edits.players === 'object' ? body.edits.players : {},
      teams: body.edits?.teams && typeof body.edits.teams === 'object' ? body.edits.teams : {},
    };
    // limite de tamanho defensivo (evita payload absurdo)
    const json = JSON.stringify(edits);
    if (json.length > 600_000) {
      res.status(400).json({ error: 'payload muito grande' });
      return;
    }
    try {
      await sql`
        INSERT INTO bo3_edits (id, data, updated_at) VALUES (1, ${json}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET data = ${json}::jsonb, updated_at = now()`;
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
