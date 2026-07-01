// Edições GLOBAIS do dataset de CS2 (carreira): o admin edita no CRM e vale pra
// TODOS os jogadores. Guardado numa linha única (id=1) no Neon. GET é sem cache
// (no-store) de propósito: a alteração do admin aparece pra todo mundo na hora,
// sem cache de CDN sobrepondo. POST é protegido por ADMIN_PASSWORD.
import { neon } from '@neondatabase/serverless';

interface Res {
  status: (code: number) => { json: (body: unknown) => void; end: () => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

// cria a tabela 1x por instância, não em TODA carga de Carreira (o GET roda a cada
// abertura do carreira). Corta 1 round-trip ao Neon por request. Idempotente.
let schemaReady = false;
async function ensureSchema(sql: ReturnType<typeof neon>): Promise<void> {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS bo3_edits (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`;
  schemaReady = true;
}

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
  res: Res,
) {
  const url = clean(process.env.DATABASE_URL);
  if (!url) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }
  const sql = neon(url);
  await ensureSchema(sql);

  if (req.method === 'GET' || !req.method) {
    // no-cache (NAO no-store): o cliente/edge REVALIDAM sempre (edicao do admin
    // aparece na hora), mas com ETag o 304 NAO repaga o corpo. Antes era no-store,
    // que baixava o blob inteiro em toda carga de Carreira -> Fast Origin Transfer.
    res.setHeader('Cache-Control', 'no-cache');
    try {
      const rows = await sql`SELECT data, EXTRACT(EPOCH FROM updated_at)::bigint AS ts FROM bo3_edits WHERE id = 1`;
      const data = rows[0]?.data ?? { players: {}, teams: {} };
      const etag = `W/"be-${rows[0]?.ts ?? 0}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
      const inm = req.headers?.['if-none-match'];
      if (inm && (Array.isArray(inm) ? inm.includes(etag) : inm === etag)) { res.status(304).end(); return; }
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
    const incoming = {
      players: (body.edits?.players && typeof body.edits.players === 'object' ? body.edits.players : {}) as Record<string, Record<string, unknown>>,
      teams: (body.edits?.teams && typeof body.edits.teams === 'object' ? body.edits.teams : {}) as Record<string, Record<string, unknown>>,
    };
    try {
      // MESCLA com o que já está no servidor (não substitui): vários editores podem
      // salvar sem apagar a edição um do outro. Merge por jogador/time, campo a campo.
      const rows = await sql`SELECT data FROM bo3_edits WHERE id = 1`;
      const cur = (rows[0]?.data ?? { players: {}, teams: {} }) as {
        players?: Record<string, Record<string, unknown>>; teams?: Record<string, Record<string, unknown>>;
      };
      const mergeMap = (base: Record<string, Record<string, unknown>> = {}, over: Record<string, Record<string, unknown>> = {}) => {
        const out: Record<string, Record<string, unknown>> = { ...base };
        for (const k of Object.keys(over)) out[k] = { ...(base[k] ?? {}), ...over[k] };
        return out;
      };
      const merged = {
        players: mergeMap(cur.players, incoming.players),
        teams: mergeMap(cur.teams, incoming.teams),
      };
      const json = JSON.stringify(merged);
      if (json.length > 1_200_000) { res.status(400).json({ error: 'payload muito grande' }); return; }
      await sql`
        INSERT INTO bo3_edits (id, data, updated_at) VALUES (1, ${json}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET data = ${json}::jsonb, updated_at = now()`;
      // não ecoa o `merged` inteiro (o cliente só usa o `ok`; ele mescla localmente
      // e revalida via ETag no próximo GET). Corta Fast Origin Transfer do POST.
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
