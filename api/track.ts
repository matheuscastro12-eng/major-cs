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
  'share_card',
]);

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
  const data = JSON.stringify(body.data && typeof body.data === 'object' ? body.data : {}).slice(0, 2000);
  try {
    const sql = neon(url);
    await sql`INSERT INTO events (type, sid, data) VALUES (${type}, ${sid}, ${data}::jsonb)`;
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: false }); // telemetria nunca quebra o jogo
  }
}
