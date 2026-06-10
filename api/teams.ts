// Função serverless (Vercel) que serve o dataset a partir do banco Neon.
// O app usa este endpoint como fonte primária e cai para o dataset embutido se indisponível.
import { neon } from '@neondatabase/serverless';

export default async function handler(req: { method?: string }, res: {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (k: string, v: string) => void;
}) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }

  try {
    const sql = neon(url);
    const rows = (await sql`SELECT data FROM teams ORDER BY id`) as { data: unknown }[];
    res.status(200).json(rows.map((r) => r.data));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
