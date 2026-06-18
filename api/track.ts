// Telemetria do jogo: eventos anônimos (visita, partida iniciada/concluída etc).
import { neon } from '@neondatabase/serverless';

const ALLOWED_TYPES = new Set([
  'visit',
  'game_start',
  'game_end',
  'season_start',
  'online_create',
  'online_join',
  'online_done',
  'donate_click',
  'ad_click',
  'share_card',
  'presence',
]);

const clean = (v?: string) => v?.replace(new RegExp('^\\uFEFF'), '').trim();

export default async function handler(
  req: { method?: string; body?: Record<string, unknown> | string; headers?: Record<string, string | string[] | undefined> },
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
  if (!url) {
    res.status(500).json({ error: 'no db' });
    return;
  }
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    type?: string;
    sid?: string;
    data?: Record<string, unknown>;
  };
  const type = String(body.type ?? '');
  if (!ALLOWED_TYPES.has(type)) {
    res.status(400).json({ error: 'tipo inválido' });
    return;
  }
  const sid = String(body.sid ?? '').slice(0, 40);
  // país do visitante via header de geo da Vercel (anônimo, só o código ISO)
  const ccHeader = req.headers?.['x-vercel-ip-country'];
  const country = String(Array.isArray(ccHeader) ? ccHeader[0] : (ccHeader ?? '')).slice(0, 2).toLowerCase();
  const rawData = body.data && typeof body.data === 'object' ? body.data : {};
  const data = JSON.stringify(country ? { ...rawData, country } : rawData).slice(0, 2000);
  try {
    const sql = neon(url);
    if (type === 'presence') {
      const payload = body.data && typeof body.data === 'object' ? body.data : {};
      const uaHeader = req.headers?.['user-agent'];
      const userAgent = String(Array.isArray(uaHeader) ? uaHeader[0] : (uaHeader ?? '')).slice(0, 240);
      const path = String(payload.path ?? '').slice(0, 120);
      await sql`
        CREATE TABLE IF NOT EXISTS online_sessions (
          sid text PRIMARY KEY,
          last_seen timestamptz NOT NULL DEFAULT now(),
          path text,
          user_agent text
        )`;
      await sql`
        INSERT INTO online_sessions (sid, last_seen, path, user_agent)
        VALUES (${sid}, now(), ${path}, ${userAgent})
        ON CONFLICT (sid) DO UPDATE
        SET last_seen = now(),
            path = EXCLUDED.path,
            user_agent = EXCLUDED.user_agent`;
      await sql`DELETE FROM online_sessions WHERE last_seen < now() - interval '1 day'`;
      res.status(200).json({ ok: true });
      return;
    }
    await sql`INSERT INTO events (type, sid, data) VALUES (${type}, ${sid}, ${data}::jsonb)`;
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: false }); // telemetria nunca quebra o jogo
  }
}
