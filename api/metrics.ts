// Painel de métricas do admin: acessos, jogos, conversão e dificuldade real.
import { neon } from '@neondatabase/serverless';

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (k: string, v: string) => void;
  },
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const url = clean(process.env.DATABASE_URL);
  const expected = clean(process.env.ADMIN_PASSWORD);
  if (!url || !expected) {
    res.status(500).json({ error: 'env não configurada' });
    return;
  }
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { password?: string };
  if ((body.password ?? '').trim() !== expected) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    const sql = neon(url);
    await sql`
      CREATE TABLE IF NOT EXISTS online_sessions (
        sid text PRIMARY KEY,
        last_seen timestamptz NOT NULL DEFAULT now(),
        path text,
        user_agent text
      )`;
    const [totals, visitsByDay, games, byDifficulty, byPool, online, recent, hall, byCountry] = await Promise.all([
      sql`SELECT
            COUNT(*) FILTER (WHERE type = 'visit') AS visits,
            COUNT(DISTINCT sid) FILTER (WHERE type = 'visit') AS unique_visitors,
            COUNT(*) FILTER (WHERE type = 'visit' AND created_at > now() - interval '1 day') AS visits_24h,
            COUNT(DISTINCT sid) FILTER (WHERE type = 'visit' AND created_at > now() - interval '1 day') AS visitors_24h,
            COUNT(DISTINCT sid) FILTER (WHERE type = 'visit' AND created_at > now() - interval '7 days') AS visitors_7d,
            COUNT(*) FILTER (WHERE type = 'game_start') AS games_started,
            COUNT(*) FILTER (WHERE type = 'game_end') AS games_finished,
            COUNT(*) FILTER (WHERE type = 'season_start') AS seasons_started,
            COUNT(*) FILTER (WHERE type = 'donate_click') AS donate_clicks,
            COUNT(*) FILTER (WHERE type = 'ad_click') AS ad_clicks,
            COUNT(*) FILTER (WHERE type = 'ad_click' AND created_at > now() - interval '1 day') AS ad_clicks_24h,
            COUNT(*) FILTER (WHERE type = 'share_card') AS share_cards
          FROM events`,
      sql`SELECT date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                 COUNT(*) AS visits,
                 COUNT(DISTINCT sid) AS visitors
          FROM events WHERE type = 'visit' AND created_at > now() - interval '14 days'
          GROUP BY 1 ORDER BY 1 DESC`,
      sql`SELECT COUNT(*) FILTER (WHERE COALESCE((data->>'champion')::boolean, false)) AS titles,
                 COUNT(*) AS total
          FROM events WHERE type = 'game_end'`,
      sql`SELECT COALESCE(data->>'difficulty', 'normal') AS difficulty,
                 COUNT(*) AS games,
                 COUNT(*) FILTER (WHERE COALESCE((data->>'champion')::boolean, false)) AS titles
          FROM events WHERE type = 'game_end'
          GROUP BY 1 ORDER BY 2 DESC`,
      sql`SELECT COALESCE(data->>'pool', 'world') AS pool, COUNT(*) AS games
          FROM events WHERE type = 'game_start'
          GROUP BY 1 ORDER BY 2 DESC`,
      sql`SELECT
            (SELECT COUNT(*) FROM lobbies) AS lobbies_total,
            (SELECT COUNT(*) FROM lobbies WHERE created_at > now() - interval '7 days') AS lobbies_7d,
            (SELECT COUNT(*) FROM lobby_players) AS lobby_players_total,
            (SELECT COUNT(*) FROM online_sessions WHERE last_seen > now() - interval '2 minutes') AS online_now`,
      sql`SELECT type, COUNT(*) AS n
          FROM events WHERE created_at > now() - interval '24 hours'
          GROUP BY 1 ORDER BY 2 DESC`,
      sql`SELECT COUNT(*) AS campaigns, COUNT(*) FILTER (WHERE placement = '1') AS titles FROM campaigns`,
      sql`SELECT lower(data->>'country') AS country,
                 COUNT(*) AS visits,
                 COUNT(DISTINCT sid) AS visitors
          FROM events
          WHERE type = 'visit' AND COALESCE(data->>'country', '') <> ''
          GROUP BY 1 ORDER BY 3 DESC LIMIT 40`,
    ]);
    res.status(200).json({
      totals: totals[0],
      visitsByDay,
      games: games[0],
      byDifficulty,
      byPool,
      online: online[0],
      last24h: recent,
      hall: hall[0],
      byCountry,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
