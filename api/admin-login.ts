// Login do administrador do CRM. A senha fica na env ADMIN_PASSWORD (Vercel).
export default async function handler(
  req: { method?: string; body?: { password?: string } | string },
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
  const expected = process.env.ADMIN_PASSWORD?.replace(new RegExp('^\\uFEFF'), '').trim();
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
    return;
  }
  const body = typeof req.body === 'string' ? (JSON.parse(req.body) as { password?: string }) : req.body;
  const given = (body?.password ?? '').trim();
  if (given.length > 0 && given === expected) {
    res.status(200).json({ ok: true });
    return;
  }
  res.status(401).json({ ok: false });
}
