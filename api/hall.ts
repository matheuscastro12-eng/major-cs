// Hall da Fama: campanhas registradas pelos jogadores (GET lista / POST registro).
//
// Endurecimento (O0-36): o POST exige conta (token) e grava 1 campanha por
// conta por temporada (registrar de novo na mesma temporada substitui); o nome
// exibido é o nick da CONTA; roster/records só com chaves conhecidas e teto de
// 4 KB (server/hall.ts); rate limit por IP e por conta no Postgres. O GET
// devolve só os campos que a tela usa — nunca o blob cru, então até uma linha
// antiga envenenada não derruba a listagem.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { respondMissingSecret, verifyAccountToken } from '../server/auth.js';
import { sanitizeHallEntry } from '../server/hall.js';
import { internalError, parseJsonBody } from '../server/http.js';
import { clientIp, rateLimitHit, respondLimited, type RateSql } from '../server/rate-limit.js';

interface Res {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

// dono da campanha + unicidade (conta, temporada). Linhas antigas (anônimas)
// ficam com email NULL e fora do índice parcial. 1x por instância.
let schemaReady = false;
async function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (schemaReady) return;
  await sql.transaction([
    sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email TEXT`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS campaigns_email_season_idx ON campaigns (email, season) WHERE email IS NOT NULL`,
  ]);
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

  if (req.method === 'GET' || !req.method) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    try {
      // projeção explícita: records só com as chaves da tela e roster com até 6
      // jogadores (nick/país/ovr) — o JSON livre de antes não sai mais daqui.
      const rows = await sql`
        SELECT id, left(player, 24) AS player, left(team_name, 40) AS team_name, pool, left(placement, 20) AS placement,
               left(champion, 60) AS champion, left(mvp, 40) AS mvp, season, created_at,
               jsonb_strip_nulls(jsonb_build_object(
                 'bestRating', CASE WHEN jsonb_typeof(records->'bestRating') = 'number' THEN records->'bestRating' END,
                 'bestRatingPlayer', left(records->>'bestRatingPlayer', 24),
                 'biggestFrag', CASE WHEN jsonb_typeof(records->'biggestFrag') = 'number' THEN records->'biggestFrag' END,
                 'biggestFragPlayer', left(records->>'biggestFragPlayer', 24),
                 'pickemScore', left(records->>'pickemScore', 10)
               )) AS records,
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object('nick', left(e->>'nick', 24), 'country', left(e->>'country', 3), 'ovr', e->'ovr'))
                 FROM (SELECT value AS e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(roster) = 'array' THEN roster ELSE '[]'::jsonb END) LIMIT 6) r
               ), '[]'::jsonb) AS roster
        FROM campaigns ORDER BY created_at DESC LIMIT 50`;
      const titles = await sql`
        SELECT COUNT(*) AS n FROM campaigns WHERE placement = '1'`;
      res.status(200).json({ campaigns: rows, totalTitles: Number(titles[0].n) });
    } catch (e) {
      internalError(res, e, 'hall_list');
    }
    return;
  }

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    if (respondMissingSecret(res)) return;
    const rsql = sql as unknown as RateSql;
    if (respondLimited(res, await rateLimitHit(rsql, [{ key: `hall:ip:${clientIp(req.headers)}`, limit: 10, windowSec: 3600 }]))) return;
    const body = parseJsonBody(req.body);
    if (!body) { res.status(400).json({ error: 'JSON inválido' }); return; }
    const email = verifyAccountToken(String(body.token ?? ''));
    if (!email) { res.status(401).json({ error: 'Entre na sua conta pra registrar a campanha no Hall da Fama.' }); return; }
    if (respondLimited(res, await rateLimitHit(rsql, [{ key: `hall:email:${email}`, limit: 10, windowSec: 86400 }]))) return;
    try {
      const acc = await sql`SELECT nick FROM rtm_accounts WHERE email=${email} UNION ALL SELECT nick FROM rtm_pending_signups WHERE email=${email} LIMIT 1`;
      const v = sanitizeHallEntry(body, String(acc[0]?.nick ?? ''));
      if (!v.ok) { res.status(400).json({ error: v.error }); return; }
      const e = v.entry;
      await ensureSchema(sql);
      await sql`
        INSERT INTO campaigns (player, team_name, pool, placement, champion, mvp, season, roster, records, email)
        VALUES (${e.player}, ${e.teamName}, ${e.pool}, ${e.placement}, ${e.champion}, ${e.mvp}, ${e.season}, ${JSON.stringify(e.roster)}::jsonb, ${JSON.stringify(e.records)}::jsonb, ${email})
        ON CONFLICT (email, season) WHERE email IS NOT NULL DO UPDATE SET
          player = EXCLUDED.player, team_name = EXCLUDED.team_name, pool = EXCLUDED.pool, placement = EXCLUDED.placement,
          champion = EXCLUDED.champion, mvp = EXCLUDED.mvp, roster = EXCLUDED.roster, records = EXCLUDED.records, created_at = now()`;
      res.status(200).json({ ok: true });
    } catch (e) {
      internalError(res, e, 'hall_insert');
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
