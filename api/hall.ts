// Hall da Fama: campanhas registradas pelos jogadores (GET lista / POST registro).
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

  if (req.method === 'GET' || !req.method) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    try {
      const rows = await sql`
        SELECT id, player, team_name, pool, placement, champion, mvp, season, roster, records, created_at
        FROM campaigns ORDER BY created_at DESC LIMIT 50`;
      const titles = await sql`
        SELECT COUNT(*) AS n FROM campaigns WHERE placement = '1'`;
      res.status(200).json({ campaigns: rows, totalTitles: Number(titles[0].n) });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      player?: string;
      teamName?: string;
      pool?: string;
      placement?: string;
      champion?: string;
      mvp?: string;
      season?: number;
      roster?: unknown;
      records?: unknown;
    };
    const player = String(body.player ?? '').slice(0, 24).trim() || 'anônimo';
    const teamName = String(body.teamName ?? '').slice(0, 40).trim();
    const placement = String(body.placement ?? '').slice(0, 20);
    const champion = String(body.champion ?? '').slice(0, 60);
    if (!teamName || !placement || !champion) {
      res.status(400).json({ error: 'campos obrigatórios faltando' });
      return;
    }
    const pool = body.pool === 'br' ? 'br' : 'world';
    const mvp = String(body.mvp ?? '').slice(0, 40);
    const season = Math.max(1, Math.min(99, Number(body.season) || 1));
    const roster = JSON.stringify(Array.isArray(body.roster) ? body.roster.slice(0, 6) : []);
    const records = JSON.stringify(body.records && typeof body.records === 'object' ? body.records : {});
    try {
      await sql`
        INSERT INTO campaigns (player, team_name, pool, placement, champion, mvp, season, roster, records)
        VALUES (${player}, ${teamName}, ${pool}, ${placement}, ${champion}, ${mvp}, ${season}, ${roster}::jsonb, ${records}::jsonb)`;
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
